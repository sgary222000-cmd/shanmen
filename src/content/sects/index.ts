import type { SectDef } from '../schema';

// 鄰近的三個電腦宗門（P1 批次 E，數量見 docs/P1規劃.md Q5）與三個遠方勢力（P2 批次 C，見 docs/P2規劃.md Q5）。起始數值為暫定值。

export const sects: SectDef[] = [
  {
    id: 'sect.qingmu',
    name: '青木宗',
    lineage: 'lineage.alchemy',
    temperament: 'steady',
    description: '以靈植與丹藥立宗的老牌宗門，作風保守，重視根基與人丁。',
    start: { lingshi: 300, food: 300, stone: 100, wood: 100, population: 30, buildings: 8, power: 40, favor: 40, trust: 25 },
    art: 'final/sect-qingmu.webp',
  },
  {
    id: 'sect.chixia',
    name: '赤霞門',
    lineage: 'lineage.sword',
    temperament: 'warlike',
    description: '劍修宗門，門風好勝，常年操練弟子，對新興宗門不太友善。',
    start: { lingshi: 250, food: 250, stone: 80, wood: 80, population: 28, buildings: 7, power: 55, favor: 25, trust: 10 },
    art: 'final/sect-chixia.webp',
  },
  {
    id: 'sect.luoyun',
    name: '落雲谷',
    lineage: 'lineage.talisman',
    temperament: 'merchant',
    description: '以符籙買賣致富的宗門，消息靈通，坊市行情常受其左右。',
    start: { lingshi: 450, food: 220, stone: 60, wood: 120, population: 24, buildings: 7, power: 35, favor: 45, trust: 20 },
    art: 'final/sect-luoyun.webp',
  },
  {
    id: 'sect.tianyan',
    name: '天衍宗',
    lineage: 'lineage.talisman',
    temperament: 'scholarly',
    scope: 'distant',
    description: '遠在中州的推演大宗，弟子潛心問道，很少過問外事；結交不易，但從不失信。',
    start: { lingshi: 2000, food: 1000, stone: 500, wood: 500, population: 70, buildings: 22, power: 150, favor: 20, trust: 20 },
    art: 'final/sect-tianyan.webp',
  },
  {
    id: 'sect.tiejian',
    name: '鐵劍盟',
    lineage: 'lineage.sword',
    temperament: 'honorable',
    scope: 'distant',
    description: '北境劍修結成的盟會，一諾千金。看重信用遠勝禮物，背約者永不往來。',
    start: { lingshi: 1500, food: 1000, stone: 500, wood: 500, population: 75, buildings: 20, power: 170, favor: 25, trust: 30 },
    art: 'final/sect-tiejian.webp',
  },
  {
    id: 'sect.wanbao',
    name: '萬寶樓',
    lineage: 'lineage.alchemy',
    temperament: 'merchant',
    scope: 'distant',
    description: '遍布各州的商盟，奇珍異寶無所不賣。只要價錢談得攏，什麼都好商量。',
    start: { lingshi: 3000, food: 1200, stone: 400, wood: 400, population: 60, buildings: 20, power: 110, favor: 35, trust: 15 },
    art: 'final/sect-wanbao.webp',
  },
];
