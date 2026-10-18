import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { addInto, canAfford, RESOURCE_IDS } from '../../resources';
import type { Building, GameState, Resources } from '../../types';
import { effectsOf, furnaceCount, furnaceRoom, FIELD, levelDef, LUMBER, QUARRY } from '../buildings/buildings';
import { productionBonusPct } from '../regions/regions';
import { allCharacters } from '../characters/characters';

// 每月收支計畫。預覽與實際結算共用同一份計算，確保「預覽等於結算」。
// 規則：所有消耗只從「月初庫存」扣除（第 2 步），產出在第 3 步入庫，下個月才能使用。

export interface FurnacePlan {
  index: number;
  recipeId: string;
  alchemistId: string;
  runs: boolean;
  reason?: string;
  successBp: number;
}

export interface MonthPlan {
  /** 第 2 步依優先順序實際扣除的資源 */
  consumption: Partial<Resources>;
  /** 第 3 步確定的產出（不含煉丹等隨機結果） */
  production: Partial<Resources>;
  /** 煉丹等隨機產出的期望值，僅供顯示 */
  expected: Partial<Resources>;
  /** 本月缺糧（不足的份數） */
  foodShortfall: number;
  foodNeed: number;
  /** 因維護不足而停用的建築 ID */
  unpaidBuildings: string[];
  /** 本月能服用聚氣丹的人物 */
  pillTakers: string[];
  /** 本月有築基丹可突破的人物 */
  breakthroughReady: string[];
  furnaces: FurnacePlan[];
  /** 給玩家看的說明 */
  notes: string[];
}

export function foodNeed(state: GameState): number {
  return (
    state.outer.count * balance.food.outerPerPerson +
    Math.ceil(state.disciples.length / 2) * balance.food.innerPerTwo
  );
}

export interface AlchemyOdds {
  bp: number;
  parts: string[];
}

/** 成丹率：丹方基礎 + 技藝 + 煉丹房等級 + 所在區域 + 傳承。furnaceIndex 決定是哪一座煉丹房。 */
export function alchemyOdds(
  state: GameState,
  content: ContentPack,
  recipeId: string,
  alchemistId: string,
  furnaceIndex = 0,
): AlchemyOdds {
  const recipe = content.recipes.get(recipeId);
  const alchemist = allCharacters(state).find((c) => c.id === alchemistId);
  if (!recipe || !alchemist) return { bp: 0, parts: [] };
  const parts = [`丹方 ${recipe.baseSuccessBp / 100}%`];
  let bp = recipe.baseSuccessBp;
  const skill = alchemist.skills.alchemy * balance.alchemy.skillBpPerPoint;
  if (skill) {
    bp += skill;
    parts.push(`技藝 +${skill / 100}%`);
  }
  const room = furnaceRoom(state, content, furnaceIndex);
  if (room) {
    const roomBp = effectsOf(content, room)?.alchemyBonusBp ?? 0;
    if (roomBp) {
      bp += roomBp;
      parts.push(`煉丹房 ${room.level} 級 +${roomBp / 100}%`);
    }
    const region = content.regions.get(room.region);
    if (region?.bonus.alchemyBonusBp) {
      bp += region.bonus.alchemyBonusBp;
      parts.push(`${region.name} +${region.bonus.alchemyBonusBp / 100}%`);
    }
  }
  const lineage = content.lineages.get(state.lineage);
  if (lineage?.bonuses.alchemyBonusBp) {
    bp += lineage.bonuses.alchemyBonusBp;
    parts.push(`${lineage.name}傳承 +${lineage.bonuses.alchemyBonusBp / 100}%`);
  }
  return { bp: Math.min(9500, bp), parts };
}

export function alchemySuccessBp(state: GameState, content: ContentPack, recipeId: string, alchemistId: string, furnaceIndex = 0): number {
  return alchemyOdds(state, content, recipeId, alchemistId, furnaceIndex).bp;
}

function take(pool: Resources, used: Partial<Resources>, cost: Partial<Resources>): boolean {
  if (!canAfford(pool, cost)) return false;
  for (const id of RESOURCE_IDS) pool[id] -= cost[id] ?? 0;
  addInto(used, cost);
  return true;
}

/**
 * 外門工人填入同種建築的順序：種糧食的靈田優先（避免工人全跑去種藥草而缺糧），
 * 其次區域與傳承加成高者，同加成依建造順序。
 */
export function fillOrder(
  state: GameState,
  content: ContentPack,
  defId: string,
  operating: (b: Building) => boolean = (b) => b.level >= 1 && b.status !== 'ruined',
): { b: Building; pct: number }[] {
  return state.buildings
    .map((b, order) => ({ b, order, pct: 100 + productionBonusPct(state, content, b.region, defId) }))
    .filter(({ b }) => b.defId === defId && operating(b))
    .sort((x, y) => Number(x.b.crop === 'herb') - Number(y.b.crop === 'herb') || y.pct - x.pct || x.order - y.order);
}

/** 每座建築本月分到的外門工人數，供介面顯示。 */
export function workersByBuilding(state: GameState, content: ContentPack): Record<string, number> {
  const out: Record<string, number> = {};
  const jobs = state.outer.jobs;
  for (const [defId, workers] of [[FIELD, jobs.field], [QUARRY, jobs.quarry], [LUMBER, jobs.lumber]] as const) {
    let left = workers;
    for (const site of fillOrder(state, content, defId)) {
      const n = Math.min(left, effectsOf(content, site.b)?.workerSlots ?? 0);
      left -= n;
      out[site.b.id] = n;
    }
  }
  return out;
}

