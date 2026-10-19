import type { ContentPack } from '../../content/registry';
import type { GameState } from '../types';
import { allCharacters, isInjured } from './characters/characters';
import { monthsUntilEmpty, planMonth } from './economy/flows';
import { qiEfficiencyPct } from './cultivation/cultivation';
import { heirOf, remainingLifeMonths, remainingLifePct } from './characters/lifespan';

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
  if (state.resources.food === 0 && !plan.production.food) alerts.push({ level: 'danger', text: '糧食已經用完，也沒有糧食產出（靈田要有外門弟子耕作）' });
  if (state.outer.count === 0) alerts.push({ level: 'danger', text: '外門弟子全部離開了，宗門沒有人手生產（大殿招生或坊市買糧）' });
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
  for (const c of allCharacters(state)) {
    const pct = remainingLifePct(c);
    if (pct > 20) continue;
    const left = remainingLifeMonths(c);
    const rest = left >= 12 ? `約 ${Math.floor(left / 12)} 年` : `${left} 個月`;
    const who = c.role === 'protagonist' ? `掌門${c.name}` : c.name;
    if (c.role === 'protagonist' && !heirOf(state))
      alerts.push({ level: 'danger', text: `${who}壽元只剩${rest}，尚未指定親傳弟子` });
    else alerts.push({ level: pct <= 10 ? 'danger' : 'warning', text: `${who}壽元只剩${rest}` });
  }
  for (const c of allCharacters(state)) if (isInjured(c)) alerts.push({ level: 'info', text: `${c.name}受傷（${c.injuryMonths} 個月）` });
  for (const f of plan.furnaces) if (!f.runs && f.reason) alerts.push({ level: 'warning', text: `丹爐 ${f.index + 1}：${f.reason}` });
  return alerts;
}
