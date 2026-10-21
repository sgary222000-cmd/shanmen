import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { STATE_VERSION, type GameState } from '../../src/engine';
import { seedState, nextUint32 } from '../../src/engine/rng';
import { estimatePower, runBattle, unitFromCharacter, type Unit } from '../../src/engine/systems/combat/combat';
import { monthlyXp } from '../../src/engine/systems/cultivation/cultivation';
import { rollRareDrops } from '../../src/engine/systems/exploration/rareDrops';
import { gearStats, innateBonus, newGear, qualityChances } from '../../src/engine/systems/talent/gear';
import type { GearQuality } from '../../src/engine/types';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// 0.11.0：敏捷／暴擊／閃避、三格裝備、法器五級品質、屬性丹、控制符籙、靈根戰力、副本稀有素材、v10 → v11 存檔升級。

const unit = (over: Partial<Unit>): Unit => ({
  key: 'u',
  name: '甲',
  side: 'ally',
  row: 'front',
  hp: 10000,
  maxHp: 10000,
  atk: 100,
  def: 0,
  spd: 10,
  hit: 100,
  res: 0,
  crit: 0,
  dodge: 0,
  mp: 0,
  turns: 0,
  ...over,
});

const rand = (seed: number) => {
  const s = seedState(seed);
  return (n: number) => nextUint32(s) % n;
};
const strategy = { useHealPill: false, useTalismans: false, focusLowest: true };

describe('法器品質', () => {
  it('五級機率合計 100%；品質加成把凡品機率移給較高品質，凡品至少保留 20%', () => {
    for (const bonus of [0, 10, 25, 100]) {
      const ch = qualityChances(bonus);
      const sum = Object.values(ch).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 6);
      expect(ch.common).toBeGreaterThanOrEqual(balance.gear.minCommonPct);
    }
    expect(qualityChances(0).common).toBe(55);
    expect(qualityChances(20).immortal).toBeGreaterThan(qualityChances(0).immortal);
  });

  it('品質越高能力越強；上品以上帶副屬性，仙品帶特效；擲出的分布接近機率', () => {
    const s = developed();
    const weak = gearStats(content, newGear(s, 'equip.fire_blade', 'common'));
    const top = newGear(s, 'equip.fire_blade', 'immortal');
    expect(gearStats(content, top).atk).toBeGreaterThan(weak.atk);
    expect(top.subs).toHaveLength(2);
    expect(top.effect).toBeDefined();
    expect(newGear(s, 'equip.fire_blade', 'superior').subs).toHaveLength(1);
    const count: Record<GearQuality, number> = { common: 0, fine: 0, superior: 0, rare: 0, immortal: 0 };
    for (let i = 0; i < 4000; i++) count[newGear(s, 'equip.fire_blade').quality]++;
    expect(count.common / 40).toBeGreaterThan(50);
    expect(count.common / 40).toBeLessThan(60);
    expect(count.immortal).toBeGreaterThan(0);
  });
});

describe('三格裝備', () => {
  it('兵器、護具、飾品各一格，同格換裝時舊的放回庫房', () => {
    let s = edit(developed(), (x) => {
      x.armory.push(
        { id: 'g901', defId: 'equip.fire_blade', quality: 'fine', subs: [] },
        { id: 'g902', defId: 'equip.crystal_robe', quality: 'common', subs: [] },
        { id: 'g903', defId: 'equip.thunder_ring', quality: 'rare', subs: [{ stat: 'crit', value: 4 }] },
        { id: 'g904', defId: 'equip.cloud_boots', quality: 'common', subs: [] },
      );
    });
    for (const id of ['g901', 'g902', 'g903']) s = run(s, { type: 'equip', characterId: 'c50', itemId: id });
    const d = s.disciples[0]!;
    expect(Object.keys(d.gear).sort()).toEqual(['accessory', 'armor', 'weapon']);
    s = run(s, { type: 'equip', characterId: 'c50', itemId: 'g904' });
    expect(s.disciples[0]?.gear.accessory?.id).toBe('g904');
    expect(s.armory.map((i) => i.id)).toEqual(['g903']);
  });

  it('裝備的暴擊、閃避、敏捷算進戰鬥單位與戰力', () => {
    const s = developed();
    const lineage = content.lineages.get(s.lineage)!;
    const d = s.disciples[0]!;
    const bare = unitFromCharacter(d, 'front', lineage);
    const geared = unitFromCharacter(d, 'front', lineage, undefined, {
      gear: gearStats(content, { id: 'g1', defId: 'equip.thunder_ring', quality: 'common', subs: [] }),
    });
    expect(geared.crit).toBe(bare.crit + 10);
    expect(estimatePower(geared)).toBeGreaterThan(estimatePower(bare));
  });
});

