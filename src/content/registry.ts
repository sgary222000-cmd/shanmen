import { z } from 'zod';
import { buildings } from './buildings';
import { recipes } from './recipes';
import { enemies } from './enemies';
import { lineages } from './lineages';
import { regions } from './regions';
import { beastSpecies } from './beasts';
import { commissions } from './commissions';
import { abandonedCave } from './secret-realms/abandoned-cave';
import { ancientRuins, beastValley, undergroundMine } from './secret-realms/p1-realms';
import { techniques } from './techniques';
import { equipment } from './equipment';
import { sects } from './sects';
import {
  beastSpeciesSchema,
  buildingSchema,
  commissionSchema,
  regionSchema,
  enemySchema,
  lineageSchema,
  recipeSchema,
  secretRealmSchema,
  techniqueSchema,
  equipmentSchema,
  sectSchema,
  type TechniqueDef,
  type EquipmentDef,
  type SectDef,
  type BuildingDef,
  type CommissionDef,
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
  commissions: Map<string, CommissionDef>;
  techniques: Map<string, TechniqueDef>;
  equipment: Map<string, EquipmentDef>;
  sects: Map<string, SectDef>;
}

export interface RawContent {
  buildings: unknown[];
  recipes: unknown[];
  enemies: unknown[];
  lineages: unknown[];
  secretRealms: unknown[];
  regions: unknown[];
  beasts: unknown[];
  commissions: unknown[];
  techniques: unknown[];
  equipment: unknown[];
  sects: unknown[];
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
    commissions: index('委託', z.array(commissionSchema).parse(raw.commissions)),
    techniques: index('功法', z.array(techniqueSchema).parse(raw.techniques)),
    equipment: index('法器', z.array(equipmentSchema).parse(raw.equipment)),
    sects: index('宗門', z.array(sectSchema).parse(raw.sects)),
  };
  if (!pack.equipment.has('equip.common')) throw new Error('缺少制式法器 equip.common');
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
    for (const r of l.start.recipes) if (!pack.recipes.has(r)) throw new Error(`傳承引用不存在的配方：${l.id} → ${r}`);
    if (l.start.beast && !pack.beasts.has(l.start.beast)) throw new Error(`傳承引用不存在的靈獸：${l.id} → ${l.start.beast}`);
    if (pack.techniques.get(l.technique)?.lineage !== l.id) throw new Error(`傳承的主修功法不存在或不屬於它：${l.id} → ${l.technique}`);
  }
  for (const s of pack.sects.values()) {
    if (!pack.lineages.has(s.lineage)) throw new Error(`宗門引用不存在的傳承：${s.id} → ${s.lineage}`);
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
    for (const e of realm.firstClear.equipment) {
      if (!pack.equipment.has(e) || e === 'equip.common') throw new Error(`秘境引用不存在的獨特法器：${realm.id} → ${e}`);
    }
    const open = realm.firstClear.openRegion;
    if (open && !pack.regions.has(open)) throw new Error(`秘境引用不存在的區域：${realm.id} → ${open}`);
  }
  for (const b of pack.buildings.values()) {
    for (const r of b.onlyRegions ?? []) {
      if (!pack.regions.has(r)) throw new Error(`建築引用不存在的區域：${b.id} → ${r}`);
      const allows = pack.regions.get(r)?.allows;
      if (allows !== 'any' && !allows?.includes(b.id)) throw new Error(`建築限定的區域不允許蓋它：${b.id} → ${r}`);
    }
    if (b.exclusive && !pack.lineages.has(b.exclusive.lineage)) throw new Error(`建築引用不存在的傳承：${b.id} → ${b.exclusive.lineage}`);
    b.levels.forEach((lv, i) => {
      if (lv.level !== i + 1) throw new Error(`建築等級需從 1 連續編號：${b.id}`);
    });
  }
  for (const c of pack.commissions.values()) {
    if (c.kind === 'labor' && !c.workers) throw new Error(`勞務委託缺少人數：${c.id}`);
    if (c.kind === 'deliver' && !c.deliver) throw new Error(`交付委託缺少物資：${c.id}`);
    if (c.kind === 'escort' && !c.enemies?.length) throw new Error(`護衛委託缺少敵人：${c.id}`);
    for (const e of c.enemies ?? []) if (!pack.enemies.has(e)) throw new Error(`委託引用不存在的敵人：${c.id} → ${e}`);
  }
  if (![...pack.commissions.values()].some((c) => c.kind === 'labor' && c.minHall === 0)) {
    throw new Error('至少需要一種不需任何建築的勞務委託（保底途徑）');
  }
  return pack;
}

export const rawContent: RawContent = {
  buildings,
  recipes,
  enemies,
  lineages,
  secretRealms: [abandonedCave, undergroundMine, beastValley, ancientRuins],
  regions,
  beasts: beastSpecies,
  commissions,
  techniques,
  equipment,
  sects,
};

export const content: ContentPack = buildContent(rawContent);
