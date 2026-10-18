import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { buildContent, rawContent } from '../../src/content/registry';
import { applyCommand, monthIndex, planMonth, STATE_VERSION, type GameState, type ResourceId } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { benchCount, newBuildOptions } from '../../src/engine/systems/buildings/buildings';
import { runBattle, unitFromCharacter, unitFromEnemy } from '../../src/engine/systems/combat/combat';
import { refreshBoard } from '../../src/engine/systems/commissions/commissions';
import { craftOdds } from '../../src/engine/systems/economy/flows';
import { buyPriceAt, MARKET_GOODS, rollMarket, sellPriceAt } from '../../src/engine/systems/economy/market';
import { balance as B } from '../../src/content/balance';
import { decode } from '../../src/save/codec';
import { botTurn, type BotRoute } from '../../tools/bot';
import { advance, content, developed, edit, fresh, run, tryRun } from './helpers';

// P1 批次 B：新資源與建築、煉器與製符、坊市、委託榜與聲望、v3 → v4 存檔升級。

const openAll = (s: GameState) =>
  edit(s, (x) => {
    for (const id of Object.keys(x.regions)) x.regions[id] = { status: 'open', construction: null };
  });

/** 在指定區域放一座已完工的建築。 */
const place = (s: GameState, defId: string, region: string, level = 1) =>
  edit(s, (x) => {
    x.buildings.push({ id: `b${x.nextId++}`, defId, region, level, status: 'active', construction: null });
  });

const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));

describe('新建築與內容資料', () => {
  it('坊市只能蓋在山門、藥園只能在靈泉谷或後山、靈礦場只能在外山或地火峰', () => {
    const s = openAll(developed());
    const can = (region: string, defId: string) => newBuildOptions(s, content, region).some((o) => o.def.id === defId);
    expect(can('region.gate', 'building.market')).toBe(true);
    expect(can('region.main', 'building.market')).toBe(false);
    expect(can('region.valley', 'building.garden')).toBe(true);
    expect(can('region.back', 'building.garden')).toBe(true);
    expect(can('region.main', 'building.garden')).toBe(false);
    expect(can('region.fire', 'building.mine')).toBe(true);
    expect(can('region.outer', 'building.mine')).toBe(true);
    expect(can('region.main', 'building.mine')).toBe(false);
    expect(can('region.fire', 'building.forge')).toBe(true);
    expect(can('region.back', 'building.talisman')).toBe(true);
  });

  it('內容驗證會擋下錯誤的引用', () => {
    const bad = structuredClone(rawContent) as typeof rawContent & { lineages: { start: { recipes: string[] } }[] };
    (bad.lineages[0] as { start: { recipes: string[] } }).start.recipes = ['recipe.nothing'];
    expect(() => buildContent(bad)).toThrow('不存在的配方');
    const noLabor = structuredClone(rawContent);
    noLabor.commissions = (noLabor.commissions as { kind: string }[]).filter((c) => c.kind !== 'labor');
    expect(() => buildContent(noLabor)).toThrow('勞務委託');
  });

  it('傳承開局配方不同：丹道會培元丹、御獸會獸骨法器、符陣會護身符', () => {
    expect(fresh(1, 'lineage.alchemy').recipes).toContain('recipe.peiyuan_pill');
    expect(fresh(1, 'lineage.beast').recipes).toContain('recipe.artifact_beast');
    expect(fresh(1, 'lineage.talisman').recipes).toContain('recipe.guard_talisman');
    expect(fresh(1, 'lineage.sword').recipes).not.toContain('recipe.guard_talisman');
    expect(fresh(1, 'lineage.sword').recipes).toContain('recipe.fire_talisman');
  });
});

