import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { STATE_VERSION, type GameState } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { seedState } from '../../src/engine/rng';
import { innerLimit, qiCapacity, upgradeOption } from '../../src/engine/systems/buildings/buildings';
import { lifespanMonths } from '../../src/engine/systems/characters/lifespan';
import { powerLevel, realmName, xpToNext } from '../../src/engine/systems/characters/characters';
import { breakthroughOdds, resolveBreakthrough } from '../../src/engine/systems/cultivation/cultivation';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// P2 批次 B：元嬰、化神、大殿 4–5 級、聚靈陣／洞府／藏經閣 3 級、凝嬰丹與化神丹、化神失敗的死亡風險、v6 → v7 存檔升級。

const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));

const place = (s: GameState, defId: string, region: string, level = 1) =>
  edit(s, (x) => {
    x.buildings.push({ id: `b${x.nextId++}`, defId, region, level, status: 'active', construction: null });
  });

/** 主角金丹圓滿（或元嬰圓滿）、修為滿、功法圓滿，後山聚靈陣 3 級加洞府 3 級，手上有凝嬰丹與化神丹。 */
function lateReady(major: 'core' | 'nascent' = 'core'): GameState {
  let s = edit(developed(), (x) => {
    for (const id of Object.keys(x.regions)) x.regions[id] = { status: 'open', construction: null };
    const hall = x.buildings.find((b) => b.defId === 'building.hall');
    if (hall) hall.level = 4;
  });
  s = place(s, 'building.array', 'region.back', 3);
  s = place(s, 'building.cave_abode', 'region.back', 3);
  return edit(s, (x) => {
    const p = x.protagonist;
    p.realm = { major, stage: 4 };
    p.xp = xpToNext(p.realm);
    p.insight = 400;
    p.seat = 'region.back';
    p.ageMonths = 150 * 12;
    x.resources.pill_nascent = 2;
    x.resources.pill_deity = 2;
  });
}

describe('境界', () => {
  it('元嬰、化神各分前期到圓滿，名稱、修為門檻、戰力、壽元都往上', () => {
    expect(realmName({ major: 'nascent', stage: 1 })).toBe('元嬰前期');
    expect(realmName({ major: 'deity', stage: 4 })).toBe('化神圓滿');
    expect(xpToNext({ major: 'nascent', stage: 1 })).toBe(balance.nascentXpPerStage);
    expect(xpToNext({ major: 'deity', stage: 1 })).toBeGreaterThan(xpToNext({ major: 'nascent', stage: 4 }));
    expect(powerLevel({ major: 'nascent', stage: 1 })).toBeGreaterThan(powerLevel({ major: 'core', stage: 4 }));
    expect(powerLevel({ major: 'deity', stage: 1 })).toBeGreaterThan(powerLevel({ major: 'nascent', stage: 4 }));
    const p = developed().protagonist;
    expect(lifespanMonths({ ...p, realm: { major: 'nascent', stage: 1 } })).toBe(800 * 12);
    expect(lifespanMonths({ ...p, realm: { major: 'deity', stage: 1 } })).toBe(1500 * 12);
  });
});

describe('大殿 4–5 級與 3 級建築', () => {
  it('大殿 3 級可以升 4 級，內門上限 14；4 級後聚靈陣、洞府、藏經閣才能升 3 級', () => {
    let s = edit(developed(), (x) => {
      const hall = x.buildings.find((b) => b.defId === 'building.hall');
      if (hall) hall.level = 3;
      x.resources.lingshi = 9000;
    });
    s = place(s, 'building.library', 'region.main', 2);
    const array = edit(s, (x) => {
      const a = x.buildings.find((b) => b.defId === 'building.array');
      if (a) a.level = 2;
    });
    const arr = array.buildings.find((b) => b.defId === 'building.array')!;
    expect(upgradeOption(array, content, arr).blocked).toContain('大殿');
    const hall = s.buildings.find((b) => b.defId === 'building.hall')!;
    expect(upgradeOption(s, content, hall).next?.level).toBe(4);
    const four = edit(array, (x) => {
      x.buildings.find((b) => b.defId === 'building.hall')!.level = 4;
    });
    expect(innerLimit(four, content)).toBe(14);
    expect(upgradeOption(four, content, four.buildings.find((b) => b.defId === 'building.array')!).blocked).toBeUndefined();
    expect(upgradeOption(four, content, four.buildings.find((b) => b.defId === 'building.library')!).next?.level).toBe(3);
  });

  it('後山聚靈陣 3 級加洞府 3 級，靈氣容量達到凝嬰要求的 70', () => {
    const s = lateReady();
    expect(qiCapacity(s, content, 'region.back')).toBeGreaterThanOrEqual(balance.nascentBreakthrough.requiredQiCapacity);
  });
});

