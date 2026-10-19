import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { innerLimit, outerCapacity, upgradeOption } from '../../src/engine/systems/buildings/buildings';
import { refreshBoard } from '../../src/engine/systems/commissions/commissions';
import { advance, content, developed, edit, run } from './helpers';

// P1 優化：大殿 3 級、弟子居所 3–4 級、護衛委託同時上榜數
describe('P1 優化', () => {
  it('大殿 3 級內門上限 10 人；弟子居所 4 級要大殿 3 級，外門上限 60 人', () => {
    let s = edit(developed(), (x) => {
      const dorm = x.buildings.find((b) => b.defId === 'building.dorm');
      if (dorm) dorm.level = 2;
    });
    const dormId = s.buildings.find((b) => b.defId === 'building.dorm')!.id;
    const hallId = s.buildings.find((b) => b.defId === 'building.hall')!.id;
    s = run(s, { type: 'upgrade', buildingId: dormId });
    s = advance(s, 2);
    expect(outerCapacity(s, content)).toBe(40);
    expect(upgradeOption(s, content, s.buildings.find((b) => b.id === dormId)!).blocked).toBe('需要大殿 3 級');
    s = run(s, { type: 'upgrade', buildingId: hallId });
    s = advance(s, 4);
    expect(innerLimit(s, content)).toBe(10);
    s = run(s, { type: 'upgrade', buildingId: dormId });
    s = advance(s, 3);
    expect(outerCapacity(s, content)).toBe(60);
    expect(upgradeOption(s, content, s.buildings.find((b) => b.id === hallId)!).blocked).toBe('已達本階段最高等級');
  });

  it('委託榜同時最多 2 件護衛委託', () => {
    let s = developed(7);
    for (let i = 0; i < 200; i++) {
      s = edit(s, (x) => {
        x.commissions = x.commissions.filter((c) => c.kind !== 'labor');
        x.date.month = (x.date.month % 12) + 1;
        refreshBoard(x, content);
      });
      expect(s.commissions.filter((c) => c.kind === 'escort').length).toBeLessThanOrEqual(balance.commissions.maxEscortOnBoard);
    }
  });
});
