import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { STATE_VERSION, type GameState } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { seedState } from '../../src/engine/rng';
import { breakthroughOdds, resolveBreakthrough } from '../../src/engine/systems/cultivation/cultivation';
import { xpToNext } from '../../src/engine/systems/characters/characters';
import { buyPriceAt } from '../../src/engine/systems/economy/market';
import { dispatchOdds } from '../../src/engine/systems/exploration/dispatch';
import { insightGain, techniqueTier } from '../../src/engine/systems/talent/techniques';
import { mentorPct } from '../../src/engine/systems/talent/positions';
import { giftFavor, sectPowerCap, sectTradePrice, tickSects } from '../../src/engine/systems/world/sects';
import { neighborSects } from '../../src/engine/systems/world/diplomacy';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// P1 批次 C、D、E：職位、功法領悟、金丹、靈獸、法器、傳承分支、新秘境與派遣、電腦宗門、大比、靈脈競標、v4 → v5 存檔升級。

const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));

const openAll = (s: GameState) =>
  edit(s, (x) => {
    for (const id of Object.keys(x.regions)) x.regions[id] = { status: 'open', construction: null };
  });

const place = (s: GameState, defId: string, region: string, level = 1) =>
  edit(s, (x) => {
    x.buildings.push({ id: `b${x.nextId++}`, defId, region, level, status: 'active', construction: null });
  });

/** 再加一位內門弟子。 */
const addDisciple = (s: GameState, id: string, skills: Partial<GameState['disciples'][number]['skills']> = {}) =>
  edit(s, (x) => {
    const base = x.disciples[0];
    if (!base) throw new Error('需要一位內門');
    x.disciples.push({ ...structuredClone(base), id, name: `弟子${id}`, skills: { ...base.skills, ...skills } });
  });

/** 主角築基圓滿、修為滿、功法小成，後山有聚靈陣 2 級與洞府，手上有結丹靈液。 */
function coreReady(seed = 1): GameState {
  let s = openAll(developed(seed));
  s = place(s, 'building.array', 'region.back', 2);
  s = place(s, 'building.cave_abode', 'region.back', 1);
  return edit(s, (x) => {
    const p = x.protagonist;
    p.realm = { major: 'foundation', stage: 4 };
    p.xp = xpToNext(p.realm);
    p.insight = 100;
    p.seat = 'region.back';
    x.resources.pill_core = 3;
  });
}

describe('職位', () => {
  it('一人只能擔任一個職位，職位只能由內門擔任', () => {
    let s = addDisciple(developed(), 'c51');
    s = run(s, { type: 'setPosition', position: 'mentor', characterId: 'c50' });
    expect(tryRun(s, { type: 'setPosition', position: 'steward', characterId: 'c50' }).ok).toBe(false);
    expect(tryRun(s, { type: 'setPosition', position: 'steward', characterId: 'c0' }).ok).toBe(false);
    s = run(s, { type: 'setPosition', position: 'steward', characterId: 'c51' });
    expect(s.positions.mentor).toBe('c50');
    expect(s.positions.steward).toBe('c51');
    s = run(s, { type: 'setPosition', position: 'mentor', characterId: null });
    expect(s.positions.mentor).toBeNull();
  });

  it('傳功長老讓修煉加成大於 0，且不超過上限', () => {
    const s = run(developed(), { type: 'setPosition', position: 'mentor', characterId: 'c50' });
    expect(mentorPct(s)).toBeGreaterThan(0);
    expect(mentorPct(s)).toBeLessThanOrEqual(balance.positions.mentorMaxPct);
  });
});

describe('功法領悟', () => {
  it('沒有藏經閣不能研究；有藏經閣時研究比平時修煉快', () => {
    let s = developed();
    expect(tryRun(s, { type: 'setSchedule', characterId: 'c50', schedule: 'research' }).ok).toBe(false);
    s = place(s, 'building.library', 'region.main');
    const passive = insightGain(s, content, s.disciples[0]!).total;
    s = run(s, { type: 'setSchedule', characterId: 'c50', schedule: 'research' });
    const research = insightGain(s, content, s.disciples[0]!).total;
    expect(research).toBeGreaterThan(passive);
    const before = s.disciples[0]!.insight;
    s = advance(s);
    expect(s.disciples[0]!.insight).toBe(before + research);
  });

  it('領悟達門檻進入小成、大成', () => {
    const s = edit(developed(), (x) => {
      x.protagonist.insight = 100;
      x.disciples[0]!.insight = 300;
    });
    expect(techniqueTier(s.protagonist).name).toBe('小成');
    expect(techniqueTier(s.disciples[0]!).name).toBe('大成');
  });
});

