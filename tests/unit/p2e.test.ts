import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { monthIndex, STATE_VERSION, type GameState } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { seedState } from '../../src/engine/rng';
import { xpToNext } from '../../src/engine/systems/characters/characters';
import { storageCap } from '../../src/engine/systems/economy/storage';
import { nodeView, realmLocked } from '../../src/engine/systems/exploration/exploration';
import { trialBlocked, trialOdds } from '../../src/engine/systems/exploration/trial';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, roomy, run, tryRun } from './helpers';

// P2 批次 E：倉庫與存放上限、太虛古境（多層、事件池、一次性機緣）、宗門試煉、附屬期滿、v9 → v10 存檔升級。

const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));
const sect = (s: GameState, id: string) => s.sects.find((x) => x.id === id)!;

/** 掌門化神圓滿、功法圓滿，帶足回春丹，可以挑戰太虛古境。 */
function strong(): GameState {
  return edit(developed(), (x) => {
    x.buildings.find((b) => b.defId === 'building.hall')!.level = 4;
    x.resources.lingshi = 5000;
    x.resources.pill_heal = 10;
    x.nextRecruitMonth = 99999;
    const p = x.protagonist;
    p.realm = { major: 'deity', stage: 4 };
    p.insight = 400;
    p.ageMonths = 100 * 12;
    p.equipment = 'equip.common';
  });
}

const enter = (s: GameState, realmId: string) => run(s, { type: 'startExploration', realmId, teamIds: ['c0'], rows: { c0: 'front' } });

describe('倉庫', () => {
  it('沒有倉庫時糧食 1,000、材料 500；倉庫每級提高上限，靈石與丹藥不受限', () => {
    const s = developed();
    expect(storageCap(s, content, 'food')).toBe(balance.storage.baseFood);
    expect(storageCap(s, content, 'stone')).toBe(balance.storage.base);
    expect(storageCap(s, content, 'lingshi')).toBeNull();
    expect(storageCap(s, content, 'pill_qi')).toBeNull();
    const w = edit(s, (x) => {
      x.buildings.push({ id: 'b300', defId: 'building.warehouse', region: 'region.main', level: 2, status: 'active', construction: null });
    });
    expect(storageCap(w, content, 'stone')).toBe(balance.storage.base + 1500);
    expect(storageCap(w, content, 'food')).toBe(balance.storage.baseFood + 3000);
  });

  it('月底超出上限的新進貨損耗並寫進月報；原本超過上限的庫存不會被扣', () => {
    const s = edit(developed(), (x) => {
      x.resources.stone = 499;
      x.resources.wood = 900;
      x.monthStart = { ...x.resources };
      x.outer.jobs = { field: 4, quarry: 4, lumber: 4, garden: 0, mine: 0, errand: 0 };
    });
    const after = advance(s);
    expect(after.resources.stone).toBe(balance.storage.base);
    expect(after.resources.wood).toBe(900);
    expect(after.reports[0]?.lines.some((l) => l.startsWith('倉庫放不下'))).toBe(true);
    expect(nonNegative(after)).toBe(true);
  });

  it('坊市買不進倉庫放不下的量', () => {
    const s = edit(developed(), (x) => {
      x.buildings.push({ id: 'b301', defId: 'building.market', region: 'region.main', level: 1, status: 'active', construction: null });
      x.resources.stone = 490;
    });
    const r = tryRun(s, { type: 'marketBuy', resource: 'stone', lots: 1 });
    expect(r.ok).toBe(false);
    expect(tryRun(roomy(s), { type: 'marketBuy', resource: 'stone', lots: 1 }).ok).toBe(true);
  });
});

