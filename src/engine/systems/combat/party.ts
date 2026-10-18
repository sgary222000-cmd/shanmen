import type { ContentPack } from '../../../content/registry';
import { balance } from '../../../content/balance';
import { ensure } from '../../errors';
import type { Character, GameState, Row } from '../../types';
import { findCharacter } from '../characters/characters';
import { techniqueTier } from '../talent/techniques';
import { unitFromBeast, unitFromCharacter, type Unit } from './combat';

// 組成出戰隊伍：人物（含法器、功法）、隨行靈獸、傳承的隊伍加成（劍陣）。
// 探索、委託、派遣共用，確保同一個人在各處的戰力一致。

export function allyUnit(state: GameState, content: ContentPack, c: Character, row: Row, hp?: number): Unit {
  const lineage = content.lineages.get(state.lineage);
  ensure(lineage, '傳承資料錯誤');
  return unitFromCharacter(c, row, lineage, hp, {
    equip: c.equipment ? content.equipment.get(c.equipment) : undefined,
    techniquePct: techniqueTier(c).pct,
  });
}

export function characterMaxHp(state: GameState, content: ContentPack, c: Character): number {
  return allyUnit(state, content, c, 'front', 0).maxHp;
}

/** 隊員帶著的靈獸（不佔隊伍名額，只有「隨主人出戰」的靈獸）。hp 給定時使用探索中的目前生命。 */
export function companions(state: GameState, content: ContentPack, teamIds: string[], hp?: Record<string, number>): Unit[] {
  const lineage = content.lineages.get(state.lineage);
  if (!lineage) return [];
  const out: Unit[] = [];
  for (const beast of state.beasts) {
    if (!beast.ownerId || beast.task !== 'follow' || !teamIds.includes(beast.ownerId)) continue;
    const owner = findCharacter(state, beast.ownerId);
    const species = content.beasts.get(beast.speciesId);
    if (!owner || !species) continue;
    if (hp && (hp[owner.id] ?? 0) <= 0) continue; // 主人倒下，靈獸護主撤離
    const u = unitFromBeast(beast, species, owner, lineage, hp?.[beast.id]);
    if (u.hp > 0) out.push(u);
  }
  return out;
}

/** 傳承的隊伍加成（劍陣）：直接修改 units，回傳戰報說明。 */
export function applyFormation(state: GameState, content: ContentPack, units: Unit[]): string | null {
  const b = content.lineages.get(state.lineage)?.bonuses;
  if (!b?.formationMin) return null;
  const people = units.filter((u) => !u.companion && u.hp > 0).length;
  if (people < b.formationMin) return null;
  for (const u of units) u.atk = Math.round((u.atk * (100 + b.formationAtkPct)) / 100);
  return `${people} 人結成劍陣，全隊攻擊 +${b.formationAtkPct}%。`;
}

/** 回春丹回復量（丹道傳承加成）。 */
export function healPctFor(state: GameState, content: ContentPack): number {
  const bonus = content.lineages.get(state.lineage)?.bonuses.healPillPct ?? 0;
  return Math.floor((balance.combat.healPct * (100 + bonus)) / 100);
}
