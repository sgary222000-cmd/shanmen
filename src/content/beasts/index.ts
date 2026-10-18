import type { BeastSpeciesDef } from '../schema';

// 靈獸種類。P1 批次 A 只有御獸開局的一種；完整靈獸系統於批次 C。

export const beastSpecies: BeastSpeciesDef[] = [
  {
    id: 'beast.cloud_ape',
    name: '雲紋靈猿',
    description: '通人性的幼年靈猿，力大敏捷。會隨主人出戰，不佔隊伍名額；平日協助搬運石木。',
    hpPct: 70,
    atkPct: 75,
    spd: 13,
    row: 'front',
    art: 'placeholder/beast-cloud-ape.svg',
  },
];
