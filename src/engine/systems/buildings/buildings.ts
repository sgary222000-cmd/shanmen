import type { ContentPack } from '../../../content/registry';
import type { BuildingDef, BuildingLevelDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { addInto, canAfford, formatResources, gain, shortfallText, RESOURCE_IDS, scaleResources, spend } from '../../resources';
import type { Building, Furnace, GameState, Resources, ScheduleKind, Skills, Station } from '../../types';
import { isRegionOpen, lineageDef, MAIN_REGION, regionDef } from '../regions/regions';

export const HALL = 'building.hall';
export const DORM = 'building.dorm';
export const FIELD = 'building.field';
export const QUARRY = 'building.quarry';
export const LUMBER = 'building.lumber';
export const ALCHEMY = 'building.alchemy';
export const ARRAY = 'building.array';
export const GARDEN = 'building.garden';
export const MINE = 'building.mine';
export const FORGE = 'building.forge';
export const TALISMAN = 'building.talisman';
export const MARKET = 'building.market';
export const LIBRARY = 'building.library';
export const TRAINING = 'building.training';
export const CAVE_ABODE = 'building.cave_abode';
export const BEAST_GARDEN = 'building.beast_garden';

export const STATIONS: Station[] = ['alchemy', 'forge', 'talisman'];

/** 三種工坊的對照：所在建築、使用的技藝、工作者的行程與介面用詞。 */
export const STATION_INFO: Record<
  Station,
  { building: string; skill: keyof Skills; schedule: ScheduleKind; bench: string; worker: string; verb: string; room: string; odds: string }
> = {
  alchemy: { building: ALCHEMY, skill: 'alchemy', schedule: 'alchemy', bench: '丹爐', worker: '掌爐', verb: '煉成', room: '煉丹房', odds: '成丹率' },
  forge: { building: FORGE, skill: 'forging', schedule: 'forge', bench: '器爐', worker: '掌爐', verb: '煉成', room: '煉器坊', odds: '成器率' },
  talisman: { building: TALISMAN, skill: 'talisman', schedule: 'talisman', bench: '符案', worker: '執筆', verb: '畫成', room: '符陣閣', odds: '成符率' },
};

export function isCraftSchedule(kind: ScheduleKind): boolean {
  return kind === 'alchemy' || kind === 'forge' || kind === 'talisman';
}

/** 取消施工時退還的比例 */
export const CANCEL_REFUND_PCT = 50;
/** 拆除時退還已投入造價的比例 */
export const DEMOLISH_REFUND_PCT = 50;
/** 不能拆除的建築（宗門根本） */
export const UNDEMOLISHABLE = [HALL, DORM];

export function findByDef(state: GameState, defId: string): Building | undefined {
  return state.buildings.find((b) => b.defId === defId);
}

export function allByDef(state: GameState, defId: string): Building[] {
  return state.buildings.filter((b) => b.defId === defId);
}

export function hallLevel(state: GameState): number {
  return findByDef(state, HALL)?.level ?? 0;
}

export function levelDef(def: BuildingDef, level: number): BuildingLevelDef | undefined {
  return def.levels[level - 1];
}

/** 建築目前是否能發揮效果（已完成且本月未因維護停用）。升級中的建築以目前等級運作。 */
export function isOperating(b: Building): boolean {
  return b.level >= 1 && b.status !== 'disabled' && b.status !== 'ruined' && !b.damaged;
}

export function effectsOf(content: ContentPack, b: Building) {
  const def = content.buildings.get(b.defId);
  return def && b.level >= 1 ? levelDef(def, b.level)?.effects : undefined;
}

/** 唯一建築目前生效的等級效果；不運作時回傳 undefined。 */
export function activeEffects(state: GameState, content: ContentPack, defId: string) {
  const b = findByDef(state, defId);
  if (!b || !isOperating(b)) return undefined;
  return effectsOf(content, b);
}

export function outerCapacity(state: GameState, content: ContentPack): number {
  const b = findByDef(state, DORM);
  if (!b || b.level < 1) return 0;
  return effectsOf(content, b)?.outerCapacity ?? 0;
}

export function innerLimit(state: GameState, content: ContentPack): number {
  return activeEffects(state, content, HALL)?.innerLimit ?? 0;
}

/** 區域的靈氣容量：區域本身 + 該區運作中的聚靈陣（符陣傳承另有加成）+ 洞府等其他建築。 */
export function qiCapacity(state: GameState, content: ContentPack, regionId: string = MAIN_REGION): number {
  const region = content.regions.get(regionId);
  if (!region) return 0;
  const arrayPct = 100 + lineageDef(state, content).bonuses.arrayQiPct;
  let fromArrays = 0;
  let other = 0;
  for (const b of state.buildings) {
    if (b.region !== regionId || !isOperating(b)) continue;
    const qi = effectsOf(content, b)?.qiCapacity ?? 0;
    if (b.defId === ARRAY) fromArrays += qi;
    else other += qi;
  }
  return region.baseQi + Math.floor((fromArrays * arrayPct) / 100) + other;
}

/** 是否擁有某傳承：主傳承或已開設的分支。 */
export function hasLineage(state: GameState, lineageId: string): boolean {
  return state.lineage === lineageId || state.branches.some((b) => b.lineageId === lineageId);
}

/** 傳承專屬建築不能建造的原因；undefined 表示可以。 */
export function exclusiveBlocked(state: GameState, content: ContentPack, def: BuildingDef): string | undefined {
  const ex = def.exclusive;
  if (!ex || hasLineage(state, ex.lineage) || ex.items.some((i) => state.items.includes(i))) return undefined;
  const name = content.lineages.get(ex.lineage)?.name ?? ex.lineage;
  return `${name}傳承專屬：需要${name}主傳承或分支${ex.items.length ? '，或取得馴獸法' : ''}`;
}

/** 運作中的某種工坊建築，依建築順序排列；爐位依此順序編號。 */
export function stationRooms(state: GameState, station: Station): Building[] {
  return state.buildings.filter((b) => b.defId === STATION_INFO[station].building && isOperating(b));
}

/** 一座工坊建築提供的爐位數（煉丹房為丹爐，煉器坊、符陣閣為器爐、符案）。 */
export function benchesOf(content: ContentPack, b: Building): number {
  const eff = effectsOf(content, b);
  return (b.defId === ALCHEMY ? eff?.furnaces : eff?.benches) ?? 0;
}

export function benchCount(state: GameState, content: ContentPack, station: Station): number {
  return stationRooms(state, station).reduce((n, b) => n + benchesOf(content, b), 0);
}

/** 第 index 個爐位所在的建築。 */
export function benchRoom(state: GameState, content: ContentPack, station: Station, index: number): Building | undefined {
  let n = 0;
  for (const b of stationRooms(state, station)) {
    n += benchesOf(content, b);
    if (index < n) return b;
  }
  return undefined;
}

/** 某種工坊的爐位設定（存檔中的陣列，可直接修改）。 */
export function benchList(state: GameState, station: Station): Furnace[] {
  return station === 'alchemy' ? state.furnaces : state.workshops[station];
}

export function alchemyRooms(state: GameState): Building[] {
  return stationRooms(state, 'alchemy');
}

export function furnaceCount(state: GameState, content: ContentPack): number {
  return benchCount(state, content, 'alchemy');
}

/** 第 index 座丹爐所在的煉丹房。 */
export function furnaceRoom(state: GameState, content: ContentPack, index: number): Building | undefined {
  return benchRoom(state, content, 'alchemy', index);
}

export function workerSlots(state: GameState, content: ContentPack, defId: string): number {
  return state.buildings
    .filter((b) => b.defId === defId && isOperating(b))
    .reduce((n, b) => n + (effectsOf(content, b)?.workerSlots ?? 0), 0);
}

export function usedSlots(state: GameState, regionId: string = MAIN_REGION): number {
  return state.buildings.filter((b) => b.region === regionId).length;
}

/** 依區域調整後的建造費用。 */
export function regionCost(content: ContentPack, regionId: string, cost: Partial<Resources>): Partial<Resources> {
  const pct = 100 + (content.regions.get(regionId)?.bonus.buildCostPct ?? 0);
  if (pct === 100) return { ...cost };
  const out: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = cost[id];
    if (v) out[id] = Math.ceil((v * pct) / 100);
  }
  return out;
}

