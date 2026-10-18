import type { Resources, RootGrade } from '../engine/types';

// 暫定平衡數值。全部未經使用者確認，集中在此方便調整；修改時記錄於 docs/暫定數值與決策.md。

export const balance = {
  start: {
    resources: {
      lingshi: 300,
      food: 200,
      stone: 80,
      wood: 80,
      herb: 20,
      spirit_herb: 0,
      ore: 0,
      paper: 0,
      beast_mat: 0,
      pill_qi: 0,
      pill_heal: 0,
      pill_foundation: 0,
      pill_peiyuan: 0,
      talisman_fire: 0,
      talisman_guard: 0,
      artifact: 0,
    } satisfies Resources,
    outerCount: 12,
    protagonistAgeMonths: 18 * 12,
    hallMonthsFirstRecruit: 6,
  },
  /** 主峰槽位 */
  slots: 8,
  /** 主峰基礎靈氣容量 */
  baseQiCapacity: 10,
  qiDemand: {
    protagonist: 3,
    protagonistSeclusion: 4,
    inner: 2,
    /** 每 4 名修煉中的外門佔 1 */
    outerPerUnit: 4,
  },
  /** 煉氣各層升到下一層所需修為：stage × 60；築基各期 1500 */
  qiXpPerStage: 60,
  foundationXpPerStage: 1500,
  baseXpPerMonth: 10,
  rootMultiplierPct: { low: 80, mid: 100, high: 130, heaven: 160 } satisfies Record<RootGrade, number>,
  /** 行程對修煉的倍率（百分比） */
  scheduleXpPct: {
    cultivate: 100,
    seclusion: 150,
    teach: 40,
    alchemy: 40,
    forge: 40,
    talisman: 40,
    heal: 20,
    breakthrough: 0,
    explore: 30,
  },
  /** 閉關每連續一個月 +10%，最多 +30% */
  seclusionStreakPct: 10,
  seclusionStreakMax: 3,
  /** 授課：每名內門弟子本月修煉 +30% */
  teachBonusPct: 30,
  pillQiXp: 30,
  /** 培元丹：築基修士服用，優先於聚氣丹 */
  pillPeiyuanXp: 120,
  injuredXpPct: 50,
  breakthrough: {
    baseBp: 6000,
    maxBp: 9000,
    arrayLv2Bp: 1000,
    rootBp: { low: -1000, mid: 0, high: 500, heaven: 1000 } satisfies Record<RootGrade, number>,
    lowHealthBp: -2000,
    lowHealthThreshold: 70,
    requiredQiCapacity: 20,
    failInjuryMonths: 3,
    failHealth: 50,
    failXpLossPct: 30,
  },
  food: {
    outerPerPerson: 1,
    /** 內門每 2 人 1 份（進位） */
    innerPerTwo: 1,
  },
  outer: {
    errandLingshi: 2,
    hungerSatisfactionLoss: 10,
    leaveThreshold: 20,
    trainingGainPerMonth: 4,
    satisfactionRecovery: 3,
  },
  recruit: {
    intervalMonths: 6,
    outerMin: 3,
    outerMax: 6,
    candidates: 3,
    promoteCost: 20,
  },
  /** 煉器、製符與煉丹共用的技藝成長 */
  craft: {
    skillBpPerPoint: 200,
    skillGainChanceBp: 3000,
    maxBp: 9500,
  },
  /**
   * 坊市：價格以「一批」計。賣價 = 基準 × 行情% × sellPct%；買價 = 賣價 × spreadPct%（聲望折扣後至少比賣價高 1）。
   * 行情每月在 minPct–maxPct 之間隨機漂移；stock / demand 為坊市 1 級時每月可買 / 可賣的批數基準。
   */
  market: {
    sellPct: 90,
    spreadPct: 125,
    minPct: 70,
    maxPct: 130,
    driftMax: 12,
    rumorPct: 15,
    rollMinPct: 60,
    rollMaxPct: 140,
    /** 每 20 聲望買價 −1%，最多 −5% */
    repPerDiscount: 20,
    maxDiscount: 5,
    goods: {
      food: { lot: 25, base: 10, stock: 6, demand: 6 },
      stone: { lot: 25, base: 10, stock: 4, demand: 6 },
      wood: { lot: 20, base: 10, stock: 4, demand: 6 },
      herb: { lot: 10, base: 8, stock: 4, demand: 4 },
      spirit_herb: { lot: 4, base: 12, stock: 3, demand: 3 },
      ore: { lot: 5, base: 10, stock: 3, demand: 3 },
      paper: { lot: 10, base: 10, stock: 3, demand: 3 },
      beast_mat: { lot: 4, base: 12, stock: 2, demand: 3 },
      pill_qi: { lot: 3, base: 12, stock: 3, demand: 3 },
      pill_heal: { lot: 4, base: 12, stock: 3, demand: 3 },
      pill_peiyuan: { lot: 1, base: 18, stock: 2, demand: 2 },
      talisman_fire: { lot: 3, base: 12, stock: 2, demand: 3 },
      talisman_guard: { lot: 3, base: 12, stock: 2, demand: 3 },
      artifact: { lot: 1, base: 22, stock: 1, demand: 2 },
    } as Partial<Record<keyof Resources, { lot: number; base: number; stock: number; demand: number }>>,
    rivals: ['青木宗', '赤霞門', '落雲谷', '玄水宮'],
  },
  commissions: {
    minBoard: 3,
    maxBoard: 5,
    /** 交付數量與報酬的隨機範圍（百分比） */
    rollMinPct: 80,
    rollMaxPct: 120,
  },
  reputation: {
    /** 每 20 聲望，招生多 1 名外門，最多 +3 */
    recruitPer: 20,
    recruitMax: 3,
  },
  talismanCombat: {
    /** 火符：戰鬥開始時對每個敵人造成的傷害 */
    fireDamage: 12,
    /** 護身符：全隊防禦提高 */
    guardDef: 3,
  },
  heal: {
    healthPerMonth: 15,
    healthPerMonthResting: 30,
    pillHealMonths: 1,
  },
  /** 山下商隊：固定價格、每月有限額，作為缺資源時的保底途徑 */
  trade: {
    /** 每單位可換得的靈石為 1 / 下列數量；丹藥為每顆換得的靈石 */
    sellPer: { stone: 4, wood: 3, herb: 2, food: 4 },
    sellPill: { pill_qi: 3, pill_heal: 2 },
    /** 每月賣出可得靈石上限：基礎 + 每級大殿 */
    sellCapBase: 40,
    sellCapPerHall: 30,
    /** 1 靈石可買的糧食，與每月可買上限 */
    foodPerLingshi: 2,
    buyFoodCap: 80,
  },
  combat: {
    maxRounds: 30,
    healThresholdPct: 40,
    healPct: 40,
    koInjuryMonths: 3,
    hurtInjuryMonths: 1,
  },
};
