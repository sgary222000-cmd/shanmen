import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { TechniqueDef } from '../../../content/schema';
import type { Character, GameState } from '../../types';
import { effectsOf, isOperating, LIBRARY } from '../buildings/buildings';

// 主修功法與領悟（企畫書 §5）：人人修宗門的主修功法。
// 0.13.0 起分 20 層（入門、小成、大成、圓滿、化境各 4 層），每層加攻擊、生命、防禦與傳承專長屬性；
// 每進入一個名稱修煉 +5%。平時修煉會慢慢領悟；在藏經閣「研究」快得多。結丹要第 5 層、凝嬰第 9 層、化神第 13 層。

const T = balance.technique;

export interface TechniqueTier {
  /** 第幾層（1–20） */
  level: number;
  /** 名稱索引：0 入門、1 小成、2 大成、3 圓滿、4 化境 */
  index: number;
  /** 名稱（入門、小成…） */
  stage: string;
  /** 完整名稱，例如「小成二層」 */
  name: string;
  /** 修煉加成（百分比） */
  pct: number;
  /** 下一層的門檻；已是最高層時為 null */
  next: number | null;
}

const NUM = ['一', '二', '三', '四'];

export function levelName(level: number): string {
  return `${T.stages[Math.floor((level - 1) / 4)] ?? ''}${NUM[(level - 1) % 4] ?? ''}層`;
}

/** 達到某個領悟度門檻的層名（突破條件說明用）。 */
export function levelNameAt(insight: number): string {
  const i = T.levels.findIndex((x) => x === insight);
  return i >= 0 ? `第 ${i + 1} 層（${levelName(i + 1)}）` : `領悟 ${insight}`;
}

export function techniqueTier(c: Character): TechniqueTier {
  let level = 1;
  T.levels.forEach((need, i) => {
    if (c.insight >= need) level = i + 1;
  });
  const index = Math.floor((level - 1) / 4);
  return {
    level,
    index,
    stage: T.stages[index] ?? '入門',
    name: levelName(level),
    pct: (index + 1) * T.xpPctPerStage,
    next: T.levels[level] ?? null,
  };
}

export interface TechniqueStats {
  atkPct: number;
  hpPct: number;
  defPct: number;
  critPct: number;
  dodgePct: number;
  agi: number;
  /** 隨行靈獸攻擊（御獸傳承） */
  beastAtkPct: number;
}

/** 功法層數換算的屬性：共通每層加成＋傳承專長。 */
export function techniqueStats(state: GameState, content: ContentPack, c: Character): TechniqueStats {
  const { level } = techniqueTier(c);
  const tech = techniqueOf(state, content);
  const sp = (tech && T.specialty[tech.id]) || {};
  const f = (n: number | undefined) => Math.floor((n ?? 0) * level);
  return {
    atkPct: f(T.perLevel.atkPct) + f(sp.atkPct),
    hpPct: f(T.perLevel.hpPct) + f(sp.hpPct),
    defPct: f(T.perLevel.defPct) + f(sp.defPct),
    critPct: f(sp.critPct),
    dodgePct: f(sp.dodgePct),
    agi: f(sp.agi),
    beastAtkPct: f(sp.beastAtkPct),
  };
}

const STAT_LABELS: [keyof TechniqueStats, string, string][] = [
  ['atkPct', '攻擊', '%'],
  ['hpPct', '生命', '%'],
  ['defPct', '防禦', '%'],
  ['critPct', '暴擊', '%'],
  ['dodgePct', '閃避', '%'],
  ['agi', '敏捷', ''],
  ['beastAtkPct', '靈獸攻擊', '%'],
];

export function techniqueStatsText(s: TechniqueStats): string {
  return STAT_LABELS.filter(([k]) => s[k])
    .map(([k, name, unit]) => `${name} +${s[k]}${unit}`)
    .join('、');
}

export function techniqueOf(state: GameState, content: ContentPack): TechniqueDef | undefined {
  const lineage = content.lineages.get(state.lineage);
  return lineage ? content.techniques.get(lineage.technique) : undefined;
}

/** 運作中的藏經閣提供的研究加成；沒有時為 null（不能研究）。 */
export function libraryResearch(state: GameState, content: ContentPack): number | null {
  const lib = state.buildings.find((b) => b.defId === LIBRARY && isOperating(b));
  return lib ? effectsOf(content, lib)?.researchPerMonth ?? 0 : null;
}

/** 本月可增加的領悟度；預覽與結算共用。 */
export function insightGain(state: GameState, content: ContentPack, c: Character): { total: number; parts: string[] } {
  const t = balance.technique;
  if (c.insight >= t.maxInsight) return { total: 0, parts: ['已達本階段上限'] };
  if (c.schedule === 'research') {
    const lib = libraryResearch(state, content) ?? 0;
    return { total: t.researchBase + lib, parts: [`研究 ${t.researchBase}`, ...(lib ? [`藏經閣 +${lib}`] : [])] };
  }
  if (c.schedule === 'breakthrough' || c.schedule === 'heal') return { total: 0, parts: [] };
  const passive = t.passive[c.realm.major];
  const extra = c.schedule === 'seclusion' ? t.seclusionPassive : 0;
  return { total: passive + extra, parts: [`平時領悟 ${passive}`, ...(extra ? [`閉關 +${extra}`] : [])] };
}

/** 月結算第 4 步：增加領悟度，跨過門檻時寫入月報。 */
export function tickInsight(state: GameState, content: ContentPack, chars: Character[], lines: string[]): void {
  const tech = techniqueOf(state, content);
  for (const c of chars) {
    const before = techniqueTier(c).level;
    c.insight = Math.min(balance.technique.maxInsight, c.insight + insightGain(state, content, c).total);
    const after = techniqueTier(c);
    if (after.level > before) lines.push(`${c.name}的《${tech?.name ?? '主修功法'}》領悟至${after.name}。`);
  }
}
