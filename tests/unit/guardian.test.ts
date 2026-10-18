import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { planMonth, type GameState } from '../../src/engine';
import { RESOURCE_IDS } from '../../src/engine/resources';
import { beastFood, guardianBonus, hatchBeast } from '../../src/engine/systems/beasts/beasts';
import { allyUnit } from '../../src/engine/systems/combat/party';
import { monthlyXp } from '../../src/engine/systems/cultivation/cultivation';
import { craftOdds } from '../../src/engine/systems/economy/flows';
import { decode, toEnvelope } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// 批次 F：新靈獸品種、孵化稀有度、護宗神獸（晉升、供奉、加成、挨餓、存檔）。

const nonNegative = (s: GameState) => RESOURCE_IDS.every((id) => s.resources[id] >= 0 && Number.isInteger(s.resources[id]));

/** 御獸傳承、靈獸苑（預設 2 級）、資源充足 */
function garden(level = 2): GameState {
  return edit(developed(), (x) => {
    x.lineage = 'lineage.beast';
    for (const id of Object.keys(x.regions)) x.regions[id] = { status: 'open', construction: null };
    x.buildings.push({ id: 'b90', defId: 'building.beast_garden', region: 'region.valley', level, status: 'active', construction: null });
    x.resources = { ...x.resources, beast_egg: 5, lingshi: 5000, beast_mat: 200, spirit_herb: 200, food: 3000 };
  });
}

/** 放一隻指定品種的成年靈獸 */
const adult = (s: GameState, speciesId: string, id = 'beast1') =>
  edit(s, (x) => {
    x.beasts.push({ id, speciesId, name: content.beasts.get(speciesId)?.name ?? id, ownerId: null, stage: 'adult', growth: 120, task: 'rest' });
  });

describe('靈獸品種', () => {
  it('共九種，孵化依稀有度：常見的多、墨麟最少，九種都孵得到', () => {
    expect(content.beasts.size).toBe(9);
    const s = garden();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 3400; i++) {
      s.resources.beast_egg = 1;
      s.beasts = [];
      hatchBeast(s, content);
      const id = s.beasts[0]!.speciesId;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    expect(Object.keys(counts)).toHaveLength(9);
    const total = [...content.beasts.values()].reduce((n, sp) => n + sp.weight, 0);
    for (const sp of content.beasts.values()) {
      const expected = (3400 * sp.weight) / total;
      expect(Math.abs((counts[sp.id] ?? 0) - expected)).toBeLessThan(expected * 0.35 + 10);
    }
    expect(counts['beast.ink_qilin']).toBeLessThan(counts['beast.jade_rabbit']!);
  });
});

