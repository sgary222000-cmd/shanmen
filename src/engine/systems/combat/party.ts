import type { ContentPack } from '../../../content/registry';
import { balance, type StatBonus } from '../../../content/balance';
import { ensure } from '../../errors';
import type { Character, GameState, ResourceId, Resources, Row } from '../../types';
import { findCharacter } from '../characters/characters';
import { techniqueTier } from '../talent/techniques';
import { guardianBonus } from '../beasts/beasts';
import { characterGear } from '../talent/gear';
import { estimatePower, unitFromBeast, unitFromCharacter, type Unit } from './combat';

// 組成出戰隊伍：人物（含法器、功法）、隨行靈獸、傳承的隊伍加成（劍陣）。
// 探索、委託、派遣共用，確保同一個人在各處的戰力一致。

export function allyUnit(state: GameState, content: ContentPack, c: Character, row: Row, hp?: number): Unit {
  const lineage = content.lineages.get(state.lineage);
  ensure(lineage, '傳承資料錯誤');
  const guard = guardianBonus(state, content);
  return unitFromCharacter(c, row, lineage, hp, {
    gear: characterGear(content, c),
    techniquePct: techniqueTier(c).pct,
    guardianAtkPct: guard.atkPct,
    guardianHpPct: guard.hpPct,
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

/** 戰前準備（0.11.0）：短效屬性丹、控制符。 */
export interface BattleKit {
  control: ResourceId[];
  extraRounds: number;
  /** 本場服下的短效屬性丹 */
  buffs: Partial<Resources>;
}

/**
 * 依戰鬥策略準備：每位出戰者各服一顆有庫存的短效屬性丹（直接加到 allies 上），挑出要祭出的控制符。
 * 只計算不扣庫存；真的開打後用 spendKit 扣掉。
 */
export function battleKit(state: GameState, content: ContentPack, allies: Unit[]): BattleKit {
  const buffs: Partial<Resources> = {};
  if (state.strategy.useBuffPills) {
    const people = allies.filter((u) => !u.companion);
    for (const [id, b] of Object.entries(balance.attributes.shortPills) as [ResourceId, StatBonus][]) {
      const n = Math.min(state.resources[id], people.length);
      for (const u of people.slice(0, n)) {
        u.spd += b.agi ?? 0;
        u.crit += b.critPct ?? 0;
        u.dodge += b.dodgePct ?? 0;
      }
      if (n) buffs[id] = n;
    }
  }
  const control = (state.strategy.control ?? []).filter((id) => state.resources[id] > 0).slice(0, balance.controlTalismans.maxKinds);
  return { control, extraRounds: content.lineages.get(state.lineage)?.bonuses.controlRounds ?? 0, buffs };
}

/** 開打後扣掉服下的屬性丹與祭出的控制符。 */
export function spendKit(state: GameState, kit: BattleKit, controlUsed: ResourceId[]): void {
  for (const [id, n] of Object.entries(kit.buffs) as [ResourceId, number][]) state.resources[id] = Math.max(0, state.resources[id] - n);
  for (const id of controlUsed) state.resources[id] = Math.max(0, state.resources[id] - 1);
}

/** 隊伍戰力（0.11.0，出戰前顯示用）：每人戰力相加，含隨行靈獸。 */
export function teamPower(state: GameState, content: ContentPack, teamIds: string[]): number {
  const units = teamIds
    .map((id) => findCharacter(state, id))
    .filter((c): c is Character => !!c)
    .map((c) => allyUnit(state, content, c, 'front'));
  units.push(...companions(state, content, teamIds));
  return units.reduce((n, u) => n + estimatePower(u), 0);
}

/** 一組敵人的戰力。 */
export function unitsPower(units: Unit[]): number {
  return units.reduce((n, u) => n + estimatePower(u), 0);
}
