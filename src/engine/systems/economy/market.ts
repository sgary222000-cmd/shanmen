import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import { RESOURCE_IDS, RESOURCE_NAMES } from '../../resources';
import { rng } from '../../rng';
import type { GameState, GearItem, MarketGood, MarketState, ResourceId } from '../../types';
import { gearName, gearScore, qualityDef } from '../talent/gear';
import { effectsOf, isOperating, MARKET } from '../buildings/buildings';
import { envoyDiscount } from '../talent/positions';
import { storageRoom } from './storage';

// 坊市（山門區建築）：每種商品以「一批」為單位買賣，每月有限貨量與收購量。
// 買價比賣價高約 25%，價格在基準價 ±30% 內每月浮動（亂數存在存檔裡，讀檔不會變）。
// 同一個月內買了再賣一定虧錢；與山下商隊之間也無法套利（見測試 market.test.ts）。

const M = balance.market;

export const MARKET_GOODS: ResourceId[] = RESOURCE_IDS.filter((id) => M.goods[id]);

export function goodDef(id: ResourceId) {
  const def = M.goods[id];
  ensure(def, `坊市不買賣${RESOURCE_NAMES[id]}`);
  return def;
}

/** 坊市目前的貨量倍率（百分比）；沒有運作中的坊市時為 0。 */
export function marketStockPct(state: GameState, content: ContentPack): number {
  const b = state.buildings.find((x) => x.defId === MARKET && isOperating(x));
  return b ? effectsOf(content, b)?.marketStockPct ?? 0 : 0;
}

export function marketOpen(state: GameState, content: ContentPack): boolean {
  return marketStockPct(state, content) > 0;
}

/** 聲望（最多 5%）與外事執事（最多 5%）帶來的買價折扣（百分比）。買價仍一定高於賣價，無法套利。 */
export function discountPct(state: GameState): number {
  return Math.min(M.maxDiscount, Math.floor(state.reputation / M.repPerDiscount)) + envoyDiscount(state);
}

/** 一批的賣出價（玩家賣給坊市可得的靈石）。 */
export function sellPriceAt(base: number, pct: number): number {
  return Math.max(1, Math.floor((base * pct * M.sellPct) / 10000));
}

/** 一批的買入價（玩家向坊市買需付的靈石）；至少比賣價高 1。 */
export function buyPriceAt(base: number, pct: number, discount = 0): number {
  const sell = sellPriceAt(base, pct);
  return Math.max(sell + 1, Math.ceil((sell * (M.spreadPct - discount)) / 100));
}

function good(state: GameState, id: ResourceId): MarketGood {
  const g = state.market.goods[id];
  ensure(g, `坊市本月沒有${RESOURCE_NAMES[id]}的行情`);
  return g;
}

export function sellPrice(state: GameState, id: ResourceId): number {
  return sellPriceAt(goodDef(id).base, good(state, id).pct);
}

export function buyPrice(state: GameState, id: ResourceId): number {
  return buyPriceAt(goodDef(id).base, good(state, id).pct, discountPct(state));
}

/** 本月還能買幾批。 */
export function stockLeft(state: GameState, content: ContentPack, id: ResourceId): number {
  const g = good(state, id);
  return Math.max(0, Math.floor((g.stock * marketStockPct(state, content)) / 100) - g.bought);
}

/** 本月還能賣幾批。 */
export function demandLeft(state: GameState, content: ContentPack, id: ResourceId): number {
  const g = good(state, id);
  return Math.max(0, Math.floor((g.demand * marketStockPct(state, content)) / 100) - g.sold);
}

function checkLots(lots: number) {
  ensure(Number.isInteger(lots) && lots > 0, '批數需為正整數');
}

export function marketBuy(state: GameState, content: ContentPack, id: ResourceId, lots: number): string {
  ensure(marketOpen(state, content), '尚未建成坊市（山門區）');
  checkLots(lots);
  const def = goodDef(id);
  const left = stockLeft(state, content, id);
  ensure(lots <= left, `坊市本月只剩 ${left} 批${RESOURCE_NAMES[id]}`);
  const cost = buyPrice(state, id) * lots;
  ensure(state.resources.lingshi >= cost, `靈石不足（需要 ${cost}）`);
  ensure(def.lot * lots <= storageRoom(state, content, id), `倉庫放不下（${RESOURCE_NAMES[id]}還能放 ${storageRoom(state, content, id)}）`);
  state.resources.lingshi -= cost;
  state.resources[id] += def.lot * lots;
  good(state, id).bought += lots;
  return `在坊市買入${RESOURCE_NAMES[id]} ${def.lot * lots}，花費靈石 ${cost}。`;
}