describe('產業鏈與工坊', () => {
  const withTalisman = () => {
    const s = place(developed(), 'building.talisman', 'region.main');
    return edit(s, (x) => {
      x.resources.wood = 30;
      x.resources.paper = 0;
    });
  };

  it('藥園產靈藥、靈礦場產靈礦，地火峰礦場 +25%；預覽等於實際結算', () => {
    let s = place(place(openAll(developed()), 'building.garden', 'region.valley'), 'building.mine', 'region.fire');
    s = run(s, { type: 'setOuterJobs', jobs: { garden: 4, mine: 4 } });
    const plan = planMonth(s, content);
    expect(plan.production.spirit_herb).toBe(5); // 4 × 1 × 125%
    expect(plan.production.ore).toBe(5);
    const next = advance(s);
    expect(next.resources.spirit_herb - s.resources.spirit_herb).toBe(5);
    expect(next.resources.ore - s.resources.ore).toBe(5);
  });

  it('符陣閣：製符紙再畫火符，材料預覽等於實際扣除', () => {
    let s = withTalisman();
    expect(benchCount(s, content, 'talisman')).toBe(1);
    s = run(s, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: 'c50', recipeId: 'recipe.paper', repeat: true });
    expect(s.disciples[0]?.schedule).toBe('talisman');
    const plan = planMonth(s, content);
    expect(plan.consumption.wood).toBe(3);
    const next = advance(s);
    expect(s.resources.wood - next.resources.wood).toBe(3);
    const made = next.resources.paper;
    expect([0, 4]).toContain(made);
    expect(nonNegative(next)).toBe(true);
  });

  it('材料不足時停工，不會產生負庫存', () => {
    let s = edit(withTalisman(), (x) => {
      x.resources.paper = 1;
    });
    s = run(s, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: 'c50', recipeId: 'recipe.fire_talisman', repeat: true });
    const plan = planMonth(s, content);
    expect(plan.furnaces[0]?.runs).toBe(false);
    expect(plan.furnaces[0]?.reason).toContain('材料不足');
    const next = advance(s);
    expect(next.resources.paper).toBe(1);
    expect(nonNegative(next)).toBe(true);
  });

  it('庫存保留量：做完後會低於保留量就停工', () => {
    let s = edit(developed(), (x) => {
      x.resources.herb = 12;
    });
    s = run(s, { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true, keep: 10 });
    expect(s.furnaces[0]?.keep).toBe(10);
    let plan = planMonth(s, content);
    expect(plan.furnaces[0]?.runs).toBe(false);
    expect(plan.furnaces[0]?.reason).toContain('保留量 10');
    s = edit(s, (x) => {
      x.resources.herb = 13;
    });
    plan = planMonth(s, content);
    expect(plan.furnaces[0]?.runs).toBe(true);
    // 保留量設回 0 即取消
    s = run(s, { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true, keep: 0 });
    expect(s.furnaces[0]?.keep).toBeUndefined();
  });

  it('配方要在對的工坊做，且要先學會', () => {
    const s = withTalisman();
    expect(tryRun(s, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true }).ok).toBe(false);
    const r = tryRun(s, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: 'c50', recipeId: 'recipe.guard_talisman', repeat: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('尚未習得');
    expect(tryRun(s, { type: 'setFurnace', station: 'forge', index: 0, alchemistId: 'c50', recipeId: 'recipe.artifact_ore', repeat: true }).ok).toBe(false);
  });

  it('同一人只能負責一個爐位', () => {
    let s = withTalisman();
    s = run(s, { type: 'setFurnace', index: 0, alchemistId: 'c50', recipeId: 'recipe.qi_pill', repeat: true });
    const r = tryRun(s, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: 'c50', recipeId: 'recipe.paper', repeat: true });
    expect(r.ok).toBe(false);
  });

  it('成功率：地火峰煉器 +10%、符陣傳承製符 +10%、煉器坊 2 級 +10%', () => {
    let s = place(openAll(developed()), 'building.forge', 'region.fire', 2);
    s = run(s, { type: 'setFurnace', station: 'forge', index: 0, alchemistId: 'c50', recipeId: 'recipe.artifact_ore', repeat: true });
    expect(craftOdds(s, content, 'forge', 'recipe.artifact_ore', 'c50', 0).bp).toBe(6500 + 1000 + 1000);
    const t = edit(place(developed(), 'building.talisman', 'region.main'), (x) => {
      x.lineage = 'lineage.talisman';
    });
    expect(craftOdds(t, content, 'talisman', 'recipe.fire_talisman', 'c50', 0).bp).toBe(7000 + 1000);
    expect(craftOdds(t, content, 'talisman', 'recipe.paper', 'c50', 0).bp).toBe(balance.craft.maxBp);
  });

  it('拆除工坊時，多出的爐位工作者回到日常修煉', () => {
    let s = withTalisman();
    s = run(s, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: 'c50', recipeId: 'recipe.paper', repeat: true });
    const id = s.buildings.find((b) => b.defId === 'building.talisman')?.id ?? '';
    s = run(s, { type: 'demolish', buildingId: id });
    expect(s.disciples[0]?.schedule).toBe('cultivate');
    expect(s.workshops.talisman[0]?.alchemistId).toBeNull();
  });

  it('築基修士優先服培元丹（修為 +120），沒有時改服聚氣丹', () => {
    let s = edit(developed(), (x) => {
      x.protagonist.realm = { major: 'foundation', stage: 1 };
      x.protagonist.takePill = true;
      x.resources.pill_peiyuan = 1;
      x.resources.pill_qi = 5;
    });
    let plan = planMonth(s, content);
    expect(plan.peiyuanTakers).toContain('c0');
    expect(plan.consumption.pill_peiyuan).toBe(1);
    expect(plan.consumption.pill_qi ?? 0).toBe(0);
    s = advance(s);
    plan = planMonth(s, content);
    expect(plan.peiyuanTakers).not.toContain('c0');
    expect(plan.consumption.pill_qi).toBe(1);
  });
});

