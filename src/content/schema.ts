import { z } from 'zod';

// 內容資料的格式定義。內容只描述「是什麼」，規則在 engine/systems。

export const resourceIds = [
  'lingshi',
  'food',
  'stone',
  'wood',
  'herb',
  'pill_qi',
  'pill_heal',
  'pill_foundation',
] as const;

const amount = z.number().int().nonnegative();
export const resourceMap = z.record(z.enum(resourceIds), amount);

export const buildingLevelSchema = z.object({
  level: z.number().int().positive(),
  cost: resourceMap,
  months: z.number().int().positive(),
  maintenance: resourceMap,
  /** 升到此等級需要的大殿等級 */
  requiresHall: z.number().int().nonnegative(),
  effects: z.object({
    workerSlots: z.number().int().optional(),
    foodPerWorker: z.number().int().optional(),
    herbPerWorker: z.number().int().optional(),
    stonePerWorker: z.number().int().optional(),
    woodPerWorker: z.number().int().optional(),
    outerCapacity: z.number().int().optional(),
    innerLimit: z.number().int().optional(),
    furnaces: z.number().int().optional(),
    alchemyBonusBp: z.number().int().optional(),
    qiCapacity: z.number().int().optional(),
    recruitOuterBonus: z.number().int().optional(),
  }),
  summary: z.string(),
});

export const buildingSchema = z.object({
  id: z.string().regex(/^building\.[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  /** 出現在建設清單所需的大殿等級 */
  unlockHall: z.number().int().nonnegative(),
  levels: z.array(buildingLevelSchema).min(1),
  art: z.string(),
});

export const recipeSchema = z.object({
  id: z.string().regex(/^recipe\.[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  inputs: resourceMap,
  outputs: resourceMap,
  baseSuccessBp: z.number().int().min(0).max(10000),
  knownAtStart: z.boolean(),
});

export const enemySchema = z.object({
  id: z.string().regex(/^enemy\.[a-z_]+$/),
  name: z.string(),
  hp: z.number().int().positive(),
  atk: z.number().int().nonnegative(),
  def: z.number().int().nonnegative(),
  spd: z.number().int().nonnegative(),
  hit: z.number().int().nonnegative(),
  res: z.number().int().nonnegative(),
  row: z.enum(['front', 'back']),
  skill: z
    .object({ name: z.string(), multiplierPct: z.number().int(), cooldown: z.number().int().positive() })
    .optional(),
});

const choiceSchema = z.object({
  id: z.string(),
  label: z.string(),
  result: z.string(),
  /** 隊伍每人損失最大生命的百分比 */
  hpLossPct: z.number().int().min(0).max(100).optional(),
  loot: resourceMap.optional(),
});

export const nodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['entrance', 'fork', 'resource', 'enemy', 'event', 'boss', 'exit']),
  title: z.string(),
  text: z.string(),
  next: z.array(z.string()),
  loot: resourceMap.optional(),
  enemies: z.array(z.string()).optional(),
  choices: z.array(choiceSchema).optional(),
});

export const secretRealmSchema = z.object({
  id: z.string().regex(/^secret\.[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  risk: z.string(),
  supplies: resourceMap,
  maxTeam: z.number().int().positive(),
  startNode: z.string(),
  nodes: z.array(nodeSchema).min(2),
  firstClear: z.object({
    rewardId: z.string(),
    recipes: z.array(z.string()),
    resources: resourceMap,
    text: z.string(),
  }),
  /** 已通關後再入，節點物資的百分比 */
  repeatLootPct: z.number().int().min(0).max(100),
  /** 撤退時保留物資的百分比 */
  retreatLootPct: z.number().int().min(0).max(100),
  art: z.string(),
});

export const lineageSchema = z.object({
  id: z.string().regex(/^lineage\.[a-z_]+$/),
  name: z.string(),
  feature: z.string(),
  available: z.boolean(),
  skill: z.object({ name: z.string(), multiplierPct: z.number().int(), mpCost: z.number().int(), piercePct: z.number().int() }),
});

export type BuildingDef = z.infer<typeof buildingSchema>;
export type BuildingLevelDef = z.infer<typeof buildingLevelSchema>;
export type RecipeDef = z.infer<typeof recipeSchema>;
export type EnemyDef = z.infer<typeof enemySchema>;
export type SecretRealmDef = z.infer<typeof secretRealmSchema>;
export type RealmNodeDef = z.infer<typeof nodeSchema>;
export type LineageDef = z.infer<typeof lineageSchema>;
