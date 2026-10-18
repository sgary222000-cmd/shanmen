import { balance } from '../../../content/balance';
import { ensure } from '../../errors';
import { rng } from '../../rng';
import type { Character, GameState, PositionId, Station } from '../../types';
import { powerLevel } from '../characters/characters';

// 職位（企畫書 §9）：每職一人、一人只任一職、限內門弟子。效果隨該職技藝提高；
// 任職不佔行程，但兼顧宗門事務，當月修煉 −20%。

export const POSITION_IDS: PositionId[] = ['mentor', 'alchemy', 'forge', 'steward', 'envoy'];

export const POSITION_NAMES: Record<PositionId, string> = {
  mentor: '傳功長老',
  alchemy: '煉丹執事',
  forge: '煉器執事',
  steward: '庶務執事',
  envoy: '外事執事',
};

export const POSITION_TEXT: Record<PositionId, string> = {
  mentor: '其他內門日常修煉、閉關時修為提高（隨任職者境界）',
  alchemy: '煉丹成功率提高（隨煉丹技藝）',
  forge: '煉器、製符成功率提高（隨煉器、符陣技藝）',
  steward: '外門生產提高、滿意度回復較快（隨庶務技藝）',
  envoy: '委託靈石報酬提高、坊市買價降低、送禮好感提高（隨庶務技藝）',
};

export function emptyPositions(): Record<PositionId, string | null> {
  return { mentor: null, alchemy: null, forge: null, steward: null, envoy: null };
}

export function holderOf(state: GameState, pos: PositionId): Character | undefined {
  const id = state.positions[pos];
  return id ? state.disciples.find((d) => d.id === id) : undefined;
}

export function positionOf(state: GameState, characterId: string): PositionId | null {
  return POSITION_IDS.find((p) => state.positions[p] === characterId) ?? null;
}

/** 傳功：其他內門修煉加成（百分比）。 */
export function mentorPct(state: GameState): number {
  const h = holderOf(state, 'mentor');
  if (!h) return 0;
  const P = balance.positions;
  return Math.min(P.mentorMaxPct, P.mentorBasePct + powerLevel(h.realm));
}

/** 煉丹、煉器執事對工坊成功率的加成（萬分比）。 */
export function craftPositionBp(state: GameState, station: Station): number {
  const P = balance.positions;
  const h = holderOf(state, station === 'alchemy' ? 'alchemy' : 'forge');
  if (!h) return 0;
  const skill = station === 'alchemy' ? h.skills.alchemy : station === 'forge' ? h.skills.forging : h.skills.talisman;
  return Math.min(P.craftMaxBp, skill * P.craftBpPerSkill);
}

export function stewardPct(state: GameState): number {
  const h = holderOf(state, 'steward');
  return h ? Math.min(balance.positions.stewardMaxPct, h.skills.affairs * balance.positions.stewardPctPerSkill) : 0;
}

export function stewardSatisfaction(state: GameState): number {
  const h = holderOf(state, 'steward');
  return h ? Math.floor(h.skills.affairs / 4) : 0;
}

export function envoyRewardPct(state: GameState): number {
  const h = holderOf(state, 'envoy');
  return h ? Math.min(balance.positions.envoyRewardMaxPct, h.skills.affairs * balance.positions.envoyRewardPctPerSkill) : 0;
}

export function envoyDiscount(state: GameState): number {
  const h = holderOf(state, 'envoy');
  return h ? Math.min(balance.positions.envoyDiscountMax, Math.floor(h.skills.affairs / 4)) : 0;
}

export function envoyGiftPct(state: GameState): number {
  const h = holderOf(state, 'envoy');
  return h ? h.skills.affairs * balance.positions.envoyGiftPctPerSkill : 0;
}

/** 目前效果的白話說明。 */
export function positionEffectText(state: GameState, pos: PositionId): string {
  switch (pos) {
    case 'mentor':
      return `其他內門修煉 +${mentorPct(state)}%`;
    case 'alchemy':
      return `成丹率 +${craftPositionBp(state, 'alchemy') / 100}%`;
    case 'forge':
      return `成器率 +${craftPositionBp(state, 'forge') / 100}%、成符率 +${craftPositionBp(state, 'talisman') / 100}%`;
    case 'steward':
      return `外門生產 +${stewardPct(state)}%、滿意度每月 +${stewardSatisfaction(state)}`;
    case 'envoy':
      return `委託靈石 +${envoyRewardPct(state)}%、坊市買價 −${envoyDiscount(state)}%、送禮好感 +${envoyGiftPct(state)}%`;
  }
}

export function setPosition(state: GameState, pos: PositionId, characterId: string | null): string {
  ensure(POSITION_IDS.includes(pos), '沒有這個職位');
  if (characterId === null) {
    state.positions[pos] = null;
    return `${POSITION_NAMES[pos]}出缺。`;
  }
  const c = state.disciples.find((d) => d.id === characterId);
  ensure(c, '職位只能由內門弟子擔任');
  const current = positionOf(state, characterId);
  ensure(!current || current === pos, `${c.name}已擔任${current ? POSITION_NAMES[current] : ''}，一人不能兼兩職`);
  state.positions[pos] = characterId;
  return `${c.name}出任${POSITION_NAMES[pos]}：${positionEffectText(state, pos)}。`;
}

/** 月結算：庶務、外事執事的庶務技藝成長。 */
export function tickPositions(state: GameState, lines: string[]): void {
  for (const pos of ['steward', 'envoy'] as const) {
    const h = holderOf(state, pos);
    if (!h || h.skills.affairs >= balance.positions.maxSkill) continue;
    if (rng(state, 'cultivation').chance(balance.positions.affairsGainBp)) {
      h.skills.affairs += 1;
      lines.push(`${h.name}處理宗門事務，庶務技藝提升至 ${h.skills.affairs}。`);
    }
  }
}
