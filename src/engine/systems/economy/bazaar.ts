import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { CommissionDef } from '../../../content/schema';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { addInto, formatResources, gain, RESOURCE_NAMES } from '../../resources';
import { rng } from '../../rng';
import type { AuctionLot, BazaarState, Commission, GameState, GearItem, GearQuality, ResourceId, Resources, StopReason } from '../../types';
import { hallLevel, isOperating, MARKET } from '../buildings/buildings';
import { addFavor, neighborSects } from '../world/diplomacy';
import { gearName, newGear, qualityDef } from '../talent/gear';
import { gearSellPrice, sellPrice } from './market';

// 0.12.0 中期擴充批次三（docs/中期擴充規劃.md）：
// - 時事：每年一月擲出，改變委託種類、報酬與坊市行情。
// - 聲望兌換：聲望（累計）達標開放各階段；兌換扣「可用聲望」＝聲望 − 已花。
// - 珍寶閣：每年一月換 4 件高價貨。拍賣會：大比隔年 9 月開拍、10 月開標，暗標。
// - 收購單：每季一張，鄰宗高價收我宗的丹藥、符籙或法器。

const B = balance.bazaar;
const AFF = B.affairs.list;
const RARE_MATS: ResourceId[] = ['mat_jade', 'mat_beastcore', 'mat_earthfire', 'mat_scroll', 'mat_thunder', 'mat_taixu'];
const PERM_PILLS: ResourceId[] = ['pill_ape', 'pill_eye', 'pill_cloud'];

export function emptyBazaar(): BazaarState {
  return { repSpent: 0, repBest: 0, affairs: [], exchange: { year: 0, used: {} }, treasury: { year: 0, goods: [] }, grandAuction: null, buyOrder: null };
}

/** 舊存檔或測試佈置可能沒有這一欄。 */
export function bazaarOf(state: GameState): BazaarState {
  state.bazaar ??= emptyBazaar();
  return state.bazaar;
}

export function availableRep(state: GameState): number {
  return Math.max(0, state.reputation - (state.bazaar?.repSpent ?? 0));
}

export function marketLevel(state: GameState): number {
  return Math.max(0, ...state.buildings.filter((b) => b.defId === MARKET && isOperating(b)).map((b) => b.level));
}

// ── 時事 ──────────────────────────────────────────────

export function affairName(id: string): string {
  return AFF[id]?.name ?? id;
}

export function activeAffairs(state: GameState) {
  const now = monthIndex(state.date);
  return (state.bazaar?.affairs ?? []).filter((a) => a.until >= now);
}

export function hasAffair(state: GameState, id: string): boolean {
  return activeAffairs(state).some((a) => a.id === id);
}

/** 一月：擲出今年的時事（1 件，25% 機率 2 件）。 */
export function rollAffairs(state: GameState, content: ContentPack, lines: string[]): void {
  const bz = bazaarOf(state);
  const now = monthIndex(state.date);
  const r = rng(state, 'commission');
  const cleared = Object.keys(state.realmClears).filter((id) => (state.realmClears[id] ?? 0) > 0 && balance.rareDrops.realms[id]);
  const pool = Object.entries(AFF).filter(([, a]) => (!a.needsMarket || marketLevel(state) > 0) && (!a.needsClear || cleared.length > 0));
  const count = 1 + (r.int(100) < B.affairs.secondChancePct ? 1 : 0);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const options = pool.filter(([id]) => !picked.includes(id));
    const weightOf = ([, a]: (typeof options)[number]) => a.weight * (a.warWeight && state.wars.length ? a.warWeight : 1);
    const total = options.reduce((n, o) => n + weightOf(o), 0);
    if (!total) break;
    let roll = r.int(total);
    const hit = options.find((o) => (roll -= weightOf(o)) < 0) ?? options[0];
    if (hit) picked.push(hit[0]);
  }
  bz.affairs = picked.map((id) => ({ id, until: now + B.affairs.months - 1, ...(id === 'realm_shift' ? { realmId: r.pick(cleared) } : {}) }));
  for (const a of bz.affairs) {
    const where = a.realmId ? `（${content.secretRealms.get(a.realmId)?.name ?? ''}）` : '';
    lines.push(`今年時事：${affairName(a.id)}${where}——${AFF[a.id]?.desc ?? ''}。`);
  }
}

