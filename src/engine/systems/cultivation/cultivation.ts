import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { rng } from '../../rng';
import type { Character, GameState, ResourceId } from '../../types';
export { BREAKTHROUGH_PILL, type BreakthroughTarget } from '../characters/characters';
import { MAIN_REGION } from '../../../content/registry';
import { ARRAY, CAVE_ABODE, effectsOf, isOperating, qiCapacity, TRAINING } from '../buildings/buildings';
import {
  allCharacters,
  atRealmCap,
  isInjured,
  BREAKTHROUGH_PILL,
  type BreakthroughTarget,
  MAJOR_NAMES,
  MAJOR_ORDER,
  nextMajor,
  qiDemandOf,
  realmName,
  topStage,
  xpToNext,
} from '../characters/characters';
import { RESOURCE_NAMES } from '../../resources';
import { minorDef, minorStats } from '../talent/minorTechniques';
import { levelNameAt, techniqueOf, techniqueTier } from '../talent/techniques';
import { mentorPct, positionOf, POSITION_NAMES } from '../talent/positions';
import { guardianBonus } from '../beasts/beasts';
import { ancestorPct, blessingReady } from '../characters/lifespan';
import { monthIndex } from '../../date';

/** 某區域的靈氣效率（百分比）：容量不足時在此修煉的人按比例降低。 */
export function qiEfficiencyPct(state: GameState, content: ContentPack, regionId: string = MAIN_REGION): number {
  const demand = qiDemandOf(state, regionId);
  if (demand <= 0) return 100;
  return Math.min(100, Math.floor((qiCapacity(state, content, regionId) * 100) / demand));
}

export interface XpBreakdown {
  total: number;
  parts: string[];
}

/** 計算人物本月修為；預覽與結算共用。 */
export function monthlyXp(state: GameState, content: ContentPack, c: Character, tookPill: boolean | 'peiyuan'): XpBreakdown {
  const parts: string[] = [];
  if (c.schedule === 'breakthrough') return { total: 0, parts: ['本月突破，不累積修為'] };
  let pct = balance.scheduleXpPct[c.schedule];
  parts.push(`行程 ${pct}%`);
  if (c.role === 'protagonist' && c.schedule === 'seclusion' && state.protagonist.seclusion) {
    const streakBonus = Math.min(state.protagonist.seclusion.streak, balance.seclusionStreakMax) * balance.seclusionStreakPct;
    if (streakBonus) {
      pct += streakBonus;
      parts.push(`連續閉關 +${streakBonus}%`);
    }
  }
  if (c.role === 'inner' && state.protagonist.schedule === 'teach' && c.schedule === 'cultivate') {
    pct += balance.teachBonusPct;
    parts.push(`掌門授課 +${balance.teachBonusPct}%`);
  }
  if (c.schedule === 'seclusion') {
    const cave = caveAbodeAt(state, content, c.seat);
    if (cave?.seclusionPct) {
      pct += cave.seclusionPct;
      parts.push(`洞府 +${cave.seclusionPct}%`);
    }
  }
  const mentor = mentorPct(state);
  if (c.role === 'inner' && mentor && state.positions.mentor !== c.id && (c.schedule === 'cultivate' || c.schedule === 'seclusion')) {
    pct += mentor;
    parts.push(`傳功長老 +${mentor}%`);
  }
  const guard = guardianBonus(state, content);
  if (guard.xpPct && pct > 0) {
    pct += guard.xpPct;
    parts.push(`${guard.title} +${guard.xpPct}%`);
  }
  const anc = ancestorPct(state, content);
  if (anc && pct > 0) {
    pct += anc;
    parts.push(`祖師殿 +${anc}%`);
  }
  if (state.heirId === c.id && (c.schedule === 'cultivate' || c.schedule === 'seclusion')) {
    pct += balance.lifespan.heirXpPct;
    parts.push(`親傳弟子 +${balance.lifespan.heirXpPct}%`);
  }
  const tier = techniqueTier(c);
  if (tier.pct) {
    pct += tier.pct;
    parts.push(`功法${tier.stage} +${tier.pct}%`);
  }
  const pos = positionOf(state, c.id);
  if (pos && pct > 0) {
    pct -= balance.positions.xpPenaltyPct;
    parts.push(`兼任${POSITION_NAMES[pos]} −${balance.positions.xpPenaltyPct}%`);
  }
  const region = content.regions.get(c.seat);
  const regionPct = region?.bonus.cultivationPct ?? 0;
  if (regionPct) {
    pct += regionPct;
    parts.push(`${region?.name ?? ''} +${regionPct}%`);
  }
  // 0.11.0：每多一種靈根修煉 +5%（天靈根單一但倍率最高）
  const rootPct = balance.rootMultiplierPct[c.root.grade] + Math.max(0, c.root.elements.length - 1) * balance.roots.extraElementXpPct;
  const qiPct = qiEfficiencyPct(state, content, c.seat);
  parts.push(`靈根 ${rootPct}%`, `${region?.name ?? ''}靈氣 ${qiPct}%`);
  const base = balance.baseXpByMajor[c.realm.major];
  if (base !== balance.baseXpPerMonth) parts.unshift(`基礎 ${base}`);
  let total = Math.floor((base * Math.max(0, pct) * rootPct * qiPct) / 1_000_000);
  // 祖師殿加成小，取整後可能完全沒效果：至少保證 +1
  if (anc && pct > 0 && total > 0 && total === Math.floor((base * Math.max(0, pct - anc) * rootPct * qiPct) / 1_000_000)) total += 1;
  if (isInjured(c)) {
    total = Math.floor((total * balance.injuredXpPct) / 100);
    parts.push(`受傷 ${balance.injuredXpPct}%`);
  }
  if (tookPill === 'peiyuan') {
    total += balance.pillPeiyuanXp;
    parts.push(`培元丹 +${balance.pillPeiyuanXp}`);
  } else if (tookPill) {
    total += balance.pillQiXp;
    parts.push(`聚氣丹 +${balance.pillQiXp}`);
  }
  return { total, parts };
}

