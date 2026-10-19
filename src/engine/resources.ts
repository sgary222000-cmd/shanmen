import { RuleError } from './errors';
import type { ResourceId, Resources } from './types';

export const RESOURCE_IDS: ResourceId[] = [
  'lingshi',
  'food',
  'stone',
  'wood',
  'herb',
  'spirit_herb',
  'ore',
  'paper',
  'beast_mat',
  'pill_qi',
  'pill_heal',
  'pill_foundation',
  'pill_peiyuan',
  'talisman_fire',
  'talisman_guard',
  'artifact',
  'beast_egg',
  'pill_core',
  'pill_life',
];

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  lingshi: '靈石',
  food: '糧食',
  stone: '石材',
  wood: '靈木',
  herb: '藥草',
  spirit_herb: '靈藥',
  ore: '靈礦',
  paper: '符紙',
  beast_mat: '獸材',
  pill_qi: '聚氣丹',
  pill_heal: '回春丹',
  pill_foundation: '築基丹',
  pill_peiyuan: '培元丹',
  talisman_fire: '火符',
  talisman_guard: '護身符',
  artifact: '法器',
  beast_egg: '靈獸蛋',
  pill_core: '結丹靈液',
  pill_life: '延壽丹',
};

export function emptyResources(): Resources {
  return Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0])) as Resources;
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

/** 費用不足時的說明：只列出還缺的資源與數量。 */
export function shortfallText(have: Resources, cost: Partial<Resources>): string {
  const lack: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const need = (cost[id] ?? 0) - have[id];
    if (need > 0) lack[id] = need;
  }
  return `材料不足（還缺 ${formatResources(lack)}）`;
}

export function formatResources(amount: Partial<Resources>): string {
  const parts = RESOURCE_IDS.filter((id) => amount[id]).map((id) => `${RESOURCE_NAMES[id]} ${amount[id]}`);
  return parts.length ? parts.join('、') : '無';
}
