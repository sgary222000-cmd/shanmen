import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyCommand, monthIndex, newGame, planMonth, STATE_VERSION, type GameState } from '../../src/engine';
import { workersByBuilding } from '../../src/engine/systems/economy/flows';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { qiCapacity, usedSlots } from '../../src/engine/systems/buildings/buildings';
import { qiDemandOf } from '../../src/engine/systems/characters/characters';
import { breakthroughOdds } from '../../src/engine/systems/cultivation/cultivation';
import { sellCap } from '../../src/engine/systems/economy/trade';
import { unitFromCharacter } from '../../src/engine/systems/combat/combat';
import { decode } from '../../src/save/codec';
import { botTurn } from '../../tools/bot';
import { advance, content, developed, edit, fresh, run, tryRun } from './helpers';

const LINEAGES = ['lineage.sword', 'lineage.alchemy', 'lineage.beast', 'lineage.talisman'];

function openAll(s: GameState): GameState {
  return edit(s, (x) => {
    for (const id of Object.keys(x.regions)) x.regions[id] = { status: 'open', construction: null };
  });
}

function play(s0: GameState, months: number): { state: GameState; negatives: number } {
  let s = s0;
  let negatives = 0;
  for (let i = 0; i < months; i++) {
    s = botTurn(s, content, []);
    const r = applyCommand(s, content, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    if (!r.ok) throw new Error(`第 ${i} 個月推進失敗：${r.error}`);
    s = r.state;
    for (const id of RESOURCE_IDS) if (s.resources[id] < 0) negatives++;
  }
  return { state: s, negatives };
}

describe('P0 存檔遷移到 v3', () => {
  const p0 = JSON.parse(readFileSync('tests/fixtures/save-v2-p0.json', 'utf-8'));

  it('P0 實際存檔（第 17 年、主角築基）可以讀取並升級', () => {
    const r = decode(p0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(2);
    const s = r.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.lineage).toBe('lineage.sword');
    expect(s.buildings.every((b) => b.region === 'region.main')).toBe(true);
    expect(s.regions['region.main']?.status).toBe('open');
    expect(s.regions['region.valley']?.status).toBe('locked');
    expect(s.protagonist.seat).toBe('region.main');
    expect(s.protagonist.skills.forging).toBe(0);
    // 原有資源、境界、日期保留
    expect(s.resources).toMatchObject(p0.world.resources);
    expect(s.protagonist.realm).toEqual(p0.world.protagonist.realm);
    expect(s.date).toEqual(p0.world.date);
  });

  it('遷移結果固定，之後推進 24 個月不出錯、資源不為負', () => {
    const a = decode(p0);
    const b = decode(p0);
    if (!a.ok || !b.ok) throw new Error('讀取失敗');
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    const { state, negatives } = play(a.state, 24);
    expect(negatives).toBe(0);
    expect(state.stats.monthsAdvanced).toBe(a.state.stats.monthsAdvanced + 24);
  });

  it('P0 的主峰建築在遷移後收支與遷移前相同', () => {
    const r = decode(p0);
    if (!r.ok) throw new Error('讀取失敗');
    const plan = planMonth(r.state, content);
    // 遷移前（P0）同一份存檔的產出：靈田 2 級、採石場 2 級、靈木場 2 級
    const jobs = r.state.outer.jobs;
    expect(plan.production.stone ?? 0).toBe(Math.min(jobs.quarry, 8) * 3);
    expect(plan.production.wood ?? 0).toBe(Math.min(jobs.lumber, 8) * 3);
  });
});

describe('區域', () => {
  it('未開放的區域不能建造；開路需要大殿等級並先付清費用', () => {
    let s = edit(fresh(), (x) => {
      const hall = x.buildings.find((b) => b.defId === 'building.hall');
      if (hall) Object.assign(hall, { level: 0, status: 'ruined' });
    });
    expect(tryRun(s, { type: 'build', defId: 'building.field', regionId: 'region.valley' }).ok).toBe(false);
    expect(tryRun(s, { type: 'openRegion', regionId: 'region.valley' }).ok).toBe(false); // 大殿未修
    s = edit(s, (x) => {
      const hall = x.buildings.find((b) => b.defId === 'building.hall');
      if (hall) Object.assign(hall, { level: 1, status: 'active' });
    });
    const before = s.resources.stone;
    s = run(s, { type: 'openRegion', regionId: 'region.valley' });
    expect(s.resources.stone).toBe(before - 60);
    expect(s.regions['region.valley']?.status).toBe('opening');
    s = advance(s, 1);
    expect(s.regions['region.valley']?.status).toBe('opening');
    s = advance(s, 1);
    expect(s.regions['region.valley']?.status).toBe('open');
    s = run(s, { type: 'build', defId: 'building.field', regionId: 'region.valley' });
    expect(s.buildings.some((b) => b.defId === 'building.field' && b.region === 'region.valley')).toBe(true);
  });

  it('區域只能蓋指定的建築，槽位滿了不能再蓋', () => {
    let s = openAll(developed());
    expect(tryRun(s, { type: 'build', defId: 'building.alchemy', regionId: 'region.valley' }).ok).toBe(false);
    for (let i = 0; i < 5; i++) s = run(s, { type: 'build', defId: 'building.field', regionId: 'region.valley' });
    expect(usedSlots(s, 'region.valley')).toBe(5);
    const r = tryRun(s, { type: 'build', defId: 'building.field', regionId: 'region.valley' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('槽位已滿');
  });

  it('外山建造費用 −20%', () => {
    const s = developed();
    const main = run(s, { type: 'build', defId: 'building.quarry', regionId: 'region.main' });
    const outer = run(s, { type: 'build', defId: 'building.quarry', regionId: 'region.outer' });
    expect(s.resources.stone - main.resources.stone).toBe(10);
    expect(s.resources.stone - outer.resources.stone).toBe(8);
    expect(s.resources.wood - outer.resources.wood).toBe(12);
  });

  it('靈泉谷的靈田產量 +25%，預覽等於實際結算', () => {
    const base = edit(openAll(developed()), (x) => {
      x.buildings = x.buildings.filter((b) => b.defId !== 'building.field');
      x.outer.jobs = { field: 6, quarry: 0, lumber: 0, garden: 0, mine: 0, errand: 0 };
    });
    const withField = (region: string) =>
      edit(base, (x) => {
        x.buildings.push({ id: 'b200', defId: 'building.field', region, level: 1, status: 'active', construction: null, crop: 'food' });
      });
    const main = withField('region.main');
    const valley = withField('region.valley');
    expect(planMonth(main, content).production.food).toBe(18);
    expect(planMonth(valley, content).production.food).toBe(22); // 18 × 1.25 = 22.5 → 22
    const plan = planMonth(valley, content);
    const after = advance(valley, 1);
    expect(after.resources.food).toBe(valley.resources.food - plan.foodNeed + 22);
  });

  it('外門先填加成高的靈田', () => {
    const s = edit(openAll(developed()), (x) => {
      x.buildings = x.buildings.filter((b) => b.defId !== 'building.field');
      x.buildings.push(
        { id: 'b201', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
        { id: 'b202', defId: 'building.field', region: 'region.valley', level: 1, status: 'active', construction: null, crop: 'food' },
      );
      x.outer.jobs = { field: 8, quarry: 0, lumber: 0, garden: 0, mine: 0, errand: 0 };
    });
    // 靈泉谷 6 人 × 3 × 1.25 = 22；主峰 2 人 × 3 = 6
    expect(planMonth(s, content).production.food).toBe(28);
  });

  it('種糧食的靈田優先分到工人，避免缺糧', () => {
    const s = edit(openAll(developed()), (x) => {
      x.buildings = x.buildings.filter((b) => b.defId !== 'building.field');
      x.buildings.push(
        { id: 'b201', defId: 'building.field', region: 'region.valley', level: 1, status: 'active', construction: null, crop: 'herb' },
        { id: 'b202', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
      );
      x.outer.jobs = { field: 6, quarry: 0, lumber: 0, garden: 0, mine: 0, errand: 0 };
    });
    const plan = planMonth(s, content);
    expect(plan.production.food).toBe(18);
    expect(plan.production.herb).toBeUndefined();
    expect(workersByBuilding(s, content)).toMatchObject({ b202: 6, b201: 0 });
  });

  it('修復山門後商隊收購額度 +50%', () => {
    const s = developed();
    expect(sellCap(openAll(s), content)).toBe(Math.floor((sellCap(s, content) * 150) / 100));
  });
});

describe('區域靈氣與修煉地點', () => {
  it('主峰與後山的靈氣各自計算', () => {
    let s = openAll(developed());
    expect(qiCapacity(s, content, 'region.back')).toBe(10);
    const mainDemand = qiDemandOf(s, 'region.main');
    s = run(s, { type: 'setSeat', characterId: 'c0', regionId: 'region.back' });
    expect(qiDemandOf(s, 'region.back')).toBe(3);
    expect(qiDemandOf(s, 'region.main')).toBe(mainDemand - 3);
  });

  it('不能搬到未開放或沒有靈氣的區域', () => {
    const s = developed();
    expect(tryRun(s, { type: 'setSeat', characterId: 'c0', regionId: 'region.back' }).ok).toBe(false);
    expect(tryRun(openAll(s), { type: 'setSeat', characterId: 'c0', regionId: 'region.valley' }).ok).toBe(false);
  });

  it('築基的靈氣條件看修煉地點；後山修煉 +10%', () => {
    let s = edit(openAll(developed()), (x) => {
      x.protagonist.realm = { major: 'qi', stage: 9 };
      x.protagonist.xp = 540;
      x.resources.pill_foundation = 1;
    });
    // 主峰有 1 級聚靈陣：10 + 10 = 20，可以突破
    expect(breakthroughOdds(s, content, s.protagonist).blocked).toBeUndefined();
    s = run(s, { type: 'setSeat', characterId: 'c0', regionId: 'region.back' });
    expect(breakthroughOdds(s, content, s.protagonist).blocked).toContain('靈氣容量');
  });

  it('聚靈陣每區一座，符陣傳承的聚靈陣靈氣 +20%', () => {
    const s = openAll(developed());
    expect(tryRun(s, { type: 'build', defId: 'building.array', regionId: 'region.main' }).ok).toBe(false);
    expect(tryRun(s, { type: 'build', defId: 'building.array', regionId: 'region.back' }).ok).toBe(true);
    const talisman = edit(s, (x) => (x.lineage = 'lineage.talisman'));
    expect(qiCapacity(s, content, 'region.main')).toBe(20);
    expect(qiCapacity(talisman, content, 'region.main')).toBe(22);
  });
});

describe('建築多座與拆除', () => {
  it('煉丹房最多兩座，第二座提供第二座丹爐', () => {
    let s = openAll(developed());
    s = run(s, { type: 'build', defId: 'building.alchemy', regionId: 'region.fire' });
    expect(tryRun(s, { type: 'build', defId: 'building.alchemy', regionId: 'region.main' }).ok).toBe(false);
    s = advance(s, 2);
    s = run(s, { type: 'setFurnace', index: 1, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true });
    const plan = planMonth(s, content);
    // 丹方 70% + 技藝 3×2% + 地火峰 10%
    expect(plan.furnaces.find((f) => f.index === 1)?.successBp).toBe(7000 + 3 * 200 + 1000);
  });

  it('拆除退還一半造價並空出槽位；大殿不能拆', () => {
    const s = developed();
    const quarry = s.buildings.find((b) => b.defId === 'building.quarry');
    if (!quarry) throw new Error('缺少採石場');
    const after = run(s, { type: 'demolish', buildingId: quarry.id });
    expect(after.resources.stone).toBe(s.resources.stone + 5);
    expect(after.resources.wood).toBe(s.resources.wood + 7);
    expect(usedSlots(after, 'region.main')).toBe(usedSlots(s, 'region.main') - 1);
    expect(tryRun(s, { type: 'demolish', buildingId: 'b1' }).ok).toBe(false);
  });

  it('拆除煉丹房時，多出的丹爐掌爐者回到日常修煉', () => {
    let s = run(developed(), { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true });
    const room = s.buildings.find((b) => b.defId === 'building.alchemy');
    s = run(s, { type: 'demolish', buildingId: room?.id ?? '' });
    expect(s.disciples[0]?.schedule).toBe('cultivate');
    expect(s.furnaces[0]?.alchemistId).toBeNull();
  });
});

describe('四種傳承開局', () => {
  const start = (lineage: string) =>
    newGame(content, { sectName: '測試宗', protagonistName: '測試', gender: 'female', lineage, seed: 5 });

  it('四種傳承都能開新局，開局內容不同', () => {
    const games = LINEAGES.map(start);
    expect(games[1]?.resources.herb).toBe(50);
    expect(games[1]?.resources.pill_qi).toBe(4);
    expect(games[2]?.beasts).toHaveLength(1);
    expect(games[3]?.resources.lingshi).toBe(340);
    expect(games[0]?.protagonist.skills.combat).toBe(8);
    expect(new Set(games.map((g) => g.protagonist.root.elements.join())).size).toBe(4);
  });

  it('戰鬥特色：劍修攻擊較高、符陣防禦較高', () => {
    const c = fresh().protagonist;
    const unit = (id: string) => unitFromCharacter(c, 'front', content.lineages.get(id) ?? (undefined as never));
    expect(unit('lineage.sword').atk).toBeGreaterThan(unit('lineage.alchemy').atk);
    expect(unit('lineage.talisman').def).toBeGreaterThan(unit('lineage.alchemy').def);
  });

  it('御獸的靈獸隨主人出戰，不佔隊伍名額', () => {
    let s = edit(developed(), (x) => {
      x.lineage = 'lineage.beast';
      x.beasts = [{ id: 'beast1', speciesId: 'beast.cloud_ape', name: '雲紋靈猿', ownerId: 'c0', stage: 'young', growth: 0, task: 'follow' }];
      x.protagonist.realm = { major: 'qi', stage: 6 };
    });
    s = run(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0'], rows: { c0: 'front' } });
    expect(s.exploration?.teamIds).toEqual(['c0']);
    expect(s.exploration?.hp.beast1).toBeGreaterThan(0);
    s = run(s, { type: 'exploreMove', nodeId: 'fork' });
    s = run(s, { type: 'exploreMove', nodeId: 'bat_cave' });
    expect(s.battles[0]?.allies.map((a) => a.id)).toEqual(['c0', 'beast1']);
  });

  it('丹道：成丹率 +10%、靈田 +20%；御獸：採石 +15%', () => {
    const dev = developed();
    const as = (lineage: string) => edit(dev, (x) => (x.lineage = lineage));
    const jobs = { field: 6, quarry: 5, lumber: 0, errand: 0 };
    const sword = planMonth(run(as('lineage.sword'), { type: 'setOuterJobs', jobs }), content);
    const alchemy = planMonth(run(as('lineage.alchemy'), { type: 'setOuterJobs', jobs }), content);
    const beast = planMonth(run(as('lineage.beast'), { type: 'setOuterJobs', jobs }), content);
    expect(sword.production.food).toBe(18);
    expect(alchemy.production.food).toBe(21);
    expect(sword.production.stone).toBe(10);
    expect(beast.production.stone).toBe(11);
  });

  it.each(LINEAGES)('%s：自動玩家玩 40 年，資源不為負且能推進到煉氣後期以上', (lineage) => {
    const { state, negatives } = play(start(lineage), 40 * 12);
    expect(negatives).toBe(0);
    const p = state.protagonist;
    expect(p.realm.major !== 'qi' || p.realm.stage >= 7).toBe(true);
    expect(state.buildings.filter((b) => b.level >= 1).length).toBeGreaterThanOrEqual(6);
  });
});
