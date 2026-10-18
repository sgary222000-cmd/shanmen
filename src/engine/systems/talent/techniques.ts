import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { TechniqueDef } from '../../../content/schema';
import type { Character, GameState } from '../../types';
import { effectsOf, isOperating, LIBRARY } from '../buildings/buildings';

// 主修功法與領悟（企畫書 §5）：人人修宗門的主修功法，領悟分入門、小成、大成。
// 平時修煉會慢慢領悟；在藏經閣「研究」快得多。結丹需要小成。

export interface TechniqueTier {
  index: number;
  name: string;
  /** 修煉與戰鬥加成（百分比） */
  pct: number;
  /** 下一階的門檻；已是大成時為 null */
  next: number | null;
}

export function techniqueTier(c: Character): TechniqueTier {
  const tiers = balance.technique.tiers;
  let index = 0;
  tiers.forEach((t, i) => {
    if (c.insight >= t.insight) index = i;
  });
  const t = tiers[index] ?? tiers[0];
  return { index, name: t?.name ?? '入門', pct: t?.pct ?? 0, next: tiers[index + 1]?.insight ?? null };
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
    const before = techniqueTier(c).index;
    c.insight = Math.min(balance.technique.maxInsight, c.insight + insightGain(state, content, c).total);
    const after = techniqueTier(c);
    if (after.index > before) lines.push(`${c.name}的《${tech?.name ?? '主修功法'}》領悟至${after.name}。`);
  }
}
