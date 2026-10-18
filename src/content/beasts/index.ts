import type { BeastSpeciesDef } from '../schema';

// 靈獸種類（批次 C）。靈獸苑孵化靈獸蛋時隨機得到其中一種。

export const beastSpecies: BeastSpeciesDef[] = [
  {
    id: 'beast.cloud_ape',
    name: '雲紋靈猿',
    description: '通人性的靈猿，力大敏捷。隨主人出戰站前排；外出採集多帶回藥草與獸材。',
    hpPct: 70,
    atkPct: 75,
    spd: 13,
    row: 'front',
    adultPct: 140,
    gather: { herb: 3, beast_mat: 1 },
    food: 2,
    art: 'placeholder/beast-cloud-ape.svg',
    artAdult: 'placeholder/beast-cloud-ape-adult.svg',
  },
  {
    id: 'beast.fire_fox',
    name: '赤焰狐',
    description: '尾生火焰的靈狐，身法極快。隨主人出戰站後排；採集時擅長找尋靈藥。',
    hpPct: 50,
    atkPct: 90,
    spd: 16,
    row: 'back',
    adultPct: 140,
    gather: { spirit_herb: 1, beast_mat: 1 },
    food: 2,
    art: 'placeholder/beast-fire-fox.svg',
    artAdult: 'placeholder/beast-fire-fox-adult.svg',
  },
  {
    id: 'beast.black_turtle',
    name: '玄甲龜',
    description: '背甲如岩的靈龜，行動緩慢但極為耐打。採集時會挖出靈礦。',
    hpPct: 110,
    atkPct: 50,
    spd: 7,
    row: 'front',
    adultPct: 150,
    gather: { ore: 2, beast_mat: 1 },
    food: 3,
    art: 'placeholder/beast-black-turtle.svg',
    artAdult: 'placeholder/beast-black-turtle-adult.svg',
  },
];