/** 委託出現的權重倍率；只在時事期間出現的委託，時事外為 0。 */
export function affairWeight(state: GameState, def: CommissionDef): number {
  if (def.affair && !hasAffair(state, def.affair)) return 0;
  return activeAffairs(state).some((a) => AFF[a.id]?.boost?.includes(def.id)) ? B.affairs.weightMult : 1;
}

export function maxEscortOnBoard(state: GameState): number {
  return Math.max(balance.commissions.maxEscortOnBoard, ...activeAffairs(state).map((a) => AFF[a.id]?.maxEscort ?? 0));
}

/** 新委託上榜時套用時事：報酬、交付量、護衛報酬，並指定委託的宗門。 */
export function applyAffairs(state: GameState, content: ContentPack, def: CommissionDef, c: Commission): void {
  let related = false;
  for (const a of activeAffairs(state)) {
    const aff = AFF[a.id];
    if (!aff) continue;
    const reward = aff.rewardPct?.[def.id] ?? (c.kind === 'escort' ? aff.escortRewardPct : undefined);
    if (reward) {
      for (const k of Object.keys(c.reward) as ResourceId[]) c.reward[k] = Math.ceil(((c.reward[k] ?? 0) * reward) / 100);
      related = true;
    }
    const deliver = aff.deliverPct?.[def.id];
    if (deliver && c.deliver) for (const k of Object.keys(c.deliver) as ResourceId[]) c.deliver[k] = Math.ceil(((c.deliver[k] ?? 0) * deliver) / 100);
    if (aff.boost?.includes(def.id)) related = true;
  }
  if (def.bonus) c.bonus = [def.bonus[0], def.bonus[1]];
  if (related) {
    const sects = neighborSects(state, content);
    if (sects.length) c.sectId = rng(state, 'commission').pick(sects).id;
  }
}

/** 委託完成時：時事委託的宗門好感、額外物資。回傳要附加在訊息後面的文字。 */
export function onCommissionDone(state: GameState, content: ContentPack, c: Commission): string {
  const parts: string[] = [];
  if (c.bonus && rng(state, 'commission').int(100) < c.bonus[1]) {
    const [id] = c.bonus;
    gain(state.resources, { [id]: 1 });
    parts.push(`另得${RESOURCE_NAMES[id]} 1`);
  }
  const sect = c.sectId ? state.sects.find((s) => s.id === c.sectId) : undefined;
  if (sect) {
    const favor = activeAffairs(state).reduce((n, a) => Math.max(n, AFF[a.id]?.boost?.includes(c.templateId) ? AFF[a.id]?.favor ?? B.affairs.favor : 0), B.affairs.favor);
    addFavor(sect, favor);
    parts.push(`${content.sects.get(sect.id)?.name ?? ''}好感 +${favor}`);
  }
  return parts.length ? `${parts.join('，')}。` : '';
}

/** 秘境異動：這處秘境派遣拿稀有素材的機率不減半。 */
export function realmShiftActive(state: GameState, realmId: string): boolean {
  return activeAffairs(state).some((a) => a.id === 'realm_shift' && a.realmId === realmId);
}

// ── 聲望兌換 ──────────────────────────────────────────

type Tier = 'early' | 'mid' | 'late';
const TIERS: Tier[] = ['early', 'mid', 'late'];

export function tierOpen(state: GameState, tier: Tier): string | undefined {
  const t = B.exchange.tiers[tier];
  if (state.reputation < t.rep) return `聲望達 ${t.rep} 開放（目前 ${state.reputation}）`;
  if (hallLevel(state) < t.hall) return `大殿 ${t.hall} 級開放`;
  return undefined;
}

export interface ExchangeOffer {
  id: string;
  tier: Tier;
  name: string;
  cost: number;
  /** 今年還能換幾次 */
  left: number;
  blocked?: string;
}

function usedThisYear(state: GameState, key: string): number {
  const ex = state.bazaar?.exchange;
  return ex && ex.year === state.date.year ? ex.used[key] ?? 0 : 0;
}