describe('戰鬥中的符籙', () => {
  it('戰鬥開始各用一張護身符、火符；關閉策略則不用', () => {
    const s = developed();
    const lineage = content.lineages.get(s.lineage);
    const wolf = content.enemies.get('enemy.wild_wolf');
    if (!lineage || !wolf) throw new Error('missing');
    const fight = (useTalismans: boolean) =>
      runBattle({
        allies: [unitFromCharacter(s.protagonist, 'front', lineage)],
        enemies: [unitFromEnemy(wolf, 0)],
        strategy: { useHealPill: false, useTalismans, focusLowest: true },
        healPills: 0,
        talismans: { fire: 3, guard: 3 },
        randInt: () => 0,
      });
    const on = fight(true);
    expect(on.talismansUsed).toEqual({ fire: 1, guard: 1 });
    expect(on.log[0]).toContain('護身符');
    expect(on.log[1]).toContain(`${balance.talismanCombat.fireDamage} 傷害`);
    expect(fight(false).talismansUsed).toEqual({ fire: 0, guard: 0 });
  });

  it('火符打死所有敵人時直接獲勝', () => {
    const s = developed();
    const lineage = content.lineages.get(s.lineage);
    const wolf = content.enemies.get('enemy.wild_wolf');
    if (!lineage || !wolf) throw new Error('missing');
    const weak = { ...unitFromEnemy(wolf, 0), hp: 5, maxHp: 5 };
    const out = runBattle({
      allies: [unitFromCharacter(s.protagonist, 'front', lineage)],
      enemies: [weak],
      strategy: { useHealPill: false, useTalismans: true, focusLowest: true },
      healPills: 0,
      talismans: { fire: 1, guard: 0 },
      randInt: () => 0,
    });
    expect(out.result).toBe('win');
    expect(out.rounds).toBe(1);
  });
});

