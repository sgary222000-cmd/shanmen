import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import { gain, RESOURCE_IDS, RESOURCE_NAMES } from '../../resources';
import { rng } from '../../rng';
import type { GameState, GearQuality, Resources, Station } from '../../types';
import { benchCount, benchList, isCraftSchedule, STATION_INFO, STATIONS, stationRooms } from '../buildings/buildings';
import { forgeQualityBonus, gearDesc, gearName, newGear, qualityChances } from '../talent/gear';
import { findCharacter } from '../characters/characters';
import type { FurnacePlan } from '../economy/flows';

// 工坊：煉丹房的丹爐、煉器坊的器爐、符陣閣的符案共用同一套規則。
// 工作者本月行程改為煉丹／煉器／製符；同一人同時只能負責一個爐位。

/** 指派爐位。station 未填為煉丹（P0 的指令格式）。keep 為庫存保留量。 */
export function setFurnace(
  state: GameState,
  content: ContentPack,
  index: number,
  alchemistId: string | null,
  recipeId: string | null,
  repeat: boolean,
  station: Station = 'alchemy',
  keep?: number,
  boost?: boolean,
): void {
  const info = STATION_INFO[station];
  ensure(index >= 0 && index < benchCount(state, content, station), `沒有這個${info.bench}（${info.room}未建成或未運作）`);
  const list = benchList(state, station);
  while (list.length <= index) list.push({ alchemistId: null, recipeId: null, repeat: true });
  const furnace = list[index];
  ensure(furnace, `沒有這個${info.bench}`);
  if (recipeId) {
    const recipe = content.recipes.get(recipeId);
    ensure(recipe, '沒有這個配方');
    ensure(recipe.station === station, `${recipe.name}不能在${info.room}製作`);
    ensure(state.recipes.includes(recipeId), '尚未習得這個配方');
  }
  if (keep !== undefined) ensure(Number.isInteger(keep) && keep >= 0 && keep <= 9999, '保留量需為 0–9999 的整數');
  // 解除原本的工作者
  if (furnace.alchemistId && furnace.alchemistId !== alchemistId) {
    const prev = findCharacter(state, furnace.alchemistId);
    if (prev && prev.schedule === info.schedule) prev.schedule = 'cultivate';
  }
  if (alchemistId) {
    const c = findCharacter(state, alchemistId);
    ensure(c, '找不到這個人物');
    for (const st of STATIONS) {
      ensure(
        !benchList(state, st).some((f, i) => (st !== station || i !== index) && f.alchemistId === alchemistId),
        `${c.name}已經在負責另一個爐位`,
      );
    }
    ensure(c.schedule !== 'explore', `${c.name}本月已外出`);
    if (c.role === 'protagonist') {
      ensure(!state.protagonist.seclusion, '主角閉關中，請先中斷閉關');
    }
    ensure(c.schedule !== 'breakthrough', `${c.name}本月安排突破`);
    c.schedule = info.schedule;
  }
  furnace.alchemistId = alchemistId;
  furnace.recipeId = recipeId;
  furnace.repeat = repeat;
  if (keep !== undefined) {
    if (keep > 0) furnace.keep = keep;
    else delete furnace.keep;
  }
  if (boost !== undefined) {
    if (boost) furnace.boost = true;
    else delete furnace.boost;
  }
}

/** 人物離開工坊行程時，從所有爐位上移除。 */
export function releaseFurnace(state: GameState, characterId: string): void {
  for (const st of STATIONS) for (const f of benchList(state, st)) if (f.alchemistId === characterId) f.alchemistId = null;
}

/** 人物負責的工坊行程（掌爐或執筆），沒有則為 null。 */
export function benchOf(state: GameState, characterId: string): (typeof STATION_INFO)[Station]['schedule'] | null {
  for (const st of STATIONS) if (benchList(state, st).some((f) => f.alchemistId === characterId)) return STATION_INFO[st].schedule;
  return null;
}

/** 月底：工作者若已不在對應行程，從爐位移除，並寫進月報。 */
export function tidyBenches(state: GameState, lines?: string[]): void {
  for (const st of STATIONS) {
    benchList(state, st).forEach((f, i) => {
      if (!f.alchemistId) return;
      const c = findCharacter(state, f.alchemistId);
      if (c?.schedule === STATION_INFO[st].schedule) return;
      if (c && lines) lines.push(`${c.name}${c.schedule === 'heal' ? '受傷療養' : '另有安排'}，離開${STATION_INFO[st].room}${STATION_INFO[st].bench} ${i + 1}，需要重新指派。`);
      f.alchemistId = null;
    });
  }
}

export { isCraftSchedule };

/** 工坊最高等級（煉器品質加成用）。 */
export function forgeLevel(state: GameState, station: Station = 'forge'): number {
  return Math.max(0, ...stationRooms(state, station).map((b) => b.level));
}

/** 預覽：這個爐位煉出各品質的機率。 */
export function forgePreview(state: GameState, station: Station, index: number): Record<GearQuality, number> {
  const f = benchList(state, station)[index];
  const worker = f?.alchemistId ? findCharacter(state, f.alchemistId) : undefined;
  return qualityChances(forgeQualityBonus(forgeLevel(state, station), worker, !!f?.boost));
}

/** 月結算第 3 步：結算各爐位。材料已在第 2 步扣除。 */
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
    const furnace = benchList(state, plan.station)[plan.index];
    const worker = findCharacter(state, plan.alchemistId);
    if (!recipe || !furnace || !worker) continue;
    const info = STATION_INFO[plan.station];
    // 煉器（0.11.0）：煉出一件有品質的法器；加入稀有素材可提高品質（不論成敗都會用掉）
    if (recipe.gear) {
      const mat = furnace.boost ? recipe.boostMats?.find((id) => state.resources[id] > 0) : undefined;
      if (mat) state.resources[mat] -= 1;
      if (r.chance(plan.successBp)) {
        const item = newGear(state, recipe.gear, undefined, forgeQualityBonus(forgeLevel(state, plan.station), worker, !!mat));
        state.armory.push(item);
        lines.push(`${worker.name}${info.verb}${gearName(content, item)}${mat ? `（加入${RESOURCE_NAMES[mat]}）` : ''}：${gearDesc(content, item)}。`);
      } else {
        lines.push(`${worker.name}煉製${recipe.name}失敗，材料損耗。`);
      }
    } else if (r.chance(plan.successBp)) {
      const out: Partial<Resources> = { ...recipe.outputs };
      gain(state.resources, out);
      for (const id of RESOURCE_IDS) if (out[id]) produced[id] = (produced[id] ?? 0) + (out[id] ?? 0);
      const desc = RESOURCE_IDS.filter((id) => out[id])
        .map((id) => `${RESOURCE_NAMES[id]} ${out[id]}`)
        .join('、');
      lines.push(`${worker.name}${info.verb}${recipe.name}（${desc}）。`);
    } else {
      lines.push(`${worker.name}製作${recipe.name}失敗，材料損耗。`);
    }
    const skill = info.skill;
    const gainBp = balance.craft.skillGainChanceBp * (worker.specialty === skill ? balance.specialty.gainMultiplier : 1);
    if (worker.skills[skill] < 20 && r.chance(gainBp)) {
      worker.skills[skill] += 1;
      lines.push(`${worker.name}的${SKILL_LABEL[skill] ?? ''}技藝提升至 ${worker.skills[skill]}。`);
    }
    if (!furnace.repeat) furnace.recipeId = null;
  }
}

const SKILL_LABEL: Partial<Record<string, string>> = { alchemy: '煉丹', forging: '煉器', talisman: '符陣' };
