// 世界狀態型別。所有數值為整數；機率以萬分比（0–10000）表示。
// 存檔只保存這裡的資料與內容 ID，不保存內容定義本身。

export type ResourceId =
  | 'lingshi' // 靈石
  | 'food' // 糧食
  | 'stone' // 石材
  | 'wood' // 靈木
  | 'herb' // 藥草
  | 'pill_qi' // 聚氣丹
  | 'pill_heal' // 回春丹
  | 'pill_foundation'; // 築基丹

export type Resources = Record<ResourceId, number>;

export interface GameDate {
  year: number; // 從 1 開始
  month: number; // 1–12
}

export type RngStream = 'world' | 'recruit' | 'alchemy' | 'combat' | 'explore' | 'cultivation';
/** xoshiro128** 狀態，四個 32 位元無號整數。 */
export type RngState = [number, number, number, number];

export type MajorRealm = 'qi' | 'foundation';

export interface Realm {
  major: MajorRealm;
  /** 煉氣 1–9；築基 1–4（前期、中期、後期、圓滿） */
  stage: number;
}

export type RootGrade = 'low' | 'mid' | 'high' | 'heaven';
export type Element = 'metal' | 'wood' | 'water' | 'fire' | 'earth';

export interface SpiritRoot {
  grade: RootGrade;
  elements: Element[];
}

export interface Skills {
  alchemy: number; // 0–20
  farming: number;
  combat: number;
}

/** 主角行程與具名弟子的本月工作。 */
export type ScheduleKind =
  | 'cultivate' // 日常修煉（弟子預設）
  | 'seclusion' // 閉關（主角，可多月）
  | 'teach' // 授課（主角）
  | 'alchemy' // 煉丹
  | 'heal' // 療傷
  | 'breakthrough' // 突破
  | 'explore'; // 探索（由探索系統設定）

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
}

export interface Protagonist extends Character {
  role: 'protagonist';
  seclusion: Seclusion | null;
}

export type OuterJob = 'field' | 'quarry' | 'lumber' | 'errand' | 'cultivate';

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
}

export type BuildingStatus = 'active' | 'constructing' | 'disabled' | 'ruined';

export interface Building {
  id: string;
  defId: string;
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

export interface Furnace {
  /** 負責人物 ID；null 表示閒置 */
  alchemistId: string | null;
  recipeId: string | null;
  /** 重複煉製；false 時煉完一次即清除配方 */
  repeat: boolean;
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
  furnaces: Furnace[];
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
  /** 統計，用於驗收與平衡紀錄 */
  stats: { commands: number; monthsAdvanced: number; explorations: number };
}
