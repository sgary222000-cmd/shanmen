import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { RESOURCE_NAMES } from '../../resources';
import type { GameState, ResourceId, Resources } from '../../types';
import { activeEffects } from '../buildings/buildings';

// 倉庫（P2 批次 E）：糧食與材料有存放上限。只限制「新進貨」：
// 月底結算後超出上限、又比月初多出來的部分損耗掉；原本就超過上限的庫存不會被扣。

const S = balance.storage;

export const STORED: ResourceId[] = ['food', 'stone', 'wood', 'herb', 'spirit_herb', 'ore', 'paper', 'beast_mat'];

export function isStored(id: ResourceId): boolean {
  return STORED.includes(id);
}

/** 存放上限；不受倉庫限制的資源回傳 null。 */
export function storageCap(state: GameState, content: ContentPack, id: ResourceId): number | null {
  if (!isStored(id)) return null;
  const bonus = activeEffects(state, content, 'building.warehouse')?.storageBonus ?? 0;
  return id === 'food' ? S.baseFood + bonus * 2 : S.base + bonus;
}

/** 還放得下多少（不受限制的資源回傳 Infinity）。 */
export function storageRoom(state: GameState, content: ContentPack, id: ResourceId): number {
  const cap = storageCap(state, content, id);
  return cap === null ? Infinity : Math.max(0, cap - state.resources[id]);
}

/** 月底：把超出上限的新進貨損耗掉，寫進月報。 */
export function applyStorage(state: GameState, content: ContentPack, before: Resources, lines: string[]): void {
  const lost: string[] = [];
  for (const id of STORED) {
    const cap = storageCap(state, content, id);
    if (cap === null) continue;
    const keep = Math.max(cap, before[id]);
    if (state.resources[id] > keep) {
      lost.push(`${RESOURCE_NAMES[id]} ${state.resources[id] - keep}`);
      state.resources[id] = keep;
    }
  }
  if (lost.length) lines.push(`倉庫放不下，損耗：${lost.join('、')}（蓋倉庫或升級可以提高上限）。`);
}