export function regionAllows(content: ContentPack, regionId: string, defId: string): boolean {
  const only = content.buildings.get(defId)?.onlyRegions;
  if (only && !only.includes(regionId)) return false;
  const allows = content.regions.get(regionId)?.allows;
  return allows === 'any' || (allows ?? []).includes(defId);
}

export interface NewBuildOption {
  def: BuildingDef;
  regionId: string;
  next: BuildingLevelDef;
  cost: Partial<Resources>;
  /** 不能建造的原因；undefined 表示可以 */
  blocked: string | undefined;
}

/** 某區域可以新建的建築。 */
export function newBuildOptions(state: GameState, content: ContentPack, regionId: string): NewBuildOption[] {
  const hall = hallLevel(state);
  const region = regionDef(content, regionId);
  const out: NewBuildOption[] = [];
  for (const def of content.buildings.values()) {
    if (!regionAllows(content, regionId, def.id)) continue;
    const next = levelDef(def, 1);
    if (!next) continue;
    const cost = regionCost(content, regionId, next.cost);
    const count = allByDef(state, def.id).length;
    let blocked: string | undefined;
    if (def.maxTotal !== undefined && count >= def.maxTotal) {
      if (def.maxTotal === 1) continue; // 唯一建築已存在，只能在原地升級
      blocked = `最多 ${def.maxTotal} 座`;
    } else if (def.perRegion !== undefined && state.buildings.filter((b) => b.defId === def.id && b.region === regionId).length >= def.perRegion)
      blocked = `每個區域最多 ${def.perRegion} 座`;
    if (!blocked) {
      const ex = exclusiveBlocked(state, content, def);
      if (ex) blocked = ex;
      else if (!isRegionOpen(state, regionId)) blocked = `${region.name}尚未開放`;
      else if (def.unlockHall > hall) blocked = `需要大殿 ${def.unlockHall} 級才開放`;
      else if (next.requiresHall > hall) blocked = `需要大殿 ${next.requiresHall} 級`;
      else if (usedSlots(state, regionId) >= region.slots) blocked = `${region.name}建築槽位已滿`;
      else if (!canAfford(state.resources, cost)) blocked = shortfallText(state.resources, cost);
    }
    out.push({ def, regionId, next, cost, blocked });
  }
  return out;
}

