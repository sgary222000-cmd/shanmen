import type { ContentPack } from '../../../content/registry';
import type { BuildingDef, BuildingLevelDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { addInto, canAfford, formatResources, gain, RESOURCE_IDS, scaleResources, spend } from '../../resources';
import type { Building, GameState, Resources } from '../../types';
import { isRegionOpen, lineageDef, MAIN_REGION, regionDef } from '../regions/regions';

export const HALL = 'building.hall';
export const DORM = 'building.dorm';
export const FIELD = 'building.field';
export const QUARRY = 'building.quarry';
export const LUMBER = 'building.lumber';
export const ALCHEMY = 'building.alchemy';
export const ARRAY = 'building.array';

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
  return b.level >= 1 && b.status !== 'disabled' && b.status !== 'ruined';
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

/** 區域的靈氣容量：區域本身 + 該區運作中的聚靈陣（符陣傳承另有加成）。 */
export function qiCapacity(state: GameState, content: ContentPack, regionId: string = MAIN_REGION): number {
  const region = content.regions.get(regionId);
  if (!region) return 0;
  const arrayPct = 100 + lineageDef(state, content).bonuses.arrayQiPct;
  let fromArrays = 0;
  for (const b of state.buildings) {
    if (b.defId !== ARRAY || b.region !== regionId || !isOperating(b)) continue;
    fromArrays += effectsOf(content, b)?.qiCapacity ?? 0;
  }
  return region.baseQi + Math.floor((fromArrays * arrayPct) / 100);
}

/** 運作中的煉丹房，依建築順序排列；丹爐依此順序編號。 */
export function alchemyRooms(state: GameState): Building[] {
  return state.buildings.filter((b) => b.defId === ALCHEMY && isOperating(b));
}

export function furnaceCount(state: GameState, content: ContentPack): number {
  return alchemyRooms(state).reduce((n, b) => n + (effectsOf(content, b)?.furnaces ?? 0), 0);
}

/** 第 index 座丹爐所在的煉丹房。 */
export function furnaceRoom(state: GameState, content: ContentPack, index: number): Building | undefined {
  let n = 0;
  for (const b of alchemyRooms(state)) {
    n += effectsOf(content, b)?.furnaces ?? 0;
    if (index < n) return b;
  }
  return undefined;
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
      if (!isRegionOpen(state, regionId)) blocked = `${region.name}尚未開放`;
      else if (def.unlockHall > hall) blocked = `需要大殿 ${def.unlockHall} 級才開放`;
      else if (next.requiresHall > hall) blocked = `需要大殿 ${next.requiresHall} 級`;
      else if (usedSlots(state, regionId) >= region.slots) blocked = `${region.name}建築槽位已滿`;
      else if (!canAfford(state.resources, cost)) blocked = `材料不足（需要 ${formatResources(cost)}）`;
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
  else if (!canAfford(state.resources, cost)) blocked = `材料不足（需要 ${formatResources(cost)}）`;
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
  // 丹爐變少時，超出的丹爐掌爐者回到日常修煉
  const slots = furnaceCount(state, content);
  state.furnaces.forEach((f, i) => {
    if (i < slots || !f.alchemistId) return;
    const c = [state.protagonist, ...state.disciples].find((x) => x.id === f.alchemistId);
    if (c && c.schedule === 'alchemy') c.schedule = 'cultivate';
    f.alchemistId = null;
  });
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

