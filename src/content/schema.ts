import { z } from 'zod';

// 內容資料的格式定義。內容只描述「是什麼」，規則在 engine/systems。

export const resourceIds = [
  'lingshi',
  'food',
  'stone',
  'wood',
  'herb',
  'spirit_herb',
  'ore',
  'paper',
  'beast_mat',
  'pill_qi',
  'pill_heal',
  'pill_foundation',
  'pill_peiyuan',
  'talisman_fire',
  'talisman_guard',
  'artifact',
] as const;

export const stations = ['alchemy', 'forge', 'talisman'] as const;

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
    spiritHerbPerWorker: z.number().int().optional(),
    orePerWorker: z.number().int().optional(),
    /** 煉器坊器爐、符陣閣符案數 */
    benches: z.number().int().optional(),
    /** 煉器、製符成功率加成（萬分比） */
    craftBonusBp: z.number().int().optional(),
    /** 坊市貨量與收購量（百分比） */
    marketStockPct: z.number().int().optional(),
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
  /** 全宗門最多幾座；未填表示只受槽位限制 */
  maxTotal: z.number().int().positive().optional(),
  /** 每個區域最多幾座 */
  perRegion: z.number().int().positive().optional(),
  /** 只能蓋在這些區域（優先於區域的 allows，例如坊市只能在山門） */
  onlyRegions: z.array(z.string()).optional(),
  art: z.string(),
  /** 0 級（殘破）時改用的圖 */
  artRuined: z.string().optional(),
});

export const recipeSchema = z.object({
  id: z.string().regex(/^recipe\.[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  inputs: resourceMap,
  outputs: resourceMap,
  baseSuccessBp: z.number().int().min(0).max(10000),
  knownAtStart: z.boolean(),
  /** 在哪種工坊製作 */
  station: z.enum(stations).default('alchemy'),
  /** 坊市販售此配方的價格（靈石）；未填表示坊市不賣 */
  marketPrice: z.number().int().positive().optional(),
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
  art: z.string().optional(),
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

const skillKeys = ['alchemy', 'farming', 'combat', 'forging', 'talisman', 'beast', 'affairs'] as const;
export const SKILL_KEYS = skillKeys;

/** 依建築種類加成產量（百分比） */
const productionPct = z.record(z.string().regex(/^building\.[a-z_]+$/), z.number().int());

export const lineageSchema = z.object({
  id: z.string().regex(/^lineage\.[a-z_]+$/),
  name: z.string(),
  feature: z.string(),
  available: z.boolean(),
  /** 開局畫面列出的具體差異 */
  traits: z.array(z.string()),
  skill: z.object({ name: z.string(), multiplierPct: z.number().int(), mpCost: z.number().int(), piercePct: z.number().int() }),
  /** 主角靈根屬性 */
  elements: z.array(z.enum(['metal', 'wood', 'water', 'fire', 'earth'])).min(1),
  bonuses: z.object({
    /** 我方戰鬥攻擊 / 防禦加成（百分比） */
    combatAtkPct: z.number().int().default(0),
    combatDefPct: z.number().int().default(0),
    /** 秘境撤退時保留物資的百分比下限 */
    retreatLootPct: z.number().int().min(0).max(100).default(0),
    alchemyBonusBp: z.number().int().default(0),
    forgeBonusBp: z.number().int().default(0),
    talismanBonusBp: z.number().int().default(0),
    productionPct: productionPct.default({}),
    /** 聚靈陣提供的靈氣加成（百分比） */
    arrayQiPct: z.number().int().default(0),
    /** 護衛類委託的靈石報酬加成（百分比） */
    guardRewardPct: z.number().int().default(0),
  }),
  start: z.object({
    resources: resourceMap.default({}),
    /** 開局就會的配方（其他傳承需在坊市購買） */
    recipes: z.array(z.string()).default([]),
    skills: z.record(z.enum(skillKeys), z.number().int()).default({}),
    /** 開局附帶的靈獸種類 */
    beast: z.string().optional(),
  }),
});

export const regionSchema = z.object({
  id: z.string().regex(/^region\.[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  slots: z.number().int().positive(),
  /** 區域本身的靈氣容量（0 表示不適合修煉） */
  baseQi: z.number().int().nonnegative(),
  /** 未填表示開局即開放 */
  unlock: z
    .object({ cost: resourceMap, months: z.number().int().positive(), requiresHall: z.number().int().nonnegative(), action: z.string() })
    .optional(),
  /** 可在此區建造的建築；'any' 表示全部 */
  allows: z.union([z.literal('any'), z.array(z.string())]),
  bonus: z.object({
    buildCostPct: z.number().int().default(0),
    productionPct: productionPct.default({}),
    alchemyBonusBp: z.number().int().default(0),
    forgeBonusBp: z.number().int().default(0),
    cultivationPct: z.number().int().default(0),
    tradeCapPct: z.number().int().default(0),
  }),
  /** 給玩家看的加成說明 */
  bonusText: z.string(),
  art: z.string(),
});

export const beastSpeciesSchema = z.object({
  id: z.string().regex(/^beast\.[a-z_]+$/),
  name: z.string(),
  description: z.string(),
  /** 相對主人戰鬥能力的百分比 */
  hpPct: z.number().int().positive(),
  atkPct: z.number().int().positive(),
  spd: z.number().int().nonnegative(),
  row: z.enum(['front', 'back']),
  art: z.string().optional(),
});

export const commissionSchema = z.object({
  id: z.string().regex(/^commission\.[a-z_]+$/),
  title: z.string(),
  text: z.string(),
  kind: z.enum(['labor', 'deliver', 'escort']),
  /** 抽中的權重 */
  weight: z.number().int().positive(),
  /** 出現所需的大殿等級 */
  minHall: z.number().int().nonnegative().default(0),
  /** 掛在榜上的月數 */
  months: z.number().int().positive(),
  /** 勞務：最多派幾人（抽 [min, max]） */
  workers: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  /** 交付：需要的物資基準量（實際 80–120%） */
  deliver: resourceMap.optional(),
  enemies: z.array(z.string()).optional(),
  maxTeam: z.number().int().positive().optional(),
  /** 報酬基準量（勞務為每人；交付隨數量等比例） */
  reward: resourceMap,
  reputation: z.number().int().nonnegative(),
  guard: z.boolean().default(false),
});

export type BuildingDef = z.infer<typeof buildingSchema>;
export type CommissionDef = z.infer<typeof commissionSchema>;
export type StationId = (typeof stations)[number];
export type BuildingLevelDef = z.infer<typeof buildingLevelSchema>;
export type RecipeDef = z.infer<typeof recipeSchema>;
export type EnemyDef = z.infer<typeof enemySchema>;
export type SecretRealmDef = z.infer<typeof secretRealmSchema>;
export type RealmNodeDef = z.infer<typeof nodeSchema>;
export type LineageDef = z.infer<typeof lineageSchema>;
export type RegionDef = z.infer<typeof regionSchema>;
export type BeastSpeciesDef = z.infer<typeof beastSpeciesSchema>;
