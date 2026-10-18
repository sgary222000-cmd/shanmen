import { z } from 'zod';
import { buildings } from './buildings';
import { recipes } from './recipes';
import { enemies } from './enemies';
import { lineages } from './lineages';
import { abandonedCave } from './secret-realms/abandoned-cave';
import {
  buildingSchema,
  enemySchema,
  lineageSchema,
  recipeSchema,
  secretRealmSchema,
  type BuildingDef,
  type EnemyDef,
  type LineageDef,
  type RecipeDef,
  type SecretRealmDef,
} from './schema';

export interface ContentPack {
  buildings: Map<string, BuildingDef>;
  recipes: Map<string, RecipeDef>;
  enemies: Map<string, EnemyDef>;
  lineages: Map<string, LineageDef>;
  secretRealms: Map<string, SecretRealmDef>;
}

export interface RawContent {
  buildings: unknown[];
  recipes: unknown[];
  enemies: unknown[];
  lineages: unknown[];
  secretRealms: unknown[];
}

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
  };

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
};

export const content: ContentPack = buildContent(rawContent);
