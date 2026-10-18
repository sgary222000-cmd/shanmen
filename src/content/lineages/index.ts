import type { LineageDef } from '../schema';

// P0 只開放劍修；其他傳承明確標示尚未開放。
export const lineages: LineageDef[] = [
  {
    id: 'lineage.sword',
    name: '劍修',
    feature: '劍訣與劍陣。擅長探索與護衛，戰鬥集中攻擊、破防。',
    available: true,
    skill: { name: '破軍劍訣', multiplierPct: 170, mpCost: 10, piercePct: 40 },
  },
  {
    id: 'lineage.alchemy',
    name: '丹道',
    feature: '丹方與靈植。煉丹與修煉供應見長。（P1 開放）',
    available: false,
    skill: { name: '丹火術', multiplierPct: 130, mpCost: 8, piercePct: 0 },
  },
  {
    id: 'lineage.beast',
    name: '御獸',
    feature: '靈獸培育。特殊採集與素材，主人與靈獸協作。（P1 開放）',
    available: false,
    skill: { name: '驅獸', multiplierPct: 140, mpCost: 8, piercePct: 0 },
  },
  {
    id: 'lineage.talisman',
    name: '符陣',
    feature: '符籙與陣法。防禦與消耗品，控制與陣容加成。（P1 開放）',
    available: false,
    skill: { name: '雷符', multiplierPct: 150, mpCost: 10, piercePct: 0 },
  },
];
