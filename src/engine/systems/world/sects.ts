import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { SectDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { RESOURCE_NAMES } from '../../resources';
import { rng } from '../../rng';
import type { GameState, ResourceId, SectGoal, SectState, SectTemperament } from '../../types';
import { goodDef, MARKET_GOODS, sellPrice } from '../economy/market';
import { envoyGiftPct } from '../talent/positions';

// 電腦宗門（企畫書 §13，P1 為初步互動）：各有資源帳本、人口、實力、性格與目前目標，
// 每月只做 1–2 件合法行動（缺料就不能建設），行動會影響坊市行情並寫入情報紀錄。
// P1 沒有宣戰與攻打山門（前期保護中）。

const S = balance.sects;

export const GOAL_NAMES: Record<SectGoal, string> = { build: '擴建山門', recruit: '廣收弟子', train: '操練弟子', trade: '經營買賣' };
export const TEMPERAMENT_NAMES: Record<SectTemperament, string> = { steady: '守成', merchant: '經商', warlike: '好戰' };

const GOAL_WEIGHTS: Record<SectTemperament, Record<SectGoal, number>> = {
  steady: { build: 3, recruit: 3, train: 1, trade: 1 },
  merchant: { build: 2, recruit: 1, train: 1, trade: 4 },
  warlike: { build: 2, recruit: 2, train: 4, trade: 0 },
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
  }));
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

/** 嘗試一件行動；不合法（缺料）時回傳 false。 */
function act(state: GameState, def: SectDef, sect: SectState, goal: SectGoal): boolean {
  const r = rng(state, 'sects');
  const res = sect.resources;
  if (goal === 'build') {
    const c = S.buildCost;
    if (sect.buildings >= S.maxBuildings || res.stone < c.stone || res.wood < c.wood || res.lingshi < c.lingshi) return false;
    res.stone -= c.stone;
    res.wood -= c.wood;
    res.lingshi -= c.lingshi;
    sect.buildings += 1;
    sect.power = Math.min(S.maxPower, sect.power + 1);
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
    sect.power = Math.min(S.maxPower, sect.power + 1);
    intel(state, sect.id, `${def.name}招收 ${n} 名弟子（共 ${sect.population} 人）。`);
    return true;
  }
  if (goal === 'train') {
    if (res.lingshi < S.trainCost || sect.power >= S.maxPower) return false;
    res.lingshi -= S.trainCost;
    const n = r.range(1, 2);
    sect.power = Math.min(S.maxPower, sect.power + n);
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
export function tickSects(state: GameState, content: ContentPack): void {
  const january = state.date.month === 12; // 結算的是 12 月，下個月是新的一年
  for (const sect of state.sects) {
    const def = content.sects.get(sect.id);
    if (!def) continue;
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
      if (!act(state, def, sect, sect.goal) && sect.goal !== 'train') act(state, def, sect, 'train');
    }
    capSect(sect);
  }
}

/** 送禮後好感增加量：每 10 靈石 +1，同一年第 n 份禮效果為 1/n；外事執事加成。 */
export function giftFavor(state: GameState, sect: SectState, lingshi: number): number {
  const D = balance.diplomacy;
  const base = Math.floor(lingshi / D.giftUnit);
  const withEnvoy = Math.floor((base * (100 + envoyGiftPct(state))) / 100);
  return Math.floor(withEnvoy / (1 + sect.giftsThisYear));
}

export function giftSect(state: GameState, content: ContentPack, sectId: string, lingshi: number): string {
  const D = balance.diplomacy;
  const sect = state.sects.find((s) => s.id === sectId);
  ensure(sect, '沒有這個宗門');
  const def = sectDef(content, sectId);
  ensure(Number.isInteger(lingshi) && lingshi >= D.minGift, `禮物至少 ${D.minGift} 靈石`);
  ensure(state.resources.lingshi >= lingshi, `靈石不足（需要 ${lingshi}）`);
  const gain = Math.min(D.maxFavor - sect.favor, giftFavor(state, sect, lingshi));
  state.resources.lingshi -= lingshi;
  sect.resources.lingshi += lingshi;
  sect.favor += gain;
  sect.giftsThisYear += 1;
  return `拜訪${def.name}並送上靈石 ${lingshi}，好感 +${gain}（目前 ${sect.favor}，${favorName(sect.favor)}）。今年再送禮效果會遞減。`;
}

/** 賣給宗門的加價（百分比），依好感。 */
export function sectTradeBonus(sect: SectState): number {
  return balance.diplomacy.tradeBonus.find((t) => sect.favor >= t.favor)?.pct ?? 0;
}

/** 賣一批給宗門的價格：坊市本月賣價 × (1 + 好感加價)。 */
export function sectTradePrice(state: GameState, sect: SectState): number {
  const base = state.market.goods[sect.wants] ? sellPrice(state, sect.wants) : goodDef(sect.wants).base;
  return Math.floor((base * (100 + sectTradeBonus(sect))) / 100);
}

export function sectTradeBlocked(state: GameState, sect: SectState, lots: number): string | undefined {
  const D = balance.diplomacy;
  const lot = goodDef(sect.wants).lot;
  if (!Number.isInteger(lots) || lots < 1) return '批數需為正整數';
  if (sect.tradedThisMonth + lots > D.tradeLots) return `本月最多再賣 ${D.tradeLots - sect.tradedThisMonth} 批`;
  if (state.resources[sect.wants] < lot * lots) return `${RESOURCE_NAMES[sect.wants]}不足（需要 ${lot * lots}）`;
  if (sect.resources.lingshi < sectTradePrice(state, sect) * lots) return '對方靈石不足';
  return undefined;
}

export function sectTrade(state: GameState, content: ContentPack, sectId: string, lots: number): string {
  const sect = state.sects.find((s) => s.id === sectId);
  ensure(sect, '沒有這個宗門');
  const def = sectDef(content, sectId);
  const blocked = sectTradeBlocked(state, sect, lots);
  ensure(!blocked, blocked ?? '');
  const lot = goodDef(sect.wants).lot;
  const value = sectTradePrice(state, sect) * lots;
  state.resources[sect.wants] -= lot * lots;
  state.resources.lingshi += value;
  sect.resources.lingshi -= value;
  sect.tradedThisMonth += lots;
  return `賣給${def.name}${RESOURCE_NAMES[sect.wants]} ${lot * lots}，得靈石 ${value}。`;
}
