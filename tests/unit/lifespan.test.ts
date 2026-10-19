import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { monthIndex, STATE_VERSION } from '../../src/engine';
import { xpToNext } from '../../src/engine/systems/characters/characters';
import { lifespanMonths } from '../../src/engine/systems/characters/lifespan';
import { breakthroughOdds, monthlyXp, resolveBreakthrough } from '../../src/engine/systems/cultivation/cultivation';
import { foodNeed } from '../../src/engine/systems/economy/flows';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// P2 批次 A：壽元、延壽丹、親傳弟子、掌門繼承、祖師殿、連續推進的停止條件。

function second(s: ReturnType<typeof developed>) {
  return edit(s, (x) => {
    const d = structuredClone(x.disciples[0]!);
    d.id = 'c51';
    d.name = '韓立';
    d.realm = { major: 'foundation', stage: 2 };
    x.disciples.push(d);
  });
}

describe('壽元', () => {
  it('壽元依境界決定：煉氣 100、築基 200、金丹 400 歲', () => {
    const s = developed();
    const p = s.protagonist;
    expect(lifespanMonths(p)).toBe(100 * 12);
    expect(lifespanMonths({ ...p, realm: { major: 'foundation', stage: 1 } })).toBe(200 * 12);
    expect(lifespanMonths({ ...p, realm: { major: 'core', stage: 1 } })).toBe(400 * 12);
  });

  it('剩兩成時預警並要求連續推進停下', () => {
    const s = edit(developed(), (x) => {
      x.disciples[0]!.ageMonths = 80 * 12 - 1;
    });
    const r = tryRun(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.report?.lines.some((l) => l.includes('葉若雪壽元只剩兩成'))).toBe(true);
    expect(r.report?.stops?.some((x) => x.kind === 'lifespan')).toBe(true);
  });

  it('弟子壽終坐化：職位、丹爐、靈獸、親傳身分都會空出來', () => {
    let s = edit(developed(), (x) => {
      const d = x.disciples[0]!;
      d.ageMonths = 100 * 12 - 1;
      x.positions.steward = d.id;
      x.heirId = d.id;
      x.furnaces = [{ alchemistId: d.id, recipeId: 'recipe.qi_pill', repeat: true }];
      d.schedule = 'alchemy';
      x.beasts.push({
        id: 'b9',
        speciesId: x.beasts[0]?.speciesId ?? 'beast.jade_rabbit',
        name: '玉兔',
        ownerId: d.id,
        stage: 'young',
        growth: 0,
        task: 'follow',
      });
    });
    s = advance(s);
    expect(s.disciples).toHaveLength(0);
    expect(s.positions.steward).toBeNull();
    expect(s.heirId).toBeNull();
    expect(s.furnaces[0]?.alchemistId).toBeNull();
    expect(s.beasts.find((b) => b.id === 'b9')?.ownerId).toBeNull();
    expect(s.reports[0]?.lines.some((l) => l.includes('葉若雪壽元已盡'))).toBe(true);
  });

  it('延壽丹：增加該境界壽元 15%，一生最多兩顆', () => {
    let s = edit(developed(), (x) => {
      x.resources.pill_life = 3;
    });
    s = run(s, { type: 'takeLongevityPill', characterId: s.protagonist.id });
    expect(lifespanMonths(s.protagonist)).toBe(115 * 12);
    s = run(s, { type: 'takeLongevityPill', characterId: s.protagonist.id });
    const r = tryRun(s, { type: 'takeLongevityPill', characterId: s.protagonist.id });
    expect(r.ok).toBe(false);
    expect(s.resources.pill_life).toBe(1);
  });
});

describe('掌門繼承', () => {
  it('指定的親傳弟子在掌門坐化時直接接任，宗門進度保留', () => {
    let s = second(developed());
    s = run(s, { type: 'setHeir', characterId: 'c50' });
    const xpWith = monthlyXp(s, content, s.disciples[0]!, false).parts.join();
    expect(xpWith).toContain('親傳弟子');
    s = edit(s, (x) => {
      x.protagonist.ageMonths = 100 * 12 - 1;
    });
    const lingshi = s.resources.lingshi;
    s = advance(s);
    expect(s.protagonist.id).toBe('c50');
    expect(s.protagonist.role).toBe('protagonist');
    expect(s.disciples.map((d) => d.id)).toEqual(['c51']);
    expect(s.ancestors?.map((a) => a.name)).toEqual(['林長風']);
    expect(s.events.some((e) => e.kind === 'succession')).toBe(false);
    expect(s.resources.lingshi).toBeGreaterThan(lingshi - 100);
    // 繼續玩不出錯
    s = advance(s, 6);
    expect(s.protagonist.id).toBe('c50');
  });

  it('沒有指定繼承人時，由境界最高者暫代，並跳出繼承事件可以改立', () => {
    let s = edit(second(developed()), (x) => {
      x.protagonist.ageMonths = 100 * 12 - 1;
    });
    const loyalty = s.disciples.find((d) => d.id === 'c51')!.loyalty;
    s = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(s.protagonist.id).toBe('c51'); // 築基的韓立暫代
    const ev = s.events.find((e) => e.kind === 'succession');
    expect(ev?.blocking).toBe(true);
    expect(ev?.successors).toEqual(['c51', 'c50']);
    expect(tryRun(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) }).ok).toBe(false);
    s = run(s, { type: 'resolveSuccession', eventId: ev!.id, characterId: 'c50' });
    expect(s.protagonist.id).toBe('c50');
    expect(s.disciples.map((d) => d.id)).toEqual(['c51']);
    expect(s.disciples[0]?.role).toBe('inner');
    expect(s.disciples[0]?.loyalty).toBe(loyalty);
    expect(s.reports[0]?.lines.some((l) => l.startsWith('→ 葉若雪接任掌門'))).toBe(true);
    expect(s.events.some((e) => e.kind === 'succession')).toBe(false);
    s = advance(s, 3);
  });

  it('沒有內門弟子時由外門推舉一人接任', () => {
    let s = edit(developed(), (x) => {
      x.disciples = [];
      x.protagonist.ageMonths = 100 * 12 - 1;
      x.nextRecruitMonth = 999;
    });
    const outer = s.outer.count;
    s = advance(s);
    expect(s.outer.count).toBe(outer - 1);
    expect(s.reports[0]?.lines.some((l) => l.includes('牌位暫供於大殿'))).toBe(true);
    expect(s.protagonist.name).not.toBe('林長風');
    expect(s.protagonist.role).toBe('protagonist');
    expect(s.ancestors).toHaveLength(1);
  });
});

