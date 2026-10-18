import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { rng } from '../../rng';
import type { Character, GameState } from '../../types';
import { ARRAY, findByDef, qiCapacity } from '../buildings/buildings';
import {
  allCharacters,
  atP0Cap,
  isInjured,
  qiDemandOf,
  readyForFoundation,
  realmName,
  xpToNext,
} from '../characters/characters';

/** 靈氣效率（百分比）：容量不足時所有修煉按比例降低。 */
export function qiEfficiencyPct(state: GameState, content: ContentPack): number {
  const demand = qiDemandOf(state);
  if (demand <= 0) return 100;
  return Math.min(100, Math.floor((qiCapacity(state, content) * 100) / demand));
}

export interface XpBreakdown {
  total: number;
  parts: string[];
}

/** 計算人物本月修為；預覽與結算共用。 */
export function monthlyXp(state: GameState, content: ContentPack, c: Character, tookPill: boolean): XpBreakdown {
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
  const rootPct = balance.rootMultiplierPct[c.root.grade];
  const qiPct = qiEfficiencyPct(state, content);
  parts.push(`靈根 ${rootPct}%`, `靈氣 ${qiPct}%`);
  let total = Math.floor((balance.baseXpPerMonth * pct * rootPct * qiPct) / 1_000_000);
  if (isInjured(c)) {
    total = Math.floor((total * balance.injuredXpPct) / 100);
    parts.push(`受傷 ${balance.injuredXpPct}%`);
  }
  if (tookPill) {
    total += balance.pillQiXp;
    parts.push(`聚氣丹 +${balance.pillQiXp}`);
  }
  return { total, parts };
}

/** 增加修為並處理小階段晉升；煉氣九層與築基圓滿會停在門檻。 */
export function addXp(c: Character, amount: number, lines: string[]): void {
  c.xp += amount;
  for (;;) {
    const need = xpToNext(c.realm);
    if (c.xp < need) return;
    if (c.realm.major === 'qi' && c.realm.stage < 9) {
      c.xp -= need;
      c.realm = { major: 'qi', stage: c.realm.stage + 1 };
      lines.push(`${c.name}晉升${realmName(c.realm)}。`);
    } else if (c.realm.major === 'foundation' && c.realm.stage < 4) {
      c.xp -= need;
      c.realm = { major: 'foundation', stage: c.realm.stage + 1 };
      lines.push(`${c.name}晉升${realmName(c.realm)}。`);
    } else {
      c.xp = need; // 停在門檻，等待大突破（或 P1 金丹）
      return;
    }
  }
}

export interface BreakthroughOdds {
  bp: number;
  factors: string[];
  failure: string;
  blocked: string | undefined;
}

export function breakthroughOdds(state: GameState, content: ContentPack, c: Character): BreakthroughOdds {
  const b = balance.breakthrough;
  const factors: string[] = [`基礎 ${b.baseBp / 100}%`];
  let bp = b.baseBp;
  const rootBp = b.rootBp[c.root.grade];
  if (rootBp) {
    bp += rootBp;
    factors.push(`靈根 ${rootBp > 0 ? '+' : ''}${rootBp / 100}%`);
  }
  const array = findByDef(state, ARRAY);
  if (array && array.level >= 2 && array.status !== 'disabled') {
    bp += b.arrayLv2Bp;
    factors.push(`聚靈陣 2 級 +${b.arrayLv2Bp / 100}%`);
  }
  if (c.health < b.lowHealthThreshold) {
    bp += b.lowHealthBp;
    factors.push(`健康低於 ${b.lowHealthThreshold} ${b.lowHealthBp / 100}%`);
  }
  bp = Math.max(0, Math.min(b.maxBp, bp));
  let blocked: string | undefined;
  if (atP0Cap(c) || c.realm.major !== 'qi') blocked = '金丹突破於 P1 開放';
  else if (!readyForFoundation(c)) blocked = `需要煉氣九層且修為圓滿（目前 ${realmName(c.realm)}）`;
  else if (isInjured(c)) blocked = '受傷中不能突破';
  else if (qiCapacity(state, content) < b.requiredQiCapacity)
    blocked = `主峰靈氣容量需達 ${b.requiredQiCapacity}（建造聚靈陣）`;
  else if (state.resources.pill_foundation < 1) blocked = '需要築基丹 1 顆';
  return {
    bp,
    factors,
    failure: `消耗築基丹；受傷 ${b.failInjuryMonths} 個月、健康降至 ${b.failHealth}、損失 ${b.failXpLossPct}% 修為。不會死亡。`,
    blocked,
  };
}

/** 月結算第 4 步：突破判定。odds 在扣除築基丹之前計算。 */
export function resolveBreakthrough(
  state: GameState,
  c: Character,
  odds: BreakthroughOdds,
  lines: string[],
): void {
  const b = balance.breakthrough;
  const success = rng(state, 'cultivation').chance(odds.bp);
  if (success) {
    c.realm = { major: 'foundation', stage: 1 };
    c.xp = 0;
    lines.push(`★ ${c.name}突破成功，踏入築基前期！`);
  } else {
    c.injuryMonths = Math.max(c.injuryMonths, b.failInjuryMonths);
    c.health = Math.min(c.health, b.failHealth);
    c.xp = Math.floor((c.xp * (100 - b.failXpLossPct)) / 100);
    lines.push(`✗ ${c.name}突破失敗，受傷 ${b.failInjuryMonths} 個月，修為受損。`);
  }
  c.schedule = 'cultivate';
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