/** 某區域運作中的洞府效果。 */
export function caveAbodeAt(state: GameState, content: ContentPack, regionId: string) {
  const b = state.buildings.find((x) => x.defId === CAVE_ABODE && x.region === regionId && isOperating(x));
  return b ? effectsOf(content, b) : undefined;
}

/** 增加修為並處理小階段晉升；煉氣九層、築基圓滿、金丹圓滿會停在門檻。 */
export function addXp(c: Character, amount: number, lines: string[]): void {
  c.xp += amount;
  for (;;) {
    const need = xpToNext(c.realm);
    if (c.xp < need) return;
    const top = topStage(c.realm.major);
    if (c.realm.stage < top) {
      c.xp -= need;
      c.realm = { major: c.realm.major, stage: c.realm.stage + 1 };
      lines.push(`${c.name}晉升${realmName(c.realm)}。`);
    } else {
      c.xp = need; // 停在門檻，等待大突破（化神圓滿是人界頂點）
      return;
    }
  }
}


export interface BreakthroughOdds {
  /** 突破的目標大境界 */
  target: BreakthroughTarget;
  bp: number;
  factors: string[];
  failure: string;
  blocked: string | undefined;
  /** 本次突破消耗的丹藥 */
  pill: ResourceId;
  /** 失敗時身死道消的機率（萬分比，佔失敗的比例）；0 表示不會死 */
  deathBp: number;
}

export const BREAKTHROUGH_NAMES: Record<BreakthroughTarget, string> = { foundation: '突破', core: '結丹', nascent: '凝嬰', deity: '化神' };

function rulesOf(target: BreakthroughTarget) {
  if (target === 'foundation') return { ...balance.breakthrough, requiredInsight: 0, masteryBp: 0, failDeathBp: 0 };
  if (target === 'core') return { ...balance.coreBreakthrough, failDeathBp: 0 };
  return target === 'nascent' ? balance.nascentBreakthrough : balance.deityBreakthrough;
}

const AWAY: Character['schedule'][] = ['explore', 'dispatch', 'breakthrough'];

