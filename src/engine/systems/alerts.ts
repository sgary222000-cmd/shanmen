import type { ContentPack } from '../../content/registry';
import type { GameState } from '../types';
import { allCharacters, isInjured } from './characters/characters';
import { monthsUntilEmpty, planMonth } from './economy/flows';
import { qiEfficiencyPct } from './cultivation/cultivation';

export interface Alert {
  level: 'danger' | 'warning' | 'info';
  text: string;
}

/** 依目前狀態計算警報；不寫入狀態。 */
export function computeAlerts(state: GameState, content: ContentPack): Alert[] {
  const alerts: Alert[] = [];
  const plan = planMonth(state, content);
  for (const ev of state.events) if (ev.blocking) alerts.push({ level: 'danger', text: `待處理：${ev.title}` });
  if (plan.foodShortfall > 0) alerts.push({ level: 'danger', text: `本月糧食不足 ${plan.foodShortfall} 份` });
  else {
    const m = monthsUntilEmpty(state, plan, 'food');
    if (m !== null && m <= 6) alerts.push({ level: 'warning', text: `糧食約 ${m} 個月後耗盡` });
  }
  const ls = monthsUntilEmpty(state, plan, 'lingshi');
  if (ls !== null && ls <= 6) alerts.push({ level: 'warning', text: `靈石約 ${ls} 個月後耗盡` });
  for (const id of plan.unpaidBuildings) {
    const b = state.buildings.find((x) => x.id === id);
    alerts.push({ level: 'danger', text: `${content.buildings.get(b?.defId ?? '')?.name ?? id}維護費不足，將停用` });
  }
  if (state.outer.satisfaction < 30) alerts.push({ level: 'warning', text: `外門滿意度偏低（${state.outer.satisfaction}）` });
  for (const r of content.regions.values()) {
    const qi = qiEfficiencyPct(state, content, r.id);
    if (qi < 100) alerts.push({ level: 'info', text: `${r.name}靈氣不足，在此修煉效率 ${qi}%` });
  }
  for (const c of allCharacters(state)) if (isInjured(c)) alerts.push({ level: 'info', text: `${c.name}受傷（${c.injuryMonths} 個月）` });
  for (const f of plan.furnaces) if (!f.runs && f.reason) alerts.push({ level: 'warning', text: `丹爐 ${f.index + 1}：${f.reason}` });
  return alerts;
}