describe('結丹', () => {
  it('條件不足時說明原因：領悟、靈氣容量、結丹靈液', () => {
    const ready = coreReady();
    expect(breakthroughOdds(ready, content, ready.protagonist).blocked).toBeUndefined();
    const noInsight = edit(ready, (x) => {
      x.protagonist.insight = 50;
    });
    expect(breakthroughOdds(noInsight, content, noInsight.protagonist).blocked).toContain('小成');
    const mainSeat = edit(ready, (x) => {
      x.protagonist.seat = 'region.main';
    });
    expect(breakthroughOdds(mainSeat, content, mainSeat.protagonist).blocked).toContain('靈氣容量');
    const noPill = edit(ready, (x) => {
      x.resources.pill_core = 0;
    });
    expect(breakthroughOdds(noPill, content, noPill.protagonist).blocked).toContain('結丹靈液');
  });

  it('預覽的成功率與 1500 次實際結果相差不到 4 個百分點', () => {
    const s = coreReady();
    const odds = breakthroughOdds(s, content, s.protagonist);
    expect(odds.target).toBe('core');
    let wins = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const t = edit(s, (x) => {
        x.rng.cultivation = seedState(1000 + i);
      });
      resolveBreakthrough(t, content, t.protagonist, odds, []);
      if (t.protagonist.realm.major === 'core') wins++;
    }
    expect(Math.abs((wins / N) * 10000 - odds.bp)).toBeLessThan(400);
  });

  it('經過月結算扣一份結丹靈液，成功時成為金丹前期', () => {
    let s = coreReady();
    s = run(s, { type: 'setSchedule', characterId: 'c0', schedule: 'breakthrough' });
    s = advance(s);
    expect(s.resources.pill_core).toBe(2);
    const p = s.protagonist;
    if (p.realm.major === 'core') expect(p.realm.stage).toBe(1);
    else expect(p.injuryMonths).toBeGreaterThan(0);
  });
});

describe('靈獸', () => {
  const garden = (s: GameState) =>
    edit(place(openAll(s), 'building.beast_garden', 'region.valley'), (x) => {
      x.resources.beast_egg = 3;
      x.items.push('item.beast_taming');
    });

  it('非御獸傳承沒有馴獸法時不能孵化；有馴獸法時最多一隻', () => {
    let s = edit(place(openAll(developed()), 'building.beast_garden', 'region.valley'), (x) => {
      x.resources.beast_egg = 3;
    });
    expect(tryRun(s, { type: 'hatchBeast' }).ok).toBe(false);
    s = garden(developed());
    s = run(s, { type: 'hatchBeast' });
    expect(s.beasts).toHaveLength(1);
    expect(s.beasts[0]?.stage).toBe('young');
    expect(s.resources.beast_egg).toBe(2);
    expect(tryRun(s, { type: 'hatchBeast' }).ok).toBe(false);
  });

  it('每人最多一隻；吃飽的幼獸長成成年', () => {
    // 御獸傳承的靈獸苑可養 3 隻
    let s = edit(garden(developed()), (x) => {
      x.lineage = 'lineage.beast';
    });
    s = run(run(s, { type: 'hatchBeast' }), { type: 'hatchBeast' });
    const [id, id2] = s.beasts.map((b) => b.id);
    s = run(s, { type: 'setBeast', beastId: id!, ownerId: 'c50', task: 'follow' });
    expect(tryRun(s, { type: 'setBeast', beastId: id2!, ownerId: 'c50', task: 'follow' }).ok).toBe(false);
    expect(tryRun(s, { type: 'setBeast', beastId: id!, ownerId: null, task: 'follow' }).ok).toBe(false);
    const months = Math.ceil(balance.beasts.adultGrowth / balance.beasts.growthPerMonth);
    s = advance(s, months);
    expect(s.beasts[0]?.stage).toBe('adult');
    expect(nonNegative(s)).toBe(true);
  });
});

describe('法器', () => {
  it('制式法器取自庫存，獨特法器取自庫房，換裝時舊的放回庫房', () => {
    let s = edit(developed(), (x) => {
      x.resources.artifact = 1;
      x.armory.push({ id: 'g900', defId: 'equip.ore_blade', quality: 'common', subs: [] });
    });
    s = run(s, { type: 'equip', characterId: 'c50', itemId: 'equip.common' });
    expect(s.resources.artifact).toBe(0);
    expect(s.disciples[0]?.gear.weapon?.defId).toBe('equip.common');
    expect(tryRun(s, { type: 'equip', characterId: 'c0', itemId: 'equip.common' }).ok).toBe(false);
    s = run(s, { type: 'equip', characterId: 'c50', itemId: 'g900' });
    expect(s.disciples[0]?.gear.weapon?.id).toBe('g900');
    expect(s.armory.map((i) => i.defId)).toEqual(['equip.common']);
    expect(tryRun(s, { type: 'equip', characterId: 'c0', itemId: 'g900' }).ok).toBe(false);
    s = run(s, { type: 'equip', characterId: 'c50', itemId: null, slot: 'weapon' });
    expect(s.armory.map((i) => i.id)).toContain('g900');
  });
});