export function exchangeOffers(state: GameState, content: ContentPack): ExchangeOffer[] {
  const out: ExchangeOffer[] = [];
  const rep = availableRep(state);
  for (const it of B.exchange.items) {
    const used = usedThisYear(state, it.group ?? it.id);
    let left = Math.max(0, it.perYear - used);
    const name = it.gear ? `${qualityDef(it.gear).name}以上法器 1 件（種類隨機）` : formatResources(it.give ?? {});
    let blocked = tierOpen(state, it.tier);
    if (!blocked && it.everyYears && state.bazaar?.exchange.deityYear !== undefined && state.date.year - state.bazaar.exchange.deityYear < it.everyYears) {
      left = 0;
      blocked = `每 ${it.everyYears} 年一次（第 ${state.bazaar.exchange.deityYear + it.everyYears} 年再開放）`;
    }
    if (!blocked && !left) blocked = it.group ? '今年已換過一顆永久屬性丹' : '今年已換完';
    if (!blocked && rep < it.cost) blocked = `可用聲望不足（${rep}／${it.cost}）`;
    out.push({ id: it.id, tier: it.tier, name, cost: it.cost, left, blocked });
  }
  // 前期：坊市有賣、還沒學會的配方，聲望 = 原價 ÷ 2
  for (const r of [...content.recipes.values()].filter((x) => x.marketPrice && !state.recipes.includes(x.id))) {
    const cost = Math.ceil((r.marketPrice ?? 0) / B.exchange.recipeDivisor);
    let blocked = tierOpen(state, 'early');
    if (!blocked && rep < cost) blocked = `可用聲望不足（${rep}／${cost}）`;
    out.push({ id: `recipe:${r.id}`, tier: 'early', name: `配方「${r.name}」`, cost, left: 1, blocked });
  }
  return out.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
}

/** 指定品質以上隨機擲一件法器（任一種類）。 */
function rollGearAtLeast(state: GameState, content: ContentPack, min: GearQuality): GearItem {
  const r = rng(state, 'alchemy');
  const qs = balance.gear.qualities.filter((q) => q.chancePct <= qualityDef(min).chancePct);
  const total = qs.reduce((n, q) => n + q.chancePct, 0);
  let roll = r.int(total * 100) / 100;
  let quality = min;
  for (const q of qs) {
    if (roll < q.chancePct) {
      quality = q.id as GearQuality;
      break;
    }
    roll -= q.chancePct;
  }
  const defs = [...content.equipment.keys()];
  return newGear(state, r.pick(defs), quality);
}

export function doExchange(state: GameState, content: ContentPack, offerId: string): string {
  const offer = exchangeOffers(state, content).find((o) => o.id === offerId);
  ensure(offer, '沒有這項兌換');
  ensure(!offer.blocked, offer.blocked ?? '');
  const bz = bazaarOf(state);
  if (bz.exchange.year !== state.date.year) bz.exchange = { ...bz.exchange, year: state.date.year, used: {} };
  bz.repSpent += offer.cost;
  if (offerId.startsWith('recipe:')) {
    state.recipes.push(offerId.slice('recipe:'.length));
    return `以聲望 ${offer.cost} 換得${offer.name}。`;
  }
  const it = B.exchange.items.find((x) => x.id === offerId);
  ensure(it, '沒有這項兌換');
  const key = it.group ?? it.id;
  bz.exchange.used[key] = (bz.exchange.used[key] ?? 0) + 1;
  if (it.everyYears) bz.exchange.deityYear = state.date.year;
  if (it.gear) {
    const item = rollGearAtLeast(state, content, it.gear);
    state.armory.push(item);
    return `以聲望 ${offer.cost} 換得${gearName(content, item)}，已放進庫房。`;
  }
  gain(state.resources, it.give ?? {});
  return `以聲望 ${offer.cost} 換得${offer.name}。`;
}

// ── 珍寶閣 ──────────────────────────────────────────

export function treasuryBlocked(state: GameState): string | undefined {
  if (marketLevel(state) < B.treasury.marketLevel) return `坊市 ${B.treasury.marketLevel} 級開放`;
  return undefined;
}

/** 一月或剛開放時換貨。 */
export function restockTreasury(state: GameState, content: ContentPack): void {
  const bz = bazaarOf(state);
  if (treasuryBlocked(state) || bz.treasury.year === state.date.year) return;
  const r = rng(state, 'market');
  const total = B.treasury.pool.reduce((n, p) => n + p.weight, 0);
  const goods: BazaarState['treasury']['goods'] = [];
  for (let i = 0; i < B.treasury.slots; i++) {
    let roll = r.int(total);
    const p = B.treasury.pool.find((x) => (roll -= x.weight) < 0) ?? B.treasury.pool[0];
    if (!p) continue;
    const g = { id: newId(state, 'tr'), price: p.price, sold: false };
    if (p.kind === 'perm') goods.push({ ...g, resource: r.pick(PERM_PILLS), amount: 1 });
    else if (p.kind === 'mat') goods.push({ ...g, resource: r.pick(RARE_MATS), amount: 1 });
    else if (p.kind === 'life') goods.push({ ...g, resource: 'pill_life', amount: 1 });
    else if (p.kind === 'nascent') goods.push({ ...g, resource: 'pill_nascent', amount: 1 });
    else {
      const q: GearQuality = p.kind === 'gear_rare' ? 'rare' : 'superior';
      goods.push({ ...g, gear: newGear(state, r.pick([...content.equipment.keys()]), q) });
    }
  }
  bz.treasury = { year: state.date.year, goods };
}

