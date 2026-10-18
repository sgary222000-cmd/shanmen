import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import { gain, RESOURCE_IDS, RESOURCE_NAMES } from '../../resources';
import { rng } from '../../rng';
import type { GameState, Resources } from '../../types';
import { furnaceCount } from '../buildings/buildings';
import { findCharacter } from '../characters/characters';
import type { FurnacePlan } from '../economy/flows';

/** 指派丹爐。掌爐者本月行程改為煉丹；同一人只能掌一座爐。 */
export function setFurnace(
  state: GameState,
  content: ContentPack,
  index: number,
  alchemistId: string | null,
  recipeId: string | null,
  repeat: boolean,
): void {
  ensure(index >= 0 && index < furnaceCount(state, content), '沒有這座丹爐（煉丹房未建成或未運作）');
  while (state.furnaces.length <= index) state.furnaces.push({ alchemistId: null, recipeId: null, repeat: true });
  const furnace = state.furnaces[index];
  ensure(furnace, '沒有這座丹爐');
  if (recipeId) {
    ensure(content.recipes.has(recipeId), '沒有這個丹方');
    ensure(state.recipes.includes(recipeId), '尚未習得這個丹方');
  }
  // 解除原本的掌爐者
  if (furnace.alchemistId && furnace.alchemistId !== alchemistId) {
    const prev = findCharacter(state, furnace.alchemistId);
    if (prev && prev.schedule === 'alchemy') prev.schedule = 'cultivate';
  }
  if (alchemistId) {
    const c = findCharacter(state, alchemistId);
    ensure(c, '找不到這個人物');
    ensure(
      !state.furnaces.some((f, i) => i !== index && f.alchemistId === alchemistId),
      `${c.name}已經在掌另一座丹爐`,
    );
    ensure(c.schedule !== 'explore', `${c.name}本月已出外探索`);
    if (c.role === 'protagonist') {
      ensure(!state.protagonist.seclusion, '主角閉關中，請先中斷閉關');
    }
    ensure(c.schedule !== 'breakthrough', `${c.name}本月安排突破`);
    c.schedule = 'alchemy';
  }
  furnace.alchemistId = alchemistId;
  furnace.recipeId = recipeId;
  furnace.repeat = repeat;
}

/** 人物離開煉丹行程時，從丹爐上移除。 */
export function releaseFurnace(state: GameState, characterId: string): void {
  for (const f of state.furnaces) if (f.alchemistId === characterId) f.alchemistId = null;
}

/** 月結算第 3 步：結算丹爐。材料已在第 2 步扣除。 */
export function resolveFurnaces(
  state: GameState,
  content: ContentPack,
  plans: FurnacePlan[],
  produced: Partial<Resources>,
  lines: string[],
): void {
  const r = rng(state, 'alchemy');
  for (const plan of plans) {
    if (!plan.runs) continue;
    const recipe = content.recipes.get(plan.recipeId);
    const furnace = state.furnaces[plan.index];
    const alchemist = findCharacter(state, plan.alchemistId);
    if (!recipe || !furnace || !alchemist) continue;
    if (r.chance(plan.successBp)) {
      const out: Partial<Resources> = { ...recipe.outputs };
      gain(state.resources, out);
      for (const id of RESOURCE_IDS) if (out[id]) produced[id] = (produced[id] ?? 0) + (out[id] ?? 0);
      const desc = RESOURCE_IDS.filter((id) => out[id])
        .map((id) => `${RESOURCE_NAMES[id]} ${out[id]}`)
        .join('、');
      lines.push(`${alchemist.name}煉成${recipe.name}（${desc}）。`);
    } else {
      lines.push(`${alchemist.name}煉製${recipe.name}失敗，材料損耗。`);
    }
    if (alchemist.skills.alchemy < 20 && r.chance(balance.alchemy.skillGainChanceBp)) {
      alchemist.skills.alchemy += 1;
      lines.push(`${alchemist.name}的煉丹技藝提升至 ${alchemist.skills.alchemy}。`);
    }
    if (!furnace.repeat) furnace.recipeId = null;
  }
}
