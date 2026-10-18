import { RuleError } from './errors';
import type { ResourceId, Resources } from './types';

export const RESOURCE_IDS: ResourceId[] = [
  'lingshi',
  'food',
  'stone',
  'wood',
  'herb',
  'pill_qi',
  'pill_heal',
  'pill_foundation',
];

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  lingshi: '靈石',
  food: '糧食',
  stone: '石材',
  wood: '靈木',
  herb: '藥草',
  pill_qi: '聚氣丹',
  pill_heal: '回春丹',
  pill_foundation: '築基丹',
};

export function emptyResources(): Resources {
  return { lingshi: 0, food: 0, stone: 0, wood: 0, herb: 0, pill_qi: 0, pill_heal: 0, pill_foundation: 0 };
}

export function canAfford(have: Resources, cost: Partial<Resources>): boolean {
  return RESOURCE_IDS.every((id) => have[id] >= (cost[id] ?? 0));
}

/** 扣除資源；不足時丟出錯誤（呼叫前應先 canAfford）。 */
export function spend(have: Resources, cost: Partial<Resources>): void {
  if (!canAfford(have, cost)) throw new RuleError('資源不足');
  for (const id of RESOURCE_IDS) have[id] -= cost[id] ?? 0;
}

export function gain(have: Resources, amount: Partial<Resources>): void {
  for (const id of RESOURCE_IDS) have[id] += amount[id] ?? 0;
}

export function addInto(target: Partial<Resources>, amount: Partial<Resources>, sign = 1): void {
  for (const id of RESOURCE_IDS) {
    const v = amount[id];
    if (v) target[id] = (target[id] ?? 0) + v * sign;
  }
}

export function scaleResources(amount: Partial<Resources>, pct: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = amount[id];
    if (v) out[id] = Math.floor((v * pct) / 100);
  }
  return out;
}

export function formatResources(amount: Partial<Resources>): string {
  const parts = RESOURCE_IDS.filter((id) => amount[id]).map((id) => `${RESOURCE_NAMES[id]} ${amount[id]}`);
  return parts.length ? parts.join('、') : '無';
}