export function treasureName(content: ContentPack, g: BazaarState['treasury']['goods'][number]): string {
  if (g.gear) return gearName(content, g.gear);
  return g.resource ? `${RESOURCE_NAMES[g.resource]} ${g.amount ?? 1}` : '';
}

export function buyTreasure(state: GameState, content: ContentPack, goodId: string): string {
  const blocked = treasuryBlocked(state);
  ensure(!blocked, blocked ?? '');
  const g = bazaarOf(state).treasury.goods.find((x) => x.id === goodId);
  ensure(g, '珍寶閣沒有這件貨');
  ensure(!g.sold, '這件已經賣出');
  ensure(state.resources.lingshi >= g.price, `靈石不足（需要 ${g.price}）`);
  state.resources.lingshi -= g.price;
  g.sold = true;
  if (g.gear) state.armory.push(g.gear);
  else if (g.resource) gain(state.resources, { [g.resource]: g.amount ?? 1 });
  return `在珍寶閣以 ${g.price} 靈石買下${treasureName(content, g)}。`;
}

// ── 拍賣會 ──────────────────────────────────────────

export function grandAuctionBlocked(state: GameState): string | undefined {
  if (marketLevel(state) < B.grandAuction.marketLevel) return `坊市 ${B.grandAuction.marketLevel} 級才有拍賣會`;
  if (hallLevel(state) < B.grandAuction.hall) return `大殿 ${B.grandAuction.hall} 級才有拍賣會`;
  return undefined;
}

/** 下一場拍賣會的年份（大比隔年）。 */
export function nextGrandAuctionYear(state: GameState): number {
  const T = balance.tournament.intervalYears;
  let y = state.date.year;
  if (state.date.month > B.grandAuction.month) y += 1;
  while (y % T !== 1 % T) y += 1;
  return y;
}

export function lotName(content: ContentPack, lot: { kind: string; gear?: GearItem; recipeId?: string; mats?: Partial<Resources> }): string {
  if (lot.gear) return gearName(content, lot.gear);
  if (lot.recipeId) return `配方「${content.recipes.get(lot.recipeId)?.name ?? lot.recipeId}」`;
  return `稀有素材一組（${formatResources(lot.mats ?? {})}）`;
}

export function maybeOpenGrandAuction(state: GameState, content: ContentPack, lines: string[]): void {
  const bz = bazaarOf(state);
  const T = balance.tournament.intervalYears;
  if (bz.grandAuction || state.date.month !== B.grandAuction.month || state.date.year % T !== 1 % T || grandAuctionBlocked(state)) return;
  const r = rng(state, 'sects');
  const R = B.grandAuction.reserve;
  const lots: AuctionLot[] = [];
  lots.push({ id: newId(state, 'lot'), kind: 'gear', reserve: R.gear, playerBid: 0, gear: rollGearAtLeast(state, content, 'superior') });
  const recipe = B.grandAuction.recipes.find((id) => content.recipes.has(id) && !state.recipes.includes(id));
  if (recipe) lots.push({ id: newId(state, 'lot'), kind: 'recipe', reserve: R.recipe, playerBid: 0, recipeId: recipe });
  else lots.push({ id: newId(state, 'lot'), kind: 'gear', reserve: R.gear, playerBid: 0, gear: rollGearAtLeast(state, content, 'superior') });
  const mats: Partial<Resources> = {};
  const n = r.range(B.grandAuction.mats[0], B.grandAuction.mats[1]);
  for (let i = 0; i < n; i++) addInto(mats, { [r.pick(RARE_MATS)]: 1 });
  lots.push({ id: newId(state, 'lot'), kind: 'mats', reserve: R.mats, playerBid: 0, mats });
  bz.grandAuction = { id: newId(state, 'ga'), deadline: monthIndex(state.date) + B.grandAuction.months - 1, lots };
  lines.push(`坊市拍賣會開拍：${lots.map((l) => lotName(content, l)).join('、')}。到「坊市 → 拍賣會」出價，下個月開標。`);
}