/** 大突破成功率與條件（築基、結丹、凝嬰、化神）。事前全部列出給玩家看。 */
export function breakthroughOdds(state: GameState, content: ContentPack, c: Character): BreakthroughOdds {
  const target = (nextMajor(c.realm.major) ?? 'deity') as BreakthroughTarget;
  const b = rulesOf(target);
  const factors: string[] = [`基礎 ${b.baseBp / 100}%`];
  let bp = b.baseBp;
  const rootBp = b.rootBp[c.root.grade];
  if (rootBp) {
    bp += rootBp;
    factors.push(`靈根 ${rootBp > 0 ? '+' : ''}${rootBp / 100}%`);
  }
  const array = state.buildings.find((x) => x.defId === ARRAY && x.region === c.seat && isOperating(x));
  if (target === 'foundation' || target === 'core') {
    const lv2 = target === 'core' ? balance.coreBreakthrough.arrayLv2Bp : balance.breakthrough.arrayLv2Bp;
    if (array && array.level >= 2) {
      bp += lv2;
      factors.push(`聚靈陣 2 級 +${lv2 / 100}%`);
    }
  } else {
    const lv3 = target === 'nascent' ? balance.nascentBreakthrough.arrayLv3Bp : balance.deityBreakthrough.arrayLv3Bp;
    if (array && array.level >= 3) {
      bp += lv3;
      factors.push(`聚靈陣 3 級 +${lv3 / 100}%`);
    }
  }
  if (target !== 'foundation') {
    const cave = caveAbodeAt(state, content, c.seat);
    const caveBp = target === 'core' ? cave?.coreBonusBp : cave?.nascentBonusBp;
    if (caveBp) {
      bp += caveBp;
      factors.push(`洞府 +${caveBp / 100}%`);
    }
    // 結丹看功法大成（第 9 層），凝嬰看功法圓滿（第 13 層）
    const masteryLevel = target === 'core' ? 9 : 13;
    if (b.masteryBp && techniqueTier(c).level >= masteryLevel) {
      bp += b.masteryBp;
      factors.push(`功法${balance.technique.stages[(masteryLevel - 1) / 4] ?? ''} +${b.masteryBp / 100}%`);
    }
  }
  // 輔修功法《養神篇》（0.14.0）
  const spirit = minorStats(c).breakBp;
  if (spirit) {
    bp += spirit;
    factors.push(`《${minorDef(c.minor?.id ?? '')?.name ?? ''}》 +${spirit / 100}%`);
  }
  // 掌門護法（0.9.1）：掌門境界高於弟子要突破的境界、人在宗門時，替弟子護法
  const p = state.protagonist;
  if (c.role !== 'protagonist' && MAJOR_ORDER.indexOf(p.realm.major) > MAJOR_ORDER.indexOf(target) && !AWAY.includes(p.schedule)) {
    bp += balance.autoBreakthrough.guardBp;
    factors.push(`掌門護法 +${balance.autoBreakthrough.guardBp / 100}%`);
  }
  if (c.health < b.lowHealthThreshold) {
    bp += b.lowHealthBp;
    factors.push(`健康低於 ${b.lowHealthThreshold} ${b.lowHealthBp / 100}%`);
  }
  bp = Math.max(0, Math.min(b.maxBp, bp));
  const where = content.regions.get(c.seat)?.name ?? '';
  const pill = BREAKTHROUGH_PILL[target];
  const pillName = RESOURCE_NAMES[pill];
  const tech = techniqueOf(state, content);
  const top = topStage(c.realm.major);
  let blocked: string | undefined;
  if (atRealmCap(c) || (c.realm.major === 'deity' && c.realm.stage === top)) blocked = '化神圓滿已是人界頂點，煉虛以上之後的版本開放';
  else if (c.realm.stage < top)
    blocked = `需要${MAJOR_NAMES[c.realm.major]}${c.realm.major === 'qi' ? '九層' : '圓滿'}且修為圓滿（目前 ${realmName(c.realm)}）`;
  else if (c.xp < xpToNext(c.realm)) blocked = `修為還沒圓滿（${c.xp} / ${xpToNext(c.realm)}）`;
  else if (isInjured(c)) blocked = '受傷中不能突破';
  else if (c.insight < b.requiredInsight) {
    blocked = `需要《${tech?.name ?? '主修功法'}》領悟到${levelNameAt(b.requiredInsight)}（${c.insight} / ${b.requiredInsight}，可在藏經閣研究）`;
  } else if (qiCapacity(state, content, c.seat) < b.requiredQiCapacity)
    blocked = `修煉地點（${where}）靈氣容量需達 ${b.requiredQiCapacity}（${
      target === 'foundation' ? '建造聚靈陣' : target === 'core' ? '聚靈陣 2 級加洞府' : '聚靈陣 3 級加洞府 3 級'
    }）`;
  else if (state.resources[pill] < 1) blocked = `需要${pillName} 1 份`;
  const deathBp = b.failDeathBp;
  const deathText = deathBp
    ? `失敗時有 ${deathBp / 100}% 會身死道消（這次突破整體約 ${Math.round(((10000 - bp) * deathBp) / 1_000_000)}% 死亡）。`
    : '不會死亡。';
  return {
    target,
    bp,
    factors,
    failure: `消耗${pillName}；受傷 ${b.failInjuryMonths} 個月、健康降至 ${b.failHealth}、損失 ${b.failXpLossPct}% 修為。${deathText}${
      blessingReady(state, content) ? `祖師殿可以免除這次失敗的受傷、修為損失${deathBp ? '與死亡' : ''}。` : ''
    }`,
    blocked,
    pill,
    deathBp,
  };
}

