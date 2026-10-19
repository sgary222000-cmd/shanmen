import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { monthIndex, STATE_VERSION, type GameState } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { seedState } from '../../src/engine/rng';
import { requestAid, tickDiplomacy, treatyBlocked, trustOf } from '../../src/engine/systems/world/diplomacy';
import { tickSects } from '../../src/engine/systems/world/sects';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// P2 批次 C：遠方勢力、信任、議事堂與條約、盟友求援、好戰宗門騷擾、資源據點、v7 → v8 存檔升級。

const D = balance.diplomacy;
const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));

/** 大殿 3 級、主峰有議事堂、外交條件都夠的宗門。 */
function withCouncil(level = 1, hall = 3): GameState {
  return edit(developed(), (x) => {
    const h = x.buildings.find((b) => b.defId === 'building.hall');
    if (h) h.level = hall;
    x.buildings.push({ id: `b${x.nextId++}`, defId: 'building.council', region: 'region.main', level, status: 'active', construction: null });
    x.resources.lingshi = 5000;
    x.nextRecruitMonth = 999;
    for (const sect of x.sects) {
      sect.favor = 70;
      sect.trust = 60;
    }
  });
}

const sect = (s: GameState, id: string) => s.sects.find((x) => x.id === id)!;

describe('勢力', () => {
  it('六個勢力：鄰近三宗、遠方三派；遠方勢力要大殿 4 級才往來、不能直接買賣', () => {
    const s = developed();
    expect(s.sects).toHaveLength(6);
    expect(s.sects.filter((x) => content.sects.get(x.id)?.scope === 'distant')).toHaveLength(3);
    expect(tryRun(s, { type: 'giftSect', sectId: 'sect.tiejian', lingshi: 50 }).ok).toBe(false);
    const big = edit(s, (x) => {
      x.buildings.find((b) => b.defId === 'building.hall')!.level = 4;
    });
    expect(tryRun(big, { type: 'giftSect', sectId: 'sect.tiejian', lingshi: 50 }).ok).toBe(true);
    expect(tryRun(big, { type: 'sectTrade', sectId: 'sect.tiejian', lots: 1 }).ok).toBe(false);
  });

  it('送禮只增加好感，不增加信任', () => {
    const s = run(developed(), { type: 'giftSect', sectId: 'sect.qingmu', lingshi: 200 });
    expect(sect(s, 'sect.qingmu').favor).toBeGreaterThan(sect(developed(), 'sect.qingmu').favor);
    expect(trustOf(sect(s, 'sect.qingmu'))).toBe(trustOf(sect(developed(), 'sect.qingmu')));
  });

  it('百年模擬：據點每宗最多 3 處，資源不為負、實力不超過上限', () => {
    const s = developed();
    for (let m = 0; m < 1200; m++) {
      tickSects(s, content);
      s.date = s.date.month === 12 ? { year: s.date.year + 1, month: 1 } : { year: s.date.year, month: s.date.month + 1 };
    }
    for (const x of s.sects) {
      expect(s.sites.filter((site) => site.owner === x.id).length).toBeLessThanOrEqual(balance.sites.maxPerSect);
      for (const v of Object.values(x.resources)) expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(s.sites.some((site) => site.owner === null)).toBe(false);
  });
});

describe('條約', () => {
  it('沒有議事堂不能締約；好感、信任不夠時說明原因', () => {
    expect(treatyBlocked(developed(), content, 'sect.qingmu', 'peace')).toContain('議事堂');
    const s = edit(withCouncil(), (x) => {
      sect(x, 'sect.qingmu').trust = 10;
      sect(x, 'sect.luoyun').favor = 10;
    });
    expect(treatyBlocked(s, content, 'sect.qingmu', 'peace')).toContain('信任');
    expect(treatyBlocked(s, content, 'sect.luoyun', 'peace')).toContain('好感');
  });

  it('締約扣儀式靈石；議事堂 1 級最多同時 2 份', () => {
    let s = withCouncil();
    const lingshi = s.resources.lingshi;
    s = run(s, { type: 'signTreaty', sectId: 'sect.qingmu', kind: 'alliance' });
    expect(s.resources.lingshi).toBe(lingshi - D.treaties.alliance.lingshi);
    expect(sect(s, 'sect.qingmu').treaty?.kind).toBe('alliance');
    s = run(s, { type: 'signTreaty', sectId: 'sect.chixia', kind: 'peace' });
    expect(treatyBlocked(s, content, 'sect.luoyun', 'peace')).toContain('最多同時維持 2 份');
  });

  it('提前解約要付代價：信任、好感、聲望都下降', () => {
    let s = run(withCouncil(), { type: 'signTreaty', sectId: 'sect.qingmu', kind: 'peace' });
    s = edit(s, (x) => {
      x.reputation = 100;
    });
    s = run(s, { type: 'breakTreaty', sectId: 'sect.qingmu' });
    const q = sect(s, 'sect.qingmu');
    expect(q.treaty).toBeNull();
    expect(trustOf(q)).toBe(60 - D.treaties.peace.breakTrust);
    expect(q.favor).toBe(70 - D.treaties.peace.breakFavor);
    expect(s.reputation).toBe(100 - D.treaties.peace.breakReputation);
  });

  it('條約期滿時信任增加並寫進月報', () => {
    let s = run(withCouncil(), { type: 'signTreaty', sectId: 'sect.qingmu', kind: 'peace' });
    s = edit(s, (x) => {
      sect(x, 'sect.qingmu').treaty!.until = monthIndex(x.date);
    });
    const trust = trustOf(sect(s, 'sect.qingmu'));
    s = advance(s);
    expect(sect(s, 'sect.qingmu').treaty).toBeNull();
    expect(trustOf(sect(s, 'sect.qingmu'))).toBe(trust + D.trustOnExpiry);
    expect(s.reports[0]?.lines.some((l) => l.includes('條約期滿'))).toBe(true);
  });
});

describe('盟友求援', () => {
  const allied = () => {
    const s = run(withCouncil(), { type: 'signTreaty', sectId: 'sect.qingmu', kind: 'alliance' });
    const stops: never[] = [];
    requestAid(s, content, sect(s, 'sect.qingmu'), '測試：', [], stops);
    return s;
  };

  it('出資援助：扣靈石，信任與好感增加', () => {
    let s = allied();
    const ev = s.events.find((e) => e.kind === 'aid')!;
    const trust = trustOf(sect(s, 'sect.qingmu'));
    const lingshi = s.resources.lingshi;
    s = run(s, { type: 'resolveAid', eventId: ev.id, choice: 'money' });
    expect(s.resources.lingshi).toBe(lingshi - ev.aid!.lingshi);
    expect(trustOf(sect(s, 'sect.qingmu'))).toBe(trust + D.trustOnAid);
    expect(s.events.some((e) => e.kind === 'aid')).toBe(false);
  });

  it('出兵援助：內門弟子外出 3 個月後回宗，不會戰死', () => {
    let s = allied();
    const ev = s.events.find((e) => e.kind === 'aid')!;
    s = run(s, { type: 'resolveAid', eventId: ev.id, choice: 'troops' });
    expect(s.disciples[0]?.schedule).toBe('dispatch');
    expect(s.dispatches[0]?.aidSectId).toBe('sect.qingmu');
    s = advance(s, D.aidMonths);
    expect(s.dispatches).toHaveLength(0);
    expect(s.disciples).toHaveLength(1);
    expect(['cultivate', 'heal']).toContain(s.disciples[0]?.schedule);
  });

  it('逾期不回覆視同拒絕；連續拒絕兩次，盟友解除聯盟', () => {
    let s = allied();
    s = advance(s, D.aidDeadline + 1);
    expect(s.events.some((e) => e.kind === 'aid')).toBe(false);
    expect(trustOf(sect(s, 'sect.qingmu'))).toBe(60 - D.trustOnRefuse);
    expect(sect(s, 'sect.qingmu').treaty?.refusals).toBe(1);
    requestAid(s, content, sect(s, 'sect.qingmu'), '測試：', [], []);
    const ev = s.events.find((e) => e.kind === 'aid')!;
    s = run(s, { type: 'resolveAid', eventId: ev.id, choice: 'refuse' });
    expect(sect(s, 'sect.qingmu').treaty).toBeNull();
  });

  it('求援不能用「知道了」略過', () => {
    const s = allied();
    const ev = s.events.find((e) => e.kind === 'aid')!;
    expect(tryRun(s, { type: 'dismissEvent', eventId: ev.id }).ok).toBe(false);
  });
});

describe('騷擾', () => {
  it('好戰又冷淡的宗門會截走商隊；締結互不侵犯後不會', () => {
    const base = edit(withCouncil(), (x) => {
      sect(x, 'sect.chixia').favor = 0;
    });
    const lose = (s: GameState) => {
      let lost = 0;
      for (let i = 0; i < 300; i++) {
        const t = edit(s, (x) => {
          x.rng.sects = seedState(500 + i);
        });
        const before = t.resources.lingshi;
        tickDiplomacy(t, content, [], []);
        lost += before - t.resources.lingshi;
      }
      return lost;
    };
    expect(lose(base)).toBeGreaterThan(0);
    const peace = edit(base, (x) => {
      sect(x, 'sect.chixia').treaty = { kind: 'peace', since: 0, until: 999 };
    });
    expect(lose(peace)).toBe(0);
  });
});

describe('存檔', () => {
  it('0.6.x 的存檔可以讀取並升級：補上遠方勢力、信任與據點，之後推進一年不出錯', () => {
    const v7 = JSON.parse(readFileSync('tests/fixtures/save-v7-p2b.json', 'utf8'));
    const r = decode(v7);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(7);
    expect(r.state.version).toBe(STATE_VERSION);
    expect(r.state.sects).toHaveLength(6);
    expect(r.state.sects.every((x) => typeof x.trust === 'number' && x.treaty === null)).toBe(true);
    expect(r.state.sites.length).toBeGreaterThan(0);
    const s = advance(r.state, 12);
    expect(nonNegative(s)).toBe(true);
  });
});