describe('傳承分支', () => {
  it('需要藏經閣 2 級、典籍與技藝達標的主持人；開設後學會該傳承配方', () => {
    let s = place(developed(), 'building.library', 'region.main', 1);
    s = edit(s, (x) => {
      x.disciples[0]!.skills.talisman = balance.branch.skillRequired;
      x.items.push('item.scripture.any');
    });
    expect(tryRun(s, { type: 'openBranch', lineageId: 'lineage.talisman', hostId: 'c50' }).ok).toBe(false);
    s = edit(s, (x) => {
      const lib = x.buildings.find((b) => b.defId === 'building.library');
      if (lib) lib.level = 2;
    });
    expect(tryRun(s, { type: 'openBranch', lineageId: 'lineage.talisman', hostId: 'c0' }).ok).toBe(false);
    s = run(s, { type: 'openBranch', lineageId: 'lineage.talisman', hostId: 'c50' });
    expect(s.branches).toEqual([{ lineageId: 'lineage.talisman', hostId: 'c50' }]);
    expect(s.items).not.toContain('item.scripture.any');
    for (const r of content.lineages.get('lineage.talisman')!.start.recipes) expect(s.recipes).toContain(r);
  });
});

describe('新秘境與派遣', () => {
  function walk(state: GameState): GameState {
    let s = state;
    let guard = 0;
    while (s.exploration?.status === 'active' && guard++ < 30) {
      const realm = content.secretRealms.get(s.exploration.realmId);
      const node = realm?.nodes.find((n) => n.id === s.exploration?.nodeId);
      if (node?.choices && !s.exploration.choices[node.id]) {
        s = run(s, { type: 'exploreChoice', choiceId: node.choices[0]?.id ?? '' });
        continue;
      }
      s = run(s, { type: 'exploreMove', nodeId: node?.next[0] ?? '' });
    }
    return s;
  }
  const strong = () =>
    edit(developed(), (x) => {
      x.protagonist.realm = { major: 'core', stage: 3 };
      x.protagonist.skills.combat = 15;
      x.disciples[0]!.realm = { major: 'foundation', stage: 4 };
      x.disciples[0]!.skills.combat = 15;
      x.realmClears['secret.abandoned_cave'] = 1;
    });

  it('地下靈礦首次通關：打通地火峰並取得礦魄刀', () => {
    let s = strong();
    s = run(s, { type: 'startExploration', realmId: 'secret.underground_mine', teamIds: ['c0', 'c50'], rows: { c0: 'front', c50: 'back' } });
    s = walk(s);
    expect(s.exploration?.status).toBe('completed');
    expect(s.regions['region.fire']?.status).toBe('open');
    expect(s.armory.map((i) => i.defId)).toContain('equip.ore_blade');
  });

  it('沒通關不能派遣；派遣結果固定、不會給唯一獎勵', () => {
    let s = strong();
    expect(tryRun(s, { type: 'dispatch', realmId: 'secret.underground_mine', teamIds: ['c50'] }).ok).toBe(false);
    s = run(s, { type: 'dispatch', realmId: 'secret.abandoned_cave', teamIds: ['c50'] });
    expect(s.disciples[0]?.schedule).toBe('dispatch');
    expect(dispatchOdds(s, content, 'secret.abandoned_cave', ['c50']).bp).toBeGreaterThan(0);
    const a = advance(s, 2);
    const b = advance(s, 2);
    expect(a.resources).toEqual(b.resources);
    expect(a.dispatches).toHaveLength(0);
    expect(a.armory).toEqual(s.armory);
    expect(a.items).toEqual(s.items);
    expect(a.recipes).toEqual(s.recipes);
    expect(a.claimedRewards).toEqual(s.claimedRewards);
  });
});

