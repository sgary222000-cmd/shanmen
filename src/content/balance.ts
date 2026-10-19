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
      beast_egg: 0,
      pill_core: 0,
      pill_life: 0,
      pill_nascent: 0,
      pill_deity: 0,
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
    /** 金丹以上修士額外佔用的靈氣 */
    majorExtra: { qi: 0, foundation: 0, core: 2, nascent: 4, deity: 6 },
    /** 每 4 名修煉中的外門佔 1 */
    outerPerUnit: 4,
  },
  /** 煉氣各層升到下一層所需修為：stage × 60；築基各期 1500 */
  qiXpPerStage: 60,
  foundationXpPerStage: 1500,
  /** 金丹各期 4000（P1 批次 D）；元嬰各期 40000、化神各期 80000（P2 批次 B，0.7.0 調整） */
  coreXpPerStage: 4000,
  nascentXpPerStage: 40000,
  deityXpPerStage: 80000,
  /** 煉氣的每月基礎修為；築基、金丹見 baseXpByMajor */
  baseXpPerMonth: 10,
  /** 每月基礎修為依大境界提高，否則築基四期要上百年（docs/P1規劃.md §3.7） */
  baseXpByMajor: { qi: 10, foundation: 20, core: 40, nascent: 100, deity: 160 },
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
    research: 30,
    explore: 30,
    dispatch: 30,
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
    errandLingshi: 3,
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
    /** 榜上同時最多幾件護衛委託：否則內門一多，每月可接好幾件高額護衛，委託流靈石失控 */
    maxEscortOnBoard: 1,
    /** 每月最多接幾件委託（0.4.5）：委託路線第 100 年靈石是其他路線 10 倍以上，先限制件數 */
    maxPerMonth: 3,
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
  /** 結丹（築基圓滿 → 金丹前期），P1 批次 D */
  coreBreakthrough: {
    baseBp: 4000,
    maxBp: 8500,
    arrayLv2Bp: 1000,
    rootBp: { low: -1000, mid: 0, high: 500, heaven: 1000 } satisfies Record<RootGrade, number>,
    /** 功法大成 */
    masteryBp: 500,
    lowHealthBp: -2000,
    lowHealthThreshold: 70,
    requiredQiCapacity: 40,
    /** 需要主修功法「小成」 */
    requiredInsight: 100,
    failInjuryMonths: 6,
    failHealth: 40,
    failXpLossPct: 30,
  },
  /** 元嬰、化神（P2 批次 B，暫定）。化神失敗有死亡風險，機率在突破前顯示。 */
  nascentBreakthrough: {
    baseBp: 3000,
    maxBp: 8000,
    /** 聚靈陣 3 級 */
    arrayLv3Bp: 1000,
    rootBp: { low: -1000, mid: 0, high: 500, heaven: 1000 } satisfies Record<RootGrade, number>,
    /** 功法圓滿 */
    masteryBp: 500,
    lowHealthBp: -2000,
    lowHealthThreshold: 70,
    /** 聚靈陣 3 級加洞府 3 級 */
    requiredQiCapacity: 70,
    /** 需要主修功法「大成」 */
    requiredInsight: 300,
    failInjuryMonths: 9,
    failHealth: 30,
    failXpLossPct: 30,
    failDeathBp: 0,
  },
  deityBreakthrough: {
    baseBp: 3500,
    maxBp: 7500,
    arrayLv3Bp: 1000,
    rootBp: { low: -1000, mid: 0, high: 500, heaven: 1000 } satisfies Record<RootGrade, number>,
    masteryBp: 0,
    lowHealthBp: -2000,
    lowHealthThreshold: 70,
    requiredQiCapacity: 70,
    /** 需要主修功法「圓滿」 */
    requiredInsight: 400,
    failInjuryMonths: 12,
    failHealth: 20,
    failXpLossPct: 25,
    /** 失敗時身死道消的機率（萬分比，佔失敗的比例） */
    failDeathBp: 2500,
  },
  /** 主修功法領悟度（批次 C） */
  technique: {
    tiers: [
      { name: '入門', insight: 0, pct: 0 },
      { name: '小成', insight: 100, pct: 10 },
      { name: '大成', insight: 300, pct: 20 },
      { name: '圓滿', insight: 400, pct: 25 },
    ],
    maxInsight: 400,
    /** 研究行程的基礎領悟（另加藏經閣） */
    researchBase: 8,
    /** 平時修煉自然領悟：每月依大境界 */
    passive: { qi: 1, foundation: 2, core: 3, nascent: 4, deity: 5 },
    /** 閉關另加 */
    seclusionPassive: 1,
  },
  /** 職位（批次 C）：每職一人、限內門弟子；任職當月修煉 −20% */
  positions: {
    xpPenaltyPct: 20,
    /** 傳功：其他內門修煉 +（5 + 綜合等級）%，最多 25% */
    mentorBasePct: 5,
    mentorMaxPct: 25,
    /** 煉丹／煉器執事：成功率 + 技藝 × 0.6%，最多 +10% */
    craftBpPerSkill: 60,
    craftMaxBp: 1000,
    /** 庶務執事：外門生產 + 庶務 × 2%，最多 15%；滿意度每月另回復 庶務 ÷ 4 */
    stewardPctPerSkill: 2,
    stewardMaxPct: 15,
    /** 外事執事：委託靈石 + 庶務 × 2%（最多 20%）；坊市買價再 − 庶務 ÷ 4 %（最多 5%）；送禮好感 + 庶務 × 3% */
    envoyRewardPctPerSkill: 2,
    envoyRewardMaxPct: 20,
    envoyDiscountMax: 5,
    envoyGiftPctPerSkill: 3,
    /** 庶務、外事執事每月庶務技藝 +1 的機率 */
    affairsGainBp: 2500,
    maxSkill: 20,
  },
  /** 弟子專長（批次 C） */
  specialty: {
    bonusMin: 3,
    bonusMax: 5,
    /** 工坊技藝成長機率倍數 */
    gainMultiplier: 2,
  },
  /** 靈獸（批次 C） */
  beasts: {
    /** 成長點數達此值長為成年；每月吃飽 +10（靈獸苑 2 級再 +50%） */
    adultGrowth: 120,
    growthPerMonth: 10,
    youngGatherPct: 50,
    youngStatPct: 100,
    /** 主人每點御獸技藝，靈獸戰力與採集 +3% */
    ownerSkillPct: 3,
    /** 非御獸傳承憑馴獸法最多養幾隻 */
    tamingCap: 1,
    /** 護宗神獸（批次 F，暫定）：成年靈獸、靈獸苑 2 級可晉升，全宗只能有一隻 */
    guardian: {
      gardenLevel: 2,
      /** 晉升費用；之後每次供奉升一級，最高 maxLevel 級 */
      ascendCost: { lingshi: 150, beast_mat: 20, spirit_herb: 15 },
      raiseCost: [
        { lingshi: 200, beast_mat: 40, spirit_herb: 30 },
        { lingshi: 350, beast_mat: 80, spirit_herb: 60 },
      ],
      maxLevel: 3,
      /** 食量為成年的幾倍；沒吃飽的月份，下個月加成失效 */
      foodMultiplier: 2,
    },
  },
  /** 傳承分支：主持人需要的技藝 */
  branch: { skillRequired: 8, scripturePrice: 300, scriptureReputation: 30 },
  /** 秘境派遣（批次 D）：成功率 = 基礎 + 比例 × 小隊實力 / 建議實力 */
  dispatch: { baseBp: 2000, scaleBp: 6000, minBp: 1000, maxBp: 9500, failLootPct: 40, failInjuryMonths: 1 },
  /** 電腦宗門（批次 E） */
  sects: {
    /** 每月收入：每級建築靈石 3、石木 2；每 3 人糧食 +2（自耕）；每人吃糧 1 */
    lingshiPerBuilding: 3,
    materialPerBuilding: 2,
    foodPerThreePeople: 4,
    buildCost: { stone: 40, wood: 30, lingshi: 60 },
    recruitCost: { food: 40, lingshi: 20 },
    trainCost: 40,
    /** 實力上限 210（約等於初入金丹的弟子出戰；原本 150 時第 50 年後就不再變強）；擴建 +1、招收 +1、操練 +1–2。
     *  另有隨年份放寬的上限：開局實力 + 每年 2，約第 50 年到 150、第 80 年到 210，免得前期大比就遇上築基圓滿 */
    maxPower: 210,
    powerPerYear: 2,
    maxPopulation: 80,
    /** 遠方勢力實力上限（簡化結算，每年 +1–3） */
    distantMaxPower: 260,
    /** 建築總級數上限與資源存量上限，避免百年後帳本無限膨脹 */
    maxBuildings: 30,
    resourceCap: { lingshi: 3000, food: 1500, stone: 1000, wood: 1000 },
    favorNeutral: 30,
    intelKeep: 30,
  },
  diplomacy: {
    /** 每 10 靈石的禮物基礎好感 +1；同一年第 n 份禮效果為 1/n */
    giftUnit: 10,
    minGift: 10,
    maxFavor: 100,
    /** 每月可賣給同一宗門的批數，與好感帶來的加價（不超過坊市買賣價差，無法套利） */
    tradeLots: 2,
    tradeBonus: [
      { favor: 60, pct: 10 },
      { favor: 30, pct: 5 },
    ],
    /** 條約（P2 批次 C，暫定）：締約條件、儀式費用、期限（年）、提前解約的代價 */
    treaties: {
      peace: { favor: 40, trust: 20, lingshi: 200, years: 10, breakTrust: 30, breakFavor: 20, breakReputation: 10 },
      alliance: { favor: 60, trust: 50, lingshi: 600, years: 10, breakTrust: 40, breakFavor: 30, breakReputation: 20 },
    },
    /** 遠方勢力要大殿幾級才建立往來 */
    distantHall: 4,
    /** 信任：守約每滿一年 +2、條約期滿 +5、履行援助 +10、拒絕援助 −15（重承諾的宗門加減都 ×1.5） */
    trustPerYear: 2,
    trustOnExpiry: 5,
    trustOnAid: 10,
    trustOnRefuse: 15,
    favorOnAid: 5,
    favorOnRefuse: 10,
    honorablePct: 150,
    /** 聯盟：交易加價 +5%、每月可多賣 2 批；連續拒絕援助 2 次，盟友會解除聯盟 */
    allianceTradePct: 5,
    allianceTradeLots: 2,
    maxRefusals: 2,
    /** 援助：出資 = 120 + 盟友實力 × 2 靈石；出兵 = 派最多 2 名內門 3 個月，每人 20% 機率輕傷 1 個月；回覆期限 2 個月 */
    aidBaseLingshi: 120,
    aidPerPower: 2,
    aidTroops: 2,
    aidMonths: 3,
    aidInjuryBp: 2000,
    aidDeadline: 2,
    /** 遠方盟友每月遭妖獸潮等禍事、向盟友求援的機率（萬分比） */
    distantTroubleBp: 80,
    /** 好戰而冷淡（好感 < 20）、沒有互不侵犯的宗門，每月騷擾我宗商隊的機率與損失（靈石 5%，最多 100） */
    harassBp: 400,
    harassFavor: 20,
    harassPct: 5,
    harassMax: 100,
  },
  /** 資源據點（P2 批次 C）：佔有的宗門每月收入；搶奪無主據點的費用、攻打他宗據點的勝率 */
  sites: {
    income: { ore: { lingshi: 15 }, herb: { lingshi: 12 }, lingshi: { lingshi: 25 }, wood: { wood: 8, lingshi: 5 } },
    claimLingshi: 100,
    /** 每宗最多佔幾處（避免一宗獨佔） */
    maxPerSect: 3,
    /** 攻方勝率 = 50% + (攻方實力 − 守方實力) × 0.5%，夾在 20%–80%；聯盟盟友可能求援 */
    attackBaseBp: 5000,
    attackPerPowerBp: 50,
    attackMinBp: 2000,
    attackMaxBp: 8000,
    lossPower: 3,
  },
  /** 衝突與戰爭（P2 批次 D，暫定）。 */
  war: {
    /** 前期保護：第幾年之前各宗不會宣戰、我宗也不能宣戰 */
    graceYears: 30,
    /** 宣戰的準備期（月）：對方宣戰 3–6 個月，我宗宣戰 3 個月 */
    prepMin: 3,
    prepMax: 6,
    playerPrep: 3,
    /** 我宗宣戰的軍費；沒有正當理由（對方好感 30 以上、也不是在擴張）時聲望 −20 */
    declareLingshi: 300,
    causeFavor: 30,
    unjustReputation: 20,
    /** 電腦宗門對我宗宣戰：好感低於 20、沒有條約與停戰、好戰或正在擴張、實力不輸我宗的八成；每月機率（萬分比） */
    declareFavor: 20,
    declarePowerPct: 80,
    declareBp: 150,
    /** 好戰又在擴張、實力達我宗 120% 的宗門，好感 40 以下也可能宣戰（每月萬分比） */
    bullyPowerPct: 120,
    bullyBp: 60,
    /** 山門戰：三場兩勝；每場倒下的內門弟子有 15% 戰死（主角不會死，只受傷） */
    rounds: 3,
    deathBp: 1500,
    koInjuryMonths: 3,
    protagonistInjuryMonths: 6,
    /** 開戰前預估勝率用的模擬次數 */
    previewRuns: 30,
    /** 盟友信任 50 以上才會出兵相助，每位盟友派一名高手 */
    allyTrust: 50,
    /** 談和：守方付 200 + 對方實力 × 3 靈石；攻方撤兵聲望 −10。之後停戰 5 年 */
    tributeBase: 200,
    tributePerPower: 3,
    withdrawReputation: 10,
    peaceTruceYears: 5,
    /** 撤離資產：最多把一半靈石藏進後山密庫 */
    evacuatePct: 50,
    /** 戰後停戰 10 年 */
    truceYears: 10,
    /** 守住山門：對方實力 −15%、賠償 100 + 實力 × 2 靈石、聲望 +20 */
    defendWinPowerPct: 15,
    reparationBase: 100,
    reparationPerPower: 2,
    defendWinReputation: 20,
    /** 山門失守：靈石被搶 30%（不含撤離的）、糧食 20%、損毀 2 座建築、割讓 1 處據點、聲望 −10 */
    lootLingshiPct: 30,
    lootFoodPct: 20,
    damagedBuildings: 2,
    defendLoseReputation: 10,
    /** 修復損毀建築：該等級建造費的 30% */
    repairPct: 30,
    /** 攻打得勝：對方實力 −20%；割地賠款最多 2 處據點與 200 + 實力 × 3 靈石 */
    attackWinPowerPct: 20,
    cedeSites: 2,
    indemnityBase: 200,
    indemnityPerPower: 3,
    attackLoseReputation: 15,
    attackWinReputation: 15,
    /** 附屬：每月進貢 5 + 實力 ÷ 10 靈石 */
    vassalBase: 5,
    vassalPerPower: 10,
    /** 附屬 30 年期滿後恢復自立（好感 50，再停戰 10 年）（P2 批次 E） */
    vassalYears: 30,
    vassalEndFavor: 50,
    /** 吞併：大殿 5 級、對方實力不到我宗的 50% 才能吞併；得到三分之一的弟子當外門、2 名內門（忠誠 50）、一半靈石與全部據點；
     *  每月整合費 30 靈石、10 年；外門滿意度 −15；其他宗門好感 −10 */
    annexPowerPct: 50,
    annexHall: 5,
    /** 攻打對方山門或據點時，對方守山陣法讓守方生命、防禦 +25% */
    homeDefensePct: 25,
    annexInner: 2,
    annexLoyalty: 50,
    integrationLingshi: 30,
    integrationYears: 10,
    annexSatisfaction: 15,
    annexFear: 10,
    annexReputation: 30,
  },
  /** 倉庫（P2 批次 E）：材料與糧食有存放上限，月底超出上限的新進貨損耗掉；靈石、丹藥、符籙、法器不設上限 */
  storage: {
    /** 沒有倉庫時：糧食 1,000，其他材料各 500；倉庫每級加的量見建築，糧食加倍 */
    baseFood: 1000,
    base: 500,
    /** 存量達上限的幾成時警告 */
    warnPct: 90,
  },
  /** 宗門試煉（P2 批次 E）：大殿 2 級起；每人每年一次；敵人依隊伍最強者的境界配置，失敗不受傷 */
  trial: {
    hall: 2,
    maxTeam: 3,
    /** 每位參加者的花費 */
    lingshiPer: 20,
    /** 三種難度：對手等級相對隊伍最強者（-2、0、+2），通關給下一階修為的百分比與領悟度 */
    tiers: [
      { id: 'easy', name: '入門', levelOffset: -2, xpPct: 10, insight: 5 },
      { id: 'normal', name: '精進', levelOffset: 0, xpPct: 20, insight: 10 },
      { id: 'hard', name: '登峰', levelOffset: 2, xpPct: 35, insight: 20 },
    ],
    /** 失敗時：生命降到 50%、修為 +5%（只是不受傷） */
    loseHealth: 50,
    loseXpPct: 5,
    previewRuns: 30,
  },
  /** 三年大比：每 3 年 9 月 */
  tournament: {
    intervalYears: 3,
    month: 9,
    minReputation: 10,
    teamSize: 3,
    rewards: [
      { reputation: 30, lingshi: 200, pill_foundation: 1 },
      { reputation: 15, lingshi: 100 },
      { reputation: 8, lingshi: 50 },
      { reputation: 3 },
    ] as Partial<Record<'reputation' | keyof Resources, number>>[],
  },
  /** 靈脈競標 */
  auction: {
    /** 沒有競標時每月出現的機率 */
    chanceBp: 400,
    months: 2,
    orePerMonth: [4, 8] as [number, number],
    years: [5, 10] as [number, number],
    minBid: 50,
    /** 電腦宗門出價：靈石的百分比範圍 */
    sectBidPct: [20, 55] as [number, number],
    temperamentPct: { steady: 70, merchant: 120, warlike: 100, scholarly: 60, honorable: 80 },
  },
  /** 壽元與繼承（P2 批次 A，暫定）。 */
  lifespan: {
    /** 各大境界的壽元上限（歲） */
    years: { qi: 100, foundation: 200, core: 400, nascent: 800, deity: 1500 },
    /** 剩下這些百分比時預警 */
    warnPct: [20, 10],
    /** 延壽丹：每顆增加該境界基礎壽元的百分比、一生最多服用幾顆 */
    pillPct: 15,
    pillMax: 2,
    /** 親傳弟子（繼承人）修煉加成（百分比） */
    heirXpPct: 10,
    /** 祖師顯靈的冷卻（月） */
    blessingCooldown: 120,
    /** 連續推進時，糧食或靈石預估幾個月內用完就停下 */
    shortageMonths: 2,
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