describe('屬性丹', () => {
  it('永久丹每人每種最多 3 顆，效果疊加；超過就不能再服', () => {
    let s = edit(developed(), (x) => {
      x.resources.pill_ape = 5;
    });
    for (let i = 0; i < 3; i++) s = run(s, { type: 'takePermPill', characterId: 'c50', pill: 'pill_ape' });
    expect(s.resources.pill_ape).toBe(2);
    expect(innateBonus(s.disciples[0]!).agi).toBe((balance.attributes.permPills.pill_ape?.agi ?? 0) * 3);
    expect(tryRun(s, { type: 'takePermPill', characterId: 'c50', pill: 'pill_ape' }).ok).toBe(false);
    expect(tryRun(s, { type: 'takePermPill', characterId: 'c50', pill: 'pill_qi' }).ok).toBe(false);
  });
});

describe('暴擊與閃避', () => {
  it('暴擊 50% 時大約一半的攻擊打出 1.5 倍；閃避 40% 時大約四成被避開', () => {
    let crits = 0;
    let hits = 0;
    let dodged = 0;
    let tries = 0;
    for (let i = 0; i < 300; i++) {
      const out = runBattle({
        allies: [unit({ key: 'a', crit: 50 })],
        enemies: [unit({ key: 'b', side: 'enemy', name: '乙', atk: 0, dodge: 40 })],
        strategy,
        healPills: 0,
        randInt: rand(i + 1),
      });
      for (const l of out.log) {
        if (l.startsWith('甲攻擊')) {
          hits++;
          tries++;
          if (l.includes('暴擊')) crits++;
        }
        if (l.includes('避開了甲')) {
          dodged++;
          tries++;
        }
      }
    }
    expect(crits / hits).toBeGreaterThan(0.44);
    expect(crits / hits).toBeLessThan(0.56);
    expect(dodged / tries).toBeGreaterThan(0.34);
    expect(dodged / tries).toBeLessThan(0.46);
  });
});

