import type { LineageDef } from '../schema';

// 四大傳承（企畫書 §10）。煉丹房與基礎丹方屬宗門通用，任何傳承都能取得築基丹。
// 加成數值為暫定值（見 docs/P1規劃.md §3.2）；完整傳承特色（劍陣、符籙、靈獸苑等）於批次 C。

const none = { combatAtkPct: 0, combatDefPct: 0, retreatLootPct: 0, alchemyBonusBp: 0, productionPct: {}, arrayQiPct: 0 };

export const lineages: LineageDef[] = [
  {
    id: 'lineage.sword',
    name: '劍修',
    feature: '劍訣與劍陣。擅長探索與護衛，戰鬥集中攻擊、破防。',
    available: true,
    traits: ['我方攻擊 +15%', '秘境撤退時保留 70% 物資（一般 50%）', '主角戰鬥技藝 +3', '招式「破軍劍訣」可破防'],
    skill: { name: '破軍劍訣', multiplierPct: 170, mpCost: 10, piercePct: 40 },
    elements: ['metal', 'water'],
    bonuses: { ...none, combatAtkPct: 15, retreatLootPct: 70 },
    start: { resources: {}, skills: { combat: 3 } },
  },
  {
    id: 'lineage.alchemy',
    name: '丹道',
    feature: '丹方與靈植。煉丹與修煉供應見長。',
    available: true,
    traits: ['成丹率 +10%', '靈田產量 +20%', '開局藥草 +30、聚氣丹 4 顆', '主角煉丹技藝 +4'],
    skill: { name: '丹火術', multiplierPct: 130, mpCost: 8, piercePct: 0 },
    elements: ['wood', 'fire'],
    bonuses: { ...none, alchemyBonusBp: 1000, productionPct: { 'building.field': 20 } },
    start: { resources: { herb: 30, pill_qi: 4 }, skills: { alchemy: 4, farming: 2 } },
  },
  {
    id: 'lineage.beast',
    name: '御獸',
    feature: '靈獸培育。特殊採集與素材，主人與靈獸協作。',
    available: true,
    traits: ['開局帶一隻雲紋靈猿，隨主角出戰、不佔隊伍名額', '採石場、靈木場產量 +15%（靈獸搬運）', '主角御獸技藝 +4'],
    skill: { name: '驅獸', multiplierPct: 140, mpCost: 8, piercePct: 0 },
    elements: ['earth', 'wood'],
    bonuses: { ...none, productionPct: { 'building.quarry': 15, 'building.lumber': 15 } },
    start: { resources: {}, skills: { beast: 4, combat: 1 }, beast: 'beast.cloud_ape' },
  },
  {
    id: 'lineage.talisman',
    name: '符陣',
    feature: '符籙與陣法。防禦與消耗品，控制與陣容加成。',
    available: true,
    traits: ['聚靈陣提供的靈氣 +20%', '戰前布陣：我方防禦 +15%', '開局靈石 +40', '主角符陣技藝 +4'],
    skill: { name: '雷符', multiplierPct: 150, mpCost: 10, piercePct: 0 },
    elements: ['fire', 'earth'],
    bonuses: { ...none, combatDefPct: 15, arrayQiPct: 20 },
    start: { resources: { lingshi: 40 }, skills: { talisman: 4 } },
  },
];