export interface UpgradeOption {
  def: BuildingDef;
  building: Building;
  next: BuildingLevelDef | undefined;
  cost: Partial<Resources>;
  blocked: string | undefined;
}

/** 既有建築的升級（或殘破建築的修復）。 */
export function upgradeOption(state: GameState, content: ContentPack, building: Building): UpgradeOption {
  const def = content.buildings.get(building.defId);
  ensure(def, `建築資料錯誤：${building.defId}`);
  const hall = hallLevel(state);
  const next = levelDef(def, building.level + 1);
  const cost = next ? regionCost(content, building.region, next.cost) : {};
  let blocked: string | undefined;
  if (building.construction) blocked = '施工中';
  else if (!next) blocked = '已達本階段最高等級';
  else if (next.requiresHall > hall) blocked = `需要大殿 ${next.requiresHall} 級`;
  else if (!canAfford(state.resources, cost)) blocked = shortfallText(state.resources, cost);
  return { def, building, next, cost, blocked };
}

/** 在指定區域建造新建築；費用在開工時一次付清。 */
export function startConstruction(state: GameState, content: ContentPack, defId: string, regionId: string): void {
  const option = newBuildOptions(state, content, regionId).find((o) => o.def.id === defId);
  ensure(option, '這個區域不能建造這種建築');
  ensure(!option.blocked, option.blocked ?? '');
  spend(state.resources, option.cost);
  state.buildings.push({
    id: newId(state, 'b'),
    defId,
    region: regionId,
    level: 0,
    status: 'constructing',
    construction: { targetLevel: 1, remainingMonths: option.next.months, paid: { ...option.cost } },
    ...(defId === FIELD ? { crop: 'food' as const } : {}),
  });
}

