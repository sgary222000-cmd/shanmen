import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import { canAfford, formatResources, gain, scaleResources, shortfallText, spend } from '../../resources';
import { rng } from '../../rng';
import type { Character, GameState } from '../../types';
import { allCharacters, findCharacter, MAJOR_NAMES, MAJOR_ORDER } from '../characters/characters';
import { isOperating, LIBRARY } from '../buildings/buildings';
import { rawInsightGain, techniqueTier } from './techniques';

// 輔修功法（0.14.0，docs/功法擴充規劃.md 第二節）：
// - 藏經閣撰寫：金丹以上的作者研究滿 6 個月寫成（有失敗機率），宗門多一部輔修功法。
// - 每人另學一部，10 層；每月輔修領悟 = 主修領悟 ÷ 2（不影響主修）。

const M = balance.minorTechnique;
export type MinorDef = (typeof M.list)[number];

export function minorDef(id: string): MinorDef | undefined {
  return M.list.find((x) => x.id === id);
}

export function libraryLevel(state: GameState): number {
  return Math.max(0, ...state.buildings.filter((b) => b.defId === LIBRARY && isOperating(b)).map((b) => b.level));
}

export function minorLevel(c: Character): { level: number; next: number | null } {
  if (!c.minor) return { level: 0, next: null };
  const insight = c.minor.insight;
  let level = 1;
  M.levels.forEach((need, i) => {
    if (insight >= need) level = i + 1;
  });
  return { level, next: M.levels[level] ?? null };
}

export interface MinorStats {
  atkPct: number;
  hpPct: number;
  defPct: number;
  critPct: number;
  dodgePct: number;
  agi: number;
  healPct: number;
  breakBp: number;
  craftBp: number;
}

export function minorStats(c: Character): MinorStats {
  const def = c.minor ? minorDef(c.minor.id) : undefined;
  const { level } = minorLevel(c);
  const f = (n: number | undefined) => Math.floor((n ?? 0) * level);
  const p = def?.per ?? {};
  return {
    atkPct: f(p.atkPct),
    hpPct: f(p.hpPct),
    defPct: f(p.defPct),
    critPct: f(p.critPct),
    dodgePct: f(p.dodgePct),
    agi: f(p.agi),
    healPct: f(p.healPct),
    breakBp: f(p.breakBp),
    craftBp: f(p.craftBp),
  };
}

/** 輔修功法目前效果的說明，例如「防禦 +6%、生命 +3%」。 */
export function minorStatsText(c: Character): string {
  const s = minorStats(c);
  const parts: string[] = [];
  if (s.atkPct) parts.push(`攻擊 +${s.atkPct}%`);
  if (s.hpPct) parts.push(`生命 +${s.hpPct}%`);
  if (s.defPct) parts.push(`防禦 +${s.defPct}%`);
  if (s.critPct) parts.push(`暴擊 +${s.critPct}%`);
  if (s.dodgePct) parts.push(`閃避 +${s.dodgePct}%`);
  if (s.agi) parts.push(`敏捷 +${s.agi}`);
  if (s.healPct) parts.push(`戰後回復生命 +${s.healPct}%`);
  if (s.breakBp) parts.push(`大突破 +${s.breakBp / 100}%`);
  if (s.craftBp) parts.push(`煉丹煉器製符 +${s.craftBp / 100}%`);
  return parts.join('、');
}

/** 每月輔修領悟：主修領悟（不計上限）÷ 2 進位；撰寫中的作者為 0。 */
export function minorGain(state: GameState, content: ContentPack, c: Character): number {
  if (!c.minor || c.minor.insight >= M.maxInsight || isComposer(state, c.id)) return 0;
  const raw = rawInsightGain(state, content, c).total;
  return raw > 0 ? Math.ceil(raw / M.gainDivisor) : 0;
}

// ── 撰寫 ──────────────────────────────────────────

export function isComposer(state: GameState, id: string): boolean {
  return state.composing?.authorId === id;
}

/** 撰寫成功率（萬分比）。 */
export function composeBp(c: Character): number {
  const lv = techniqueTier(c).level;
  return Math.min(M.maxBp, M.baseBp + Math.max(0, lv - M.bpFromLevel) * M.bpPerLevel);
}

