// 世界狀態型別。所有數值為整數；機率以萬分比（0–10000）表示。
// 存檔只保存這裡的資料與內容 ID，不保存內容定義本身。

export type ResourceId =
  | 'lingshi' // 靈石
  | 'food' // 糧食
  | 'stone' // 石材
  | 'wood' // 靈木
  | 'herb' // 藥草
  | 'spirit_herb' // 靈藥（P1）
  | 'ore' // 靈礦（P1）
  | 'paper' // 符紙（P1）
  | 'beast_mat' // 獸材（P1）
  | 'pill_qi' // 聚氣丹
  | 'pill_heal' // 回春丹
  | 'pill_foundation' // 築基丹
  | 'pill_peiyuan' // 培元丹（P1，築基期修煉用）
  | 'talisman_fire' // 火符（P1）
  | 'talisman_guard' // 護身符（P1）
  | 'artifact' // 法器（P1；可裝備，見 equipment）
  | 'beast_egg' // 靈獸蛋（P1 批次 C）
  | 'pill_core'; // 結丹靈液（P1 批次 D）

export type Resources = Record<ResourceId, number>;

export interface GameDate {
  year: number; // 從 1 開始
  month: number; // 1–12
}

export type RngStream =
  | 'world'
  | 'recruit'
  | 'alchemy'
  | 'combat'
  | 'explore'
  | 'cultivation'
  | 'market'
  | 'commission'
  | 'beast'
  | 'sects';
/** xoshiro128** 狀態，四個 32 位元無號整數。 */
export type RngState = [number, number, number, number];

export type MajorRealm = 'qi' | 'foundation' | 'core';

export interface Realm {
  major: MajorRealm;
  /** 煉氣 1–9；築基、金丹 1–4（前期、中期、後期、圓滿） */
  stage: number;
}

export type RootGrade = 'low' | 'mid' | 'high' | 'heaven';
export type Element = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export interface SpiritRoot {
  grade: RootGrade;
  elements: Element[];
}

export interface Skills {
  alchemy: number; // 煉丹 0–20
  farming: number; // 耕作
  combat: number; // 戰鬥
  forging: number; // 煉器（P1）
  talisman: number; // 符陣（P1）
  beast: number; // 御獸（P1）
  affairs: number; // 庶務（P1）
}

/** 主角行程與具名弟子的本月工作。 */
export type ScheduleKind =
  | 'cultivate' // 日常修煉（弟子預設）
  | 'seclusion' // 閉關（主角，可多月）
  | 'teach' // 授課（主角）
  | 'alchemy' // 煉丹
  | 'forge' // 煉器（P1）
  | 'talisman' // 製符（P1）
  | 'heal' // 療傷
  | 'breakthrough' // 突破
  | 'research' // 研究功法（P1 批次 C，需藏經閣）
  | 'explore' // 探索（由探索系統設定）
  | 'dispatch'; // 秘境派遣（P1 批次 D，由派遣系統設定）

export interface Seclusion {
  plannedMonths: number;
  remainingMonths: number;
  /** 已連續閉關的月數，提供修煉加成；中斷時歸零。 */
  streak: number;
}

export type CharacterRole = 'protagonist' | 'inner';

export interface Character {
  id: string;
  name: string;
  gender: 'male' | 'female';
  role: CharacterRole;
  /** 年齡（月） */
  ageMonths: number;
  realm: Realm;
  /** 目前小階段累積的修為 */
  xp: number;
  root: SpiritRoot;
  /** 0–100 */
  health: number;
  /** 剩餘受傷月數；大於 0 時不能探索或突破，修煉效率減半 */
  injuryMonths: number;
  /** 0–100 */
  loyalty: number;
  skills: Skills;
  schedule: ScheduleKind;
  /** 本月是否服用聚氣丹 */
  takePill: boolean;
  /** 修煉地點（區域 ID），佔用該區域的靈氣 */
  seat: string;
  /** 專長技藝（招收時決定，起始較高、成長較快）；主角與舊存檔人物為 null */
  specialty: keyof Skills | null;
  /** 主修功法的領悟度（入門 0、小成 100、大成 300，見 balance.technique） */
  insight: number;
  /** 裝備的法器 ID（content.equipment）；null 表示沒有 */
  equipment: string | null;
}

export interface Protagonist extends Character {
  role: 'protagonist';
  seclusion: Seclusion | null;
}

export type OuterJob = 'field' | 'quarry' | 'lumber' | 'garden' | 'mine' | 'errand' | 'cultivate';

export interface OuterDisciples {
  count: number;
  /** 各分工人數；未分配者視為修煉。 */
  jobs: Record<Exclude<OuterJob, 'cultivate'>, number>;
  /** 0–100 */
  satisfaction: number;
  /** 0–100，影響選拔出的內門資質 */
  training: number;
  /** 連續缺糧月數 */
  hungerMonths: number;
  /** 本月接了勞務委託、外出幫工的人數（月底歸零） */
  labor: number;
}

export type BuildingStatus = 'active' | 'constructing' | 'disabled' | 'ruined';

