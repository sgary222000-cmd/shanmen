import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { allyUnit } from '../../src/engine/systems/combat/party';
import { xpToNext } from '../../src/engine/systems/characters/characters';
import { breakthroughOdds, monthlyXp } from '../../src/engine/systems/cultivation/cultivation';
import { techniqueStats, techniqueTier } from '../../src/engine/systems/talent/techniques';
import { advance, content, developed, edit, fresh } from './helpers';

// 0.13.0：主修功法 20 層，每層加屬性，每進入一個名稱修煉 +5%。

const T = balance.technique;

describe('主修功法 20 層', () => {
  it('門檻遞增、共 20 層，第 5、9、13 層對齊舊的小成、大成、圓滿', () => {
    expect(T.levels).toHaveLength(20);
    for (let i = 1; i < T.levels.length; i++) expect(T.levels[i]).toBeGreaterThan(T.levels[i - 1] ?? 0);
    expect(T.levels[4]).toBe(100);
    expect(T.levels[8]).toBe(300);
    expect(T.levels[12]).toBe(400);
    expect(T.maxInsight).toBe(T.levels[19]);
  });

  it('層名與修煉加成：入門一層 +5%、小成一層 +10%、化境四層 +25%', () => {
    const s = fresh();
    const at = (insight: number) => techniqueTier({ ...s.protagonist, insight });
    expect(at(0)).toMatchObject({ level: 1, name: '入門一層', pct: 5, next: 20 });
    expect(at(99)).toMatchObject({ level: 4, name: '入門四層' });
    expect(at(100)).toMatchObject({ level: 5, name: '小成一層', pct: 10 });
    expect(at(1500)).toMatchObject({ level: 20, name: '化境四層', pct: 25, next: null });
  });

  it('每層加攻擊、生命、防禦；劍修另加暴擊；戰鬥單位跟著變強', () => {
    const low = developed();
    const high = edit(low, (x) => {
      x.protagonist.insight = 1500;
    });
    expect(techniqueStats(high, content, high.protagonist)).toMatchObject({ atkPct: 40, hpPct: 40, defPct: 20, critPct: 10 });
    const a = allyUnit(low, content, low.protagonist, 'front');
    const b = allyUnit(high, content, high.protagonist, 'front');
    expect(b.atk).toBeGreaterThan(a.atk);
    expect(b.maxHp).toBeGreaterThan(a.maxHp);
    expect(b.crit).toBe(a.crit + 10 - Math.floor(0.5 * techniqueTier(low.protagonist).level));
  });

  it('丹道傳承專長加生命與防禦，符陣加閃避，御獸加敏捷', () => {
    for (const [lineage, key, value] of [
      ['lineage.alchemy', 'hpPct', 60],
      ['lineage.talisman', 'dodgePct', 10],
      ['lineage.beast', 'agi', 10],
    ] as const) {
      const s = edit(fresh(1, lineage), (x) => {
        x.protagonist.insight = 1500;
      });
      expect(techniqueStats(s, content, s.protagonist)[key]).toBe(value);
    }
  });

  it('層數越高修煉越快', () => {
    const s = developed();
    const hi = edit(s, (x) => {
      x.protagonist.insight = 1500;
    });
    expect(monthlyXp(hi, content, hi.protagonist, false).total).toBeGreaterThan(monthlyXp(s, content, s.protagonist, false).total);
  });

  it('突破條件說明寫出需要的層數；領悟可以累積到 1500', () => {
    const s = edit(developed(), (x) => {
      x.protagonist.realm = { major: 'foundation', stage: 4 };
      x.protagonist.insight = 50;
      x.protagonist.xp = xpToNext(x.protagonist.realm);
    });
    expect(breakthroughOdds(s, content, s.protagonist).blocked ?? '').toContain('第 5 層');
    let late = edit(developed(), (x) => {
      x.protagonist.insight = 1495;
      x.protagonist.realm = { major: 'deity', stage: 1 };
    });
    late = advance(late, 3);
    expect(late.protagonist.insight).toBe(1500);
  });
});
