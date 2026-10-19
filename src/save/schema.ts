import { z } from 'zod';
import { STATE_VERSION } from '../engine';
import { resourceIds } from '../content/schema';

// 存檔外殼與世界狀態的格式驗證。匯入或讀取時先驗證，不合格的檔案一律拒絕。

export const SAVE_FORMAT = 'shanmen-save';
export const FORMAT_VERSION = STATE_VERSION;

const int = z.number().int();
const nonneg = int.nonnegative();
const resources = z.object(Object.fromEntries(resourceIds.map((id) => [id, nonneg])) as Record<(typeof resourceIds)[number], typeof nonneg>);
const realm = z.object({ major: z.enum(['qi', 'foundation', 'core', 'nascent', 'deity']), stage: int.min(1).max(9) });
const schedule = z.enum([
  'cultivate',
  'seclusion',
  'teach',
  'alchemy',
  'forge',
  'talisman',
  'heal',
  'breakthrough',
  'research',
  'explore',
  'dispatch',
]);
const skillKey = z.enum(['alchemy', 'farming', 'combat', 'forging', 'talisman', 'beast', 'affairs']);
const furnace = z.object({ alchemistId: z.string().nullable(), recipeId: z.string().nullable(), repeat: z.boolean(), keep: nonneg.optional() });
const marketGood = z.object({ pct: int.min(1), stock: nonneg, demand: nonneg, bought: nonneg, sold: nonneg });
const character = z.object({
  id: z.string(),
  name: z.string(),
  gender: z.enum(['male', 'female']),
  role: z.enum(['protagonist', 'inner']),
  ageMonths: nonneg,
  realm,
  xp: nonneg,
  root: z.object({ grade: z.enum(['low', 'mid', 'high', 'heaven']), elements: z.array(z.string()) }),
  health: int.min(0).max(100),
  injuryMonths: nonneg,
  loyalty: int.min(0).max(100),
  skills: z.object({
    alchemy: nonneg,
    farming: nonneg,
    combat: nonneg,
    forging: nonneg,
    talisman: nonneg,
    beast: nonneg,
    affairs: nonneg,
  }),
  schedule,
  takePill: z.boolean(),
  seat: z.string(),
  specialty: skillKey.nullable(),
  insight: nonneg,
  equipment: z.string().nullable(),
});

/** 世界狀態的主要欄位驗證（未列出的欄位保留原樣）。 */
export const worldSchema = z
  .object({
    version: int,
    sectName: z.string().min(1),
    lineage: z.string(),
    date: z.object({ year: int.min(1), month: int.min(1).max(12) }),
    resources,
    protagonist: character.extend({
      role: z.literal('protagonist'),
      seclusion: z.object({ plannedMonths: nonneg, remainingMonths: int, streak: nonneg }).nullable(),
    }),
    disciples: z.array(character),
    outer: z.object({
      count: nonneg,
      jobs: z.object({ field: nonneg, quarry: nonneg, lumber: nonneg, garden: nonneg, mine: nonneg, errand: nonneg }),
      satisfaction: int.min(0).max(100),
      training: int.min(0).max(100),
      hungerMonths: nonneg,
      labor: nonneg,
    }),
    buildings: z.array(z.object({ id: z.string(), defId: z.string(), region: z.string(), level: nonneg, status: z.string() }).passthrough()),
    regions: z.record(
      z.string(),
      z.object({
        status: z.enum(['locked', 'opening', 'open']),
        construction: z.object({ remainingMonths: int, paid: z.record(z.string(), nonneg) }).nullable(),
      }),
    ),
    beasts: z.array(
      z.object({
        id: z.string(),
        speciesId: z.string(),
        name: z.string(),
        ownerId: z.string().nullable(),
        stage: z.enum(['young', 'adult']),
        growth: nonneg,
        task: z.enum(['follow', 'gather', 'rest']),
        guardian: z.object({ level: z.number().int().min(1), hungry: z.boolean() }).optional(),
      }),
    ),
    furnaces: z.array(furnace),
    workshops: z.object({ forge: z.array(furnace), talisman: z.array(furnace) }),
    market: z.object({ goods: z.record(z.enum(resourceIds), marketGood), rumor: z.string().nullable() }),
    commissions: z.array(
      z
        .object({
          id: z.string(),
          templateId: z.string(),
          title: z.string(),
          kind: z.enum(['labor', 'deliver', 'escort']),
          reward: z.record(z.enum(resourceIds), nonneg),
          reputation: nonneg,
          guard: z.boolean(),
          expires: int,
        })
        .passthrough(),
    ),
    reputation: nonneg,
    recipes: z.array(z.string()),
    claimedRewards: z.array(z.string()),
    pendingLoot: z.record(z.string(), nonneg),
    events: z.array(z.object({ id: z.string(), kind: z.string(), blocking: z.boolean() }).passthrough()),
    rng: z.record(z.string(), z.tuple([nonneg, nonneg, nonneg, nonneg])),
    nextId: nonneg,
    tutorial: z.object({ skipped: z.boolean(), viewedLedger: z.boolean(), done: z.array(z.string()) }),
    trade: z.object({ soldLingshi: nonneg, boughtFood: nonneg }),
    strategy: z.object({ useHealPill: z.boolean(), useTalismans: z.boolean(), focusLowest: z.boolean() }),
    stats: z.object({ commands: nonneg, monthsAdvanced: nonneg, explorations: nonneg }),
    positions: z.object({
      mentor: z.string().nullable(),
      alchemy: z.string().nullable(),
      forge: z.string().nullable(),
      steward: z.string().nullable(),
      envoy: z.string().nullable(),
    }),
    armory: z.array(z.string()),
    items: z.array(z.string()),
    branches: z.array(z.object({ lineageId: z.string(), hostId: z.string() })),
    dispatches: z.array(z.object({ id: z.string(), realmId: z.string(), teamIds: z.array(z.string()), monthsLeft: nonneg, aidSectId: z.string().optional() })),
    sects: z.array(
      z
        .object({
          id: z.string(),
          resources: z.object({ lingshi: nonneg, food: nonneg, stone: nonneg, wood: nonneg }),
          population: nonneg,
          buildings: nonneg,
          power: nonneg,
          favor: int.min(0).max(100),
          giftsThisYear: nonneg,
          tradedThisMonth: nonneg,
        })
        .passthrough(),
    ),
    intel: z.array(z.object({ sectId: z.string(), text: z.string() }).passthrough()),
    tournament: z.object({ year: int, status: z.enum(['open', 'done', 'skipped']) }).passthrough().nullable(),
    auction: z.object({ id: z.string(), playerBid: nonneg, deadline: int }).passthrough().nullable(),
    veins: z.array(z.object({ name: z.string(), orePerMonth: nonneg, until: int })),
  })
  .passthrough();

export const saveSummarySchema = z.object({
  sectName: z.string(),
  protagonistName: z.string(),
  realm: z.string(),
  date: z.string(),
});

export const envelopeSchema = z.object({
  format: z.literal(SAVE_FORMAT),
  formatVersion: int.positive(),
  gameVersion: z.string(),
  savedAt: z.string(),
  summary: saveSummarySchema,
  checksum: z.string(),
  world: z.unknown(),
});

export type SaveSummary = z.infer<typeof saveSummarySchema>;
export type SaveEnvelope = z.infer<typeof envelopeSchema>;
