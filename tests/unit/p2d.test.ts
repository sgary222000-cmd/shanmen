import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { monthIndex, STATE_VERSION, type GameState } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { seedState } from '../../src/engine/rng';
import { innerLimit, isOperating } from '../../src/engine/systems/buildings/buildings';
import { planMonth } from '../../src/engine/systems/economy/flows';
import { neighborSects } from '../../src/engine/systems/world/diplomacy';
import {
  annexBlocked,
  contestBlocked,
  declareBlocked,
  PLAYER,
  playerPower,
  tickWar,
  warOdds,
  warThreatBp,
} from '../../src/engine/systems/world/war';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// P2 批次 D：據點爭奪、宣戰與準備期、山門戰、護山大陣、戰死、附屬與吞併、損毀與修復、v8 → v9 存檔升級。

const W = balance.war;
const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));
const sect = (s: GameState, id: string) => s.sects.find((x) => x.id === id)!;

/** 前期保護已過、大殿 3 級；主角與兩名內門依 strong 決定強弱。 */
function wartime(strong: boolean, hall = 3): GameState {
  return edit(developed(), (x) => {
    x.date = { year: 40, month: 1 };
    x.buildings.find((b) => b.defId === 'building.hall')!.level = hall;
    x.resources.lingshi = 5000;
    x.nextRecruitMonth = 99999;
    const p = x.protagonist;
    p.realm = strong ? { major: 'deity', stage: 4 } : { major: 'qi', stage: 1 };
    p.ageMonths = 40 * 12;
    const d = x.disciples[0]!;
    d.realm = strong ? { major: 'nascent', stage: 4 } : { major: 'qi', stage: 1 };
    x.disciples.push({ ...structuredClone(d), id: 'c51', name: '沈清秋' }, { ...structuredClone(d), id: 'c52', name: '白朝陽' });
    for (const s of x.sects) s.power = Math.min(s.power, 150);
  });
}

describe('前期保護與實力', () => {
  it('第 30 年前不能宣戰、各宗也不會宣戰', () => {
    const s = edit(wartime(true), (x) => {
      x.date = { year: 10, month: 1 };
      sect(x, 'sect.chixia').favor = 0;
    });
    expect(declareBlocked(s, content, 'sect.chixia')).toContain('前期保護');
    expect(warThreatBp(s, content, sect(s, 'sect.chixia'))).toBe(0);
  });

  it('我宗實力隨最強三人的境界提高', () => {
    expect(playerPower(wartime(true), content)).toBeGreaterThan(playerPower(wartime(false), content));
  });
});

describe('據點爭奪', () => {
  it('無主據點花靈石佔下，每月收入算進產業預估', () => {
    let s = edit(wartime(true), (x) => {
      x.sites.find((y) => y.id === 'site.qingshi')!.owner = null;
    });
    const before = planMonth(s, content).production.lingshi ?? 0;
    s = run(s, { type: 'contestSite', siteId: 'site.qingshi' });
    expect(s.sites.find((y) => y.id === 'site.qingshi')?.owner).toBe(PLAYER);
    expect(planMonth(s, content).production.lingshi ?? 0).toBe(before + 15);
  });

  it('實力強時搶下鄰宗據點，對方好感與信任下降；同一處一年只能爭一次；有條約不能動手', () => {
    let s = wartime(true);
    const favor = sect(s, 'sect.chixia').favor;
    s = run(s, { type: 'contestSite', siteId: 'site.chitong' });
    expect(s.sites.find((y) => y.id === 'site.chitong')?.owner).toBe(PLAYER);
    expect(sect(s, 'sect.chixia').favor).toBe(favor - 15);
    const back = edit(s, (x) => {
      x.sites.find((y) => y.id === 'site.chitong')!.owner = 'sect.chixia';
    });
    expect(contestBlocked(back, content, 'site.chitong')).toContain('今年');
    const treaty = edit(wartime(true), (x) => {
      sect(x, 'sect.luoyun').treaty = { kind: 'peace', since: 0, until: 9999 };
    });
    expect(contestBlocked(treaty, content, 'site.lingquan')).toContain('條約');
  });

  it('實力弱時搶不下，出手的人受傷但不會死', () => {
    let s = edit(wartime(false), (x) => {
      sect(x, 'sect.chixia').power = 200;
    });
    s = run(s, { type: 'contestSite', siteId: 'site.chitong' });
    expect(s.sites.find((y) => y.id === 'site.chitong')?.owner).toBe('sect.chixia');
    expect(s.disciples).toHaveLength(3);
    expect([s.protagonist, ...s.disciples].some((c) => c.injuryMonths > 0)).toBe(true);
  });
});