describe('凝嬰', () => {
  it('條件不足時說明原因：功法大成、靈氣容量、凝嬰丹', () => {
    const ready = lateReady();
    const odds = breakthroughOdds(ready, content, ready.protagonist);
    expect(odds.target).toBe('nascent');
    expect(odds.blocked).toBeUndefined();
    expect(odds.deathBp).toBe(0);
    expect(odds.failure).toContain('不會死亡');
    expect(odds.factors.some((f) => f.includes('聚靈陣 3 級'))).toBe(true);
    expect(odds.factors.some((f) => f.includes('洞府'))).toBe(true);
    const noInsight = edit(ready, (x) => {
      x.protagonist.insight = 200;
    });
    expect(breakthroughOdds(noInsight, content, noInsight.protagonist).blocked).toContain('大成');
    const mainSeat = edit(ready, (x) => {
      x.protagonist.seat = 'region.main';
    });
    expect(breakthroughOdds(mainSeat, content, mainSeat.protagonist).blocked).toContain('靈氣容量');
    const noPill = edit(ready, (x) => {
      x.resources.pill_nascent = 0;
    });
    expect(breakthroughOdds(noPill, content, noPill.protagonist).blocked).toContain('凝嬰丹');
  });

  it('預覽的成功率與 1500 次實際結果相差不到 4 個百分點，失敗不會死', () => {
    const s = lateReady();
    const odds = breakthroughOdds(s, content, s.protagonist);
    let wins = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const t = edit(s, (x) => {
        x.rng.cultivation = seedState(2000 + i);
      });
      expect(resolveBreakthrough(t, content, t.protagonist, odds, [])).toBe(false);
      if (t.protagonist.realm.major === 'nascent') wins++;
    }
    expect(Math.abs((wins / N) * 10000 - odds.bp)).toBeLessThan(400);
  });

  it('經過月結算扣一顆凝嬰丹，成功時成為元嬰前期、壽元變成 800 歲', () => {
    let s = lateReady();
    s = run(s, { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' });
    s = advance(s);
    expect(s.resources.pill_nascent).toBe(1);
    const p = s.protagonist;
    if (p.realm.major === 'nascent') {
      expect(p.realm.stage).toBe(1);
      expect(lifespanMonths(p)).toBe(800 * 12);
    } else expect(p.injuryMonths).toBeGreaterThan(0);
    expect(nonNegative(s)).toBe(true);
  });
});

describe('化神', () => {
  it('突破前明示死亡機率', () => {
    const s = lateReady('nascent');
    const odds = breakthroughOdds(s, content, s.protagonist);
    expect(odds.target).toBe('deity');
    expect(odds.blocked).toBeUndefined();
    expect(odds.deathBp).toBe(balance.deityBreakthrough.failDeathBp);
    expect(odds.failure).toContain(`${balance.deityBreakthrough.failDeathBp / 100}% 會身死道消`);
  });

  it('化神失敗可能身死道消，祖師顯靈可以保命', () => {
    const s = lateReady('nascent');
    const doom = { ...breakthroughOdds(s, content, s.protagonist), bp: 0, deathBp: 10000 };
    const t = structuredClone(s);
    expect(resolveBreakthrough(t, content, t.protagonist, doom, [])).toBe(true);
    const blessed = place(s, 'building.ancestral', 'region.main', 2);
    const u = structuredClone(blessed);
    expect(resolveBreakthrough(u, content, u.protagonist, doom, [])).toBe(false);
    expect(u.protagonist.injuryMonths).toBe(0);
  });

  it('掌門化神隕落時由親傳弟子接任，月報寫明原因', () => {
    let fell: GameState | undefined;
    for (let seed = 1; seed <= 200 && !fell; seed++) {
      let s = run(lateReady('nascent'), { type: 'setHeir', characterId: 'c50' });
      s = edit(s, (x) => {
        x.rng.cultivation = seedState(seed);
      });
      s = run(s, { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' });
      const after = advance(s);
      if (after.protagonist.id !== 'c0') fell = after;
    }
    expect(fell).toBeDefined();
    if (!fell) return;
    expect(fell.protagonist.id).toBe('c50');
    expect(fell.ancestors?.[0]?.realm.major).toBe('nascent');
    expect(fell.reports[0]?.lines.some((l) => l.includes('衝擊化神失敗') && l.includes('隕落'))).toBe(true);
    expect(fell.reports[0]?.stops?.some((x) => x.kind === 'death')).toBe(true);
    expect(nonNegative(advance(fell, 3))).toBe(true);
  });

  it('化神圓滿是目前的頂點', () => {
    const s = edit(lateReady('nascent'), (x) => {
      x.protagonist.realm = { major: 'deity', stage: 4 };
      x.protagonist.xp = xpToNext(x.protagonist.realm);
    });
    expect(breakthroughOdds(s, content, s.protagonist).blocked).toContain('頂點');
    expect(tryRun(s, { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' }).ok).toBe(false);
  });
});

describe('存檔', () => {
  it('0.5.x 的存檔可以讀取並升級，之後推進一年不出錯', () => {
    const v6 = JSON.parse(readFileSync('tests/fixtures/save-v6-p2a.json', 'utf8'));
    const r = decode(v6);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(6);
    expect(r.state.version).toBe(STATE_VERSION);
    expect(r.state.resources.pill_nascent).toBe(0);
    expect(r.state.resources.pill_deity).toBe(0);
    const s = advance(r.state, 12);
    expect(nonNegative(s)).toBe(true);
  });
});
