import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { BuildingDef, BuildingLevelDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { canAfford, formatResources, gain, scaleResources, spend } from '../../resources';
import type { Building, GameState } from '../../types';

export const HALL = 'building.hall';
export const DORM = 'building.dorm';
export const FIELD = 'building.field';
export const QUARRY = 'building.quarry';
export const LUMBER = 'building.lumber';
export const ALCHEMY = 'building.alchemy';
export const ARRAY = 'building.array';

/** 取消施工時退還的比例 */
export const CANCEL_REFUND_PCT = 50;

export function findByDef(state: GameState, defId: string): Building | undefined {
  return state.buildings.find((b) => b.defId === defId);
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

/** 目前生效的等級效果；不運作時回傳 undefined。 */
export function activeEffects(state: GameState, content: ContentPack, defId: string) {
  const b = findByDef(state, defId);
  if (!b || !isOperating(b)) return undefined;
  const def = content.buildings.get(defId);
  return def ? levelDef(def, b.level)?.effects : undefined;
}

export function outerCapacity(state: GameState, content: ContentPack): number {
  const b = findByDef(state, DORM);
  const def = content.buildings.get(DORM);
  if (!b || !def || b.level < 1) return 0;
  return levelDef(def, b.level)?.effects.outerCapacity ?? 0;
}

export function innerLimit(state: GameState, content: ContentPack): number {
  return activeEffects(state, content, HALL)?.innerLimit ?? 0;
}

export function qiCapacity(state: GameState, content: ContentPack): number {
  return balance.baseQiCapacity + (activeEffects(state, content, ARRAY)?.qiCapacity ?? 0);
}

export function furnaceCount(state: GameState, content: ContentPack): number {
  return activeEffects(state, content, ALCHEMY)?.furnaces ?? 0;
}

export function workerSlots(state: GameState, content: ContentPack, defId: string): number {
  return activeEffects(state, content, defId)?.workerSlots ?? 0;
}

export function usedSlots(state: GameState): number {
  return state.buildings.length;
}

export interface BuildOption {
  def: BuildingDef;
  /** 已存在的建築 */
  existing: Building | undefined;
  /** 下一個可建造或升級的等級 */
  next: BuildingLevelDef | undefined;
  /** 不能建造的原因；undefined 表示可以 */
  blocked: string | undefined;
}

export function buildOptions(state: GameState, content: ContentPack): BuildOption[] {
  const hall = hallLevel(state);
  return [...content.buildings.values()].map((def) => {
    const existing = findByDef(state, def.id);
    const nextLevel = (existing?.level ?? 0) + 1;
    const next = levelDef(def, nextLevel);
    let blocked: string | undefined;
    if (def.unlockHall > hall && !existing) blocked = `需要大殿 ${def.unlockHall} 級才開放`;
    else if (existing?.construction) blocked = '施工中';
    else if (!next) blocked = '已達本階段最高等級';
    else if (next.requiresHall > hall) blocked = `需要大殿 ${next.requiresHall} 級`;
    else if (!existing && usedSlots(state) >= balance.slots) blocked = '主峰建築槽位已滿';
    else if (!canAfford(state.resources, next.cost)) blocked = `材料不足（需要 ${formatResources(next.cost)}）`;
    return { def, existing, next, blocked };
  });
}

/** 建造新建築或升級／修復既有建築；費用在開工時一次付清。 */
export function startConstruction(state: GameState, content: ContentPack, defId: string): void {
  const option = buildOptions(state, content).find((o) => o.def.id === defId);
  ensure(option, '沒有這種建築');
  ensure(!option.blocked, option.blocked ?? '');
  const next = option.next;
  ensure(next, '已達最高等級');
  spend(state.resources, next.cost);
  const construction = { targetLevel: next.level, remainingMonths: next.months, paid: { ...next.cost } };
  if (option.existing) {
    option.existing.construction = construction;
    if (option.existing.level === 0) option.existing.status = 'constructing';
  } else {
    state.buildings.push({
      id: newId(state, 'b'),
      defId,
      level: 0,
      status: 'constructing',
      construction,
      ...(defId === FIELD ? { crop: 'food' as const } : {}),
    });
  }
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
      lines.push(`${name}${b.level === 1 ? '完工' : `升至 ${b.level} 級`}，下月開始運作。`);
    }
  }
}
