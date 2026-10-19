import type { ContentPack } from '../../../content/registry';
import { MAIN_REGION } from '../../../content/registry';
import type { LineageDef, RegionDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { canAfford, formatResources, shortfallText, spend } from '../../resources';
import type { GameState, RegionState } from '../../types';

// 區域（企畫書 §7）：各區有槽位、環境加成與開放條件。開路費用開工時付清，完工下月可建造。

export { MAIN_REGION };

export function regionDef(content: ContentPack, id: string): RegionDef {
  const def = content.regions.get(id);
  ensure(def, `沒有這個區域：${id}`);
  return def;
}

export function regionState(state: GameState, id: string): RegionState {
  return state.regions[id] ?? { status: 'locked', construction: null };
}

export function isRegionOpen(state: GameState, id: string): boolean {
  return regionState(state, id).status === 'open';
}

export function lineageDef(state: GameState, content: ContentPack): LineageDef {
  const l = content.lineages.get(state.lineage);
  ensure(l, '傳承資料錯誤');
  return l;
}

/** 新存檔的區域狀態：沒有開放條件的區域開局即開放。 */
export function initialRegions(content: ContentPack): Record<string, RegionState> {
  const out: Record<string, RegionState> = {};
  for (const r of content.regions.values()) out[r.id] = { status: r.unlock ? 'locked' : 'open', construction: null };
  return out;
}

export function openRegionBlocked(state: GameState, content: ContentPack, id: string, hall: number): string | undefined {
  const def = regionDef(content, id);
  const rs = regionState(state, id);
  if (rs.status === 'open') return '已開放';
  if (rs.status === 'opening') return '施工中';
  if (!def.unlock) return undefined;
  if (def.unlock.requiresHall > hall) return `需要大殿 ${def.unlock.requiresHall} 級`;
  if (!canAfford(state.resources, def.unlock.cost)) return shortfallText(state.resources, def.unlock.cost);
  return undefined;
}

export function startOpenRegion(state: GameState, content: ContentPack, id: string, hall: number): void {
  const def = regionDef(content, id);
  const blocked = openRegionBlocked(state, content, id, hall);
  ensure(!blocked, blocked ?? '');
  ensure(def.unlock, '這個區域不需要開放');
  spend(state.resources, def.unlock.cost);
  state.regions[id] = { status: 'opening', construction: { remainingMonths: def.unlock.months, paid: { ...def.unlock.cost } } };
}

/** 月結算第 3 步：推進開路工程。 */
export function progressRegions(state: GameState, content: ContentPack, lines: string[]): void {
  for (const [id, rs] of Object.entries(state.regions)) {
    if (!rs.construction) continue;
    rs.construction.remainingMonths -= 1;
    if (rs.construction.remainingMonths <= 0) {
      rs.construction = null;
      rs.status = 'open';
      const def = content.regions.get(id);
      lines.push(`★ ${def?.name ?? id}已開放（${def?.bonusText ?? ''}），下月起可以建造。`);
    }
  }
}

/** 區域與傳承對某種建築產量的加成（百分比）。 */
export function productionBonusPct(state: GameState, content: ContentPack, regionId: string, defId: string): number {
  const region = content.regions.get(regionId);
  const lineage = content.lineages.get(state.lineage);
  return (region?.bonus.productionPct[defId] ?? 0) + (lineage?.bonuses.productionPct[defId] ?? 0);
}

/** 山門開放後的交易額度加成（百分比）。 */
export function tradeCapPct(state: GameState, content: ContentPack): number {
  let pct = 0;
  for (const r of content.regions.values()) if (isRegionOpen(state, r.id)) pct += r.bonus.tradeCapPct;
  return pct;
}