describe('坊市', () => {
  const withMarket = (s = developed()) => place(openAll(s), 'building.market', 'region.gate');

  it('沒有坊市不能交易；有坊市後可買賣，貨量用完就不能再買', () => {
    const s0 = developed();
    expect(tryRun(s0, { type: 'marketBuy', resource: 'stone', lots: 1 }).ok).toBe(false);
    let s = withMarket(s0);
    const g = s.market.goods.stone;
    if (!g) throw new Error('missing');
    const price = sellPriceAt(B.market.goods.stone?.base ?? 0, g.pct);
    s = run(s, { type: 'marketSell', resource: 'stone', lots: 1 });
    expect(s.resources.stone).toBe(1000 - 25);
    expect(s.resources.lingshi).toBe(2000 + price);
    const r = tryRun(s, { type: 'marketBuy', resource: 'stone', lots: g.stock + 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('只剩');
    s = run(s, { type: 'marketBuy', resource: 'stone', lots: g.stock });
    expect(tryRun(s, { type: 'marketBuy', resource: 'stone', lots: 1 }).ok).toBe(false);
  });

  it('價格永遠在基準價 ±30% 內，買價一定高於賣價（模擬 600 個月）', () => {
    let s = developed(3);
    for (let i = 0; i < 600; i++) {
      rollMarket(s);
      for (const id of MARKET_GOODS) {
        const g = s.market.goods[id];
        const def = B.market.goods[id];
        if (!g || !def) throw new Error(`missing ${id}`);
        expect(g.pct).toBeGreaterThanOrEqual(70);
        expect(g.pct).toBeLessThanOrEqual(130);
        expect(buyPriceAt(def.base, g.pct, 5)).toBeGreaterThan(sellPriceAt(def.base, g.pct));
        expect(g.stock).toBeGreaterThan(0);
      }
    }
  });

  it('同月買了再賣一定虧本；與山下商隊之間也無法套利（所有行情、含聲望折扣）', () => {
    for (const id of MARKET_GOODS) {
      const def = B.market.goods[id];
      if (!def) continue;
      for (let pct = 70; pct <= 130; pct++) {
        for (let discount = 0; discount <= B.market.maxDiscount; discount++) {
          const buy = buyPriceAt(def.base, pct, discount);
          const sell = sellPriceAt(def.base, pct);
          expect(buy).toBeGreaterThan(sell);
          // 從坊市買來賣給商隊：商隊給的錢不能多於坊市買價
          const caravanPer = (B.trade.sellPer as Partial<Record<ResourceId, number>>)[id];
          const caravanPill = (B.trade.sellPill as Partial<Record<ResourceId, number>>)[id];
          const caravanValue = caravanPer ? def.lot / caravanPer : caravanPill ? def.lot * caravanPill : 0;
          expect(caravanValue).toBeLessThanOrEqual(buy);
        }
        // 從商隊買糧賣給坊市：坊市收購價不能高於商隊賣價
        if (id === 'food') expect(sellPriceAt(def.base, pct)).toBeLessThanOrEqual(def.lot / B.trade.foodPerLingshi);
      }
    }
  });

  it('坊市 2 級貨量 +60%；聲望讓買價便宜', () => {
    const s1 = withMarket();
    const s2 = edit(s1, (x) => {
      const m = x.buildings.find((b) => b.defId === 'building.market');
      if (m) m.level = 2;
      x.reputation = 100;
    });
    const g = s1.market.goods.food;
    if (!g) throw new Error('missing');
    const r1 = tryRun(s1, { type: 'marketBuy', resource: 'food', lots: Math.floor((g.stock * 160) / 100) });
    expect(r1.ok).toBe(g.stock >= Math.floor((g.stock * 160) / 100));
    expect(tryRun(s2, { type: 'marketBuy', resource: 'food', lots: Math.floor((g.stock * 160) / 100) }).ok).toBe(true);
    const base = B.market.goods.food?.base ?? 0;
    expect(buyPriceAt(base, 130, 5)).toBeLessThanOrEqual(buyPriceAt(base, 130, 0));
  });

  it('行情用存檔裡的亂數：存讀檔後推進月份得到同樣的行情', () => {
    const s = withMarket();
    const a = advance(s, 3);
    const b = advance(JSON.parse(JSON.stringify(s)) as GameState, 3);
    expect(a.market).toEqual(b.market);
    expect(a.commissions).toEqual(b.commissions);
  });

  it('可以在坊市買配方', () => {
    let s = withMarket();
    s = run(s, { type: 'buyRecipe', recipeId: 'recipe.guard_talisman' });
    expect(s.recipes).toContain('recipe.guard_talisman');
    expect(s.resources.lingshi).toBe(2000 - 80);
    expect(tryRun(s, { type: 'buyRecipe', recipeId: 'recipe.guard_talisman' }).ok).toBe(false);
    expect(tryRun(s, { type: 'buyRecipe', recipeId: 'recipe.foundation_pill' }).ok).toBe(false);
  });
});

describe('委託榜與聲望', () => {
  it('每月 3–5 件，且一定有一件勞務委託（模擬 200 個月）', () => {
    let s = fresh(11);
    for (let i = 0; i < 200; i++) {
      s = advance(s);
      expect(s.commissions.length).toBeGreaterThanOrEqual(3);
      expect(s.commissions.length).toBeLessThanOrEqual(5);
      expect(s.commissions.some((c) => c.kind === 'labor')).toBe(true);
      expect(new Set(s.commissions.map((c) => c.templateId)).size).toBe(s.commissions.length);
    }
  });

  it('勞務委託：派出的外門本月不能分工，報酬依人數立即入庫，月底歸隊', () => {
    let s = fresh(2);
    const job = s.commissions.find((c) => c.kind === 'labor');
    if (!job) throw new Error('missing');
    const n = Math.min(job.workers ?? 0, s.outer.count);
    const before = s.resources.lingshi;
    s = run(s, { type: 'acceptCommission', commissionId: job.id, workers: n });
    expect(s.outer.labor).toBe(n);
    expect(s.resources.lingshi).toBe(before + (job.reward.lingshi ?? 0) * n);
    expect(s.reputation).toBe(job.reputation);
    expect(s.commissions.some((c) => c.id === job.id)).toBe(false);
    const r = tryRun(s, { type: 'setOuterJobs', jobs: { errand: s.outer.count - n + 1 } });
    expect(r.ok).toBe(false);
    s = advance(s);
    expect(s.outer.labor).toBe(0);
  });

  it('交付委託需要物資，交出後得到報酬', () => {
    let s = developed(4);
    s = edit(s, (x) => {
      x.commissions = [];
      refreshBoard(x, content);
      x.commissions.push({
        id: 'jobX',
        templateId: 'commission.stone',
        title: '交付石材',
        text: '',
        kind: 'deliver',
        deliver: { stone: 40 },
        reward: { lingshi: 14 },
        reputation: 1,
        guard: false,
        expires: monthIndex(x.date) + 1,
      });
    });
    s = run(s, { type: 'acceptCommission', commissionId: 'jobX' });
    expect(s.resources.stone).toBe(960);
    expect(s.resources.lingshi).toBe(2014);
    const poor = edit(s, (x) => {
      x.resources.stone = 0;
      x.commissions.push({ ...structuredClone(x.commissions[0] ?? ({} as never)), id: 'jobY', kind: 'deliver', deliver: { stone: 40 }, reward: { lingshi: 1 } });
    });
    expect(tryRun(poor, { type: 'acceptCommission', commissionId: 'jobY' }).ok).toBe(false);
  });

  it('護衛委託：當場自動戰鬥，隊員本月外出；劍修護衛報酬 +30%', () => {
    const setup = (lineage: string) =>
      edit(fresh(5, lineage), (x) => {
        x.protagonist.realm = { major: 'foundation', stage: 1 };
        x.commissions = [
          {
            id: 'jobE',
            templateId: 'commission.wolves',
            title: '除去傷人妖狼',
            text: '',
            kind: 'escort',
            enemies: ['enemy.wild_wolf'],
            maxTeam: 3,
            reward: { lingshi: 20 },
            reputation: 3,
            guard: true,
            expires: monthIndex(x.date),
          },
        ];
      });
    const sword = run(setup('lineage.sword'), { type: 'acceptCommission', commissionId: 'jobE', teamIds: ['c0'] });
    expect(sword.protagonist.schedule).toBe('explore');
    expect(sword.battles[0]?.title).toBe('委託・除去傷人妖狼');
    expect(sword.battles[0]?.result).toBe('win');
    expect(sword.resources.lingshi - setup('lineage.sword').resources.lingshi).toBe(26);
    const alchemy = run(setup('lineage.alchemy'), { type: 'acceptCommission', commissionId: 'jobE', teamIds: ['c0'] });
    expect(alchemy.resources.lingshi - setup('lineage.alchemy').resources.lingshi).toBe(20);
    // 已外出的人不能再出戰
    expect(tryRun(sword, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0'], rows: { c0: 'front' } }).ok).toBe(false);
  });

  it('過期的委託在月底撤下', () => {
    let s = fresh(6);
    const ids = s.commissions.filter((c) => c.expires === monthIndex(s.date)).map((c) => c.id);
    s = advance(s);
    for (const id of ids) expect(s.commissions.some((c) => c.id === id)).toBe(false);
  });

  it('聲望讓招生多收外門', () => {
    let s = edit(developed(7), (x) => {
      x.reputation = 60;
      x.outer.count = 0;
      x.nextRecruitMonth = monthIndex(x.date) + 1;
    });
    s = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    const ev = s.events.find((e) => e.kind === 'recruitment');
    expect(ev?.outerJoined).toBeGreaterThanOrEqual(balance.recruit.outerMin + 3);
  });

  it('資源全部歸零的宗門，只靠勞務委託 12 個月內恢復（不需任何建築）', () => {
    const broke = (base: GameState) =>
      edit(base, (x) => {
        for (const id of RESOURCE_IDS) x.resources[id] = 0;
        x.outer.jobs = { field: 0, quarry: 0, lumber: 0, garden: 0, mine: 0, errand: 0 };
        x.outer.count = 12;
      });
    const recover = (start: GameState) => {
      let s = start;
      let earned = 0;
      for (let m = 0; m < 12; m++) {
        for (const c of [...s.commissions]) {
          if (c.kind !== 'labor') continue;
          const r = applyCommand(s, content, { type: 'acceptCommission', commissionId: c.id });
          if (r.ok) {
            earned += r.state.resources.lingshi - s.resources.lingshi;
            s = r.state;
          }
        }
        s = advance(s);
        expect(nonNegative(s)).toBe(true);
      }
      return { s, earned };
    };
    // 大殿殘破、沒有任何產業的宗門：糧食與靈石都回升
    const bare = recover(broke(fresh(8)));
    expect(bare.s.resources.lingshi).toBeGreaterThanOrEqual(100);
    expect(bare.s.resources.food).toBeGreaterThanOrEqual(30);
    expect(bare.s.outer.count).toBeGreaterThanOrEqual(12);
    // 已發展的宗門（每月維護 23 靈石）：委託收入足以讓糧食回升、外門不離開，並支付部分維護
    const big = recover(broke(developed(8)));
    expect(big.earned).toBeGreaterThanOrEqual(150);
    expect(big.s.resources.food).toBeGreaterThanOrEqual(30);
    expect(big.s.outer.count).toBeGreaterThanOrEqual(12);
  });
});

describe('v3 存檔升級到 v4', () => {
  const v3 = JSON.parse(readFileSync('tests/fixtures/save-v3-p1a.json', 'utf8'));

  it('批次 A 的實際存檔（符陣、第 9 年）可以讀取並升級', () => {
    const r = decode(v3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(3);
    const s = r.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.resources).toMatchObject(v3.world.resources);
    expect(s.resources.ore).toBe(0);
    expect(s.outer.jobs).toMatchObject(v3.world.outer.jobs);
    expect(s.outer.jobs.garden).toBe(0);
    expect(s.recipes).toContain('recipe.guard_talisman');
    expect(s.recipes).toContain('recipe.paper');
    expect(s.commissions.some((c) => c.kind === 'labor')).toBe(true);
    expect(Object.keys(s.market.goods).length).toBe(MARKET_GOODS.length);
    expect(s.buildings).toEqual(v3.world.buildings);
    expect(s.strategy.useTalismans).toBe(true);
  });

  it('升級結果固定，主峰收支與升級前相同，之後推進 24 個月不出錯', () => {
    const a = decode(v3);
    const b = decode(JSON.parse(JSON.stringify(v3)));
    if (!a.ok || !b.ok) throw new Error('decode failed');
    expect(a.state).toEqual(b.state);
    const plan = planMonth(a.state, content);
    expect(plan.unpaidBuildings).toEqual([]);
    let s = a.state;
    for (let i = 0; i < 24; i++) {
      s = botTurn(s, content, []);
      s = advance(s);
      expect(nonNegative(s)).toBe(true);
    }
  });
});

describe('經營路線（模擬 100 年不卡死）', () => {
  for (const route of ['craft', 'commission'] as BotRoute[]) {
    it(`${route} 路線：100 年資源不為負，主角能築基，工坊或委託實際有在運作`, () => {
      let s = fresh(2468, 'lineage.sword');
      let crafted = 0;
      let jobs = 0;
      for (let m = 0; m < 1200; m++) {
        const before = s;
        s = botTurn(s, content, [], route);
        jobs += before.commissions.filter((c) => !s.commissions.some((x) => x.id === c.id)).length;
        const r = applyCommand(s, content, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
        if (!r.ok) throw new Error(r.error);
        crafted += r.report?.lines.filter((l) => l.includes('畫成') || l.includes('法器')).length ?? 0;
        s = r.state;
        expect(nonNegative(s)).toBe(true);
      }
      expect(s.protagonist.realm.major).toBe('foundation');
      if (route === 'craft') expect(crafted).toBeGreaterThan(50);
      else expect(jobs).toBeGreaterThan(200);
    }, 60_000);
  }
});