const SUCCESS_TEXT: Record<BreakthroughTarget, (name: string) => string> = {
  foundation: (n) => `★ ${n}突破成功，踏入築基前期！`,
  core: (n) => `★ ${n}結丹成功，凝成金丹！`,
  nascent: (n) => `★ ${n}碎丹成嬰，踏入元嬰前期！`,
  deity: (n) => `★ ${n}元神出竅，踏入化神前期！`,
};

/** 月結算第 4 步：突破判定。odds 在扣除丹藥之前計算。回傳 true 表示身死道消（由呼叫者處理後事）。 */
export function resolveBreakthrough(
  state: GameState,
  content: ContentPack,
  c: Character,
  odds: BreakthroughOdds,
  lines: string[],
): boolean {
  const b = rulesOf(odds.target);
  const name = BREAKTHROUGH_NAMES[odds.target];
  c.schedule = 'cultivate';
  if (rng(state, 'cultivation').chance(odds.bp)) {
    c.realm = { major: odds.target, stage: 1 };
    c.xp = 0;
    lines.push(SUCCESS_TEXT[odds.target](c.name));
    return false;
  }
  if (blessingReady(state, content)) {
    // 祖師殿 2 級：祖師顯靈，免除失敗懲罰（丹藥仍然耗掉）
    state.blessingReadyAt = monthIndex(state.date) + balance.lifespan.blessingCooldown;
    lines.push(`✗ ${c.name}${name}失敗，但祖師顯靈護住心脈，沒有受傷，修為也未受損。`);
    return false;
  }
  if (odds.deathBp && rng(state, 'cultivation').chance(odds.deathBp)) {
    lines.push(`✗ ${c.name}${name}失敗，經脈盡毀，身死道消。`);
    return true;
  }
  c.injuryMonths = Math.max(c.injuryMonths, b.failInjuryMonths);
  c.health = Math.min(c.health, b.failHealth);
  c.xp = Math.floor((c.xp * (100 - b.failXpLossPct)) / 100);
  lines.push(`✗ ${c.name}${name}失敗，受傷 ${b.failInjuryMonths} 個月，修為受損。`);
  return false;
}

/** 月結算第 4 步：演武場切磋，日常修煉的內門有機會提升戰鬥技藝。 */
export function tickTraining(state: GameState, content: ContentPack, lines: string[]): void {
  const b = state.buildings.find((x) => x.defId === TRAINING && isOperating(x));
  const eff = b ? effectsOf(content, b) : undefined;
  if (!eff?.combatTrainBp) return;
  const gained: string[] = [];
  for (const d of state.disciples) {
    if (d.schedule !== 'cultivate' || d.skills.combat >= balance.positions.maxSkill) continue;
    if (rng(state, 'cultivation').chance(eff.combatTrainBp)) {
      d.skills.combat += 1;
      gained.push(d.name);
    }
  }
  if (gained.length) lines.push(`演武場切磋：${gained.join('、')}戰鬥技藝 +1。`);
  if (eff.outerTraining) state.outer.training = Math.min(100, state.outer.training + eff.outerTraining);
}

/** 月結算第 4 步：療傷、年齡、閉關計時。 */
export function tickBody(state: GameState, lines: string[]): void {
  for (const c of allCharacters(state)) {
    c.ageMonths += 1;
    const resting = c.schedule === 'heal';
    const heal = resting ? balance.heal.healthPerMonthResting : balance.heal.healthPerMonth;
    if (c.health < 100) c.health = Math.min(100, c.health + heal);
    if (c.injuryMonths > 0) {
      c.injuryMonths -= resting ? 2 : 1;
      if (c.injuryMonths <= 0) {
        c.injuryMonths = 0;
        lines.push(`${c.name}傷勢痊癒。`);
        if (c.schedule === 'heal') c.schedule = 'cultivate';
      }
    }
  }
  const p = state.protagonist;
  if (p.schedule === 'seclusion' && p.seclusion) {
    p.seclusion.remainingMonths -= 1;
    p.seclusion.streak += 1;
    if (p.seclusion.remainingMonths <= 0) {
      lines.push(`${p.name}出關。`);
      p.seclusion = null;
      p.schedule = 'cultivate';
    }
  }
}
