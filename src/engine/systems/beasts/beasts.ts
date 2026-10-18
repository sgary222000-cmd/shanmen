import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { BeastSpeciesDef } from '../../../content/schema';
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
// 批次 F：成年靈獸可晉升為護宗神獸（全宗一隻），供奉升級，依品種給全宗門加成。

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

/** 佔靈獸苑名額的靈獸數（護宗神獸不佔名額） */
export function keptBeasts(state: GameState): number {
  return state.beasts.filter((b) => !b.guardian).length;
}

export function hatchBlocked(state: GameState, content: ContentPack): string | undefined {
  if (!beastGarden(state)) return '需要運作中的靈獸苑';
  const cap = beastCapacity(state, content);
  if (cap <= 0) return '需要御獸傳承、御獸分支或「馴獸法」';
  if (keptBeasts(state) >= cap) return `靈獸已達上限 ${cap} 隻`;
  if (state.resources.beast_egg < 1) return '沒有靈獸蛋（秘境、委託或坊市取得）';
  return undefined;
}

export function hatchBeast(state: GameState, content: ContentPack): string {
  const blocked = hatchBlocked(state, content);
  ensure(!blocked, blocked ?? '');
  const all = [...content.beasts.values()];
  let roll = rng(state, 'beast').int(all.reduce((n, sp) => n + sp.weight, 0));
  const species = all.find((sp) => (roll -= sp.weight) < 0) ?? all[0]!;
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
  ensure(!beast.guardian, `${beast.name}已是護宗神獸，不再隨人出戰或採集`);
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
  const adult = (species?.food ?? 0) + (beast.stage === 'adult' ? 1 : 0);
  return beast.guardian ? adult * balance.beasts.guardian.foodMultiplier : adult;
}

/** 本月採集所得（吃飽才會出去）。幼年減半；主人御獸技藝與御獸傳承有加成。 */
export function beastGather(state: GameState, content: ContentPack, beast: Beast): Partial<Resources> {
  if (beast.task !== 'gather' || beast.guardian) return {};
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
    if (b.guardian) {
      const hungry = !fed.includes(b.id);
      if (hungry && !b.guardian.hungry) lines.push(`${b.name}沒吃飽，下個月護宗加成暫停。`);
      b.guardian.hungry = hungry;
      continue;
    }
    if (!fed.includes(b.id) || b.stage === 'adult') continue;
    b.growth += Math.floor((balance.beasts.growthPerMonth * growthPct) / 100);
    if (b.growth >= balance.beasts.adultGrowth) {
      b.stage = 'adult';
      lines.push(`★ ${b.name}長為成年，戰力與採集大幅提升。`);
    }
  }
}

// ── 護宗神獸 ──

export type GuardianBonus = BeastSpeciesDef['guardian'];
const NO_BONUS: GuardianBonus = { title: '', productionPct: 0, craftBp: 0, xpPct: 0, atkPct: 0, hpPct: 0, monthly: {} };

export function guardianBeast(state: GameState): Beast | undefined {
  return state.beasts.find((b) => b.guardian);
}

/** 某品種在某一級的加成（每級等量疊加） */
export function guardianBonusAt(species: BeastSpeciesDef, level: number): GuardianBonus {
  const g = species.guardian;
  const monthly: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = g.monthly[id];
    if (v) monthly[id] = v * level;
  }
  return {
    title: g.title,
    productionPct: g.productionPct * level,
    craftBp: g.craftBp * level,
    xpPct: g.xpPct * level,
    atkPct: g.atkPct * level,
    hpPct: g.hpPct * level,
    monthly,
  };
}

/** 目前生效的護宗加成；沒有神獸或上個月沒吃飽時全為 0。預覽與結算共用。 */
export function guardianBonus(state: GameState, content: ContentPack): GuardianBonus {
  const b = guardianBeast(state);
  const species = b ? content.beasts.get(b.speciesId) : undefined;
  if (!b?.guardian || !species || b.guardian.hungry) return NO_BONUS;
  return guardianBonusAt(species, b.guardian.level);
}

/** 下一步（晉升或供奉）的費用；已達最高級回傳 undefined */
export function guardianNextCost(state: GameState): Partial<Resources> | undefined {
  const g = guardianBeast(state)?.guardian;
  if (!g) return balance.beasts.guardian.ascendCost;
  return balance.beasts.guardian.raiseCost[g.level - 1];
}

function lacking(state: GameState, cost: Partial<Resources>): string | undefined {
  const short = RESOURCE_IDS.filter((id) => state.resources[id] < (cost[id] ?? 0));
  return short.length ? '資源不足' : undefined;
}

export function ascendBlocked(state: GameState, content: ContentPack, beastId: string): string | undefined {
  const beast = state.beasts.find((b) => b.id === beastId);
  if (!beast) return '沒有這隻靈獸';
  const garden = beastGarden(state);
  if (!garden || garden.level < balance.beasts.guardian.gardenLevel) return `需要 ${balance.beasts.guardian.gardenLevel} 級以上、運作中的靈獸苑`;
  if (guardianBeast(state)) return '宗門已有護宗神獸';
  if (beast.stage !== 'adult') return '需要成年靈獸';
  if (!content.beasts.get(beast.speciesId)) return '靈獸資料錯誤';
  return lacking(state, balance.beasts.guardian.ascendCost);
}

function pay(state: GameState, cost: Partial<Resources>): void {
  for (const id of RESOURCE_IDS) state.resources[id] -= cost[id] ?? 0;
}

export function ascendGuardian(state: GameState, content: ContentPack, beastId: string): string {
  const blocked = ascendBlocked(state, content, beastId);
  ensure(!blocked, blocked ?? '');
  const beast = state.beasts.find((b) => b.id === beastId)!;
  const species = content.beasts.get(beast.speciesId)!;
  pay(state, balance.beasts.guardian.ascendCost);
  beast.ownerId = null;
  beast.task = 'rest';
  beast.guardian = { level: 1, hungry: false };
  return `${beast.name}晉升為護宗神獸「${species.guardian.title}」，從此守護山門。`;
}

export function raiseBlocked(state: GameState): string | undefined {
  const g = guardianBeast(state)?.guardian;
  if (!g) return '宗門還沒有護宗神獸';
  const cost = guardianNextCost(state);
  if (!cost) return `已達最高 ${balance.beasts.guardian.maxLevel} 級`;
  return lacking(state, cost);
}

export function raiseGuardian(state: GameState, content: ContentPack): string {
  const blocked = raiseBlocked(state);
  ensure(!blocked, blocked ?? '');
  const beast = guardianBeast(state)!;
  pay(state, guardianNextCost(state)!);
  beast.guardian!.level += 1;
  const title = content.beasts.get(beast.speciesId)?.guardian.title ?? beast.name;
  return `供奉${title}，神獸升為 ${beast.guardian!.level} 級，護宗加成提高。`;
}
