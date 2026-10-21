import type { EquipmentDef } from '../schema';

// 法器。每人三格：兵器、護具、飾品（0.11.0）。煉器坊煉出的法器有品質（凡品到仙品），其餘為秘境取得的獨特法器。
// 庫存資源「法器」是未鑑定的制式兵器（舊存檔與坊市買來的），裝備時算凡品。

export const COMMON_EQUIPMENT = 'equip.common';

const item = (d: Omit<EquipmentDef, 'agi' | 'critPct' | 'dodgePct'> & Partial<Pick<EquipmentDef, 'agi' | 'critPct' | 'dodgePct'>>): EquipmentDef => ({
  agi: 0,
  critPct: 0,
  dodgePct: 0,
  ...d,
});

export const equipment: EquipmentDef[] = [
  // 兵器
  item({ id: 'equip.common', name: '制式法器', description: '煉器坊煉成的一般兵器，攻守兼備。', slot: 'weapon', atk: 4, def: 2, hp: 10 }),
  item({ id: 'equip.ore_blade', name: '礦魄刀', description: '以地下靈礦深處的礦魄鍛成，刀身隱有火紋。', slot: 'weapon', atk: 9, def: 1, hp: 10 }),
  item({ id: 'equip.ancient_sword', name: '古修遺劍', description: '古修遺跡中殘留的飛劍，靈性未失。', slot: 'weapon', atk: 14, def: 3, hp: 20 }),
  item({ id: 'equip.taixu_sword', name: '劍冢神兵', description: '太虛古境劍冢之主的佩劍，劍意凜然。', slot: 'weapon', atk: 40, def: 6, hp: 60 }),
  item({ id: 'equip.fire_blade', name: '地火劍', description: '以地火精淬煉的長劍，出鞘時熱浪逼人。', slot: 'weapon', atk: 18, def: 2, hp: 20, critPct: 3 }),
  // 護具
  item({ id: 'equip.common_armor', name: '制式護甲', description: '煉器坊以獸骨靈礦煉成的護甲。', slot: 'armor', atk: 0, def: 4, hp: 30 }),
  item({ id: 'equip.beast_hide', name: '赤鱗甲', description: '靈獸山谷赤鱗蟒的鱗皮所製，堅韌輕巧。', slot: 'armor', atk: 1, def: 6, hp: 40 }),
  item({ id: 'equip.taixu_mirror', name: '照虛古鏡', description: '太虛古境中無名修士的遺物，鏡光護身，能化去大半攻勢。', slot: 'armor', atk: 4, def: 20, hp: 150 }),
  item({ id: 'equip.crystal_robe', name: '太虛晶衣', description: '以太虛晶織入法衣，流光護體。', slot: 'armor', atk: 0, def: 12, hp: 90, dodgePct: 2 }),
  // 飾品
  item({ id: 'equip.common_charm', name: '制式玉佩', description: '煉器坊煉成的護身玉佩，讓人身手更靈活。', slot: 'accessory', atk: 0, def: 0, hp: 0, agi: 3, critPct: 3 }),
  item({ id: 'equip.thunder_ring', name: '雷紋玉環', description: '雷池深處的玉環，雷紋流轉，出手更見凌厲。', slot: 'accessory', atk: 0, def: 0, hp: 0, critPct: 10 }),
  item({ id: 'equip.cloud_boots', name: '太虛雲履', description: '石林中拾得的雲履，踏之如履輕雲。', slot: 'accessory', atk: 0, def: 0, hp: 0, dodgePct: 8 }),
  item({ id: 'equip.ancient_pendant', name: '古修靈佩', description: '古修遺跡主人的隨身靈佩，佩之身輕如燕。', slot: 'accessory', atk: 0, def: 0, hp: 0, agi: 8 }),
];
