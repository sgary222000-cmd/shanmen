import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { monthIndex, type GameState } from '../../src/engine';
import { sectPowerCap } from '../../src/engine/systems/world/sects';
import { playerPower, warThreatBp } from '../../src/engine/systems/world/war';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// 0.10.0：自動出征（試煉、派遣、護衛委託）、電腦宗門後期成長、凝嬰丹方降價。

/** 大殿 2 級、兩名內門（煉氣六層），十二月底（下個月是一月）。 */
function base(): GameState {
  return edit(developed(), (s) => {
    s.buildings.find((b) => b.defId === 'building.hall')!.level = 2;
    const d = s.disciples[0]!;
    d.realm = { major: 'qi', stage: 6 };
    s.disciples.push({ ...structuredClone(d), id: 'c51', name: '林青' });
    s.date = { year: 5, month: 12 };
    s.monthStart = { ...s.resources };
    s.nextRecruitMonth = 99999;
    s.commissions = [];
  });
}

const auto = (s: GameState) => s.reports[0]?.lines.filter((l) => l.startsWith('自動出征')) ?? [];

describe('自動出征', () => {
  it('名單只收內門弟子、最多 3 人', () => {
    expect(tryRun(base(), { type: 'setAuto', kind: 'trial', config: { ids: ['c0'], tier: 'easy' } }).ok).toBe(false);
    const s = run(base(), { type: 'setAuto', kind: 'trial', config: { ids: ['c50', 'c51', 'c50', 'c0'], tier: 'easy' } });
    expect(s.auto?.trial?.ids).toEqual(['c50', 'c51']);
    expect(run(s, { type: 'setAuto', kind: 'trial', config: null }).auto?.trial).toBeUndefined();
  });

  it('宗門試煉每年一月自動舉辦；有其他行程的人略過', () => {
    let s = run(base(), { type: 'setAuto', kind: 'trial', config: { ids: ['c50', 'c51'], tier: 'easy' } });
    s = edit(s, (x) => {
      x.disciples[1]!.schedule = 'alchemy';
    });
    s = advance(s); // 十二月 → 一月：還沒到
    expect(auto(s)).toHaveLength(0);
    s = advance(s); // 一月結算
    expect(auto(s)[0]).toContain('宗門試煉');
    expect(s.trials.c50).toBe(s.date.year);
    expect(s.trials.c51).toBeUndefined();
    s = advance(s);
    expect(auto(s)).toHaveLength(0);
  });

  it('秘境派遣：小隊不在外面時自動再派', () => {
    let s = edit(base(), (x) => {
      x.realmClears['secret.abandoned_cave'] = 1;
    });
    s = run(s, { type: 'setAuto', kind: 'dispatch', config: { ids: ['c50', 'c51'], realmId: 'secret.abandoned_cave' } });
    let sent = 0;
    for (let i = 0; i < 4; i++) {
      s = advance(s);
      sent += auto(s).filter((l) => l.includes('派出 2 人前往荒廢洞府')).length;
    }
    expect(sent).toBeGreaterThanOrEqual(2);
  });

  it('護衛委託：勝率達到設定才接', () => {
    const job = {
      id: 'cm1',
      templateId: 'commission.test',
      title: '護送藥商',
      text: '',
      kind: 'escort' as const,
      enemies: ['enemy.wild_wolf'],
      maxTeam: 3,
      reward: { lingshi: 30 },
      reputation: 2,
      guard: true,
      expires: 0,
    };
    const withJob = (minOdds: number) =>
      run(
        edit(base(), (x) => {
          x.commissions = [{ ...job, expires: monthIndex(x.date) + 2 }];
          for (const d of x.disciples) d.realm = { major: 'foundation', stage: 2 };
        }),
        { type: 'setAuto', kind: 'escort', config: { ids: ['c50', 'c51'], minOdds } },
      );
    const s = advance(withJob(70));
    expect(auto(s).some((l) => l.includes('護送藥商'))).toBe(true);
    expect(s.resources.lingshi).toBeGreaterThan(0);
  });
});

describe('數值調整', () => {
  it('凝嬰丹方 800 靈石', () => {
    expect(content.recipes.get('recipe.nascent_pill')?.marketPrice).toBe(800);
  });

  it('電腦宗門實力過了 210 繼續成長，最多 400', () => {
    const s = developed();
    const q = s.sects.find((x) => x.id === 'sect.qingmu')!;
    const at = (year: number) => sectPowerCap(edit(s, (x) => (x.date = { year, month: 1 })), content, q);
    expect(at(80)).toBeLessThanOrEqual(212);
    expect(at(150)).toBeGreaterThan(300);
    expect(at(150) - at(100)).toBe(balance.sects.powerPerYear * 50);
    expect(at(2000)).toBe(balance.sects.lateMaxPower);
  });

  it('第 80 年起，好戰的鄰宗實力有我宗一半就可能宣戰（爭雄）', () => {
    const at = (year: number) =>
      edit(developed(), (s) => {
        s.date = { year, month: 1 };
        const c = s.sects.find((x) => x.id === 'sect.chixia')!;
        Object.assign(c, { favor: 30, treaty: undefined, vassal: false, truceUntil: undefined });
        c.power = Math.ceil((playerPower(s, content) * balance.war.rivalPowerPct) / 100);
      });
    const bp = (s: GameState) => warThreatBp(s, content, s.sects.find((x) => x.id === 'sect.chixia')!);
    expect(bp(at(60))).toBe(0);
    expect(bp(at(100))).toBe(balance.war.rivalBp);
    expect(bp(edit(at(100), (s) => (s.sects.find((x) => x.id === 'sect.chixia')!.favor = 60)))).toBe(0);
  });
});
