import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { addInto } from '../../resources';
import { rng } from '../../rng';
import type { GameState, Resources } from '../../types';
import { gearName, newGear } from '../talent/gear';

// 副本稀有素材（0.11.0）：秘境首領每次被打倒都可能掉稀有素材、丹方與法器。
// 素材回傳給呼叫者決定入庫方式；丹方立即學會，法器直接放進庫房（品質隨機）。

export function rollRareDrops(
  state: GameState,
  content: ContentPack,
  realmId: string,
  scalePct = 100,
): { loot: Partial<Resources>; lines: string[] } {
  const table = balance.rareDrops.realms[realmId];
  const loot: Partial<Resources> = {};
  const lines: string[] = [];
  if (!table) return { loot, lines };
  const r = rng(state, 'explore');
  for (const [id, pct, min, max] of table.mats) {
    if (r.int(100) < Math.floor((pct * scalePct) / 100)) addInto(loot, { [id]: r.range(min, max) });
  }
  for (const [id, pct] of table.recipes) {
    if (state.recipes.includes(id) || r.int(100) >= Math.floor((pct * scalePct) / 100)) continue;
    state.recipes.push(id);
    lines.push(`首領身上找到「${content.recipes.get(id)?.name ?? id}」的配方，已經學會。`);
  }
  for (const [id, pct] of table.gear) {
    if (r.int(100) >= Math.floor((pct * scalePct) / 100)) continue;
    const item = newGear(state, id);
    state.armory.push(item);
    lines.push(`首領遺下法器「${gearName(content, item)}」，已放進庫房。`);
  }
  return { loot, lines };
}