export function bidGrandAuction(state: GameState, lotId: string, amount: number): string {
  const a = state.bazaar?.grandAuction;
  ensure(a, '目前沒有拍賣會');
  const lot = a.lots.find((l) => l.id === lotId);
  ensure(lot, '沒有這件拍品');
  ensure(Number.isInteger(amount) && amount >= lot.reserve, `出價至少是底價 ${lot.reserve} 靈石`);
  ensure(amount > lot.playerBid, `新出價要高於目前的 ${lot.playerBid}`);
  const extra = amount - lot.playerBid;
  ensure(state.resources.lingshi >= extra, `靈石不足（需再付 ${extra}）`);
  state.resources.lingshi -= extra;
  lot.playerBid = amount;
  return `出價 ${amount} 靈石（已預扣，沒得標全數退還）。`;
}

export function resolveGrandAuction(state: GameState, content: ContentPack, lines: string[]): void {
  const a = state.bazaar?.grandAuction;
  if (!a || monthIndex(state.date) < a.deadline) return;
  const r = rng(state, 'sects');
  const sects = [...state.sects.filter((s) => !s.annexed)].sort((x, y) => y.resources.lingshi - x.resources.lingshi).slice(0, B.grandAuction.bidders);
  for (const lot of a.lots) {
    const name = lotName(content, lot);
    let best: { sectId: string; bid: number } | null = null;
    for (const s of sects) {
      const def = content.sects.get(s.id);
      const temper = def ? balance.auction.temperamentPct[def.temperament] : 100;
      const raw = Math.floor((lot.reserve * r.range(B.grandAuction.bidPct[0], B.grandAuction.bidPct[1]) * temper) / 10000);
      const bid = Math.min(raw, Math.floor(s.resources.lingshi / 2));
      if (bid >= lot.reserve && (!best || bid > best.bid)) best = { sectId: s.id, bid };
    }
    if (lot.playerBid > 0 && (!best || lot.playerBid > best.bid)) {
      if (lot.gear) state.armory.push(lot.gear);
      if (lot.recipeId && !state.recipes.includes(lot.recipeId)) state.recipes.push(lot.recipeId);
      if (lot.mats) gain(state.resources, lot.mats);
      lines.push(`★ 拍賣會：我宗以 ${lot.playerBid} 靈石標得${name}。`);
      continue;
    }
    if (lot.playerBid > 0) state.resources.lingshi += lot.playerBid;
    const winner = best ? state.sects.find((s) => s.id === best?.sectId) : undefined;
    const wname = winner ? content.sects.get(winner.id)?.name ?? '' : '';
    if (winner && best) {
      winner.resources.lingshi -= best.bid;
      state.intel.unshift({ date: { ...state.date }, sectId: winner.id, text: `${wname}在拍賣會以 ${best.bid} 靈石標得${name}。` });
    }
    lines.push(`拍賣會：${name}${winner ? `由${wname}以 ${best?.bid} 靈石得標` : '流標'}${lot.playerBid > 0 ? `，我宗出價 ${lot.playerBid} 靈石已退還` : ''}。`);
  }
  state.intel = state.intel.slice(0, balance.sects.intelKeep);
  bazaarOf(state).grandAuction = null;
}

// ── 收購單 ──────────────────────────────────────────

function qualifies(item: GearItem, content: ContentPack, slot: 'weapon' | 'armor'): boolean {
  const min = qualityDef(B.buyOrders.gearQuality as GearQuality);
  return content.equipment.get(item.defId)?.slot === slot && qualityDef(item.quality).statPct >= min.statPct;
}

export function orderName(content: ContentPack, o: NonNullable<BazaarState['buyOrder']>): string {
  if (o.resource) return `${RESOURCE_NAMES[o.resource]} ${o.amount}`;
  return `${qualityDef(B.buyOrders.gearQuality as GearQuality).name}以上的${o.slot === 'weapon' ? '兵器' : '護具'} ${o.amount} 件`;
}

