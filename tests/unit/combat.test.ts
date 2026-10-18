import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/registry';
import { seedState, nextUint32 } from '../../src/engine/rng';
import { runBattle, unitFromEnemy, type Unit } from '../../src/engine/systems/combat/combat';

function randomUnit(r: () => number, side: 'ally' | 'enemy', i: number): Unit {
  return {
    key: `${side}${i}`,
    name: `${side}${i}`,
    side,
    row: r() % 2 ? 'front' : 'back',
    hp: 1 + (r() % 400),
    maxHp: 400,
    atk: r() % 60,
    def: r() % 80,
    spd: r() % 30,
    hit: r() % 20,
    res: r() % 20,
    mp: r() % 50,
    skill: { name: '技', multiplierPct: 100 + (r() % 100), mpCost: 10, piercePct: r() % 50 },
    turns: 0,
  };
}

describe('自動戰鬥', () => {
  it('10,000 場隨機戰鬥全部在回合上限內結束', () => {
    const seed = seedState(2024);
    const r = () => nextUint32(seed);
    for (let i = 0; i < 10000; i++) {
      const allies = Array.from({ length: 1 + (r() % 5) }, (_, k) => randomUnit(r, 'ally', k));
      const enemies = Array.from({ length: 1 + (r() % 5) }, (_, k) => randomUnit(r, 'enemy', k));
      const out = runBattle({
        allies,
        enemies,
        strategy: { useHealPill: !!(r() % 2), focusLowest: !!(r() % 2) },
        healPills: r() % 5,
        randInt: (n) => r() % n,
      });
      expect(out.rounds).toBeLessThanOrEqual(30);
      expect(['win', 'lose', 'draw']).toContain(out.result);
    }
  });

  it('同樣的輸入與亂數得到同樣的結果', () => {
    const golem = content.enemies.get('enemy.stone_golem');
    if (!golem) throw new Error('missing');
    const make = () => {
      const s = seedState(5);
      return runBattle({
        allies: [randomUnit(() => 7, 'ally', 0)],
        enemies: [unitFromEnemy(golem, 0)],
        strategy: { useHealPill: true, focusLowest: true },
        healPills: 2,
        randInt: (n) => nextUint32(s) % n,
      });
    };
    expect(JSON.stringify(make())).toBe(JSON.stringify(make()));
  });
});
