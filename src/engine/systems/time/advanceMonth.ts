import type { ContentPack } from '../../../content/registry';
import { monthIndex, nextMonth } from '../../date';
import { ensure } from '../../errors';
import { addInto, gain, RESOURCE_IDS } from '../../resources';
import type { GameState, MonthReport, Resources } from '../../types';
import { resolveFurnaces, tidyBenches } from '../alchemy/alchemy';
import { progressConstruction } from '../buildings/buildings';
import { allCharacters } from '../characters/characters';
import { refreshBoard } from '../commissions/commissions';
import { rollMarket } from '../economy/market';
import { tickOuter } from '../characters/outer';
import { addXp, breakthroughOdds, monthlyXp, resolveBreakthrough, tickBody } from '../cultivation/cultivation';
import { planMonth } from '../economy/flows';
import { maybeRecruitment } from '../events/recruitment';
import { progressRegions } from '../regions/regions';

const REPORT_KEEP = 36;

/** 推進前的檢查；有阻擋原因時回傳說明。 */
export function advanceBlockers(state: GameState): string[] {
  const out: string[] = [];
  for (const ev of state.events) if (ev.blocking) out.push(`請先處理事件：${ev.title}`);
  if (state.exploration?.status === 'active') out.push('探索進行中，請先走到出口或撤退');
  return out;
}

/**
 * 推進一個月（企畫書 §3 的結算順序）。state 為呼叫者已複製的狀態，會直接修改。
 * expectMonth 必須等於目前月份，避免同一個月被重複結算（例如連點兩次）。
 */
export function advanceMonth(state: GameState, content: ContentPack, expectMonth: number): MonthReport {
  ensure(monthIndex(state.date) === expectMonth, '這個月份已經結算過了');
  const blockers = advanceBlockers(state);
  ensure(blockers.length === 0, blockers[0] ?? '');

  const lines: string[] = [];
  const before: Resources = { ...state.resources };

  // 1. 檢查行程合法性：條件不足的突破改為日常修煉
  const odds = new Map<string, ReturnType<typeof breakthroughOdds>>();
  for (const c of allCharacters(state)) {
    if (c.schedule !== 'breakthrough') continue;
    const o = breakthroughOdds(state, content, c);
    if (o.blocked) {
      lines.push(`${c.name}無法突破：${o.blocked}，改為日常修煉。`);
      c.schedule = 'cultivate';
    } else odds.set(c.id, o);
  }

  // 2. 依優先順序扣除糧食、維護、丹藥與煉丹材料
  const plan = planMonth(state, content);
  for (const id of RESOURCE_IDS) state.resources[id] -= plan.consumption[id] ?? 0;
  for (const b of state.buildings) {
    if (plan.unpaidBuildings.includes(b.id)) {
      b.status = 'disabled';
      b.disabledReason = '維護費不足';
    } else if (b.status === 'disabled') {
      b.status = 'active';
      delete b.disabledReason;
    }
  }
  lines.push(...plan.notes);

  // 3. 生產、煉丹與建造
  const produced: Partial<Resources> = { ...plan.production };
  gain(state.resources, plan.production);
  resolveFurnaces(state, content, plan.furnaces, produced, lines);
  progressConstruction(state, content, lines);
  progressRegions(state, content, lines);

  // 4. 修煉、突破、療傷、年齡、外門
  for (const c of allCharacters(state)) {
    if (c.schedule === 'breakthrough') {
      const o = odds.get(c.id);
      if (o && plan.breakthroughReady.includes(c.id)) resolveBreakthrough(state, c, o, lines);
      else c.schedule = 'cultivate';
      continue;
    }
    const pill = plan.peiyuanTakers.includes(c.id) ? 'peiyuan' : plan.pillTakers.includes(c.id);
    const xp = monthlyXp(state, content, c, pill);
    addXp(c, xp.total, lines);
  }
  tickBody(state, lines);
  tickOuter(state, plan.foodShortfall, lines);

  // 5. 探索取得的物資入庫，探索行程結束
  if (Object.keys(state.pendingLoot).length) {
    addInto(produced, state.pendingLoot);
    gain(state.resources, state.pendingLoot);
    lines.push('探索帶回的物資已入庫。');
    state.pendingLoot = {};
  }
  state.exploration = null;
  state.exploredThisMonth = false;
  for (const c of allCharacters(state)) if (c.schedule === 'explore') c.schedule = c.injuryMonths > 0 ? 'heal' : 'cultivate';
  // 工作者若已不在工坊行程，從爐位移除
  tidyBenches(state);

  state.trade = { soldLingshi: 0, boughtFood: 0 };
  state.outer.labor = 0;
  rollMarket(state);

  // 6. 電腦宗門：P0 尚未開放

  // 7. 推進日期、產生事件、寫入月報
  const settled = { ...state.date };
  state.date = nextMonth(state.date);
  maybeRecruitment(state, content, lines);
  refreshBoard(state, content);
  if (state.market.rumor) lines.push(`坊市消息：${state.market.rumor}`);

  for (const id of RESOURCE_IDS) {
    if (state.resources[id] < 0) throw new Error(`結算後資源為負：${id}`);
  }
  const delta: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const d = state.resources[id] - before[id];
    if (d) delta[id] = d;
  }
  const report: MonthReport = { date: settled, lines, delta };
  state.reports.unshift(report);
  state.reports = state.reports.slice(0, REPORT_KEEP);
  state.stats.monthsAdvanced += 1;
  return report;
}