export interface Building {
  id: string;
  defId: string;
  /** 所在區域 ID */
  region: string;
  /** 已完成的等級；殘破建築為 0 */
  level: number;
  status: BuildingStatus;
  /** 施工中：目標等級與剩餘月數 */
  construction: { targetLevel: number; remainingMonths: number; paid: Partial<Resources> } | null;
  /** 靈田作物 */
  crop?: 'food' | 'herb';
  /** 本月因維護不足停用 */
  disabledReason?: string;
}

export type RegionStatus = 'locked' | 'opening' | 'open';

export interface RegionState {
  status: RegionStatus;
  /** 開路施工中：剩餘月數與已付費用 */
  construction: { remainingMonths: number; paid: Partial<Resources> } | null;
}

export type BeastTask = 'follow' | 'gather' | 'rest';

/** 靈獸。由靈獸苑孵化，成長分幼年、成年。 */
export interface Beast {
  id: string;
  speciesId: string;
  name: string;
  /** 主人人物 ID；每人最多一隻。null 表示養在靈獸苑 */
  ownerId: string | null;
  stage: 'young' | 'adult';
  /** 成長點數；達 balance.beasts.adultGrowth 時長為成年 */
  growth: number;
  /** follow：隨主人出戰（不佔隊伍名額）；gather：外出採集；rest：休養 */
  task: BeastTask;
}

export type PositionId = 'mentor' | 'alchemy' | 'forge' | 'steward' | 'envoy';

/** 傳承分支：開設後取得該傳承的專屬建築與基礎配方。 */
export interface Branch {
  lineageId: string;
  /** 主持人（內門弟子） */
  hostId: string;
}

/** 秘境派遣：已通關的秘境，派小隊自動結算。 */
export interface Dispatch {
  id: string;
  realmId: string;
  teamIds: string[];
  monthsLeft: number;
}

export type SectTemperament = 'steady' | 'merchant' | 'warlike';
export type SectGoal = 'build' | 'recruit' | 'train' | 'trade';

/** 電腦宗門（P1 批次 E）。只做合法行動：缺料就不能建設。 */
export interface SectState {
  id: string;
  resources: { lingshi: number; food: number; stone: number; wood: number };
  population: number;
  /** 建築總等級 */
  buildings: number;
  /** 綜合實力（決定大比出戰弟子的強弱） */
  power: number;
  /** 對我宗的好感 0–100 */
  favor: number;
  /** 今年已收的禮數（送禮效果遞減） */
  giftsThisYear: number;
  /** 本月已與我宗交易的批數 */
  tradedThisMonth: number;
  goal: SectGoal;
  /** 本月想收購的物資 */
  wants: ResourceId;
}

export interface IntelEntry {
  date: GameDate;
  sectId: string;
  text: string;
}

export interface TournamentStanding {
  sectId: string | null; // null 為我宗
  name: string;
  points: number;
  duelWins: number;
}

/** 年度大比：每 3 年一次。 */
export interface TournamentState {
  year: number;
  status: 'open' | 'done' | 'skipped';
  standings: TournamentStanding[];
  log: string[];
  /** 我宗名次（1 起）；未參加為 null */
  rank: number | null;
}

/** 靈脈競標。 */
export interface AuctionState {
  id: string;
  name: string;
  /** 得標後每月靈礦與持續年數 */
  orePerMonth: number;
  years: number;
  /** 截止月份（monthIndex，該月月底開標） */
  deadline: number;
  /** 我宗出價（已預扣靈石，落標退還） */
  playerBid: number;
}

export interface Vein {
  name: string;
  orePerMonth: number;
  /** 最後一個有收入的月份（monthIndex） */
  until: number;
}

export interface Furnace {
  /** 負責人物 ID；null 表示閒置 */
  alchemistId: string | null;
  recipeId: string | null;
  /** 重複煉製；false 時煉完一次即清除配方 */
  repeat: boolean;
  /** 庫存保留量：做完後任何材料（靈石除外）會低於此數就停工；未設或 0 表示不保留 */
  keep?: number;
}

/** 工坊種類：煉丹房的丹爐、煉器坊的器爐、符陣閣的符案。 */
export type Station = 'alchemy' | 'forge' | 'talisman';

/** 坊市某商品本月的行情。價格以「一批」計，見 balance.market。 */
export interface MarketGood {
  /** 本月價格相對基準價的百分比（70–130） */
  pct: number;
  /** 本月可買批數（坊市 1 級時；等級越高越多） */
  stock: number;
  /** 本月收購批數 */
  demand: number;
  /** 本月已買、已賣批數 */
  bought: number;
  sold: number;
}

export interface MarketState {
  goods: Partial<Record<ResourceId, MarketGood>>;
  /** 本月行情消息，例如某宗大量收購丹藥 */
  rumor: string | null;
}

export type CommissionKind = 'labor' | 'deliver' | 'escort';

