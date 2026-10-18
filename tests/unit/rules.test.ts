import { describe, expect, it } from 'vitest';
import { monthIndex } from '../../src/engine';
import { breakthroughOdds } from '../../src/engine/systems/cultivation/cultivation';
import { advance, content, developed, edit, fresh, run, tryRun } from './helpers';

describe('建築', () => {
  it('材料足夠才能開工，費用開工時付清', () => {
    const s = fresh();
    const after = run(s, { type: 'upgrade', buildingId: 'b1' });
    expect(after.resources.stone).toBe(s.resources.stone - 40);
    const poor = edit(fresh(), (x) => {
      x.resources.stone = 0;
    });
    expect(tryRun(poor, { type: 'upgrade', buildingId: 'b1' }).ok).toBe(false);
  });

  it('未修復大殿時不能建靈田', () => {
    expect(tryRun(fresh(), { type: 'build', defId: 'building.field', regionId: 'region.main' }).ok).toBe(false);
  });

  it('完工當月不運作，下月才產出', () => {
    let s = edit(fresh(), (x) => {
      const hall = x.buildings.find((b) => b.defId === 'building.hall');
      if (hall) {
        hall.level = 1;
        hall.status = 'active';
      }
    });
    s = run(s, { type: 'build', defId: 'building.quarry', regionId: 'region.main' }); // 1 個月
    s = run(s, { type: 'setOuterJobs', jobs: { field: 0, quarry: 0, lumber: 0, errand: 0 } });
    const stoneBefore = s.resources.stone;
    s = advance(s); // 完工
    expect(s.buildings.find((b) => b.defId === 'building.quarry')?.level).toBe(1);
    expect(s.resources.stone).toBe(stoneBefore);
    s = run(s, { type: 'setOuterJobs', jobs: { field: 0, quarry: 5, lumber: 0, errand: 0 } });
    const before = s.resources.stone;
    s = advance(s);
    expect(s.resources.stone).toBe(before + 10);
  });

  it('取消施工退還一半材料', () => {
    const s = run(fresh(), { type: 'upgrade', buildingId: 'b1' });
    const hall = s.buildings.find((b) => b.defId === 'building.hall');
    const after = run(s, { type: 'cancelConstruction', buildingId: hall?.id ?? '' });
    expect(after.resources.stone).toBe(s.resources.stone + 20);
    expect(after.buildings.find((b) => b.defId === 'building.hall')?.status).toBe('ruined');
  });
});

