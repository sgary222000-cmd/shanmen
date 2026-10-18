import { balance } from '../../../content/balance';
import { ensure } from '../../errors';
import { RESOURCE_NAMES } from '../../resources';
import type { GameState, ResourceId } from '../../types';
import { hallLevel } from '../buildings/buildings';

// 山下商隊（P0 的簡易交易）：固定價格、買賣價差、每月限額，避免無限套利，
// 也讓缺靈石或缺糧時一定有恢復途徑。完整市場於 P1 實作。

export type Sellable = 'stone' | 'wood' | 'herb' | 'food' | 'pill_qi' | 'pill_heal';
export const SELLABLE: Sellable[] = ['stone', 'wood', 'herb', 'food', 'pill_qi', 'pill_heal'];

export function sellCap(state: GameState): number {
  return balance.trade.sellCapBase + balance.trade.sellCapPerHall * hallLevel(state);
}

/** 賣出 amount 單位可得的靈石。 */
export function sellValue(resource: Sellable, amount: number): number {
  if (resource === 'pill_qi' || resource === 'pill_heal') return amount * balance.trade.sellPill[resource];
  return Math.floor(amount / balance.trade.sellPer[resource]);
}

export function priceText(resource: Sellable): string {
  if (resource === 'pill_qi' || resource === 'pill_heal') return `1 顆換 ${balance.trade.sellPill[resource]} 靈石`;
  return `${balance.trade.sellPer[resource]} 份換 1 靈石`;
}

export function sell(state: GameState, resource: Sellable, amount: number): string {
  ensure(SELLABLE.includes(resource), '商隊不收這種物品');
  ensure(Number.isInteger(amount) && amount > 0, '數量需為正整數');
  ensure(state.resources[resource as ResourceId] >= amount, `${RESOURCE_NAMES[resource]}不足`);
  const value = sellValue(resource, amount);
  ensure(value > 0, '數量太少，換不到靈石');
  const left = sellCap(state) - state.trade.soldLingshi;
  ensure(value <= left, `商隊本月只剩 ${left} 靈石的收購額度`);
  // 只扣實際換到靈石的部分，零頭退回
  const used =
    resource === 'pill_qi' || resource === 'pill_heal' ? amount : value * balance.trade.sellPer[resource];
  state.resources[resource as ResourceId] -= used;
  state.resources.lingshi += value;
  state.trade.soldLingshi += value;
  return `賣出${RESOURCE_NAMES[resource]} ${used}，得靈石 ${value}。`;
}

export function buyFood(state: GameState, lingshi: number): string {
  ensure(Number.isInteger(lingshi) && lingshi > 0, '數量需為正整數');
  ensure(state.resources.lingshi >= lingshi, '靈石不足');
  const food = lingshi * balance.trade.foodPerLingshi;
  const left = balance.trade.buyFoodCap - state.trade.boughtFood;
  ensure(food <= left, `商隊本月只剩 ${left} 份糧食可賣`);
  state.resources.lingshi -= lingshi;
  state.resources.food += food;
  state.trade.boughtFood += food;
  return `以靈石 ${lingshi} 買入糧食 ${food}。`;
}
