import { balance } from '../../content/balance';
import type { ContentPack } from '../../content/registry';
import { ensure } from '../errors';
import { seedAll } from '../rng';
import type { GameState } from '../types';

export const STATE_VERSION = 2;

export interface NewGameOptions {
  sectName: string;
  protagonistName: string;
  gender: 'male' | 'female';
  lineage: string;
  seed: number;
}

export function newGame(content: ContentPack, opts: NewGameOptions): GameState {
  const sectName = opts.sectName.trim();
  const protagonistName = opts.protagonistName.trim();
  ensure(sectName.length >= 1 && sectName.length <= 12, '宗門名稱需為 1–12 字');
  ensure(protagonistName.length >= 1 && protagonistName.length <= 8, '主角名稱需為 1–8 字');
  const lineage = content.lineages.get(opts.lineage);
  ensure(lineage, '沒有這個傳承');
  ensure(lineage.available, `${lineage.name}傳承尚未開放`);

  const start = balance.start;
  return {
    version: STATE_VERSION,
    sectName,
    lineage: lineage.id,
    date: { year: 1, month: 1 },
    resources: { ...start.resources },
    protagonist: {
      id: 'c0',
      name: protagonistName,
      gender: opts.gender,
      role: 'protagonist',
      ageMonths: start.protagonistAgeMonths,
      realm: { major: 'qi', stage: 1 },
      xp: 0,
      root: { grade: 'mid', elements: ['metal', 'water'] },
      health: 100,
      injuryMonths: 0,
      loyalty: 100,
      skills: { alchemy: 2, farming: 1, combat: 5 },
      schedule: 'cultivate',
      takePill: false,
      seclusion: null,
    },
    disciples: [],
    outer: {
      count: start.outerCount,
      jobs: { field: 0, quarry: 0, lumber: 0, errand: 0 },
      satisfaction: 60,
      training: 0,
      hungerMonths: 0,
    },
    buildings: [
      { id: 'b1', defId: 'building.hall', level: 0, status: 'ruined', construction: null },
      { id: 'b2', defId: 'building.dorm', level: 1, status: 'active', construction: null },
    ],
    furnaces: [],
    recipes: [...content.recipes.values()].filter((r) => r.knownAtStart).map((r) => r.id),
    exploration: null,
    exploredThisMonth: false,
    realmClears: {},
    claimedRewards: [],
    pendingLoot: {},
    events: [],
    reports: [],
    battles: [],
    nextRecruitMonth: 0,
    rng: seedAll(opts.seed),
    nextId: 3,
    tutorial: { skipped: false, viewedLedger: false, done: [] },
    trade: { soldLingshi: 0, boughtFood: 0 },
    strategy: { useHealPill: true, focusLowest: true },
    stats: { commands: 0, monthsAdvanced: 0, explorations: 0 },
  };
}
