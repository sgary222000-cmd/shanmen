import type { EquipmentDef } from '../schema';

// 法器。每人一個裝備欄。「制式法器」對應庫存資源「法器」（煉器坊製作），其餘為秘境取得的獨特法器。

export const COMMON_EQUIPMENT = 'equip.common';

export const equipment: EquipmentDef[] = [
  {
    id: 'equip.common',
    name: '制式法器',
    description: '煉器坊煉成的一般法器，攻守兼備。',
    atk: 4,
    def: 2,
    hp: 10,
  },
  {
    id: 'equip.ore_blade',
    name: '礦魄刀',
    description: '以地下靈礦深處的礦魄鍛成，刀身隱有火紋。',
    atk: 9,
    def: 1,
    hp: 10,
  },
  {
    id: 'equip.beast_hide',
    name: '赤鱗甲',
    description: '靈獸山谷赤鱗蟒的鱗皮所製，堅韌輕巧。',
    atk: 1,
    def: 6,
    hp: 40,
  },
  {
    id: 'equip.ancient_sword',
    name: '古修遺劍',
    description: '古修遺跡中殘留的飛劍，靈性未失。',
    atk: 14,
    def: 3,
    hp: 20,
  },
];