export function marketSell(state: GameState, content: ContentPack, id: ResourceId, lots: number): string {
  ensure(marketOpen(state, content), '尚未建成坊市（山門區）');
  checkLots(lots);
  const def = goodDef(id);
  const left = demandLeft(state, content, id);
  ensure(lots <= left, `坊市本月只再收 ${left} 批${RESOURCE_NAMES[id]}`);
  const amount = def.lot * lots;
  ensure(state.resources[id] >= amount, `${RESOURCE_NAMES[id]}不足（需要 ${amount}）`);
  const value = sellPrice(state, id) * lots;
  state.resources[id] -= amount;
  state.resources.lingshi += value;
  good(state, id).sold += lots;
  return `在坊市賣出${RESOURCE_NAMES[id]} ${amount}，得靈石 ${value}。`;
}

/** 一件法器在坊市的賣價：制式法器的行情 × 品質倍率 × 法器強弱（0.11.0）。 */
export function gearSellPrice(state: GameState, content: ContentPack, item: GearItem): number {
  return Math.max(1, Math.floor((sellPrice(state, 'artifact') * qualityDef(item.quality).pricePct * gearScore(content.equipment.get(item.defId))) / 100));
}

/** 賣出庫房裡的一件法器（佔坊市法器的收購量）。 */
export function sellGear(state: GameState, content: ContentPack, itemId: string): string {
  ensure(marketOpen(state, content), '尚未建成坊市（山門區）');
  const idx = state.armory.findIndex((x) => x.id === itemId);
  const item = state.armory[idx];
  ensure(item, '庫房裡沒有這件法器');
  ensure(demandLeft(state, content, 'artifact') >= 1, '坊市本月不再收購法器');
  const value = gearSellPrice(state, content, item);
  state.armory.splice(idx, 1);
  state.resources.lingshi += value;
  good(state, 'artifact').sold += 1;
  return `在坊市賣出${gearName(content, item)}，得靈石 ${value}。`;
}

/** 坊市販售、尚未習得的配方。 */
export function recipesForSale(state: GameState, content: ContentPack) {
  return [...content.recipes.values()].filter((r) => r.marketPrice && !state.recipes.includes(r.id));
}

export function buyRecipe(state: GameState, content: ContentPack, recipeId: string): string {
  ensure(marketOpen(state, content), '尚未建成坊市（山門區）');
  const recipe = content.recipes.get(recipeId);
  ensure(recipe?.marketPrice, '坊市沒有賣這個配方');
  ensure(!state.recipes.includes(recipeId), '已經會這個配方');
  ensure(state.resources.lingshi >= recipe.marketPrice, `靈石不足（需要 ${recipe.marketPrice}）`);
  state.resources.lingshi -= recipe.marketPrice;
  state.recipes.push(recipeId);
  return `以靈石 ${recipe.marketPrice} 購得配方「${recipe.name}」。`;
}

export function emptyMarket(): MarketState {
  return { goods: {}, rumor: null };
}

/** 月底更新行情：價格隨機漂移、重抽貨量，偶爾有某宗大量收購的消息。開局與舊存檔升級時也會呼叫。 */
export function rollMarket(state: GameState): void {
  const r = rng(state, 'market');
  const goods: MarketState['goods'] = {};
  for (const id of MARKET_GOODS) {
    const def = goodDef(id);
    const prev = state.market.goods[id]?.pct ?? 100;
    const pct = Math.max(M.minPct, Math.min(M.maxPct, prev + r.range(-M.driftMax, M.driftMax)));
    const roll = (n: number) => Math.max(1, Math.round((n * r.range(M.rollMinPct, M.rollMaxPct)) / 100));
    goods[id] = { pct, stock: roll(def.stock), demand: roll(def.demand), bought: 0, sold: 0 };
  }
  let rumor: string | null = null;
  if (r.chance(5000)) {
    const id = r.pick(MARKET_GOODS);
    const rival = r.pick(M.rivals);
    const g = goods[id];
    if (g) {
      g.demand *= 2;
      g.pct = Math.min(M.maxPct, g.pct + M.rumorPct);
      rumor = `${rival}本月大量收購${RESOURCE_NAMES[id]}，坊市收購價上漲、收購量加倍。`;
    }
  }
  state.market = { goods, rumor };
  // 坊市傳聞也記進情報，和月報一致（舊存檔升級途中還沒有情報欄位時略過）
  if (rumor && Array.isArray(state.intel)) {
    state.intel.unshift({ date: { ...state.date }, sectId: '', text: rumor });
    state.intel = state.intel.slice(0, balance.sects.intelKeep);
  }
}
