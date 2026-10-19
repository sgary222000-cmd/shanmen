import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { rng } from '../../rng';
import type { Character, GameState } from '../../types';
import { MAIN_REGION } from '../../../content/registry';
import { ARRAY, CAVE_ABODE, effectsOf, isOperating, qiCapacity, TRAINING } from '../buildings/buildings';
import {
  allCharacters,
  atP1Cap,
  isInjured,
  qiDemandOf,
  readyForCore,
  readyForFoundation,
  realmName,
  xpToNext,
} from '../characters/characters';
import { techniqueOf, techniqueTier } from '../talent/techniques';
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
    parts.push(`功法${tier.name} +${tier.pct}%`);
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
  const rootPct = balance.rootMultiplierPct[c.root.grade];
  const qiPct = qiEfficiencyPct(state, content, c.seat);
  parts.push(`靈根 ${rootPct}%`, `${region?.name ?? ''}靈氣 ${qiPct}%`);
  const base = balance.baseXpByMajor[c.realm.major];
  if (base !== balance.baseXpPerMonth) parts.unshift(`基礎 ${base}`);
  let total = Math.floor((base * Math.max(0, pct) * rootPct * qiPct) / 1_000_000);
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
    const top = c.realm.major === 'qi' ? 9 : 4;
    if (c.realm.stage < top) {
      c.xp -= need;
      c.realm = { major: c.realm.major, stage: c.realm.stage + 1 };
      lines.push(`${c.name}晉升${realmName(c.realm)}。`);
    } else {
      c.xp = need; // 停在門檻，等待大突破（金丹圓滿之後於 P2 開放）
      return;
    }
  }
}

export interface BreakthroughOdds {
  /** 突破的目標：築基或結丹 */
  target: 'foundation' | 'core';
  bp: number;
  factors: string[];
  failure: string;
  blocked: string | undefined;
  /** 本次突破消耗的丹藥 */
  pill: 'pill_foundation' | 'pill_core';
}

/** 突破成功率與條件（築基：煉氣九層圓滿；結丹：築基圓滿）。事前全部列出給玩家看。 */
export function breakthroughOdds(state: GameState, content: ContentPack, c: Character): BreakthroughOdds {
  const toCore = c.realm.major !== 'qi';
  const b = toCore ? balance.coreBreakthrough : balance.breakthrough;
  const factors: string[] = [`基礎 ${b.baseBp / 100}%`];
  let bp = b.baseBp;
  const rootBp = b.rootBp[c.root.grade];
  if (rootBp) {
    bp += rootBp;
    factors.push(`靈根 ${rootBp > 0 ? '+' : ''}${rootBp / 100}%`);
  }
  const array = state.buildings.find((x) => x.defId === ARRAY && x.region === c.seat && isOperating(x));
  if (array && array.level >= 2) {
    bp += b.arrayLv2Bp;
    factors.push(`聚靈陣 2 級 +${b.arrayLv2Bp / 100}%`);
  }
  if (toCore) {
    const cave = caveAbodeAt(state, content, c.seat);
    if (cave?.coreBonusBp) {
      bp += cave.coreBonusBp;
      factors.push(`洞府 +${cave.coreBonusBp / 100}%`);
    }
    if (techniqueTier(c).index >= 2) {
      bp += balance.coreBreakthrough.masteryBp;
      factors.push(`功法大成 +${balance.coreBreakthrough.masteryBp / 100}%`);
    }
  }
  if (c.health < b.lowHealthThreshold) {
    bp += b.lowHealthBp;
    factors.push(`健康低於 ${b.lowHealthThreshold} ${b.lowHealthBp / 100}%`);
  }
  bp = Math.max(0, Math.min(b.maxBp, bp));
  const where = content.regions.get(c.seat)?.name ?? '';
  let blocked: string | undefined;
  if (toCore) {
    const cb = balance.coreBreakthrough;
    const tech = techniqueOf(state, content);
    if (c.realm.major === 'core') blocked = atP1Cap(c) ? '元嬰突破於 P2 開放' : `金丹期正在累積修為（目前 ${realmName(c.realm)}）`;
    else if (!readyForCore(c)) blocked = `需要築基圓滿且修為圓滿（目前 ${realmName(c.realm)}）`;
    else if (isInjured(c)) blocked = '受傷中不能突破';
    else if (c.insight < cb.requiredInsight)
      blocked = `需要《${tech?.name ?? '主修功法'}》領悟小成（${c.insight} / ${cb.requiredInsight}，可在藏經閣研究）`;
    else if (qiCapacity(state, content, c.seat) < cb.requiredQiCapacity)
      blocked = `修煉地點（${where}）靈氣容量需達 ${cb.requiredQiCapacity}（聚靈陣 2 級加洞府）`;
    else if (state.resources.pill_core < 1) blocked = '需要結丹靈液 1 份';
  } else {
    const fb = balance.breakthrough;
    if (!readyForFoundation(c)) blocked = `需要煉氣九層且修為圓滿（目前 ${realmName(c.realm)}）`;
    else if (isInjured(c)) blocked = '受傷中不能突破';
    else if (qiCapacity(state, content, c.seat) < fb.requiredQiCapacity)
      blocked = `修煉地點（${where}）靈氣容量需達 ${fb.requiredQiCapacity}（建造聚靈陣）`;
    else if (state.resources.pill_foundation < 1) blocked = '需要築基丹 1 顆';
  }
  const pillName = toCore ? '結丹靈液' : '築基丹';
  return {
    target: toCore ? 'core' : 'foundation',
    bp,
    factors,
    failure: `消耗${pillName}；受傷 ${b.failInjuryMonths} 個月、健康降至 ${b.failHealth}、損失 ${b.failXpLossPct}% 修為。不會死亡。${
      blessingReady(state, content) ? '祖師殿可以免除這次失敗的受傷與修為損失。' : ''
    }`,
    blocked,
    pill: toCore ? 'pill_core' : 'pill_foundation',
  };
}

/** 月結算第 4 步：突破判定。odds 在扣除丹藥之前計算。 */
export function resolveBreakthrough(
  state: GameState,
  content: ContentPack,
  c: Character,
  odds: BreakthroughOdds,
  lines: string[],
): void {
  const b = odds.target === 'core' ? balance.coreBreakthrough : balance.breakthrough;
  const success = rng(state, 'cultivation').chance(odds.bp);
  if (success) {
    c.realm = { major: odds.target, stage: 1 };
    c.xp = 0;
    lines.push(odds.target === 'core' ? `★ ${c.name}結丹成功，凝成金丹！` : `★ ${c.name}突破成功，踏入築基前期！`);
  } else if (blessingReady(state, content)) {
    // 祖師殿 2 級：祖師顯靈，免除失敗懲罰（丹藥仍然耗掉）
    state.blessingReadyAt = monthIndex(state.date) + balance.lifespan.blessingCooldown;
    lines.push(`✗ ${c.name}${odds.target === 'core' ? '結丹' : '突破'}失敗，但祖師顯靈護住心脈，沒有受傷，修為也未受損。`);
  } else {
    c.injuryMonths = Math.max(c.injuryMonths, b.failInjuryMonths);
    c.health = Math.min(c.health, b.failHealth);
    c.xp = Math.floor((c.xp * (100 - b.failXpLossPct)) / 100);
    lines.push(`✗ ${c.name}${odds.target === 'core' ? '結丹' : '突破'}失敗，受傷 ${b.failInjuryMonths} 個月，修為受損。`);
  }
  c.schedule = 'cultivate';
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
