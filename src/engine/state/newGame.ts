import { balance } from '../../content/balance';
import type { ContentPack } from '../../content/registry';
import { ensure } from '../errors';
import { seedAll } from '../rng';
import { MAIN_REGION } from '../../content/registry';
import { gain } from '../resources';
import { initialRegions } from '../systems/regions/regions';
import type { Beast, GameState, Skills } from '../types';

export const STATE_VERSION = 3;

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
  const resources = { ...start.resources };
  gain(resources, lineage.start.resources);
  const skills: Skills = { alchemy: 2, farming: 1, combat: 5, forging: 0, talisman: 0, beast: 0, affairs: 0 };
  for (const [k, v] of Object.entries(lineage.start.skills)) skills[k as keyof Skills] += v ?? 0;
  const beasts: Beast[] = [];
  const species = lineage.start.beast ? content.beasts.get(lineage.start.beast) : undefined;
  if (species) beasts.push({ id: 'beast1', speciesId: species.id, name: species.name, ownerId: 'c0' });
  return {
    version: STATE_VERSION,
    sectName,
    lineage: lineage.id,
    date: { year: 1, month: 1 },
    resources,
    protagonist: {
      id: 'c0',
      name: protagonistName,
      gender: opts.gender,
      role: 'protagonist',
      ageMonths: start.protagonistAgeMonths,
      realm: { major: 'qi', stage: 1 },
      xp: 0,
      root: { grade: 'mid', elements: [...lineage.elements] },
      health: 100,
      injuryMonths: 0,
      loyalty: 100,
      skills,
      schedule: 'cultivate',
      takePill: false,
      seat: MAIN_REGION,
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
      { id: 'b1', defId: 'building.hall', region: MAIN_REGION, level: 0, status: 'ruined', construction: null },
      { id: 'b2', defId: 'building.dorm', region: MAIN_REGION, level: 1, status: 'active', construction: null },
    ],
    regions: initialRegions(content),
    beasts,
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