describe('控制符籙', () => {
  it('定身符讓最強的敵人停手；首領有一半機率掙脫；最多用兩種', () => {
    const enemies = [unit({ key: 'b', side: 'enemy', name: '妖', atk: 300 }), unit({ key: 'c', side: 'enemy', name: '小妖', atk: 10 })];
    const out = runBattle({
      allies: [unit({ key: 'a' })],
      enemies,
      strategy,
      healPills: 0,
      control: ['talisman_bind', 'talisman_break', 'talisman_slow'],
      randInt: rand(3),
    });
    expect(out.controlUsed).toEqual(['talisman_bind', 'talisman_break']);
    expect(out.log.some((l) => l.includes('妖被定身'))).toBe(true);
    let resisted = 0;
    for (let i = 0; i < 200; i++) {
      const o = runBattle({
        allies: [unit({ key: 'a' })],
        enemies: [unit({ key: 'b', side: 'enemy', name: '妖王', boss: true })],
        strategy,
        healPills: 0,
        control: ['talisman_bind'],
        randInt: rand(100 + i),
      });
      if (o.log.some((l) => l.includes('被妖王掙脫'))) resisted++;
    }
    expect(resisted).toBeGreaterThan(70);
    expect(resisted).toBeLessThan(130);
  });

  it('設定戰前用符後，探索戰鬥會扣掉用掉的符', () => {
    let s = edit(developed(), (x) => {
      x.resources.talisman_break = 2;
      x.protagonist.realm = { major: 'core', stage: 3 };
      x.protagonist.skills.combat = 15;
    });
    s = run(s, { type: 'setStrategy', useHealPill: true, focusLowest: true, control: ['talisman_break', 'talisman_break', 'pill_qi'] });
    expect(s.strategy.control).toEqual(['talisman_break']);
    s = run(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0'], rows: { c0: 'front' } });
    let guard = 0;
    while (s.exploration?.status === 'active' && guard++ < 30) {
      const realm = content.secretRealms.get(s.exploration.realmId);
      const node = realm?.nodes.find((n) => n.id === s.exploration?.nodeId);
      if (node?.choices && !s.exploration.choices[node.id]) {
        s = run(s, { type: 'exploreChoice', choiceId: node.choices[0]?.id ?? '' });
        continue;
      }
      const r = tryRun(s, { type: 'exploreMove', nodeId: node?.next[0] ?? '' });
      if (!r.ok) break;
      s = r.state;
    }
    expect(s.resources.talisman_break).toBeLessThan(2);
  });
});

describe('靈根', () => {
  it('品質越高、種類越多，戰鬥加成越高；天靈根最高', () => {
    const base = developed().disciples[0]!;
    const mk = (grade: 'low' | 'mid' | 'high' | 'heaven', elements: ('metal' | 'wood' | 'water' | 'fire' | 'earth')[]) =>
      innateBonus({ ...base, root: { grade, elements } });
    expect(mk('high', ['metal']).atkPct).toBeGreaterThan(mk('mid', ['metal']).atkPct);
    expect(mk('mid', ['metal', 'fire']).critPct).toBeGreaterThan(mk('mid', ['metal']).critPct);
    expect(mk('heaven', ['metal']).atkPct).toBeGreaterThan(mk('high', ['metal', 'wood', 'water']).atkPct);
  });

  it('每多一種靈根修煉快 5%；天靈根修煉最快', () => {
    const s = developed();
    const d = s.disciples[0]!;
    const xp = (grade: 'mid' | 'heaven', elements: ('metal' | 'wood' | 'fire')[]) =>
      monthlyXp(s, content, { ...d, root: { grade, elements } }, false).total;
    expect(xp('mid', ['metal', 'wood', 'fire'])).toBeGreaterThan(xp('mid', ['metal']));
    expect(xp('heaven', ['metal'])).toBeGreaterThan(xp('mid', ['metal', 'wood', 'fire']));
  });
});

describe('副本稀有素材', () => {
  it('古修遺跡首領掉古修殘卷；已會的丹方不會重複掉', () => {
    let scrolls = 0;
    const s: GameState = developed();
    for (let i = 0; i < 100; i++) scrolls += rollRareDrops(s, content, 'secret.ancient_ruins').loot.mat_scroll ?? 0;
    expect(scrolls).toBeGreaterThan(50);
    expect(s.recipes.filter((r) => r === 'recipe.seal_talisman')).toHaveLength(1);
    expect(rollRareDrops(s, content, 'secret.unknown').loot).toEqual({});
  });

  it('庫房的法器可在坊市賣出，品質越高越值錢', () => {
    let s = edit(developed(), (x) => {
      x.buildings.push({ id: 'b190', defId: 'building.market', region: 'region.gate', level: 1, status: 'active', construction: null });
      x.regions['region.gate'] = { status: 'open', construction: null };
      x.armory.push(
        { id: 'g911', defId: 'equip.fire_blade', quality: 'common', subs: [] },
        { id: 'g912', defId: 'equip.fire_blade', quality: 'rare', subs: [] },
      );
    });
    const before = s.resources.lingshi;
    s = run(s, { type: 'sellGear', itemId: 'g911' });
    const low = s.resources.lingshi - before;
    s = run(s, { type: 'sellGear', itemId: 'g912' });
    const high = s.resources.lingshi - before - low;
    expect(high).toBeGreaterThan(low * 3);
    expect(s.armory).toHaveLength(0);
  });
});

describe('存檔', () => {
  it('0.10.x 的存檔升級：舊法器變成凡品、放進對應的格子，庫房字串變成法器，推進一年不出錯', () => {
    const v10 = JSON.parse(readFileSync('tests/fixtures/save-v10-p2e.json', 'utf8'));
    const r = decode(v10);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(10);
    const s = r.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.protagonist.gear.weapon).toMatchObject({ defId: 'equip.ore_blade', quality: 'common' });
    expect(s.disciples[0]?.gear.weapon?.defId).toBe('equip.common');
    expect(s.armory.map((i) => i.defId)).toEqual(['equip.beast_hide', 'equip.ancient_sword']);
    expect(new Set([s.protagonist.gear.weapon?.id, ...s.armory.map((i) => i.id)]).size).toBe(3);
    expect(s.resources.mat_taixu).toBe(0);
    const later = advance(s, 12);
    expect(Object.values(later.resources).every((v) => v >= 0)).toBe(true);
  });
});