describe('宣戰與山門戰', () => {
  it('我宗宣戰：扣軍費；沒有理由時聲望下降；3 個月後打山門戰，得勝後可割地賠款', () => {
    let s = edit(wartime(true), (x) => {
      x.reputation = 100;
      sect(x, 'sect.qingmu').favor = 50;
      sect(x, 'sect.qingmu').goal = 'build';
    });
    const lingshi = s.resources.lingshi;
    s = run(s, { type: 'declareWar', sectId: 'sect.qingmu' });
    expect(s.resources.lingshi).toBe(lingshi - W.declareLingshi);
    expect(s.reputation).toBe(100 - W.unjustReputation);
    expect(s.wars).toHaveLength(1);
    expect(warOdds(s, content, s.wars[0]!).winPct).toBeGreaterThan(50);
    s = advance(s, W.playerPrep);
    expect(s.wars).toHaveLength(0);
    const ev = s.events.find((e) => e.kind === 'victory');
    expect(ev).toBeDefined();
    expect(tryRun(s, { type: 'dismissEvent', eventId: ev!.id }).ok).toBe(false);
    const sites = s.sites.filter((y) => y.owner === 'sect.qingmu').length;
    s = run(s, { type: 'resolveVictory', eventId: ev!.id, choice: 'tribute' });
    expect(s.sites.filter((y) => y.owner === PLAYER).length).toBe(Math.min(sites, W.cedeSites));
    expect(sect(s, 'sect.qingmu').truceUntil).toBeGreaterThan(monthIndex(s.date));
    expect(declareBlocked(s, content, 'sect.qingmu')).toContain('停戰');
    expect(nonNegative(s)).toBe(true);
  });

  it('收為附屬：每月進貢；吞併要大殿 5 級、對方夠弱，之後從世界上消失並付整合費', () => {
    const won = (hall: number) => {
      let s = edit(wartime(true, hall), (x) => {
        sect(x, 'sect.luoyun').favor = 10;
        sect(x, 'sect.luoyun').power = 60;
      });
      s = run(s, { type: 'declareWar', sectId: 'sect.luoyun' });
      return advance(s, W.playerPrep);
    };
    let s = won(3);
    const ev = s.events.find((e) => e.kind === 'victory')!;
    expect(annexBlocked(s, content, 'sect.luoyun')).toContain('大殿 5 級');
    s = run(s, { type: 'resolveVictory', eventId: ev.id, choice: 'vassal' });
    expect(sect(s, 'sect.luoyun').vassal).toBe(true);
    const before = sect(s, 'sect.luoyun').resources.lingshi;
    s = advance(s);
    expect(sect(s, 'sect.luoyun').resources.lingshi).toBeLessThan(before + 1000);
    expect(declareBlocked(s, content, 'sect.luoyun')).toContain('附屬');

    let t = won(5);
    const ev2 = t.events.find((e) => e.kind === 'victory')!;
    const outer = t.outer.count;
    const inner = t.disciples.length;
    t = run(t, { type: 'resolveVictory', eventId: ev2.id, choice: 'annex' });
    expect(sect(t, 'sect.luoyun').annexed).toBe(true);
    expect(neighborSects(t, content).some((x) => x.id === 'sect.luoyun')).toBe(false);
    expect(t.integrations).toHaveLength(1);
    expect(t.outer.count).toBeGreaterThanOrEqual(outer);
    expect(t.disciples.length).toBeGreaterThan(inner);
    expect(t.sites.some((y) => y.owner === 'sect.luoyun')).toBe(false);
    const lingshi = t.resources.lingshi;
    t = advance(t);
    expect(t.resources.lingshi).toBeLessThan(lingshi + 2000);
    expect(nonNegative(t)).toBe(true);
  });

  it('好戰又冷淡的宗門會宣戰，有 3–6 個月準備期；信任夠的盟友答應出兵', () => {
    const base = edit(wartime(false), (x) => {
      const c = sect(x, 'sect.chixia');
      c.favor = 0;
      c.power = 150;
      Object.assign(sect(x, 'sect.qingmu'), { trust: 80, treaty: { kind: 'alliance', since: 0, until: 9999 } });
    });
    expect(warThreatBp(base, content, sect(base, 'sect.chixia'))).toBeGreaterThan(0);
    let war: GameState | undefined;
    for (let i = 0; i < 400 && !war; i++) {
      const t = edit(base, (x) => {
        x.rng.sects = seedState(900 + i);
      });
      const stops: { kind: string; text: string }[] = [];
      tickWar(t, content, [], stops as never);
      if (t.wars.length) war = t;
    }
    expect(war).toBeDefined();
    const w = war!.wars[0]!;
    expect(w.side).toBe('defend');
    expect(w.sectId).toBe('sect.chixia');
    const prep = w.resolveAt - monthIndex(war!.date);
    expect(prep).toBeGreaterThanOrEqual(W.prepMin + 1);
    expect(prep).toBeLessThanOrEqual(W.prepMax + 1);
    expect(w.allies).toContain('sect.qingmu');
    // 締結互不侵犯就不會被宣戰
    const peace = edit(base, (x) => {
      sect(x, 'sect.chixia').treaty = { kind: 'peace', since: 0, until: 9999 };
    });
    expect(warThreatBp(peace, content, sect(peace, 'sect.chixia'))).toBe(0);
  });

  it('守方求和：付靈石、停戰 5 年', () => {
    let s = edit(wartime(false), (x) => {
      x.wars.push({ id: 'w1', sectId: 'sect.chixia', side: 'defend', reason: '測試', declared: 0, resolveAt: monthIndex(x.date) + 3, teamIds: [], hidden: 0, allies: [] });
    });
    const lingshi = s.resources.lingshi;
    const cost = W.tributeBase + sect(s, 'sect.chixia').power * W.tributePerPower;
    s = run(s, { type: 'makePeace', warId: 'w1' });
    expect(s.resources.lingshi).toBe(lingshi - cost);
    expect(s.wars).toHaveLength(0);
    expect(sect(s, 'sect.chixia').truceUntil).toBe(monthIndex(s.date) + W.peaceTruceYears * 12);
  });

  it('山門失守：撤離的靈石不會被搶，建築損毀停用、割讓據點，修好後恢復；宗門還在', () => {
    let s = edit(wartime(false), (x) => {
      sect(x, 'sect.chixia').power = 200;
      x.sites.find((y) => y.id === 'site.qingshi')!.owner = PLAYER;
      x.wars.push({ id: 'w1', sectId: 'sect.chixia', side: 'defend', reason: '測試', declared: 0, resolveAt: monthIndex(x.date) + 1, teamIds: [], hidden: 0, allies: [] });
    });
    s = run(s, { type: 'evacuate', warId: 'w1' });
    const hidden = s.wars[0]!.hidden;
    expect(hidden).toBe(2500);
    const left = s.resources.lingshi;
    s = advance(s);
    expect(s.wars).toHaveLength(0);
    const damaged = s.buildings.filter((b) => b.damaged);
    expect(damaged).toHaveLength(W.damagedBuildings);
    expect(damaged.every((b) => !isOperating(b))).toBe(true);
    expect(s.sites.find((y) => y.id === 'site.qingshi')?.owner).toBe('sect.chixia');
    // 被搶的只有留在庫房的部分，撤離的取回
    expect(s.resources.lingshi).toBeGreaterThan(hidden);
    expect(s.resources.lingshi).toBeLessThan(left + hidden);
    expect(s.reports[0]?.lines.some((l) => l.includes('山門失守'))).toBe(true);
    s = run(s, { type: 'repairBuilding', buildingId: damaged[0]!.id });
    expect(s.buildings.find((b) => b.id === damaged[0]!.id)?.damaged).toBeUndefined();
    expect(nonNegative(s)).toBe(true);
  });

  it('倒下的內門弟子可能戰死，掌門不會死；護山大陣降低戰死機率', () => {
    let deaths = 0;
    for (let i = 0; i < 60; i++) {
      let s = edit(wartime(false), (x) => {
        sect(x, 'sect.chixia').power = 260;
        x.rng.combat = seedState(300 + i);
        x.wars.push({ id: 'w1', sectId: 'sect.chixia', side: 'defend', reason: '測試', declared: 0, resolveAt: monthIndex(x.date) + 1, teamIds: [], hidden: 0, allies: [] });
      });
      s = advance(s);
      expect(s.protagonist.id).toBe('c0');
      expect(s.protagonist.injuryMonths).toBeGreaterThan(0);
      deaths += 3 - s.disciples.length;
      if (s.disciples.length < 3) expect(s.reports[0]?.lines.some((l) => l.includes('戰死'))).toBe(true);
    }
    expect(deaths).toBeGreaterThan(0);
    const armed = edit(wartime(false), (x) => {
      x.buildings.push({ id: 'b99', defId: 'building.grand_array', region: 'region.main', level: 2, status: 'active', construction: null });
      x.wars.push({ id: 'w1', sectId: 'sect.chixia', side: 'defend', reason: '測試', declared: 0, resolveAt: monthIndex(x.date) + 1, teamIds: [], hidden: 0, allies: [] });
    });
    expect(warOdds(armed, content, armed.wars[0]!).deathPct).toBeLessThan(W.deathBp / 100);
  });

  it('攻打敗北：聲望下降，戰事結束並停戰', () => {
    let s = edit(wartime(false), (x) => {
      x.reputation = 50;
      sect(x, 'sect.chixia').favor = 5;
      sect(x, 'sect.chixia').power = 200;
    });
    s = run(s, { type: 'declareWar', sectId: 'sect.chixia' });
    s = advance(s, W.playerPrep);
    expect(s.wars).toHaveLength(0);
    expect(s.events.some((e) => e.kind === 'victory')).toBe(false);
    expect(s.reputation).toBe(50 - W.attackLoseReputation);
    expect(declareBlocked(s, content, 'sect.chixia')).toContain('停戰');
  });
});

describe('0.7.0 試玩修正', () => {
  it('內門已滿時招生不跳出視窗，只寫進月報', () => {
    let s = edit(wartime(false), (x) => {
      const limit = innerLimit(x, content);
      while (x.disciples.length < limit) x.disciples.push({ ...structuredClone(x.disciples[0]!), id: `c${200 + x.disciples.length}` });
      x.nextRecruitMonth = monthIndex(x.date);
    });
    s = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    expect(s.events.some((e) => e.kind === 'recruitment')).toBe(false);
    expect(s.reports[0]?.lines.some((l) => l.includes('內門已達大殿上限'))).toBe(true);
  });
});

describe('存檔', () => {
  it('0.7.x 的存檔可以讀取並升級：補上戰事與整合費，之後推進一年不出錯', () => {
    const v8 = JSON.parse(readFileSync('tests/fixtures/save-v8-p2c.json', 'utf8'));
    const r = decode(v8);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(8);
    expect(r.state.version).toBe(STATE_VERSION);
    expect(r.state.wars).toEqual([]);
    expect(r.state.integrations).toEqual([]);
    const s = advance(r.state, 12);
    expect(nonNegative(s)).toBe(true);
  });
});