/** 升級或修復既有建築。 */
export function startUpgrade(state: GameState, content: ContentPack, buildingId: string): void {
  const b = state.buildings.find((x) => x.id === buildingId);
  ensure(b, '沒有這座建築');
  const option = upgradeOption(state, content, b);
  ensure(!option.blocked, option.blocked ?? '');
  const next = option.next;
  ensure(next, '已達最高等級');
  spend(state.resources, option.cost);
  b.construction = { targetLevel: next.level, remainingMonths: next.months, paid: { ...option.cost } };
  if (b.level === 0) b.status = 'constructing';
}

export function cancelConstruction(state: GameState, buildingId: string): void {
  const b = state.buildings.find((x) => x.id === buildingId);
  ensure(b?.construction, '這座建築沒有在施工');
  gain(state.resources, scaleResources(b.construction.paid, CANCEL_REFUND_PCT));
  b.construction = null;
  if (b.level === 0) {
    if (b.defId === HALL) b.status = 'ruined';
    else state.buildings = state.buildings.filter((x) => x.id !== buildingId);
  }
}

/** 拆除退還的資源：已完成各等級基本造價的一半。 */
export function demolishRefund(content: ContentPack, b: Building): Partial<Resources> {
  const def = content.buildings.get(b.defId);
  const total: Partial<Resources> = {};
  for (let lv = 1; lv <= b.level; lv++) {
    const l = def ? levelDef(def, lv) : undefined;
    if (l) addInto(total, l.cost);
  }
  return scaleResources(total, DEMOLISH_REFUND_PCT);
}

export function demolishBlocked(b: Building): string | undefined {
  if (UNDEMOLISHABLE.includes(b.defId)) return '宗門大殿與弟子居所不能拆除';
  if (b.construction) return '施工中，請先取消施工';
  return undefined;
}

/** 拆除建築，空出槽位。 */
export function demolish(state: GameState, content: ContentPack, buildingId: string): string {
  const b = state.buildings.find((x) => x.id === buildingId);
  ensure(b, '沒有這座建築');
  const blocked = demolishBlocked(b);
  ensure(!blocked, blocked ?? '');
  const refund = demolishRefund(content, b);
  gain(state.resources, refund);
  state.buildings = state.buildings.filter((x) => x.id !== buildingId);
  // 爐位變少時，超出的爐位工作者回到日常修煉
  for (const station of STATIONS) {
    const slots = benchCount(state, content, station);
    benchList(state, station).forEach((f, i) => {
      if (i < slots || !f.alchemistId) return;
      const c = [state.protagonist, ...state.disciples].find((x) => x.id === f.alchemistId);
      if (c && c.schedule === STATION_INFO[station].schedule) c.schedule = 'cultivate';
      f.alchemistId = null;
    });
  }
  const name = content.buildings.get(b.defId)?.name ?? b.defId;
  return `已拆除${name}，退還 ${formatResources(refund)}。`;
}

/** 月結算第 3 步：推進施工。本月完成的建築下個月才開始運作。 */
export function progressConstruction(state: GameState, content: ContentPack, lines: string[]): void {
  for (const b of state.buildings) {
    if (!b.construction) continue;
    b.construction.remainingMonths -= 1;
    if (b.construction.remainingMonths <= 0) {
      b.level = b.construction.targetLevel;
      b.construction = null;
      if (b.status === 'constructing' || b.status === 'ruined') b.status = 'active';
      const name = content.buildings.get(b.defId)?.name ?? b.defId;
      const where = content.regions.get(b.region)?.name ?? '';
      lines.push(`${where}${name}${b.level === 1 ? '完工' : `升至 ${b.level} 級`}，下月開始運作。`);
    }
  }
}

/** 給玩家看的建築名稱（含區域）。 */
export function buildingLabel(content: ContentPack, b: Building): string {
  return `${content.regions.get(b.region)?.name ?? ''}・${content.buildings.get(b.defId)?.name ?? b.defId}`;
}

