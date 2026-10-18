import { z } from 'zod';
import { buildings } from './buildings';
import { recipes } from './recipes';
import { enemies } from './enemies';
import { lineages } from './lineages';
import { regions } from './regions';
import { beastSpecies } from './beasts';
import { abandonedCave } from './secret-realms/abandoned-cave';
import {
  beastSpeciesSchema,
  buildingSchema,
  regionSchema,
  enemySchema,
  lineageSchema,
  recipeSchema,
  secretRealmSchema,
  type BuildingDef,
  type EnemyDef,
  type BeastSpeciesDef,
  type LineageDef,
  type RecipeDef,
  type RegionDef,
  type SecretRealmDef,
} from './schema';

export interface ContentPack {
  buildings: Map<string, BuildingDef>;
  recipes: Map<string, RecipeDef>;
  enemies: Map<string, EnemyDef>;
  lineages: Map<string, LineageDef>;
  secretRealms: Map<string, SecretRealmDef>;
  regions: Map<string, RegionDef>;
  beasts: Map<string, BeastSpeciesDef>;
}

export interface RawContent {
  buildings: unknown[];
  recipes: unknown[];
  enemies: unknown[];
  lineages: unknown[];
  secretRealms: unknown[];
  regions: unknown[];
  beasts: unknown[];
}

export const MAIN_REGION = 'region.main';

function index<T extends { id: string }>(kind: string, items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`內容 ID 重複：${kind} ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

/** 驗證全部內容並檢查跨資料引用；有錯立即丟出。 */
export function buildContent(raw: RawContent): ContentPack {
  const pack: ContentPack = {
    buildings: index('建築', z.array(buildingSchema).parse(raw.buildings)),
    recipes: index('配方', z.array(recipeSchema).parse(raw.recipes)),
    enemies: index('敵人', z.array(enemySchema).parse(raw.enemies)),
    lineages: index('傳承', z.array(lineageSchema).parse(raw.lineages)),
    secretRealms: index('秘境', z.array(secretRealmSchema).parse(raw.secretRealms)),
    regions: index('區域', z.array(regionSchema).parse(raw.regions)),
    beasts: index('靈獸', z.array(beastSpeciesSchema).parse(raw.beasts)),
  };
  if (!pack.regions.has(MAIN_REGION)) throw new Error(`缺少主峰區域：${MAIN_REGION}`);
  for (const region of pack.regions.values()) {
    if (region.allows !== 'any') {
      for (const b of region.allows) if (!pack.buildings.has(b)) throw new Error(`區域引用不存在的建築：${region.id} → ${b}`);
    }
    for (const b of Object.keys(region.bonus.productionPct)) {
      if (!pack.buildings.has(b)) throw new Error(`區域加成引用不存在的建築：${region.id} → ${b}`);
    }
  }
  for (const l of pack.lineages.values()) {
    for (const b of Object.keys(l.bonuses.productionPct)) {
      if (!pack.buildings.has(b)) throw new Error(`傳承加成引用不存在的建築：${l.id} → ${b}`);
    }
    if (l.start.beast && !pack.beasts.has(l.start.beast)) throw new Error(`傳承引用不存在的靈獸：${l.id} → ${l.start.beast}`);
  }

  for (const realm of pack.secretRealms.values()) {
    const nodeIds = new Set<string>();
    for (const node of realm.nodes) {
      if (nodeIds.has(node.id)) throw new Error(`秘境節點重複：${realm.id} ${node.id}`);
      nodeIds.add(node.id);
    }
    if (!nodeIds.has(realm.startNode)) throw new Error(`秘境起點不存在：${realm.id} ${realm.startNode}`);
    for (const node of realm.nodes) {
      for (const next of node.next) {
        if (!nodeIds.has(next)) throw new Error(`秘境節點引用不存在：${realm.id} ${node.id} → ${next}`);
      }
      for (const enemy of node.enemies ?? []) {
        if (!pack.enemies.has(enemy)) throw new Error(`引用不存在的敵人：${realm.id} ${node.id} → ${enemy}`);
      }
    }
    for (const recipe of realm.firstClear.recipes) {
      if (!pack.recipes.has(recipe)) throw new Error(`引用不存在的配方：${realm.id} → ${recipe}`);
    }
  }
  for (const b of pack.buildings.values()) {
    b.levels.forEach((lv, i) => {
      if (lv.level !== i + 1) throw new Error(`建築等級需從 1 連續編號：${b.id}`);
    });
  }
  return pack;
}

export const rawContent: RawContent = {
  buildings,
  recipes,
  enemies,
  lineages,
  secretRealms: [abandonedCave],
  regions,
  beasts: beastSpecies,
};

export const content: ContentPack = buildContent(rawContent);
