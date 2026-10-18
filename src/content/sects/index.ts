import type { SectDef } from '../schema';

// 鄰近的三個電腦宗門（P1 批次 E，數量見 docs/P1規劃.md Q5）。起始數值為暫定值。

export const sects: SectDef[] = [
  {
    id: 'sect.qingmu',
    name: '青木宗',
    lineage: 'lineage.alchemy',
    temperament: 'steady',
    description: '以靈植與丹藥立宗的老牌宗門，作風保守，重視根基與人丁。',
    start: { lingshi: 300, food: 300, stone: 100, wood: 100, population: 30, buildings: 8, power: 40, favor: 40 },
    art: 'placeholder/sect-qingmu.svg',
  },
  {
    id: 'sect.chixia',
    name: '赤霞門',
    lineage: 'lineage.sword',
    temperament: 'warlike',
    description: '劍修宗門，門風好勝，常年操練弟子，對新興宗門不太友善。',
    start: { lingshi: 250, food: 250, stone: 80, wood: 80, population: 28, buildings: 7, power: 55, favor: 25 },
    art: 'placeholder/sect-chixia.svg',
  },
  {
    id: 'sect.luoyun',
    name: '落雲谷',
    lineage: 'lineage.talisman',
    temperament: 'merchant',
    description: '以符籙買賣致富的宗門，消息靈通，坊市行情常受其左右。',
    start: { lingshi: 450, food: 220, stone: 60, wood: 120, population: 24, buildings: 7, power: 35, favor: 45 },
    art: 'placeholder/sect-luoyun.svg',
  },
];