export function planMonth(state: GameState, content: ContentPack): MonthPlan {
  const pool: Resources = { ...state.resources };
  const consumption: Partial<Resources> = {};
  const notes: string[] = [];

  // 1. 糧食
  const need = foodNeed(state);
  const eaten = Math.min(need, pool.food);
  pool.food -= eaten;
  if (eaten) consumption.food = eaten;
  const foodShortfall = need - eaten;
  if (foodShortfall > 0) notes.push(`糧食不足 ${foodShortfall} 份，外門弟子將挨餓。`);

  // 2. 建築維護（依建築順序）
  const unpaidBuildings: string[] = [];
  for (const b of state.buildings) {
    if (b.level < 1) continue;
    const def = content.buildings.get(b.defId);
    const lv = def ? levelDef(def, b.level) : undefined;
    if (!lv) continue;
    if (!take(pool, consumption, lv.maintenance)) {
      unpaidBuildings.push(b.id);
      notes.push(`${def?.name ?? b.defId}維護費不足，本月停用。`);
    }
  }
  const operating = (b: Building | undefined) =>
    !!b && b.level >= 1 && b.status !== 'ruined' && !unpaidBuildings.includes(b.id);

  // 3. 突破用築基丹
  const breakthroughReady: string[] = [];
  for (const c of allCharacters(state)) {
    if (c.schedule !== 'breakthrough') continue;
    if (take(pool, consumption, { pill_foundation: 1 })) breakthroughReady.push(c.id);
    else notes.push(`${c.name}缺少築基丹，本月無法突破。`);
  }

  // 4. 修煉用聚氣丹
  const pillTakers: string[] = [];
  for (const c of allCharacters(state)) {
    if (!c.takePill) continue;
    if (take(pool, consumption, { pill_qi: 1 })) pillTakers.push(c.id);
    else notes.push(`聚氣丹不足，${c.name}本月未服丹。`);
  }

  // 5. 煉丹投入（只計本月有付維護費的煉丹房）
  const unpaidRooms = state.buildings.filter((b) => b.defId === 'building.alchemy' && unpaidBuildings.includes(b.id));
  const slots =
    furnaceCount(state, content) - unpaidRooms.reduce((n, b) => n + (b.level >= 1 ? effectsOf(content, b)?.furnaces ?? 0 : 0), 0);
  const roomWorks = slots > 0;
  const furnaces: FurnacePlan[] = [];
  const expected: Partial<Resources> = {};
  state.furnaces.forEach((f, index) => {
    if (!f.recipeId || !f.alchemistId) return;
    const recipe = content.recipes.get(f.recipeId);
    if (!recipe) return;
    const plan: FurnacePlan = {
      index,
      recipeId: f.recipeId,
      alchemistId: f.alchemistId,
      runs: false,
      successBp: alchemySuccessBp(state, content, f.recipeId, f.alchemistId, index),
    };
    if (index >= slots) plan.reason = roomWorks ? '丹爐數量不足' : '煉丹房未運作';
    else if (!take(pool, consumption, recipe.inputs)) plan.reason = '材料不足，停爐';
    else plan.runs = true;
    if (plan.runs) {
      for (const id of RESOURCE_IDS) {
        const out = recipe.outputs[id];
        if (out) expected[id] = (expected[id] ?? 0) + Math.floor((out * plan.successBp) / 10000);
      }
    } else if (plan.reason) notes.push(`丹爐 ${index + 1}：${plan.reason}。`);
    furnaces.push(plan);
  });

  // 產出（確定部分）：外門工人依 fillOrder 填入各座建築（糧食田優先，其次加成高者）
  const production: Partial<Resources> = {};
  const jobs = state.outer.jobs;
  const assign = (defId: string, workers: number, perWorker: (b: Building) => { id: keyof Resources; n: number }) => {
    let left = workers;
    for (const site of fillOrder(state, content, defId, operating)) {
      const n = Math.min(left, effectsOf(content, site.b)?.workerSlots ?? 0);
      left -= n;
      const out = perWorker(site.b);
      const amount = Math.floor((n * out.n * site.pct) / 100);
      if (amount) production[out.id] = (production[out.id] ?? 0) + amount;
    }
  };
  assign(FIELD, jobs.field, (b) => {
    const eff = effectsOf(content, b);
    return b.crop === 'herb' ? { id: 'herb', n: eff?.herbPerWorker ?? 0 } : { id: 'food', n: eff?.foodPerWorker ?? 0 };
  });
  assign(QUARRY, jobs.quarry, (b) => ({ id: 'stone', n: effectsOf(content, b)?.stonePerWorker ?? 0 }));
  assign(LUMBER, jobs.lumber, (b) => ({ id: 'wood', n: effectsOf(content, b)?.woodPerWorker ?? 0 }));
  if (jobs.errand) production.lingshi = jobs.errand * balance.outer.errandLingshi;
  for (const id of RESOURCE_IDS) if (production[id] === 0) delete production[id];

  return {
    consumption,
    production,
    expected,
    foodShortfall,
    foodNeed: need,
    unpaidBuildings,
    pillTakers,
    breakthroughReady,
    furnaces,
    notes,
  };
}

/** 依目前計畫推估某資源幾個月後耗盡；不會耗盡回傳 null。 */
export function monthsUntilEmpty(state: GameState, plan: MonthPlan, id: keyof Resources): number | null {
  const net = (plan.production[id] ?? 0) + (plan.expected[id] ?? 0) - (plan.consumption[id] ?? 0);
  if (net >= 0) return null;
  // 需求可能大於可扣除量；以實際需求估算
  const demand = id === 'food' ? plan.foodNeed : plan.consumption[id] ?? 0;
  const income = (plan.production[id] ?? 0) + (plan.expected[id] ?? 0);
  const burn = demand - income;
  if (burn <= 0) return null;
  return Math.floor(state.resources[id] / burn);
}