export function maybeBuyOrder(state: GameState, content: ContentPack, lines: string[]): void {
  const bz = bazaarOf(state);
  const now = monthIndex(state.date);
  if (bz.buyOrder && bz.buyOrder.expires < now) {
    lines.push(`${content.sects.get(bz.buyOrder.sectId)?.name ?? ''}的收購單（${orderName(content, bz.buyOrder)}）已過期。`);
    bz.buyOrder = null;
  }
  if (bz.buyOrder || marketLevel(state) < 1 || (state.date.month - 1) % B.buyOrders.months !== 0) return;
  const sects = neighborSects(state, content);
  if (!sects.length) return;
  const r = rng(state, 'commission');
  const sect = r.pick(sects);
  const want = r.pick(B.buyOrders.pool);
  const pct = r.range(B.buyOrders.pricePct[0], B.buyOrders.pricePct[1]);
  let base: number;
  if ('resource' in want) {
    const g = balance.market.goods[want.resource];
    base = g ? Math.ceil((sellPrice(state, want.resource) * want.amount) / g.lot) : want.amount * 10;
  } else {
    const probe: GearItem = { id: 'probe', defId: want.slot === 'weapon' ? 'equip.common' : 'equip.common_armor', quality: B.buyOrders.gearQuality as GearQuality, subs: [] };
    base = gearSellPrice(state, content, probe) * want.amount;
  }
  bz.buyOrder = {
    id: newId(state, 'ord'),
    sectId: sect.id,
    ...('resource' in want ? { resource: want.resource } : { slot: want.slot }),
    amount: want.amount,
    lingshi: Math.max(1, Math.ceil((base * pct) / 100)),
    expires: now + B.buyOrders.months - 1,
  };
  lines.push(`${content.sects.get(sect.id)?.name ?? ''}開出收購單：${orderName(content, bz.buyOrder)}，出價 ${bz.buyOrder.lingshi} 靈石（到「坊市 → 收購單」交貨）。`);
}

/** 收購單交貨要交出的法器（挑符合條件裡最差的）。 */
export function orderGear(state: GameState, content: ContentPack): GearItem[] {
  const o = state.bazaar?.buyOrder;
  if (!o?.slot) return [];
  const slot = o.slot;
  return state.armory
    .filter((it) => qualifies(it, content, slot))
    .sort((a, b) => qualityDef(a.quality).statPct - qualityDef(b.quality).statPct)
    .slice(0, o.amount);
}

export function orderBlocked(state: GameState, content: ContentPack): string | undefined {
  const o = state.bazaar?.buyOrder;
  if (!o) return '目前沒有收購單';
  if (o.resource && state.resources[o.resource] < o.amount) return `${RESOURCE_NAMES[o.resource]}不足（${state.resources[o.resource]}／${o.amount}）`;
  if (o.slot && orderGear(state, content).length < o.amount) return `庫房裡符合條件的法器不足（${orderGear(state, content).length}／${o.amount}）`;
  return undefined;
}

export function fulfillOrder(state: GameState, content: ContentPack): string {
  const blocked = orderBlocked(state, content);
  ensure(!blocked, blocked ?? '');
  const bz = bazaarOf(state);
  const o = bz.buyOrder;
  ensure(o, '目前沒有收購單');
  const name = orderName(content, o);
  if (o.resource) state.resources[o.resource] -= o.amount;
  else {
    const ids = new Set(orderGear(state, content).map((x) => x.id));
    state.armory = state.armory.filter((x) => !ids.has(x.id));
  }
  state.resources.lingshi += o.lingshi;
  const sect = state.sects.find((s) => s.id === o.sectId);
  if (sect) addFavor(sect, B.buyOrders.favor);
  bz.buyOrder = null;
  return `交給${content.sects.get(o.sectId)?.name ?? ''}${name}，得靈石 ${o.lingshi}，好感 +${B.buyOrders.favor}。`;
}

// ── 月結 ──────────────────────────────────────────

/** 月結第 6 步（日期推進前）：拍賣會開標。 */
export function settleBazaar(state: GameState, content: ContentPack, lines: string[]): void {
  resolveGrandAuction(state, content, lines);
}

/** 月結第 7 步（日期推進後）：一月擲時事、珍寶閣換貨；拍賣會開拍；收購單。 */
export function tickBazaar(state: GameState, content: ContentPack, lines: string[], stops: StopReason[]): void {
  const bz = bazaarOf(state);
  bz.repBest = Math.max(bz.repBest, state.reputation);
  if (state.date.month === 1) rollAffairs(state, content, lines);
  restockTreasury(state, content);
  const before = bz.grandAuction?.id;
  maybeOpenGrandAuction(state, content, lines);
  if (bz.grandAuction && bz.grandAuction.id !== before) stops.push({ kind: 'auction', text: '坊市拍賣會開拍' });
  maybeBuyOrder(state, content, lines);
}
