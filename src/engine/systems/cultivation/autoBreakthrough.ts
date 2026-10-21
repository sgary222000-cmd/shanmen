import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { RESOURCE_NAMES } from '../../resources';
import type { Character, GameState, ResourceId } from '../../types';
import { isInjured, MAJOR_NAMES, MAJOR_ORDER, nextMajor, topStage, xpToNext } from '../characters/characters';
import { breakthroughOdds } from './cultivation';

// 弟子自動突破（0.9.1）：內門弟子在日常修煉、修為圓滿、條件與丹藥齊全，
// 而且成功率夠高、失敗不會死、要突破的境界比掌門低時，月初自動嘗試突破，不必一個一個安排。

const A = balance.autoBreakthrough;

export function autoBreakthroughOn(state: GameState): boolean {
  return state.autoBreakthrough ?? true;
}

/** 這位弟子本月會不會自動突破（不考慮丹藥被其他人先用掉）。 */
export function autoBreakthroughEligible(state: GameState, content: ContentPack, c: Character): boolean {
  if (c.role === 'protagonist' || c.schedule !== 'cultivate' || isInjured(c)) return false;
  if (c.realm.stage !== topStage(c.realm.major) || c.xp < xpToNext(c.realm) || !nextMajor(c.realm.major)) return false;
  // 只自動衝比掌門低的境界：凝嬰丹、化神丹這類掌門自己要用的丹藥不會被弟子先用掉
  const target = nextMajor(c.realm.major)!;
  if (MAJOR_ORDER.indexOf(target) >= MAJOR_ORDER.indexOf(state.protagonist.realm.major)) return false;
  const o = breakthroughOdds(state, content, c);
  return !o.blocked && o.deathBp === 0 && o.bp >= A.minOddsPct * 100;
}

/** 月初：把符合條件的弟子改成突破行程，每顆突破丹只分給一人。 */
export function scheduleAutoBreakthroughs(state: GameState, content: ContentPack, lines: string[]): void {
  if (!autoBreakthroughOn(state)) return;
  const reserved: Partial<Record<ResourceId, number>> = {};
  for (const c of state.disciples) {
    if (!autoBreakthroughEligible(state, content, c)) continue;
    const o = breakthroughOdds(state, content, c);
    const used = reserved[o.pill] ?? 0;
    if (state.resources[o.pill] - used < 1) continue;
    reserved[o.pill] = used + 1;
    c.schedule = 'breakthrough';
    lines.push(
      `${c.name}修為圓滿，自動嘗試突破${MAJOR_NAMES[nextMajor(c.realm.major)!]}（成功率 ${Math.round(o.bp / 100)}%，消耗${RESOURCE_NAMES[o.pill]}；可在弟子頁關閉自動突破）。`,
    );
  }
}