/** 委託榜上的一件委託。 */
export interface Commission {
  id: string;
  templateId: string;
  title: string;
  text: string;
  kind: CommissionKind;
  /** 勞務：最多派幾名外門；報酬依人數 */
  workers?: number;
  /** 交付：需要交出的物資 */
  deliver?: Partial<Resources>;
  /** 護衛：會遇到的敵人與隊伍上限 */
  enemies?: string[];
  maxTeam?: number;
  /** 報酬；勞務委託為每人報酬 */
  reward: Partial<Resources>;
  reputation: number;
  /** 護衛類委託（劍修報酬加成） */
  guard: boolean;
  /** 最後一個可接的月份（monthIndex） */
  expires: number;
}

export interface CombatUnitSnapshot {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
}

export type ExplorationStatus = 'active' | 'completed' | 'retreated' | 'defeated';

export interface CombatStrategy {
  /** 生命低於門檻時服用回春丹 */
  useHealPill: boolean;
  /** 戰鬥開始時使用護身符、火符（各一張） */
  useTalismans: boolean;
  /** 優先攻擊生命最低的敵人；關閉時依站位順序攻擊 */
  focusLowest: boolean;
}

export type Row = 'front' | 'back';

export interface ExplorationRun {
  realmId: string;
  teamIds: string[];
  rows: Record<string, Row>;
  nodeId: string;
  visited: string[];
  /** 每位隊員目前生命 */
  hp: Record<string, number>;
  /** 本次取得、尚未入庫的物資 */
  loot: Partial<Resources>;
  /** 本次解鎖的配方（完成時才生效） */
  unlocks: string[];
  status: ExplorationStatus;
  /** 事件節點已做的選擇：節點 ID → 選項 ID */
  choices: Record<string, string>;
  log: string[];
  /** 是否為首次通關的路線（決定首領獎勵） */
  firstClear: boolean;
}

export interface BattleRecord {
  id: string;
  date: GameDate;
  title: string;
  result: 'win' | 'lose' | 'draw';
  rounds: number;
  highlights: string[];
  log: string[];
  allies: CombatUnitSnapshot[];
  enemies: CombatUnitSnapshot[];
}

export interface Candidate {
  id: string;
  name: string;
  gender: 'male' | 'female';
  ageMonths: number;
  root: SpiritRoot;
  skills: Skills;
  specialty?: keyof Skills;
  cost: number;
}

export interface PendingEvent {
  id: string;
  kind: 'recruitment' | 'notice';
  title: string;
  text: string;
  /** 阻擋推進月份，直到處理 */
  blocking: boolean;
  candidates?: Candidate[];
  outerJoined?: number;
}

export interface MonthReport {
  date: GameDate;
  lines: string[];
  delta: Partial<Resources>;
}

export interface TutorialState {
  skipped: boolean;
  /** 只能由「查看」行為設定的旗標 */
  viewedLedger: boolean;
  /** 已完成過的步驟（一旦完成不會倒退） */
  done: string[];
}

export interface GameState {
  /** 世界狀態格式版本，與存檔格式版本一致 */
  version: number;
  sectName: string;
  lineage: string;
  date: GameDate;
  resources: Resources;
  protagonist: Protagonist;
  disciples: Character[];
  outer: OuterDisciples;
  buildings: Building[];
  /** 各區域的開放狀態 */
  regions: Record<string, RegionState>;
  beasts: Beast[];
  furnaces: Furnace[];
  /** 煉器坊的器爐與符陣閣的符案（P1 批次 B） */
  workshops: { forge: Furnace[]; talisman: Furnace[] };
  /** 坊市行情（每月月底更新） */
  market: MarketState;
  /** 委託榜 */
  commissions: Commission[];
  /** 聲望：進度指標，不能花用；影響招生與坊市折扣 */
  reputation: number;
  /** 已學會的配方 */
  recipes: string[];
  exploration: ExplorationRun | null;
  /** 本月是否已進行過探索 */
  exploredThisMonth: boolean;
  /** 已探索完成的秘境與次數 */
  realmClears: Record<string, number>;
  /** 唯一獎勵領取紀錄，領過不可再領 */
  claimedRewards: string[];
  /** 探索結束後待月結算入庫的物資 */
  pendingLoot: Partial<Resources>;
  events: PendingEvent[];
  reports: MonthReport[];
  battles: BattleRecord[];
  /** 下次山門招生的總月數 */
  nextRecruitMonth: number;
  rng: Record<RngStream, RngState>;
  nextId: number;
  tutorial: TutorialState;
  /** 本月與山下商隊的交易量（月底歸零） */
  trade: { soldLingshi: number; boughtFood: number };
  /** 自動戰鬥策略 */
  strategy: CombatStrategy;
  /** 職位（P1 批次 C）：職位 → 人物 ID */
  positions: Record<PositionId, string | null>;
  /** 庫房裡未裝備的獨特法器 ID（一般法器以資源 artifact 計數） */
  armory: string[];
  /** 關鍵物品：傳承典籍、馴獸法等 */
  items: string[];
  branches: Branch[];
  dispatches: Dispatch[];
  /** 電腦宗門（P1 批次 E） */
  sects: SectState[];
  /** 情報紀錄（新的在前） */
  intel: IntelEntry[];
  tournament: TournamentState | null;
  auction: AuctionState | null;
  veins: Vein[];
  /** 統計，用於驗收與平衡紀錄 */
  stats: { commands: number; monthsAdvanced: number; explorations: number };
}