describe('太虛古境', () => {
  it('五層依序開放：要先通關上一層', () => {
    const s = strong();
    expect(realmLocked(s, content, content.secretRealms.get('secret.taixu_1')!)).toBeUndefined();
    expect(realmLocked(s, content, content.secretRealms.get('secret.taixu_2')!)).toContain('石林');
    expect(tryRun(s, { type: 'startExploration', realmId: 'secret.taixu_2', teamIds: ['c0'], rows: { c0: 'front' } }).ok).toBe(false);
    const cleared = edit(s, (x) => {
      x.realmClears['secret.taixu_1'] = 1;
    });
    expect(tryRun(cleared, { type: 'startExploration', realmId: 'secret.taixu_2', teamIds: ['c0'], rows: { c0: 'front' } }).ok).toBe(true);
  });

  it('岔路從事件池抽事件，每次可能不同；首次通關第一層得到凝嬰丹', () => {
    const seen = new Set<string>();
    let cleared: GameState | undefined;
    for (let i = 0; i < 20; i++) {
      let s = edit(strong(), (x) => {
        x.rng.combat = seedState(300 + i);
      });
      s = enter(s, 'secret.taixu_1');
      s = run(s, { type: 'exploreMove', nodeId: 'guards' });
      s = run(s, { type: 'exploreMove', nodeId: 'fork' });
      s = run(s, { type: 'exploreMove', nodeId: 'left' });
      const ex = s.exploration!;
      const realm = content.secretRealms.get(ex.realmId)!;
      const id = ex.events?.left;
      expect(id).toBeDefined();
      seen.add(id!);
      const view = nodeView(realm, ex, realm.nodes.find((n) => n.id === 'left')!);
      expect(view.choices?.length).toBeGreaterThan(0);
      if (!cleared) {
        s = run(s, { type: 'exploreChoice', choiceId: view.choices![view.choices!.length - 1]!.id });
        for (const n of ['deep', 'boss', 'exit']) s = run(s, { type: 'exploreMove', nodeId: n });
        if (s.exploration?.status === 'completed') cleared = s;
      }
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(cleared).toBeDefined();
    const after = advance(run(cleared!, { type: 'exploreClose' }));
    expect(after.resources.pill_nascent).toBe(1);
    expect(after.realmClears['secret.taixu_1']).toBe(1);
  });

  it('一次性機緣只領一次：撤退也不會失去，之後不再抽到', () => {
    let s = enter(strong(), 'secret.taixu_1');
    s = run(s, { type: 'exploreMove', nodeId: 'guards' });
    s = run(s, { type: 'exploreMove', nodeId: 'fork' });
    s = run(s, { type: 'exploreMove', nodeId: 'left' });
    s = edit(s, (x) => {
      x.exploration!.events!.left = 'spring';
    });
    s = run(s, { type: 'exploreChoice', choiceId: 'bottle' });
    expect(s.claimedRewards).toContain('taixu.spring');
    s = run(s, { type: 'exploreRetreat' });
    expect(s.pendingLoot.pill_life).toBe(1);
    const base = advance(run(s, { type: 'exploreClose' }));
    expect(base.resources.pill_life).toBe(1);
    for (let i = 0; i < 30; i++) {
      let t = edit(base, (x) => {
        x.rng.combat = seedState(900 + i);
        x.protagonist.injuryMonths = 0;
        x.protagonist.health = 100;
      });
      t = enter(t, 'secret.taixu_1');
      t = run(t, { type: 'exploreMove', nodeId: 'guards' });
      if (t.exploration?.status !== 'active') continue;
      t = run(t, { type: 'exploreMove', nodeId: 'fork' });
      t = run(t, { type: 'exploreMove', nodeId: 'right' });
      expect(t.exploration?.events?.right).not.toBe('spring');
    }
  });
});

describe('宗門試煉', () => {
  const trialState = () =>
    edit(developed(), (x) => {
      x.buildings.find((b) => b.defId === 'building.hall')!.level = 2;
      x.disciples[0]!.realm = { major: 'qi', stage: 6 };
      x.disciples[0]!.xp = 0;
    });

  it('大殿 2 級起；掌門不參加；每人每年一次', () => {
    const d = trialState().disciples[0]!.id;
    const low = edit(trialState(), (x) => {
      x.buildings.find((b) => b.defId === 'building.hall')!.level = 1;
    });
    expect(trialBlocked(low, [d])).toContain('大殿');
    expect(trialBlocked(trialState(), ['c0'])).toContain('弟子');
    const s = run(trialState(), { type: 'runTrial', teamIds: [d], tier: 'easy' });
    expect(trialBlocked(s, [d])).toContain('今年');
    expect(s.trials[d]).toBe(s.date.year);
  });

  it('通過給修為與領悟；失敗不受傷，只是生命降到一半', () => {
    const s0 = trialState();
    const d = s0.disciples[0]!;
    expect(trialOdds(s0, content, [d.id], 'easy')).toBeGreaterThanOrEqual(90);
    const win = run(s0, { type: 'runTrial', teamIds: [d.id], tier: 'easy' });
    const w = win.disciples[0]!;
    expect(w.xp).toBe(Math.floor((xpToNext(d.realm) * balance.trial.tiers[0]!.xpPct) / 100));
    expect(w.insight).toBe(d.insight + balance.trial.tiers[0]!.insight);
    expect(win.resources.lingshi).toBe(s0.resources.lingshi - balance.trial.lingshiPer);
    expect(trialOdds(s0, content, [d.id], 'hard')).toBeLessThanOrEqual(10);
    const lose = run(s0, { type: 'runTrial', teamIds: [d.id], tier: 'hard' });
    const l = lose.disciples[0]!;
    if (lose.battles[0]?.result !== 'win') {
      expect(l.injuryMonths).toBe(0);
      expect(l.health).toBeLessThanOrEqual(balance.trial.loseHealth);
      expect(l.insight).toBe(d.insight);
    }
    expect(lose.monthLog?.some((x) => x.includes('宗門試煉'))).toBe(true);
  });
});

describe('附屬期滿', () => {
  it(`收為附屬 ${balance.war.vassalYears} 年後恢復自立，之後停戰`, () => {
    const s = edit(strong(), (x) => {
      const q = sect(x, 'sect.qingmu');
      q.vassal = true;
      q.vassalUntil = monthIndex(x.date) + 1;
      q.favor = 70;
    });
    const after = advance(s, 2);
    const q = sect(after, 'sect.qingmu');
    expect(q.vassal).toBe(false);
    expect(q.favor).toBe(balance.war.vassalEndFavor);
    expect(q.truceUntil).toBeGreaterThan(monthIndex(after.date));
    expect(after.reports.some((r) => r.lines.some((l) => l.includes('期滿，恢復自立')))).toBe(true);
  });
});

describe('存檔', () => {
  it('0.8.x 的存檔可以讀取並升級：已有的附屬從現在起算 30 年，之後推進一年不出錯', () => {
    const v9 = JSON.parse(readFileSync('tests/fixtures/save-v9-p2d.json', 'utf8'));
    const r = decode(v9);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(9);
    expect(r.state.version).toBe(STATE_VERSION);
    expect(r.state.trials).toEqual({});
    const vassals = r.state.sects.filter((x) => x.vassal);
    expect(vassals.length).toBeGreaterThan(0);
    for (const v of vassals) expect(v.vassalUntil).toBe(monthIndex(r.state.date) + balance.war.vassalYears * 12);
    const s = advance(r.state, 12);
    expect(nonNegative(s)).toBe(true);
  });
});
