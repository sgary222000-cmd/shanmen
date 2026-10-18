import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { RESOURCE_IDS } from '../../resources';
import { rng } from '../../rng';
import type { Beast, BeastTask, GameState, Resources } from '../../types';
import { BEAST_GARDEN, effectsOf, hasLineage, isOperating } from '../buildings/buildings';
import { findCharacter } from '../characters/characters';
import { BEAST_TAMING } from '../talent/items';

// 靈獸（企畫書 §11）：靈獸苑孵化靈獸蛋，幼年吃飽一段時間後長成成年。
// 每隻靈獸可以：隨主人出戰（不佔隊伍名額，每人最多一隻）、外出採集、或休養。

export const BEAST_TASK_NAMES: Record<BeastTask, string> = { follow: '隨主人出戰', gather: '外出採集', rest: '休養' };
export const BEAST_LINEAGE = 'lineage.beast';

export function beastGarden(state: GameState) {
  return state.buildings.find((b) => b.defId === BEAST_GARDEN && isOperating(b));
}

/** 宗門最多能養幾隻靈獸。御獸傳承或分支依靈獸苑；只憑馴獸法時最多一隻。 */
export function beastCapacity(state: GameState, content: ContentPack): number {
  const garden = beastGarden(state);
  const cap = garden ? effectsOf(content, garden)?.beastCapacity ?? 0 : 0;
  if (hasLineage(state, BEAST_LINEAGE)) return cap;
  if (state.items.includes(BEAST_TAMING)) return Math.min(cap, balance.beasts.tamingCap);
  return 0;
}

export function hatchBlocked(state: GameState, content: ContentPack): string | undefined {
  if (!beastGarden(state)) return '需要運作中的靈獸苑';
  const cap = beastCapacity(state, content);
  if (cap <= 0) return '需要御獸傳承、御獸分支或「馴獸法」';
  if (state.beasts.length >= cap) return `靈獸已達上限 ${cap} 隻`;
  if (state.resources.beast_egg < 1) return '沒有靈獸蛋（秘境、委託或坊市取得）';
  return undefined;
}

export function hatchBeast(state: GameState, content: ContentPack): string {
  const blocked = hatchBlocked(state, content);
  ensure(!blocked, blocked ?? '');
  const species = rng(state, 'beast').pick([...content.beasts.values()]);
  state.resources.beast_egg -= 1;
  const same = state.beasts.filter((b) => b.speciesId === species.id).length;
  const beast: Beast = {
    id: newId(state, 'beast'),
    speciesId: species.id,
    name: same ? `${species.name}（${same + 1}）` : species.name,
    ownerId: null,
    stage: 'young',
    growth: 0,
    task: 'rest',
  };
  state.beasts.push(beast);
  return `靈獸蛋破殼，孵出一隻幼年${species.name}！`;
}

export function setBeast(state: GameState, beastId: string, ownerId: string | null, task: BeastTask): string {
  const beast = state.beasts.find((b) => b.id === beastId);
  ensure(beast, '沒有這隻靈獸');
  ensure(['follow', 'gather', 'rest'].includes(task), '沒有這種安排');
  if (ownerId) {
    const owner = findCharacter(state, ownerId);
    ensure(owner, '找不到主人');
    const other = state.beasts.find((b) => b.ownerId === ownerId && b.id !== beastId);
    ensure(!other, `${owner.name}已經有靈獸「${other?.name ?? ''}」，每人最多一隻`);
  }
  ensure(task !== 'follow' || ownerId, '隨主人出戰需要指定主人');
  ensure(
    !(state.exploration?.status === 'active' && beast.ownerId && state.exploration.teamIds.includes(beast.ownerId)),
    '探索途中不能更換靈獸安排',
  );
  beast.ownerId = ownerId;
  beast.task = task;
  return `${beast.name}：${BEAST_TASK_NAMES[task]}${ownerId ? `（主人：${findCharacter(state, ownerId)?.name ?? ''}）` : ''}。`;
}

export function beastFood(content: ContentPack, beast: Beast): number {
  const species = content.beasts.get(beast.speciesId);
  return (species?.food ?? 0) + (beast.stage === 'adult' ? 1 : 0);
}

/** 本月採集所得（吃飽才會出去）。幼年減半；主人御獸技藝與御獸傳承有加成。 */
export function beastGather(state: GameState, content: ContentPack, beast: Beast): Partial<Resources> {
  if (beast.task !== 'gather') return {};
  const species = content.beasts.get(beast.speciesId);
  if (!species) return {};
  const owner = beast.ownerId ? findCharacter(state, beast.ownerId) : undefined;
  let pct = beast.stage === 'adult' ? 100 : balance.beasts.youngGatherPct;
  pct = Math.floor((pct * (100 + (owner?.skills.beast ?? 0) * balance.beasts.ownerSkillPct)) / 100);
  pct = Math.floor((pct * (100 + (content.lineages.get(state.lineage)?.bonuses.beastGatherPct ?? 0))) / 100);
  const out: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = species.gather[id];
    if (v) {
      const n = Math.floor((v * pct) / 100);
      if (n) out[id] = n;
    }
  }
  return out;
}

/** 月結算第 4 步：吃飽的靈獸成長，幼年到點長成成年。 */
export function tickBeasts(state: GameState, content: ContentPack, fed: string[], lines: string[]): void {
  const garden = beastGarden(state);
  const growthPct = 100 + (garden ? effectsOf(content, garden)?.beastGrowthPct ?? 0 : 0);
  for (const b of state.beasts) {
    if (!fed.includes(b.id) || b.stage === 'adult') continue;
    b.growth += Math.floor((balance.beasts.growthPerMonth * growthPct) / 100);
    if (b.growth >= balance.beasts.adultGrowth) {
      b.stage = 'adult';
      lines.push(`★ ${b.name}長為成年，戰力與採集大幅提升。`);
    }
  }
}
