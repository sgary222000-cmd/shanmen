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
      pill_qi: 0,
      pill_heal: 0,
      pill_foundation: 0,
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
  alchemy: {
    skillBpPerPoint: 200,
    skillGainChanceBp: 3000,
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