describe('人物不重複占用', () => {
  it('同一人不能掌兩座丹爐', () => {
    let s = edit(developed(), (x) => {
      const a = x.buildings.find((b) => b.defId === 'building.alchemy');
      if (a) a.level = 2;
    });
    s = run(s, { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true });
    expect(tryRun(s, { type: 'setFurnace', index: 1, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true }).ok).toBe(false);
  });

  it('閉關中的主角不能掌爐或出外探索', () => {
    let s = developed();
    s = run(s, { type: 'setSchedule', characterId: 'c0', schedule: 'seclusion', months: 3 });
    expect(tryRun(s, { type: 'setFurnace', index: 0, alchemistId: 'c0', recipeId: 'recipe.qi_pill', repeat: true }).ok).toBe(false);
    expect(
      tryRun(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0'], rows: { c0: 'front' } }).ok,
    ).toBe(false);
  });

  it('探索中的人物本月不能改做其他事，也不能重複探索', () => {
    let s = developed();
    s = run(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c50'], rows: { c50: 'front' } });
    expect(tryRun(s, { type: 'setSchedule', characterId: 'c50', schedule: 'cultivate' }).ok).toBe(false);
    expect(tryRun(s, { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true }).ok).toBe(false);
    s = run(s, { type: 'exploreRetreat' });
    s = run(s, { type: 'exploreClose' });
    expect(
      tryRun(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0'], rows: { c0: 'front' } }).ok,
    ).toBe(false);
  });

  it('掌爐者改排其他行程時自動離開丹爐', () => {
    let s = developed();
    s = run(s, { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true });
    s = run(s, { type: 'setSchedule', characterId: 'c50', schedule: 'heal' });
    expect(s.furnaces[0]?.alchemistId).toBeNull();
  });

  it('外門分工總數不能超過人數', () => {
    const s = developed();
    expect(tryRun(s, { type: 'setOuterJobs', jobs: { field: 6, quarry: 5, lumber: 5, errand: 5 } }).ok).toBe(false);
  });
});

describe('閉關', () => {
  it('閉關多月後自動出關，中斷代價事前可見', () => {
    let s = run(fresh(), { type: 'setSchedule', characterId: 'c0', schedule: 'seclusion', months: 2 });
    s = advance(s);
    expect(s.protagonist.seclusion?.streak).toBe(1);
    const r = tryRun(s, { type: 'interruptSeclusion' });
    expect(r.ok && r.message).toMatch(/\+10%/);
    s = advance(s);
    expect(s.protagonist.seclusion).toBeNull();
    expect(s.protagonist.schedule).toBe('cultivate');
  });
});

describe('築基突破', () => {
  function ready(seed: number) {
    return edit(developed(seed), (x) => {
      x.protagonist.realm = { major: 'qi', stage: 9 };
      x.protagonist.xp = 540;
      x.resources.pill_foundation = 1;
    });
  }

  it('條件不足時不能安排突破', () => {
    expect(tryRun(developed(), { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' }).ok).toBe(false);
  });

  it('顯示的成功率等於實際使用的成功率', () => {
    const odds = breakthroughOdds(ready(1), content, ready(1).protagonist);
    expect(odds.blocked).toBeUndefined();
    let success = 0;
    const trials = 1500;
    for (let i = 0; i < trials; i++) {
      let s = run(ready(i + 1000), { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' });
      s = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
      if (s.protagonist.realm.major === 'foundation') success++;
    }
    const rate = success / trials;
    expect(Math.abs(rate - odds.bp / 10000)).toBeLessThan(0.04);
  });

  it('突破失敗後受傷但可繼續遊玩', () => {
    for (let seed = 1; seed < 50; seed++) {
      let s = run(ready(seed), { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' });
      s = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
      if (s.protagonist.realm.major === 'qi') {
        expect(s.protagonist.injuryMonths).toBeGreaterThan(0);
        expect(s.resources.pill_foundation).toBe(0);
        s = advance(s, 6);
        expect(s.protagonist.injuryMonths).toBe(0);
        return;
      }
    }
    throw new Error('找不到失敗的種子');
  });
});

describe('招募與晉升', () => {
  it('從外門選拔內門，外門人數減少', () => {
    const s = developed();
    const after = run(s, { type: 'promoteOuter' });
    expect(after.disciples.length).toBe(s.disciples.length + 1);
    expect(after.outer.count).toBe(s.outer.count - 1);
  });

  it('招生事件可收一名候選人', () => {
    let s = run(fresh(), { type: 'upgrade', buildingId: 'b1' });
    s = advance(s, 2);
    const ev = s.events.find((e) => e.kind === 'recruitment');
    expect(ev).toBeTruthy();
    const cand = ev?.candidates?.find((c) => c.cost <= s.resources.lingshi);
    if (!ev || !cand) return;
    const after = run(s, { type: 'resolveRecruitment', eventId: ev.id, candidateId: cand.id });
    expect(after.disciples.map((d) => d.name)).toContain(cand.name);
    expect(after.events.length).toBe(0);
  });
});

describe('商隊交易', () => {
  it('每月收購有上限，買賣有價差', () => {
    let s = developed();
    s = run(s, { type: 'sell', resource: 'stone', amount: 400 });
    expect(tryRun(s, { type: 'sell', resource: 'stone', amount: 400 }).ok).toBe(false);
    s = advance(s);
    expect(s.trade.soldLingshi).toBe(0);
    // 1 靈石買 2 糧，4 糧才賣 1 靈石：買進再賣出一定虧
    const t = run(developed(), { type: 'buyFood', lingshi: 10 });
    const back = run(t, { type: 'sell', resource: 'food', amount: 20 });
    expect(back.resources.lingshi).toBeLessThan(developed().resources.lingshi);
  });
});
