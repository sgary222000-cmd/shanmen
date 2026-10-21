import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import type { GameState } from '../../src/engine';
import { xpToNext } from '../../src/engine/systems/characters/characters';
import { autoBreakthroughEligible } from '../../src/engine/systems/cultivation/autoBreakthrough';
import { breakthroughOdds, monthlyXp } from '../../src/engine/systems/cultivation/cultivation';
import { advance, content, developed, edit, run } from './helpers';

// 0.9.1：弟子晉升加快——外出、工坊也能修煉；修為圓滿自動突破；掌門護法。

/** 掌門金丹，兩名煉氣九層、修為圓滿的弟子，一份築基丹。 */
function ready(pills = 1): GameState {
  return edit(developed(), (s) => {
    s.protagonist.realm = { major: 'core', stage: 1 };
    s.resources.pill_foundation = pills;
    const d = s.disciples[0]!;
    d.realm = { major: 'qi', stage: 9 };
    d.xp = xpToNext(d.realm);
    s.disciples.push({ ...structuredClone(d), id: 'c51', name: '林青' });
  });
}

const tried = (s: GameState) => s.reports[0]?.lines.filter((l) => l.includes('自動嘗試突破')) ?? [];

describe('弟子晉升', () => {
  it('外出、派遣、工坊時的修為是日常修煉的七成', () => {
    const s = developed();
    const d = s.disciples[0]!;
    const base = monthlyXp(s, content, d, false).total;
    for (const schedule of ['dispatch', 'explore', 'alchemy'] as const) {
      const away = edit(s, (x) => {
        x.disciples[0]!.schedule = schedule;
      });
      expect(balance.scheduleXpPct[schedule]).toBe(70);
      expect(monthlyXp(away, content, away.disciples[0]!, false).total).toBe(Math.floor((base * 70) / 100));
    }
  });

  it('修為圓滿的弟子月初自動突破；只有一份築基丹時只有一人衝', () => {
    const s = ready(1);
    expect(autoBreakthroughEligible(s, content, s.disciples[0]!)).toBe(true);
    const after = advance(s);
    expect(tried(after)).toHaveLength(1);
    expect(after.resources.pill_foundation).toBe(0);
    const two = advance(ready(2));
    expect(tried(two)).toHaveLength(2);
  });

  it('關掉自動突破就不會衝', () => {
    const s = run(ready(2), { type: 'setAutoBreakthrough', value: false });
    const after = advance(s);
    expect(tried(after)).toHaveLength(0);
    expect(after.resources.pill_foundation).toBe(2);
  });

  it('不自動衝掌門還沒到的境界，也不衝外出中的弟子', () => {
    const low = edit(ready(1), (s) => {
      s.protagonist.realm = { major: 'foundation', stage: 1 };
    });
    expect(autoBreakthroughEligible(low, content, low.disciples[0]!)).toBe(false);
    const away = edit(ready(1), (s) => {
      s.disciples[0]!.schedule = 'dispatch';
    });
    expect(autoBreakthroughEligible(away, content, away.disciples[0]!)).toBe(false);
  });

  it('掌門境界較高、人在宗門時有掌門護法加成；外出時沒有', () => {
    const s = ready(1);
    const home = breakthroughOdds(s, content, s.disciples[0]!);
    expect(home.factors.some((f) => f.startsWith('掌門護法'))).toBe(true);
    const out = edit(s, (x) => {
      x.protagonist.schedule = 'explore';
    });
    const o = breakthroughOdds(out, content, out.disciples[0]!);
    expect(o.factors.some((f) => f.startsWith('掌門護法'))).toBe(false);
    expect(home.bp).toBeGreaterThan(o.bp);
    expect(breakthroughOdds(s, content, s.protagonist).factors.some((f) => f.startsWith('掌門護法'))).toBe(false);
  });
});