describe('祖師殿', () => {
  it('全宗修煉 +3%，每位已故掌門 +3%，最多 +15%', () => {
    let s = edit(developed(), (x) => {
      x.buildings.push({ id: 'b200', defId: 'building.ancestral', region: 'region.main', level: 1, status: 'active', construction: null });
    });
    expect(monthlyXp(s, content, s.protagonist, false).parts).toContain('祖師殿 +3%');
    s = edit(s, (x) => {
      x.ancestors = Array.from({ length: 9 }, (_, i) => ({
        name: `祖${i}`,
        gender: 'male' as const,
        realm: { major: 'core' as const, stage: 1 },
        ageMonths: 4800,
        date: { year: 1, month: 1 },
      }));
    });
    expect(monthlyXp(s, content, s.protagonist, false).parts).toContain('祖師殿 +15%');
  });

  it('2 級祖師顯靈：突破失敗時免除懲罰，十年一次', () => {
    const base = edit(developed(), (x) => {
      x.buildings.push({ id: 'b200', defId: 'building.ancestral', region: 'region.main', level: 2, status: 'active', construction: null });
      const p = x.protagonist;
      p.realm = { major: 'qi', stage: 9 };
      p.xp = xpToNext(p.realm);
      x.resources.pill_foundation = 2;
    });
    const odds = { ...breakthroughOdds(base, content, base.protagonist), bp: 0 };
    const t = structuredClone(base);
    resolveBreakthrough(t, content, t.protagonist, odds, []);
    expect(t.protagonist.injuryMonths).toBe(0);
    expect(t.blessingReadyAt).toBe(monthIndex(t.date) + 120);
    const xp = t.protagonist.xp;
    resolveBreakthrough(t, content, t.protagonist, odds, []);
    expect(t.protagonist.injuryMonths).toBeGreaterThan(0);
    expect(t.protagonist.xp).toBeLessThan(xp);
  });
});

describe('連續推進的停止條件', () => {
  it('糧食快用完時要求停下，同一次短缺只停一次', () => {
    let s = edit(developed(), (x) => {
      x.resources.food = foodNeed(x) * 4;
      x.nextRecruitMonth = 999;
      x.buildings = x.buildings.filter((b) => b.defId !== 'building.field');
    });
    const kinds: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = tryRun(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
      if (!r.ok) throw new Error(r.error);
      kinds.push(!!r.report?.stops?.some((x) => x.kind === 'shortage' && x.text.includes('糧食')));
      s = r.state;
    }
    expect(kinds.filter(Boolean)).toHaveLength(1);
  });

  it('修為圓滿、可以突破時要求停下（只在剛達成的那個月）', () => {
    let s = edit(developed(), (x) => {
      x.protagonist.realm = { major: 'qi', stage: 9 };
      x.protagonist.xp = xpToNext(x.protagonist.realm) - 1;
    });
    const r = tryRun(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(r.ok && r.report?.stops?.some((x) => x.kind === 'breakthrough')).toBe(true);
    if (!r.ok) return;
    s = r.state;
    const r2 = tryRun(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(r2.ok && r2.report?.stops?.some((x) => x.kind === 'breakthrough')).toBeFalsy();
  });
});

describe('存檔', () => {
  const v5 = JSON.parse(readFileSync('tests/fixtures/save-v5-p1.json', 'utf8'));

  it('0.4.x 的存檔可以讀取並升級，之後推進一年不出錯', () => {
    const r = decode(v5);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(5);
    expect(r.state.version).toBe(STATE_VERSION);
    expect(r.state.resources.pill_life).toBe(0);
    expect(r.state.heirId).toBeNull();
    const s = advance(r.state, 12);
    expect(s.stats.monthsAdvanced).toBe(r.state.stats.monthsAdvanced + 12);
  });
});
