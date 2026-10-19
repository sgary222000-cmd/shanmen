import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { SectDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { RESOURCE_NAMES } from '../../resources';
import { rng } from '../../rng';
import type { GameState, ResourceId, SectGoal, SectState, SectTemperament, StopReason } from '../../types';
import { contactBlocked, councilEnvoyPct, isDistant, requestAid, SITE_KIND_NAMES, siteIncome } from './diplomacy';
import { goodDef, MARKET_GOODS, sellPrice } from '../economy/market';
import { envoyGiftPct } from '../talent/positions';
import { defendSite, graceOver, PLAYER, playerPower } from './war';

// 電腦宗門（企畫書 §13，P1 為初步互動）：各有資源帳本、人口、實力、性格與目前目標，
// 每月只做 1–2 件合法行動（缺料就不能建設），行動會影響坊市行情並寫入情報紀錄。
// P2 批次 C：遠方勢力只做簡化結算；鄰近宗門會搶佔無主據點、攻打他宗據點（盟友被攻打時會向我宗求援）。
// 宣戰與攻打山門在批次 D。

const S = balance.sects;

export const GOAL_NAMES: Record<SectGoal, string> = { build: '擴建山門', recruit: '廣收弟子', train: '操練弟子', trade: '經營買賣', expand: '爭奪據點' };
export const TEMPERAMENT_NAMES: Record<SectTemperament, string> = {
  steady: '守成',
  merchant: '經商',
  warlike: '好戰',
  scholarly: '求道',
  honorable: '重承諾',
};

const GOAL_WEIGHTS: Record<SectTemperament, Record<SectGoal, number>> = {
  steady: { build: 3, recruit: 3, train: 1, trade: 1, expand: 1 },
  merchant: { build: 2, recruit: 1, train: 1, trade: 4, expand: 1 },
  warlike: { build: 2, recruit: 2, train: 3, trade: 0, expand: 3 },
  scholarly: { build: 3, recruit: 1, train: 3, trade: 1, expand: 0 },
  honorable: { build: 2, recruit: 2, train: 3, trade: 1, expand: 1 },
};

/** 宗門想收購的物資（我宗可賣給他們）。 */
const WANTS: ResourceId[] = ['herb', 'spirit_herb', 'ore', 'pill_qi', 'pill_heal', 'talisman_fire', 'talisman_guard', 'artifact', 'beast_mat'];

export function initialSects(content: ContentPack): SectState[] {
  return [...content.sects.values()].map((d) => ({
    id: d.id,
    resources: { lingshi: d.start.lingshi, food: d.start.food, stone: d.start.stone, wood: d.start.wood },
    population: d.start.population,
    buildings: d.start.buildings,
    power: d.start.power,
    favor: d.start.favor,
    giftsThisYear: 0,
    tradedThisMonth: 0,
    goal: d.temperament === 'merchant' ? 'trade' : d.temperament === 'warlike' ? 'train' : 'build',
    wants: 'pill_qi',
    trust: d.start.trust ?? 20,
    treaty: null,
  }));
}

/** 本年的實力上限：開局實力 + 每年放寬，最多 maxPower。 */
export function sectPowerCap(state: GameState, content: ContentPack, sect: SectState): number {
  const def = content.sects.get(sect.id);
  const start = def?.start.power ?? 0;
  const max = def?.scope === 'distant' ? S.distantMaxPower : S.maxPower;
  return Math.min(max, Math.max(start, start + S.powerPerYear * (state.date.year - 1)));
}

export function sectDef(content: ContentPack, id: string): SectDef {
  const d = content.sects.get(id);
  ensure(d, '沒有這個宗門');
  return d;
}

export function favorName(favor: number): string {
  if (favor >= 80) return '交好';
  if (favor >= 60) return '友好';
  if (favor >= 30) return '普通';
  return '冷淡';
}

function weighted<T extends string>(state: GameState, weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let roll = rng(state, 'sects').int(total);
  for (const [k, w] of entries) {
    if (roll < w) return k;
    roll -= w;
  }
  return entries[0]?.[0] as T;
}

function intel(state: GameState, sectId: string, text: string): void {
  state.intel.unshift({ date: { ...state.date }, sectId, text });
  state.intel = state.intel.slice(0, S.intelKeep);
}

/** 爭奪據點：先搶無主的；沒有時攻打實力較弱的鄰宗據點，被攻打的若是我宗盟友就會求援。 */
function expand(state: GameState, content: ContentPack, def: SectDef, sect: SectState, lines: string[], stops: StopReason[]): boolean {
  const B = balance.sites;
  const r = rng(state, 'sects');
  const sites = state.sites ?? [];
  const free = sites.filter((x) => !x.owner);
  if (sites.filter((x) => x.owner === sect.id).length >= B.maxPerSect) return false;
  if (free.length) {
    if (sect.resources.lingshi < B.claimLingshi) return false;
    const site = r.pick(free);
    sect.resources.lingshi -= B.claimLingshi;
    site.owner = sect.id;
    intel(state, sect.id, `${def.name}派人佔下無主的${site.name}（${SITE_KIND_NAMES[site.kind]}）。`);
    return true;
  }
  // 前期保護結束後，好戰而冷淡、沒有條約的宗門也會來搶我宗的據點
  const hitPlayer =
    graceOver(state) && !sect.treaty && !sect.vassal && def.temperament === 'warlike' && sect.favor < balance.war.declareFavor && sect.power > playerPower(state, content);
  const targets = sites.filter((x) => {
    if (x.owner === PLAYER) return hitPlayer;
    const owner = state.sects.find((s) => s.id === x.owner);
    return owner && owner.id !== sect.id && !owner.annexed && owner.power < sect.power;
  });
  if (!targets.length) return false;
  const site = r.pick(targets);
  if (site.owner === PLAYER) {
    defendSite(state, content, sect, site, lines, stops);
    return true;
  }
  const defender = state.sects.find((s) => s.id === site.owner);
  if (!defender) return false;
  const dname = content.sects.get(defender.id)?.name ?? '';
  if (defender.treaty?.kind === 'alliance') {
    requestAid(state, content, defender, `${def.name}出兵爭奪${dname}的${site.name}，`, lines, stops);
    // 盟友有我宗撐腰，對方這次先撤
    intel(state, sect.id, `${def.name}覬覦${dname}的${site.name}，因${dname}有盟友撐腰而暫緩。`);
    return true;
  }
  const bp = Math.max(B.attackMinBp, Math.min(B.attackMaxBp, B.attackBaseBp + (sect.power - defender.power) * B.attackPerPowerBp));
  if (r.chance(bp)) {
    site.owner = sect.id;
    defender.power = Math.max(1, defender.power - B.lossPower);
    intel(state, sect.id, `${def.name}從${dname}手中奪下${site.name}。`);
  } else {
    sect.power = Math.max(1, sect.power - B.lossPower);
    intel(state, sect.id, `${def.name}爭奪${dname}的${site.name}失利，折損了些弟子。`);
  }
  return true;
}

/** 遠方勢力的簡化結算：每年擴建、招收、操練一次，實力緩慢成長。 */
function tickDistant(state: GameState, content: ContentPack, sect: SectState): void {
  if (state.date.month !== 12) return;
  const r = rng(state, 'sects');
  sect.buildings = Math.min(S.maxBuildings, sect.buildings + 1);
  sect.population = Math.min(S.maxPopulation, sect.population + r.range(0, 3));
  sect.power = Math.min(sectPowerCap(state, content, sect), sect.power + r.range(1, 3));
  sect.resources.lingshi += sect.buildings * S.lingshiPerBuilding * 12;
  capSect(sect);
}

/** 嘗試一件行動；不合法（缺料）時回傳 false。 */
function act(
  state: GameState,
  content: ContentPack,
  def: SectDef,
  sect: SectState,
  goal: SectGoal,
  lines: string[],
  stops: StopReason[],
): boolean {
  const r = rng(state, 'sects');
  const cap = sectPowerCap(state, content, sect);
  const res = sect.resources;
  if (goal === 'expand') return expand(state, content, def, sect, lines, stops);
  if (goal === 'build') {
    const c = S.buildCost;
    if (sect.buildings >= S.maxBuildings || res.stone < c.stone || res.wood < c.wood || res.lingshi < c.lingshi) return false;
    res.stone -= c.stone;
    res.wood -= c.wood;
    res.lingshi -= c.lingshi;
    sect.buildings += 1;
    sect.power = Math.max(sect.power, Math.min(cap, sect.power + 1));
    intel(state, sect.id, `${def.name}擴建山門（建築共 ${sect.buildings} 級）。`);
    return true;
  }
  if (goal === 'recruit') {
    const c = S.recruitCost;
    if (res.food < c.food || res.lingshi < c.lingshi || sect.population >= S.maxPopulation) return false;
    res.food -= c.food;
    res.lingshi -= c.lingshi;
    const n = Math.min(S.maxPopulation - sect.population, r.range(3, 6));
    sect.population += n;
    sect.power = Math.max(sect.power, Math.min(cap, sect.power + 1));
    intel(state, sect.id, `${def.name}招收 ${n} 名弟子（共 ${sect.population} 人）。`);
    return true;
  }
  if (goal === 'train') {
    if (res.lingshi < S.trainCost || sect.power >= cap) return false;
    res.lingshi -= S.trainCost;
    const n = r.range(1, 2);
    sect.power = Math.min(cap, sect.power + n);
    intel(state, sect.id, `${def.name}閉門操練弟子，實力提升。`);
    return true;
  }
  // trade：在坊市大量收購或拋售，影響本月行情
  const id = r.pick(MARKET_GOODS);
  const g = state.market.goods[id];
  if (!g) return false;
  if (r.chance(5000)) {
    g.demand *= 2;
    g.pct = Math.min(balance.market.maxPct, g.pct + balance.market.rumorPct);
    res.lingshi = Math.max(0, res.lingshi - r.range(10, 30));
    intel(state, sect.id, `${def.name}本月大量收購${RESOURCE_NAMES[id]}，坊市收購價上漲、收購量加倍。`);
  } else {
    g.stock += 2;
    g.pct = Math.max(balance.market.minPct, g.pct - 10);
    res.lingshi += r.range(20, 60);
    intel(state, sect.id, `${def.name}在坊市拋售${RESOURCE_NAMES[id]}，貨量增加、價格下跌。`);
  }
  if (!state.market.rumor) state.market.rumor = state.intel[0]?.text ?? null;
  return true;
}

function capSect(sect: SectState): void {
  const res = sect.resources;
  for (const k of Object.keys(S.resourceCap) as (keyof typeof S.resourceCap)[]) res[k] = Math.min(res[k], S.resourceCap[k]);
}

/** 月結算第 6 步：各宗門收支與行動。在坊市行情更新之後執行，行動才會影響下個月的行情。 */
export function tickSects(state: GameState, content: ContentPack, lines: string[] = [], stops: StopReason[] = []): void {
  const january = state.date.month === 12; // 結算的是 12 月，下個月是新的一年
  siteIncome(state);
  for (const sect of state.sects) {
    const def = content.sects.get(sect.id);
    if (!def || sect.annexed) continue;
    if (def.scope === 'distant') {
      tickDistant(state, content, sect);
      if (state.date.month % 3 === 0) {
        if (sect.favor > S.favorNeutral) sect.favor -= 1;
        else if (sect.favor < S.favorNeutral) sect.favor += 1;
      }
      if (january) sect.giftsThisYear = 0;
      continue;
    }
    const res = sect.resources;
    res.lingshi += sect.buildings * S.lingshiPerBuilding;
    res.stone += sect.buildings * S.materialPerBuilding;
    res.wood += sect.buildings * S.materialPerBuilding;
    res.food += Math.floor(sect.population / 3) * S.foodPerThreePeople - sect.population;
    if (res.food < 0) {
      res.food = 0;
      sect.population = Math.max(5, sect.population - 1);
      intel(state, sect.id, `${def.name}糧食不足，有弟子離去。`);
    }
    sect.tradedThisMonth = 0;
    sect.wants = rng(state, 'sects').pick(WANTS);
    if (january) {
      sect.giftsThisYear = 0;
      sect.goal = weighted(state, GOAL_WEIGHTS[def.temperament]);
    }
    // 好感慢慢回到中性
    if (state.date.month % 3 === 0) {
      if (sect.favor > S.favorNeutral) sect.favor -= 1;
      else if (sect.favor < S.favorNeutral) sect.favor += 1;
    }
    const actions = rng(state, 'sects').chance(5000) ? 2 : 1;
    for (let i = 0; i < actions; i++) {
      if (!act(state, content, def, sect, sect.goal, lines, stops) && sect.goal !== 'train') act(state, content, def, sect, 'train', lines, stops);
    }
    capSect(sect);
  }
}

/** 外事執事的送禮加成（百分比）；議事堂讓它再提高。 */
export function giftEnvoyPct(state: GameState, content: ContentPack): number {
  return Math.floor((envoyGiftPct(state) * (100 + councilEnvoyPct(state, content))) / 100);
}

/** 送禮後好感增加量：每 10 靈石 +1，同一年第 n 份禮效果為 1/n；外事執事加成。 */
export function giftFavor(state: GameState, content: ContentPack, sect: SectState, lingshi: number): number {
  const D = balance.diplomacy;
  const base = Math.floor(lingshi / D.giftUnit);
  const withEnvoy = Math.floor((base * (100 + giftEnvoyPct(state, content))) / 100);
  return Math.floor(withEnvoy / (1 + sect.giftsThisYear));
}

export function giftSect(state: GameState, content: ContentPack, sectId: string, lingshi: number): string {
  const D = balance.diplomacy;
  const sect = state.sects.find((s) => s.id === sectId);
  ensure(sect, '沒有這個宗門');
  const def = sectDef(content, sectId);
  const contact = contactBlocked(state, content, sectId);
  ensure(!contact, contact ?? '');
  ensure(Number.isInteger(lingshi) && lingshi >= D.minGift, `禮物至少 ${D.minGift} 靈石`);
  ensure(state.resources.lingshi >= lingshi, `靈石不足（需要 ${lingshi}）`);
  const gain = Math.min(D.maxFavor - sect.favor, giftFavor(state, content, sect, lingshi));
  state.resources.lingshi -= lingshi;
  sect.resources.lingshi += lingshi;
  sect.favor += gain;
  sect.giftsThisYear += 1;
  return `拜訪${def.name}並送上靈石 ${lingshi}，好感 +${gain}（目前 ${sect.favor}，${favorName(sect.favor)}）。今年再送禮效果會遞減。`;
}

/** 賣給宗門的加價（百分比），依好感；聯盟另加。 */
export function sectTradeBonus(sect: SectState): number {
  const ally = sect.treaty?.kind === 'alliance' ? balance.diplomacy.allianceTradePct : 0;
  return (balance.diplomacy.tradeBonus.find((t) => sect.favor >= t.favor)?.pct ?? 0) + ally;
}

/** 每月可以賣給這個宗門的批數（聯盟較多）。 */
export function sectTradeLots(sect: SectState): number {
  return balance.diplomacy.tradeLots + (sect.treaty?.kind === 'alliance' ? balance.diplomacy.allianceTradeLots : 0);
}

/** 賣一批給宗門的價格：坊市本月賣價 × (1 + 好感加價)。 */
export function sectTradePrice(state: GameState, sect: SectState): number {
  const base = state.market.goods[sect.wants] ? sellPrice(state, sect.wants) : goodDef(sect.wants).base;
  return Math.floor((base * (100 + sectTradeBonus(sect))) / 100);
}

export function sectTradeBlocked(state: GameState, content: ContentPack, sect: SectState, lots: number): string | undefined {
  const lot = goodDef(sect.wants).lot;
  if (sect.annexed) return '已併入我宗';
  if (isDistant(content, sect.id)) return '路途遙遠，無法直接買賣';
  if (!Number.isInteger(lots) || lots < 1) return '批數需為正整數';
  if (sect.tradedThisMonth + lots > sectTradeLots(sect)) return `本月最多再賣 ${sectTradeLots(sect) - sect.tradedThisMonth} 批`;
  if (state.resources[sect.wants] < lot * lots) return `${RESOURCE_NAMES[sect.wants]}不足（需要 ${lot * lots}）`;
  if (sect.resources.lingshi < sectTradePrice(state, sect) * lots) return '對方靈石不足';
  return undefined;
}

export function sectTrade(state: GameState, content: ContentPack, sectId: string, lots: number): string {
  const sect = state.sects.find((s) => s.id === sectId);
  ensure(sect, '沒有這個宗門');
  const def = sectDef(content, sectId);
  const blocked = sectTradeBlocked(state, content, sect, lots);
  ensure(!blocked, blocked ?? '');
  const lot = goodDef(sect.wants).lot;
  const value = sectTradePrice(state, sect) * lots;
  state.resources[sect.wants] -= lot * lots;
  state.resources.lingshi += value;
  sect.resources.lingshi -= value;
  sect.tradedThisMonth += lots;
  return `賣給${def.name}${RESOURCE_NAMES[sect.wants]} ${lot * lots}，得靈石 ${value}。`;
}