describe('護宗神獸', () => {
  it('需要靈獸苑 2 級與成年靈獸；晉升扣費、不佔名額、不能再出戰，全宗只能一隻', () => {
    expect(tryRun(adult(garden(1), 'beast.fire_fox'), { type: 'ascendGuardian', beastId: 'beast1' }).ok).toBe(false);
    const young = edit(adult(garden(), 'beast.fire_fox'), (x) => {
      x.beasts[0]!.stage = 'young';
    });
    expect(tryRun(young, { type: 'ascendGuardian', beastId: 'beast1' }).ok).toBe(false);

    let s = adult(adult(garden(), 'beast.fire_fox'), 'beast.cloud_ape', 'beast2');
    const before = s.resources.lingshi;
    s = run(s, { type: 'ascendGuardian', beastId: 'beast1' });
    expect(s.beasts[0]?.guardian).toEqual({ level: 1, hungry: false });
    expect(s.resources.lingshi).toBe(before - (balance.beasts.guardian.ascendCost.lingshi ?? 0));
    expect(tryRun(s, { type: 'ascendGuardian', beastId: 'beast2' }).ok).toBe(false);
    expect(tryRun(s, { type: 'setBeast', beastId: 'beast1', ownerId: 'c50', task: 'follow' }).ok).toBe(false);
    // 御獸傳承靈獸苑 2 級可養 5 隻；神獸不佔名額，所以還能再孵 4 隻（beast2 佔 1 隻）
    for (let i = 0; i < 4; i++) s = run(s, { type: 'hatchBeast' });
    expect(tryRun(s, { type: 'hatchBeast' }).ok).toBe(false);
    expect(beastFood(content, s.beasts[0]!)).toBe((2 + 1) * balance.beasts.guardian.foodMultiplier);
  });

  it('各品種的加成真的反映在工坊、產量、修煉、戰鬥與每月資源上', () => {
    const base = garden();
    const ascended = (speciesId: string) => run(adult(base, speciesId), { type: 'ascendGuardian', beastId: 'beast1' });

    const fox = ascended('beast.fire_fox');
    const bp = (s: GameState) => craftOdds(s, content, 'alchemy', 'recipe.qi_pill', 'c50').bp;
    expect(bp(fox) - bp(base)).toBe(200);

    const withWorkers = (s: GameState) =>
      edit(s, (x) => {
        x.outer.count = Math.max(x.outer.count, 10);
        x.outer.jobs.field = 10;
      });
    // 加成太小時會被逐座建築的取整吃掉，用 3 級神獸（+15%）檢查
    const ape = withWorkers(run(run(ascended('beast.cloud_ape'), { type: 'raiseGuardian' }), { type: 'raiseGuardian' }));
    expect(planMonth(ape, content).production.food ?? 0).toBeGreaterThan(planMonth(withWorkers(base), content).production.food ?? 0);

    const luan = ascended('beast.azure_luan');
    const c50 = (s: GameState) => s.disciples.find((c) => c.id === 'c50')!;
    expect(monthlyXp(luan, content, c50(luan), false).parts.join()).toContain('棲梧青鸞 +4%');

    const wolf = ascended('beast.frost_wolf');
    const turtle = ascended('beast.black_turtle');
    const unit = (s: GameState) => allyUnit(s, content, c50(s), 'front');
    expect(unit(wolf).atk).toBeGreaterThanOrEqual(unit(base).atk);
    expect(unit(turtle).maxHp).toBeGreaterThan(unit(base).maxHp);

    const toad = ascended('beast.gold_toad');
    expect((planMonth(toad, content).production.lingshi ?? 0) - (planMonth(base, content).production.lingshi ?? 0)).toBe(15);
  });

  it('供奉升到 3 級後不能再升；加成按等級加倍', () => {
    let s = run(adult(garden(), 'beast.gold_toad'), { type: 'ascendGuardian', beastId: 'beast1' });
    s = run(s, { type: 'raiseGuardian' });
    s = run(s, { type: 'raiseGuardian' });
    expect(s.beasts[0]?.guardian?.level).toBe(3);
    expect(guardianBonus(s, content).monthly.lingshi).toBe(45);
    expect(tryRun(s, { type: 'raiseGuardian' }).ok).toBe(false);
  });

  it('沒吃飽的下個月加成暫停，吃飽後恢復', () => {
    let s = run(adult(garden(), 'beast.gold_toad'), { type: 'ascendGuardian', beastId: 'beast1' });
    s = edit(s, (x) => {
      x.resources.food = 0;
      x.outer.jobs.field = 0;
    });
    s = advance(s, 1);
    expect(s.beasts[0]?.guardian?.hungry).toBe(true);
    expect(guardianBonus(s, content).monthly.lingshi).toBeUndefined();
    s = edit(s, (x) => {
      x.resources.food = 2000;
    });
    s = advance(s, 1);
    expect(s.beasts[0]?.guardian?.hungry).toBe(false);
    expect(guardianBonus(s, content).monthly.lingshi).toBe(15);
  });

  it('存檔讀回後神獸還在；有神獸推進 10 年資源不為負', () => {
    let s = run(adult(garden(), 'beast.ink_qilin'), { type: 'ascendGuardian', beastId: 'beast1' });
    const r = decode(JSON.parse(JSON.stringify(toEnvelope(s, '2026-10-18T00:00:00.000Z'))));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.beasts[0]?.guardian).toEqual({ level: 1, hungry: false });
    s = advance(s, 120);
    expect(nonNegative(s)).toBe(true);
    expect(s.beasts.find((b) => b.guardian)).toBeDefined();
  });
});