export function composeBlocked(state: GameState, techId: string, authorId?: string): string | undefined {
  const def = minorDef(techId);
  if (!def) return '沒有這部功法';
  if ((state.minorTechs ?? []).includes(techId)) return '已經寫成';
  if (state.composing) return `藏經閣正在撰寫《${minorDef(state.composing.techId)?.name ?? ''}》`;
  if (libraryLevel(state) < def.library) return `藏經閣 ${def.library} 級才能撰寫`;
  if (!canAfford(state.resources, M.cost)) return `材料不足（${shortfallText(state.resources, M.cost)}）`;
  if (authorId !== undefined) {
    const c = findCharacter(state, authorId);
    if (!c) return '沒有這個人';
    if (MAJOR_ORDER.indexOf(c.realm.major) < MAJOR_ORDER.indexOf(M.authorMajor)) return `作者要${MAJOR_NAMES[M.authorMajor]}以上`;
  }
  return undefined;
}

/** 可以擔任作者的人：金丹以上。 */
export function composeAuthors(state: GameState): Character[] {
  return allCharacters(state).filter((c) => MAJOR_ORDER.indexOf(c.realm.major) >= MAJOR_ORDER.indexOf(M.authorMajor));
}

export function startCompose(state: GameState, techId: string, authorId: string): string {
  const blocked = composeBlocked(state, techId, authorId);
  ensure(!blocked, blocked ?? '');
  const c = findCharacter(state, authorId);
  ensure(c, '沒有這個人');
  spend(state.resources, M.cost);
  state.composing = { authorId, techId, months: 0 };
  c.schedule = 'research';
  return `${c.name}開始在藏經閣撰寫《${minorDef(techId)?.name ?? ''}》（花費 ${formatResources(M.cost)}），研究滿 ${M.months} 個月寫成，成功率 ${composeBp(c) / 100}%。`;
}

/** 月結：作者本月有研究就推進一個月；寫滿時擲成敗，失敗退還一半材料。 */
export function tickCompose(state: GameState, lines: string[]): void {
  const job = state.composing;
  if (!job) return;
  const def = minorDef(job.techId);
  const c = findCharacter(state, job.authorId);
  const name = def?.name ?? '';
  if (!c) {
    gain(state.resources, scaleResources(M.cost, 50));
    state.composing = null;
    lines.push(`撰寫《${name}》的作者已不在宗門，撰寫中止，退回一半材料。`);
    return;
  }
  if (c.schedule !== 'research') return;
  job.months += 1;
  if (job.months < M.months) return;
  state.composing = null;
  if (rng(state, 'alchemy').chance(composeBp(c))) {
    state.minorTechs = [...(state.minorTechs ?? []), job.techId];
    lines.push(`★ ${c.name}寫成輔修功法《${name}》，內門弟子可以到「傳承 → 輔修功法」學習。`);
  } else {
    gain(state.resources, scaleResources(M.cost, 50));
    lines.push(`${c.name}撰寫《${name}》功虧一簣，退回一半材料。`);
  }
}

// ── 學習 ──────────────────────────────────────────

export function learnMinor(state: GameState, characterId: string, techId: string | null): string {
  const c = findCharacter(state, characterId);
  ensure(c, '沒有這個人');
  if (techId === null) {
    ensure(c.minor, '沒有在修輔修功法');
    const old = minorDef(c.minor.id)?.name ?? '';
    delete c.minor;
    return `${c.name}放下《${old}》，輔修領悟歸零。`;
  }
  ensure((state.minorTechs ?? []).includes(techId), '宗門還沒有這部功法');
  ensure(c.minor?.id !== techId, '已經在修這部功法');
  const had = c.minor ? minorDef(c.minor.id)?.name : undefined;
  c.minor = { id: techId, insight: 0 };
  return `${c.name}開始修習《${minorDef(techId)?.name ?? ''}》${had ? `（放下《${had}》，原本的輔修領悟歸零）` : ''}。`;
}

/** 月結：輔修領悟，升層時寫月報。 */
export function tickMinorInsight(state: GameState, content: ContentPack, chars: Character[], lines: string[]): void {
  for (const c of chars) {
    if (!c.minor) continue;
    const add = minorGain(state, content, c);
    if (!add) continue;
    const before = minorLevel(c).level;
    c.minor.insight = Math.min(M.maxInsight, c.minor.insight + add);
    const after = minorLevel(c).level;
    if (after > before) lines.push(`${c.name}的《${minorDef(c.minor.id)?.name ?? ''}》修至第 ${after} 層。`);
  }
}