describe('電腦宗門', () => {
  it('百年內資源不為負、不超過上限，實力隨年份慢慢成長、不超過上限', () => {
    const s = developed();
    for (let m = 0; m < 1200; m++) {
      tickSects(s, content);
      for (const x of s.sects) expect(x.power).toBeLessThanOrEqual(sectPowerCap(s, content, x));
      if (s.date.year === 10 && s.date.month === 12) for (const x of neighborSects(s, content)) expect(x.power).toBeLessThan(100);
      s.date = s.date.month === 12 ? { year: s.date.year + 1, month: 1 } : { year: s.date.year, month: s.date.month + 1 };
      for (const x of s.sects) {
        for (const [k, v] of Object.entries(x.resources)) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(balance.sects.resourceCap[k as keyof typeof x.resources]);
        }
        expect(x.power).toBeLessThanOrEqual(Math.max(balance.sects.lateMaxPower, balance.sects.distantLateMaxPower));
        expect(x.buildings).toBeLessThanOrEqual(balance.sects.maxBuildings);
      }
    }
    expect(s.intel.length).toBeGreaterThan(0);
  });

  it('同一年送禮效果遞減', () => {
    let s = developed();
    const id = s.sects[0]!.id;
    const first = giftFavor(s, content, s.sects[0]!, 100);
    s = run(s, { type: 'giftSect', sectId: id, lingshi: 100 });
    const second = giftFavor(s, content, s.sects[0]!, 100);
    expect(second).toBeLessThan(first);
  });

  it('賣給宗門的價格不超過坊市買價（不能套利）', () => {
    const s = edit(developed(), (x) => {
      for (const sect of x.sects) sect.favor = 100;
    });
    for (const sect of s.sects) {
      for (const id of ['herb', 'pill_qi', 'ore', 'talisman_fire', 'artifact'] as const) {
        const t = { ...sect, wants: id };
        const good = balance.market.goods[id];
        if (!good) continue;
        expect(sectTradePrice(s, t)).toBeLessThan(buyPriceAt(good.base, balance.market.maxPct, 0));
      }
    }
  });
});

describe('大比與靈脈競標', () => {
  it('聲望不足不能參賽；參賽後有四家排名並依名次發獎', () => {
    const base = edit(developed(), (x) => {
      x.tournament = { year: x.date.year, status: 'open', standings: [], log: [], rank: null };
    });
    expect(tryRun(edit(base, (x) => (x.reputation = 0)), { type: 'enterTournament', teamIds: ['c0'] }).ok).toBe(false);
    const s = run(
      edit(base, (x) => (x.reputation = 50)),
      { type: 'enterTournament', teamIds: ['c0', 'c50'] },
    );
    const t = s.tournament;
    expect(t?.status).toBe('done');
    if (t?.status !== 'done') return;
    expect(t.standings).toHaveLength(4);
    expect(t.rank).toBeGreaterThanOrEqual(1);
    expect(s.reputation).toBeGreaterThanOrEqual(50);
    expect(tryRun(s, { type: 'enterTournament', teamIds: ['c0'] }).ok).toBe(false);
  });

  it('出價預扣靈石，落標全數退還，得標每月有靈礦', () => {
    const base = edit(developed(), (x) => {
      x.auction = { id: 'auc1', name: '測試靈脈', orePerMonth: 5, years: 6, deadline: 0, playerBid: 0 };
      for (const s of x.sects) s.resources.lingshi = 0;
    });
    const before = base.resources.lingshi;
    let s = run(base, { type: 'bidAuction', amount: 100 });
    expect(s.resources.lingshi).toBe(before - 100);
    s = advance(s);
    expect(s.veins).toHaveLength(1);
    expect(s.auction).toBeNull();
    const ore = s.resources.ore;
    s = advance(s);
    expect(s.resources.ore).toBeGreaterThanOrEqual(ore + 5);

    let lose = edit(base, (x) => {
      for (const sect of x.sects) sect.resources.lingshi = 3000;
    });
    lose = run(lose, { type: 'bidAuction', amount: 50 });
    const mid = lose.resources.lingshi;
    lose = advance(lose);
    expect(lose.veins).toHaveLength(0);
    expect(lose.resources.lingshi).toBeGreaterThanOrEqual(mid + 50 - 200);
  });
});

describe('存檔 v4 → v5', () => {
  const v4 = JSON.parse(readFileSync('tests/fixtures/save-v4-p1b.json', 'utf8'));

  it('批次 B 的實際存檔（御獸、第 15 年）可以讀取並升級', () => {
    const r = decode(v4);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(4);
    const s = r.state;
    expect(s.version).toBe(STATE_VERSION);
    for (const id of Object.keys(v4.world.resources)) expect(s.resources[id as keyof typeof s.resources]).toBe(v4.world.resources[id]);
    expect(s.resources.beast_egg).toBe(0);
    expect(s.resources.pill_core).toBe(0);
    expect(s.buildings).toEqual(v4.world.buildings);
    expect(s.disciples.map((d) => d.name)).toEqual(v4.world.disciples.map((d: { name: string }) => d.name));
    expect(s.protagonist.insight).toBe(0);
    expect(s.protagonist.gear).toEqual({});
    expect(s.beasts[0]).toMatchObject({ stage: 'young', task: 'follow', ownerId: v4.world.beasts[0].ownerId });
    expect(s.sects).toHaveLength(6);
    expect(Object.values(s.positions).every((v) => v === null)).toBe(true);
  });

  it('升級後推進 24 個月不出錯、資源不為負', () => {
    const r = decode(v4);
    if (!r.ok) throw new Error(r.error);
    const s = advance(r.state, 24);
    expect(nonNegative(s)).toBe(true);
  });
});
