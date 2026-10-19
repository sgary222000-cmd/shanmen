import { describe, expect, it } from 'vitest';
import { monthIndex, planMonth } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { advance, content, developed, edit, fresh, roomy, run, tryRun } from './helpers';

describe('月份結算', () => {
  it('一次推進只前進一個月', () => {
    const s = advance(fresh());
    expect(s.date).toEqual({ year: 1, month: 2 });
    expect(s.stats.monthsAdvanced).toBe(1);
    const s12 = advance(fresh(), 12);
    expect(s12.date).toEqual({ year: 2, month: 1 });
  });

  it('同一個月不能結算兩次（例如連點兩次）', () => {
    const s0 = fresh();
    const expectMonth = monthIndex(s0.date);
    const s1 = run(s0, { type: 'advanceMonth', expectMonth });
    const again = tryRun(s1, { type: 'advanceMonth', expectMonth });
    expect(again.ok).toBe(false);
    expect(s1.date).toEqual({ year: 1, month: 2 });
  });

  it('原狀態不會被指令修改', () => {
    const s0 = fresh();
    const snapshot = JSON.stringify(s0);
    run(s0, { type: 'advanceMonth', expectMonth: 0 });
    run(s0, { type: 'upgrade', buildingId: 'b1' });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('有待處理事件時不能推進', () => {
    let s = fresh();
    s = run(s, { type: 'upgrade', buildingId: 'b1' });
    s = run(s, { type: 'advanceMonth', expectMonth: 0 });
    s = run(s, { type: 'advanceMonth', expectMonth: 1 }); // 大殿完工、觸發招生
    expect(s.events.some((e) => e.kind === 'recruitment')).toBe(true);
    const r = tryRun(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(r.ok).toBe(false);
  });

  it('預覽與實際結算的確定部分一致', () => {
    let s = roomy(developed());
    s = run(s, { type: 'setOuterJobs', jobs: { field: 4, quarry: 3, lumber: 3, errand: 2 } });
    const plan = planMonth(s, content);
    const after = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    for (const id of RESOURCE_IDS) {
      const expected = s.resources[id] - (plan.consumption[id] ?? 0) + (plan.production[id] ?? 0);
      expect(after.resources[id], id).toBe(expected);
    }
  });

  it('本月產出不能當月使用：沒有存糧時，即使靈田收成也會缺糧', () => {
    let s = developed();
    s = edit(s, (x) => {
      x.resources.food = 0;
    });
    s = run(s, { type: 'setOuterJobs', jobs: { field: 6, quarry: 0, lumber: 0, errand: 0 } });
    const plan = planMonth(s, content);
    expect(plan.production.food).toBeGreaterThan(0);
    expect(plan.foodShortfall).toBe(plan.foodNeed);
    const after = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(after.outer.hungerMonths).toBe(1);
    expect(after.resources.food).toBe(plan.production.food);
  });

  it('維護費不足時建築停用，資源不會變成負數', () => {
    let s = developed();
    s = edit(s, (x) => {
      x.resources.lingshi = 3;
    });
    const after = advance(s);
    expect(after.resources.lingshi).toBeGreaterThanOrEqual(0);
    expect(after.buildings.some((b) => b.status === 'disabled')).toBe(true);
  });
});
