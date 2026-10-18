import { describe, expect, it } from 'vitest';
import { content } from '../../src/content/registry';
import type { GameState } from '../../src/engine';
import { advance, developed, edit, run } from './helpers';

function walk(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.exploration?.status === 'active' && guard++ < 20) {
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

function strongTeam(seed = 1): GameState {
  return edit(developed(seed), (x) => {
    x.protagonist.realm = { major: 'qi', stage: 9 };
    const d = x.disciples[0];
    if (d) d.realm = { major: 'qi', stage: 9 };
  });
}

const enter = (s: GameState) =>
  run(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0', 'c50'], rows: { c0: 'front', c50: 'back' } });

describe('秘境探索', () => {
  it('首次通關取得丹方，物資月底入庫', () => {
    let s = walk(enter(strongTeam()));
    expect(s.exploration?.status).toBe('completed');
    expect(s.recipes).toContain('recipe.foundation_pill');
    expect(s.claimedRewards).toContain('reward.abandoned_cave.first_clear');
    const lingshiBefore = s.resources.lingshi;
    expect(s.pendingLoot.lingshi).toBeGreaterThan(0);
    s = run(s, { type: 'exploreClose' });
    s = advance(s);
    expect(s.pendingLoot).toEqual({});
    expect(s.resources.lingshi).toBeGreaterThan(lingshiBefore - 100);
  });

  it('首次通關獎勵只能領一次', () => {
    let s = walk(enter(strongTeam()));
    s = run(s, { type: 'exploreClose' });
    s = advance(s);
    s = edit(s, (x) => {
      x.protagonist.injuryMonths = 0;
      x.protagonist.health = 100;
      for (const d of x.disciples) {
        d.injuryMonths = 0;
        d.health = 100;
      }
    });
    s = walk(enter(s));
    expect(s.exploration?.status).toBe('completed');
    expect(s.claimedRewards.filter((r) => r === 'reward.abandoned_cave.first_clear').length).toBe(1);
    expect(s.exploration?.log.some((l) => l.startsWith('首次通關'))).toBe(false);
  });

  it('從同一份存檔重來，結果完全相同（無法靠重開畫面重擲）', () => {
    const saved = JSON.stringify(strongTeam(3));
    const a = walk(enter(JSON.parse(saved)));
    const b = walk(enter(JSON.parse(saved)));
    expect(JSON.stringify(a.battles)).toBe(JSON.stringify(b.battles));
    expect(a.pendingLoot).toEqual(b.pendingLoot);
  });

  it('戰敗後人物受傷但遊戲可以繼續', () => {
    let s = edit(developed(), (x) => {
      x.protagonist.realm = { major: 'qi', stage: 1 };
      x.protagonist.skills.combat = 0;
      x.resources.pill_heal = 0;
    });
    s = run(s, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: ['c0'], rows: { c0: 'front' } });
    s = walk(s);
    expect(['defeated', 'retreated']).toContain(s.exploration?.status);
    expect(s.protagonist.injuryMonths).toBeGreaterThan(0);
    s = run(s, { type: 'exploreClose' });
    s = advance(s, 3);
    expect(s.date.month).toBe(4);
  });

  it('撤退保留一半物資；劍修保留 70%', () => {
    for (const [lineage, pct] of [['lineage.alchemy', 50], ['lineage.sword', 70]] as const) {
      let s = enter(edit(strongTeam(), (x) => (x.lineage = lineage)));
      s = run(s, { type: 'exploreMove', nodeId: 'fork' });
      s = run(s, { type: 'exploreMove', nodeId: 'herb_garden' });
      const loot = s.exploration?.loot.herb ?? 0;
      s = run(s, { type: 'exploreRetreat' });
      expect(s.pendingLoot.herb).toBe(Math.floor((loot * pct) / 100));
    }
  });
});
