import type { GameState } from '../types';
import { hallLevel } from './buildings/buildings';

// 引導任務（企畫書 §14）。完成狀態一旦達成就記錄，不會倒退。

export interface TutorialStep {
  id: string;
  title: string;
  hint: string;
  check: (s: GameState) => boolean;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'ledger', title: '查看收支', hint: '打開「產業」頁，看看本月預計收入與消耗。', check: (s) => s.tutorial.viewedLedger },
  {
    id: 'assign',
    title: '指派生產',
    hint: '在「產業」頁替外門弟子分工，例如派人下山接委託賺靈石。',
    check: (s) => Object.values(s.outer.jobs).some((n) => n > 0),
  },
  {
    id: 'cultivate',
    title: '安排主角修煉',
    hint: '在「主角」頁安排閉關，修煉速度最快。',
    check: (s) => s.protagonist.schedule === 'seclusion',
  },
  { id: 'month', title: '推進首月', hint: '按右上角「推進一月」。', check: (s) => s.stats.monthsAdvanced >= 1 },
  { id: 'hall', title: '修復宗門大殿', hint: '在「建設」頁修復大殿，開放招生與更多建築。', check: (s) => hallLevel(s) >= 1 },
  {
    id: 'inner',
    title: '招收第一位內門弟子',
    hint: '大殿修復後，在「弟子」頁從外門選拔，或等待山門招生。',
    check: (s) => s.disciples.length >= 1,
  },
  {
    id: 'explore',
    title: '完成初次探索與戰鬥',
    hint: '在「探索」頁帶隊進入荒廢洞府。',
    check: (s) => s.stats.explorations >= 1 && s.battles.length >= 1,
  },
  {
    id: 'pills',
    title: '建立穩定丹藥供應',
    hint: '大殿升到 2 級後建造煉丹房，指派掌爐者並設定重複煉製。',
    check: (s) => s.furnaces.some((f) => f.alchemistId && f.recipeId && f.repeat),
  },
];

export function updateTutorial(state: GameState): void {
  for (const step of TUTORIAL_STEPS) {
    if (!state.tutorial.done.includes(step.id) && step.check(state)) state.tutorial.done.push(step.id);
  }
}

export function currentStep(state: GameState): TutorialStep | undefined {
  if (state.tutorial.skipped) return undefined;
  return TUTORIAL_STEPS.find((s) => !state.tutorial.done.includes(s.id));
}
