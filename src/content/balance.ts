import type { Element, ResourceId, Resources, RootGrade } from '../engine/types';

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
      pill_swift: 0,
      pill_keen: 0,
      pill_phantom: 0,
      pill_ape: 0,
      pill_eye: 0,
      pill_cloud: 0,
      talisman_bind: 0,
      talisman_break: 0,
      talisman_slow: 0,
      talisman_confuse: 0,
      talisman_seal: 0,
      mat_jade: 0,
      mat_beastcore: 0,
      mat_earthfire: 0,
      mat_scroll: 0,
      mat_thunder: 0,
      mat_taixu: 0,
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
    // 0.9.1：外出歷練、工坊、研究也是修行，弟子不會因為被派出去就停滯
    alchemy: 70,
    forge: 70,
    talisman: 70,
    heal: 40,
    breakthrough: 0,
    research: 60,
    explore: 70,
    dispatch: 70,
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
    // 0.10.0：製品（丹藥、符籙、法器）基準價 +25%，每月可買批數 +50%
    goods: {
      food: { lot: 25, base: 10, stock: 9, demand: 6 },
      stone: { lot: 25, base: 10, stock: 6, demand: 6 },
      wood: { lot: 20, base: 10, stock: 6, demand: 6 },
      herb: { lot: 10, base: 8, stock: 6, demand: 4 },
      spirit_herb: { lot: 4, base: 12, stock: 5, demand: 3 },
      ore: { lot: 5, base: 10, stock: 5, demand: 3 },
      paper: { lot: 10, base: 10, stock: 5, demand: 3 },
      beast_mat: { lot: 4, base: 12, stock: 3, demand: 3 },
      pill_qi: { lot: 3, base: 15, stock: 5, demand: 3 },
      pill_heal: { lot: 4, base: 15, stock: 5, demand: 3 },
      pill_peiyuan: { lot: 1, base: 23, stock: 3, demand: 2 },
      talisman_fire: { lot: 3, base: 15, stock: 3, demand: 3 },
      talisman_guard: { lot: 3, base: 15, stock: 3, demand: 3 },
      artifact: { lot: 1, base: 28, stock: 2, demand: 2 },
      // 0.11.0：短效屬性丹、三種常見控制符（稀有素材與永久丹不在坊市買賣）
      pill_swift: { lot: 2, base: 20, stock: 2, demand: 2 },
      pill_keen: { lot: 2, base: 20, stock: 2, demand: 2 },
      pill_phantom: { lot: 2, base: 20, stock: 2, demand: 2 },
      talisman_break: { lot: 2, base: 18, stock: 2, demand: 2 },
      talisman_slow: { lot: 2, base: 18, stock: 2, demand: 2 },
      talisman_confuse: { lot: 2, base: 18, stock: 2, demand: 2 },
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
  /** 主修功法領悟度（批次 C；0.13.0 起 20 層，每 4 層一個名稱，每層加屬性） */
  technique: {
    stages: ['入門', '小成', '大成', '圓滿', '化境'],
    /** 第 1–20 層的累計領悟度門檻；第 5、9、13 層對齊舊的小成、大成、圓滿 */
    levels: [0, 20, 45, 70, 100, 140, 185, 240, 300, 330, 360, 380, 400, 500, 620, 760, 920, 1100, 1300, 1500],
    maxInsight: 1500,
    /** 每進入一個名稱（入門、小成…化境）修煉 +5%，最多 +25% */
    xpPctPerStage: 5,
    /** 每層共通屬性（百分比） */
    perLevel: { atkPct: 2, hpPct: 2, defPct: 1 },
    /** 各傳承專長：每層再加（可為小數，取整） */
    specialty: {
      'technique.sword': { critPct: 0.5 },
      'technique.alchemy': { defPct: 1, hpPct: 1 },
      'technique.beast': { agi: 0.5, beastAtkPct: 1 },
      'technique.talisman': { dodgePct: 0.5 },
    } as Record<string, Partial<Record<'atkPct' | 'hpPct' | 'defPct' | 'critPct' | 'dodgePct' | 'agi' | 'beastAtkPct', number>>>,
    /** 研究行程的基礎領悟（另加藏經閣） */
    researchBase: 8,
    /** 平時修煉自然領悟：每月依大境界 */
    passive: { qi: 1, foundation: 2, core: 3, nascent: 4, deity: 5 },
    /** 閉關另加 */
    seclusionPassive: 1,
  },
  /** 輔修功法（0.14.0，docs/功法擴充規劃.md 第二節）：藏經閣撰寫，每人另學一部，10 層 */
  minorTechnique: {
    /** 撰寫：作者要金丹以上、行程為研究功法；研究滿這麼多個月寫成 */
    months: 6,
    authorMajor: 'core' as const,
    cost: { mat_scroll: 2, lingshi: 800 } as Partial<Resources>,
    /** 寫成機率：基本 60%，作者主修功法每高於第 5 層一層 +2%，最多 95%；失敗退還一半材料 */
    baseBp: 6000,
    bpPerLevel: 200,
    bpFromLevel: 5,
    maxBp: 9500,
    /** 第 1–10 層的累計輔修領悟度 */
    levels: [0, 10, 25, 45, 70, 100, 140, 190, 250, 320],
    maxInsight: 320,
    /** 每月輔修領悟 = 主修領悟（不計上限）÷ 2，無條件進位 */
    gainDivisor: 2,
    list: [
      { id: 'minor.vajra', name: '金剛不壞體', library: 2, desc: '每層防禦 +2%、生命 +1%', per: { defPct: 2, hpPct: 1 } },
      { id: 'minor.swift', name: '驚鴻步', library: 2, desc: '每層敏捷 +0.5、閃避 +0.5%', per: { agi: 0.5, dodgePct: 0.5 } },
      { id: 'minor.army', name: '破軍訣', library: 2, desc: '每層攻擊 +2%、暴擊 +0.3%', per: { atkPct: 2, critPct: 0.3 } },
      { id: 'minor.spring', name: '回春訣', library: 2, desc: '每層每場戰鬥後回復生命 +1%', per: { healPct: 1 } },
      { id: 'minor.spirit', name: '養神篇', library: 3, desc: '每層大突破成功率 +0.3%', per: { breakBp: 30 } },
      { id: 'minor.crafts', name: '百藝心經', library: 3, desc: '每層煉丹、煉器、製符成功率 +0.5%', per: { craftBp: 50 } },
    ] as {
      id: string;
      name: string;
      library: number;
      desc: string;
      per: Partial<Record<'atkPct' | 'hpPct' | 'defPct' | 'critPct' | 'dodgePct' | 'agi' | 'healPct' | 'breakBp' | 'craftBp', number>>;
    }[],
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
    /** 擴建 +1、招收 +1、操練 +1–2。實力上限隨年份放寬：開局實力 + 每年 2，約第 50 年到 150、第 80 年到 210，
     *  免得前期大比就遇上築基圓滿。0.10.0 起不再停在 210（遠方勢力 260），鄰宗約第 175 年到 400、遠方勢力 450（化神前期的對手） */
    powerPerYear: 2,
    lateMaxPower: 400,
    distantLateMaxPower: 450,
    maxPopulation: 80,
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
    declareBp: 250,
    /** 好戰又在擴張、實力達我宗 120% 的宗門，好感 40 以下也可能宣戰（每月萬分比） */
    bullyPowerPct: 120,
    bullyBp: 60,
    /** 0.10.0 爭雄：第 80 年起，好戰或正在擴張、好感 40 以下、實力達我宗一半的鄰宗也會興兵（每月萬分比） */
    rivalFromYear: 80,
    rivalPowerPct: 50,
    rivalBp: 100,
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
    truceYears: 8,
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
  /** 弟子自動突破與掌門護法（0.9.1，暫定）：成功率至少幾成才自動衝，失敗會死的突破不自動；
   *  掌門境界高於弟子要突破的境界、人在宗門時，弟子突破成功率加成（萬分比）。 */
  autoBreakthrough: {
    minOddsPct: 40,
    guardBp: 1500,
  },
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
  /** 0.11.0 戰鬥屬性（暫定）：敏捷沿用原本的速度；暴擊傷害 1.5 倍；閃避在命中後再判定一次 */
  attributes: {
    baseCritPct: 5,
    critDamagePct: 150,
    maxCritPct: 50,
    baseDodgePct: 3,
    maxDodgePct: 40,
    /** 比對方敏捷每高 1 點，閃避 +0.5%（萬分比 50） */
    agiDodgeBp: 50,
    enemyCritPct: 5,
    enemyDodgePct: 3,
    bossCritPct: 10,
    bossDodgePct: 5,
    /** 戰力換算：暴擊每 1% 算攻擊 × 0.02，閃避每 1% 算生命 × 0.01 */
    powerCritBp: 200,
    powerDodgeBp: 100,
    /** 屬性丹：短效只對下一場戰鬥有效；永久每人每種最多 permMax 顆 */
    shortPills: {
      pill_swift: { agi: 6 },
      pill_keen: { critPct: 10 },
      pill_phantom: { dodgePct: 8 },
    } as Partial<Record<ResourceId, StatBonus>>,
    permPills: {
      pill_ape: { agi: 3 },
      pill_eye: { critPct: 3 },
      pill_cloud: { dodgePct: 2 },
    } as Partial<Record<ResourceId, StatBonus>>,
    permMax: 3,
  },
  /** 0.11.0 靈根影響戰力與修煉：品級加成（生命、攻擊、防禦）、每種靈根一項屬性 × 品級倍率；靈根越多修煉越快 */
  roots: {
    gradePct: { low: 0, mid: 5, high: 10, heaven: 25 } satisfies Record<RootGrade, number>,
    gradeMultPct: { low: 100, mid: 150, high: 200, heaven: 400 } satisfies Record<RootGrade, number>,
    element: {
      metal: { atkPct: 5 },
      wood: { hpPct: 8 },
      water: { dodgePct: 2 },
      fire: { critPct: 3 },
      earth: { defPct: 8 },
    } satisfies Record<Element, StatBonus>,
    /** 招收時靈根數量 1–5 種的權重（天靈根固定單一） */
    countWeights: [30, 35, 25, 8, 2],
    /** 每多一種靈根，修煉速度 +5% */
    extraElementXpPct: 5,
  },
  /** 0.11.0 法器品質（暫定）：凡品、良品、上品、極品、仙品 */
  gear: {
    qualities: [
      { id: 'common', name: '凡品', chancePct: 55, statPct: 100, subs: 0, effect: false, pricePct: 100, shareOfBonus: 0 },
      { id: 'fine', name: '良品', chancePct: 28, statPct: 120, subs: 0, effect: false, pricePct: 130, shareOfBonus: 50 },
      { id: 'superior', name: '上品', chancePct: 12, statPct: 145, subs: 1, effect: false, pricePct: 200, shareOfBonus: 30 },
      { id: 'rare', name: '極品', chancePct: 4, statPct: 175, subs: 2, effect: false, pricePct: 400, shareOfBonus: 15 },
      { id: 'immortal', name: '仙品', chancePct: 1, statPct: 220, subs: 2, effect: true, pricePct: 1000, shareOfBonus: 5 },
    ],
    /** 凡品機率最低到 20% */
    minCommonPct: 20,
    /** 品質加成：煉器技藝每 5 點 +1、煉器坊每升一級 +2、加入稀有素材 +8 */
    skillPerPoint: 5,
    perForgeLevel: 2,
    rareBonus: 8,
    /** 副屬性範圍（生命為百分比） */
    subRanges: { agi: [2, 4], crit: [3, 6], dodge: [2, 4], hp: [5, 10] },
    /** 仙品特效：吸血 10%、破甲無視 20% 防禦 */
    drainPct: 10,
    piercePct: 20,
  },
  /**
   * 0.11.0 副本稀有素材：秘境首領每次被打倒都可能掉（只能從副本取得，坊市不賣也不收）。
   * mats：[素材, 機率%, 最少, 最多]；recipes／gear：[ID, 機率%]，丹方學會後不再掉，法器品質隨機。
   * 秘境派遣帶回的機率減半；宗門試煉獲勝給試煉玉髓。
   */
  rareDrops: {
    realms: {
      'secret.underground_mine': { mats: [['mat_earthfire', 60, 1, 1]], recipes: [], gear: [] },
      'secret.beast_valley': { mats: [['mat_beastcore', 60, 1, 1]], recipes: [['recipe.ape_pill', 30]], gear: [] },
      'secret.ancient_ruins': { mats: [['mat_scroll', 70, 1, 1]], recipes: [['recipe.seal_talisman', 30]], gear: [['equip.ancient_pendant', 10]] },
      'secret.taixu_1': { mats: [['mat_taixu', 100, 1, 2]], recipes: [], gear: [['equip.cloud_boots', 10]] },
      'secret.taixu_2': { mats: [['mat_taixu', 100, 1, 2], ['mat_thunder', 70, 1, 1]], recipes: [], gear: [] },
      'secret.taixu_3': { mats: [['mat_taixu', 100, 1, 2]], recipes: [], gear: [] },
      'secret.taixu_4': { mats: [['mat_taixu', 100, 1, 2], ['mat_thunder', 70, 1, 1]], recipes: [], gear: [['equip.thunder_ring', 10]] },
      'secret.taixu_5': { mats: [['mat_taixu', 100, 2, 3]], recipes: [], gear: [] },
    } as Record<string, { mats: [ResourceId, number, number, number][]; recipes: [string, number][]; gear: [string, number][] }>,
    dispatchPct: 50,
    trialJade: { easy: 0, normal: 1, hard: 2 } as Record<string, number>,
    /** 試煉「登峰」第一次獲勝學會天眼丹方 */
    trialHardRecipe: 'recipe.eye_pill',
  },
  /** 0.11.0 控制、削弱符籙：戰前最多祭出兩種，各一張；符陣傳承持續回合 +1 */
  controlTalismans: {
    maxKinds: 2,
    bossResistPct: 50,
    defDownPct: 30,
    slowPct: 30,
    hitDownBp: 2000,
    rounds: { talisman_bind: 1, talisman_break: 2, talisman_slow: 2, talisman_confuse: 2, talisman_seal: 3 } as Partial<Record<ResourceId, number>>,
  },
  /** 0.12.0 中期擴充批次三：時事委託、聲望兌換、拍賣會、珍寶閣、收購單（使用者 2026-10-21「照建議」） */
  bazaar: {
    affairs: {
      /** 每年一月擲時事：1 件，另有此機率多 1 件；各持續 12 個月 */
      secondChancePct: 25,
      months: 12,
      /** 時事相關委託出現權重倍率 */
      weightMult: 3,
      /** 時事委託完成時委託宗門好感 */
      favor: 3,
      list: {
        beast_tide: { name: '獸潮', desc: '山中獸潮湧動，剿獸委託增加；獸材充斥，坊市獸材收購價下跌', weight: 1, boost: ['commission.beast_tide'], price: { beast_mat: -20 } },
        famine: { name: '歉收', desc: '山下歉收，交付糧食的報酬加倍；坊市糧價上漲', weight: 1, boost: ['commission.food'], rewardPct: { 'commission.food': 200 }, price: { food: 30 } },
        plague: { name: '疫病', desc: '疫病流行，交付回春丹的報酬加倍、需要的數量多一半', weight: 1, boost: ['commission.pill_heal'], rewardPct: { 'commission.pill_heal': 200 }, deliverPct: { 'commission.pill_heal': 150 } },
        war_prep: { name: '鄰宗備戰', desc: '鄰宗厲兵秣馬，委託代製符籙；坊市火符、法器收購價上漲', weight: 1, boost: ['commission.war_fire', 'commission.war_guard'], rewardPct: { 'commission.war_fire': 150, 'commission.war_guard': 150 }, favor: 5, price: { talisman_fire: 30, artifact: 30 }, warWeight: 2 },
        trade: { name: '商路大開', desc: '商隊往來頻繁，護衛委託報酬多一半，榜上可同時有兩件護衛委託', weight: 1, escortRewardPct: 150, maxEscort: 2, needsMarket: true },
        realm_shift: { name: '秘境異動', desc: '某處秘境靈氣翻湧，派遣時拿到稀有素材的機率不再減半', weight: 1, needsClear: true },
      } as Record<
        string,
        {
          name: string;
          desc: string;
          weight: number;
          boost?: string[];
          rewardPct?: Record<string, number>;
          deliverPct?: Record<string, number>;
          price?: Partial<Record<ResourceId, number>>;
          favor?: number;
          escortRewardPct?: number;
          maxEscort?: number;
          warWeight?: number;
          needsMarket?: boolean;
          needsClear?: boolean;
        }
      >,
    },
    exchange: {
      tiers: {
        early: { name: '前期', rep: 200, hall: 2 },
        mid: { name: '中期', rep: 1000, hall: 3 },
        late: { name: '後期', rep: 3000, hall: 4 },
      },
      /** 坊市配方換算：原價 ÷ 2 */
      recipeDivisor: 2,
      items: [
        { id: 'ex.foundation', tier: 'early', cost: 120, perYear: 2, give: { pill_foundation: 1 } },
        { id: 'ex.heal', tier: 'early', cost: 40, perYear: 4, give: { pill_heal: 5 } },
        { id: 'ex.earthfire', tier: 'mid', cost: 80, perYear: 2, give: { mat_earthfire: 1 } },
        { id: 'ex.beastcore', tier: 'mid', cost: 80, perYear: 2, give: { mat_beastcore: 1 } },
        { id: 'ex.scroll', tier: 'mid', cost: 80, perYear: 2, give: { mat_scroll: 1 } },
        { id: 'ex.ape', tier: 'mid', cost: 300, perYear: 1, group: 'perm', give: { pill_ape: 1 } },
        { id: 'ex.eye', tier: 'mid', cost: 300, perYear: 1, group: 'perm', give: { pill_eye: 1 } },
        { id: 'ex.cloud', tier: 'mid', cost: 300, perYear: 1, group: 'perm', give: { pill_cloud: 1 } },
        { id: 'ex.gear_superior', tier: 'mid', cost: 400, perYear: 1, gear: 'superior' },
        { id: 'ex.core', tier: 'mid', cost: 250, perYear: 1, give: { pill_core: 1 } },
        { id: 'ex.taixu', tier: 'late', cost: 150, perYear: 3, give: { mat_taixu: 1 } },
        { id: 'ex.life', tier: 'late', cost: 600, perYear: 1, give: { pill_life: 1 } },
        { id: 'ex.nascent', tier: 'late', cost: 800, perYear: 1, give: { pill_nascent: 1 } },
        { id: 'ex.deity', tier: 'late', cost: 2000, perYear: 1, everyYears: 5, give: { pill_deity: 1 } },
        { id: 'ex.gear_rare', tier: 'late', cost: 1200, perYear: 1, gear: 'rare' },
      ] as { id: string; tier: 'early' | 'mid' | 'late'; cost: number; perYear: number; group?: string; everyYears?: number; give?: Partial<Resources>; gear?: 'superior' | 'rare' }[],
    },
    treasury: {
      marketLevel: 2,
      slots: 4,
      pool: [
        { kind: 'perm', price: 1500, weight: 3 },
        { kind: 'mat', price: 300, weight: 4 },
        { kind: 'gear_superior', price: 2000, weight: 3 },
        { kind: 'gear_rare', price: 6000, weight: 1 },
        { kind: 'life', price: 3000, weight: 1 },
        { kind: 'nascent', price: 4000, weight: 1 },
      ] as { kind: 'perm' | 'mat' | 'gear_superior' | 'gear_rare' | 'life' | 'nascent'; price: number; weight: number }[],
    },
    grandAuction: {
      marketLevel: 2,
      hall: 3,
      /** 大比隔年的這個月開拍，下個月開標 */
      month: 9,
      months: 2,
      reserve: { gear: 2000, recipe: 3000, mats: 1000 },
      mats: [3, 5] as [number, number],
      /** 參與競價的電腦宗門數 */
      bidders: 3,
      /** 電腦宗門出價：底價的百分比範圍，再乘性格倍率，最多出到自己靈石的一半 */
      bidPct: [70, 190] as [number, number],
      recipes: ['recipe.deity_pill', 'recipe.nascent_pill', 'recipe.crystal_robe', 'recipe.fire_blade', 'recipe.seal_talisman', 'recipe.bind_talisman', 'recipe.cloud_pill', 'recipe.eye_pill', 'recipe.ape_pill'],
    },
    buyOrders: {
      /** 每季第一個月（1、4、7、10 月）沒有收購單時開一張 */
      months: 3,
      pricePct: [150, 200] as [number, number],
      favor: 5,
      pool: [
        { resource: 'pill_heal', amount: 10 },
        { resource: 'pill_qi', amount: 10 },
        { resource: 'pill_peiyuan', amount: 6 },
        { resource: 'talisman_fire', amount: 8 },
        { resource: 'talisman_guard', amount: 8 },
        { slot: 'weapon', amount: 2 },
        { slot: 'armor', amount: 1 },
      ] as ({ resource: ResourceId; amount: number } | { slot: 'weapon' | 'armor'; amount: number })[],
      /** 法器收購單：良品以上 */
      gearQuality: 'fine',
    },
  },
};

export interface StatBonus {
  agi?: number;
  critPct?: number;
  dodgePct?: number;
  atkPct?: number;
  hpPct?: number;
  defPct?: number;
}
