import { describe, expect, it } from 'vitest';
import { planMonth } from '../../src/engine';
import { balance } from '../../src/content/balance';
import { commissionBlocked } from '../../src/engine/systems/commissions/commissions';
import { advance, content, developed, edit, run } from './helpers';

// P1 收尾：掌爐人外出一個月後回到工坊，受傷才離開並寫進月報
describe('P1 收尾', () => {
  const withKeeper = () => run(developed(), { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true });

  it('掌爐人出外一個月：本月停工，月底回到丹爐', () => {
    let s = edit(withKeeper(), (x) => {
      x.disciples.find((c) => c.id === 'c50')!.schedule = 'explore';
    });
    const plan = planMonth(s, content).furnaces[0];
    expect(plan?.runs).toBe(false);
    expect(plan?.reason).toContain('外出');
    s = advance(s, 1);
    expect(s.furnaces[0]?.alchemistId).toBe('c50');
    expect(s.disciples.find((c) => c.id === 'c50')?.schedule).toBe('alchemy');
  });

  it('掌爐人外出受傷：離開丹爐並寫進月報', () => {
    let s = edit(withKeeper(), (x) => {
      const c = x.disciples.find((d) => d.id === 'c50')!;
      c.schedule = 'explore';
      c.injuryMonths = 2;
    });
    s = advance(s, 1);
    expect(s.furnaces[0]?.alchemistId).toBeNull();
    expect(s.reports[0]?.lines.join('')).toContain('離開煉丹房');
  });

  it('每月最多接 3 件委託，月底歸零；接委託的收入寫進月報與整月增減', () => {
    let s = edit(developed(), (x) => {
      x.commissionsTaken = balance.commissions.maxPerMonth;
    });
    const c = s.commissions[0]!;
    expect(commissionBlocked(s, c)).toContain('本月已接');
    s = edit(s, (x) => {
      x.commissionsTaken = 0;
      x.monthStart = { ...x.resources };
    });
    const labor = s.commissions.find((x) => x.kind === 'labor')!;
    const before = s.resources.lingshi;
    s = run(s, { type: 'acceptCommission', commissionId: labor.id, workers: 1 });
    expect(s.commissionsTaken).toBe(1);
    s = advance(s, 1);
    expect(s.commissionsTaken).toBe(0);
    expect(s.reports[0]?.lines[0]).toContain('本月事務');
    // 整月增減包含月中接委託的收入
    expect(s.reports[0]?.delta.lingshi ?? 0).toBe(s.resources.lingshi - before);
  });
});
