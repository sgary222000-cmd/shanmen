import { balance } from '../../../content/balance';
import { MAIN_REGION } from '../../../content/registry';
import { givenFemale, givenMale, surnames } from '../../../content/names';
import { newId } from '../../ids';
import { rng } from '../../rng';
import type { Candidate, Character, Element, GameState, Realm, RootGrade, Skills, SpiritRoot } from '../../types';

export const ROOT_GRADE_NAMES: Record<RootGrade, string> = {
  low: '下品',
  mid: '中品',
  high: '上品',
  heaven: '天品',
};

export const ELEMENT_NAMES: Record<Element, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

const ELEMENTS: Element[] = ['metal', 'wood', 'water', 'fire', 'earth'];
const FOUNDATION_STAGE_NAMES = ['前期', '中期', '後期', '圓滿'];
const QI_STAGE_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export function realmName(realm: Realm): string {
  if (realm.major === 'qi') return `煉氣${QI_STAGE_NAMES[realm.stage - 1] ?? realm.stage}層`;
  const major = realm.major === 'core' ? '金丹' : '築基';
  return `${major}${FOUNDATION_STAGE_NAMES[realm.stage - 1] ?? realm.stage}`;
}

export function rootName(root: SpiritRoot): string {
  return `${ROOT_GRADE_NAMES[root.grade]}${root.elements.map((e) => ELEMENT_NAMES[e]).join('')}靈根`;
}

/** 目前小階段升到下一階段所需修為。 */
export function xpToNext(realm: Realm): number {
  if (realm.major === 'qi') return realm.stage * balance.qiXpPerStage;
  if (realm.major === 'core') return balance.coreXpPerStage;
  return balance.foundationXpPerStage;
}

/** 戰鬥與能力計算用的綜合等級：煉氣 1–9、築基 12–21、金丹 25–37。 */
export function powerLevel(realm: Realm): number {
  if (realm.major === 'qi') return realm.stage;
  if (realm.major === 'foundation') return 9 + realm.stage * 3;
  return 21 + realm.stage * 4;
}

/** 是否已達築基門檻（煉氣九層且修為滿）。 */
export function readyForFoundation(c: Character): boolean {
  return c.realm.major === 'qi' && c.realm.stage === 9 && c.xp >= xpToNext(c.realm);
}

/** 是否已達結丹門檻（築基圓滿且修為滿）。 */
export function readyForCore(c: Character): boolean {
  return c.realm.major === 'foundation' && c.realm.stage === 4 && c.xp >= xpToNext(c.realm);
}

/** 已到 P1 上限（金丹圓滿且修為滿），元嬰於 P2 開放。 */
export function atP1Cap(c: Character): boolean {
  return c.realm.major === 'core' && c.realm.stage === 4 && c.xp >= xpToNext(c.realm);
}

export function allCharacters(state: GameState): Character[] {
  return [state.protagonist, ...state.disciples];
}

export function findCharacter(state: GameState, id: string): Character | undefined {
  return allCharacters(state).find((c) => c.id === id);
}

export function rollName(state: GameState, gender: 'male' | 'female'): string {
  const r = rng(state, 'recruit');
  return r.pick(surnames) + r.pick(gender === 'male' ? givenMale : givenFemale);
}

export function rollRoot(state: GameState, bonusBp: number): SpiritRoot {
  const r = rng(state, 'recruit');
  const roll = r.int(10000) + bonusBp;
  const grade: RootGrade = roll >= 9700 ? 'heaven' : roll >= 8000 ? 'high' : roll >= 4000 ? 'mid' : 'low';
  const count = grade === 'heaven' ? 1 : r.range(1, 3);
  const pool = [...ELEMENTS];
  const elements: Element[] = [];
  for (let i = 0; i < count; i++) {
    const idx = r.int(pool.length);
    const [e] = pool.splice(idx, 1);
    if (e) elements.push(e);
  }
  return { grade, elements };
}

export function rollCandidate(state: GameState, bonusBp: number): Candidate {
  const r = rng(state, 'recruit');
  const gender = r.chance(5000) ? 'male' : 'female';
  const root = rollRoot(state, bonusBp);
  const skills = {
    alchemy: r.range(0, 5),
    farming: r.range(0, 5),
    combat: r.range(1, 6),
    forging: r.range(0, 3),
    talisman: r.range(0, 3),
    beast: r.range(0, 3),
    affairs: r.range(0, 3),
  };
  // 專長（企畫書 §9）：資質普通的弟子也可能是某項技藝的關鍵人才
  const specialty = r.pick(SPECIALTIES);
  skills[specialty] += r.range(balance.specialty.bonusMin, balance.specialty.bonusMax);
  const gradeCost: Record<RootGrade, number> = { low: 20, mid: 40, high: 70, heaven: 120 };
  return {
    id: newId(state, 'cand'),
    name: rollName(state, gender),
    gender,
    ageMonths: r.range(14, 22) * 12,
    root,
    skills,
    specialty,
    cost: gradeCost[root.grade] + skills.alchemy * 2 + skills.combat * 2 + skills[specialty],
  };
}

const SPECIALTIES: (keyof Skills)[] = ['alchemy', 'farming', 'combat', 'forging', 'talisman', 'beast', 'affairs'];

export function characterFromCandidate(state: GameState, cand: Candidate, stage: number): Character {
  return {
    id: newId(state, 'c'),
    name: cand.name,
    gender: cand.gender,
    role: 'inner',
    ageMonths: cand.ageMonths,
    realm: { major: 'qi', stage },
    xp: 0,
    root: cand.root,
    health: 100,
    injuryMonths: 0,
    loyalty: 70,
    skills: { ...cand.skills },
    schedule: 'cultivate',
    takePill: false,
    seat: MAIN_REGION,
    specialty: cand.specialty ?? null,
    insight: 0,
    equipment: null,
  };
}

export function isInjured(c: Character): boolean {
  return c.injuryMonths > 0;
}

/** 某區域的靈氣需求：在此修煉的人物；修煉中的外門一律在主峰。 */
export function qiDemandOf(state: GameState, regionId: string = MAIN_REGION): number {
  const p = state.protagonist;
  let demand = 0;
  const core = (c: Character) => (c.realm.major === 'core' ? balance.qiDemand.coreExtra : 0);
  if (p.seat === regionId)
    demand += (p.schedule === 'seclusion' ? balance.qiDemand.protagonistSeclusion : balance.qiDemand.protagonist) + core(p);
  for (const d of state.disciples) if (d.seat === regionId) demand += balance.qiDemand.inner + core(d);
  if (regionId === MAIN_REGION) demand += Math.ceil(outerCultivating(state) / balance.qiDemand.outerPerUnit);
  return demand;
}

export function outerAssigned(state: GameState): number {
  const j = state.outer.jobs;
  return j.field + j.quarry + j.lumber + j.garden + j.mine + j.errand + state.outer.labor;
}

export function outerCultivating(state: GameState): number {
  return Math.max(0, state.outer.count - outerAssigned(state));
}
