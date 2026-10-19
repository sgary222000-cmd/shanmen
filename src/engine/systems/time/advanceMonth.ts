import type { ContentPack } from '../../../content/registry';
import { monthIndex, nextMonth } from '../../date';
import { ensure } from '../../errors';
import { addInto, gain, RESOURCE_IDS } from '../../resources';
import type { GameState, MonthReport, Resources, StopReason } from '../../types';
import { benchOf, resolveFurnaces, tidyBenches } from '../alchemy/alchemy';
import { progressConstruction } from '../buildings/buildings';
import { allCharacters, atMajorThreshold, MAJOR_NAMES, nextMajor } from '../characters/characters';
import { passAway, tickLifespan } from '../characters/lifespan';
import { balance } from '../../../content/balance';
import { refreshBoard } from '../commissions/commissions';
import { rollMarket } from '../economy/market';
import { tickOuter } from '../characters/outer';
import { addXp, breakthroughOdds, monthlyXp, resolveBreakthrough, tickBody, tickTraining } from '../cultivation/cultivation';
import { monthsUntilEmpty, planMonth, type MonthPlan } from '../economy/flows';
import { maybeRecruitment } from '../events/recruitment';
import { progressRegions } from '../regions/regions';
import { tickInsight } from '../talent/techniques';
import { tickPositions } from '../talent/positions';
import { tickBeasts } from '../beasts/beasts';
import { resolveDispatches } from '../exploration/dispatch';
import { tickSects } from '../world/sects';
import { maybeStartAuction, resolveAuction } from '../world/auction';
import { closeTournament, maybeOpenTournament } from '../world/tournament';

const REPORT_KEEP = 36;

const atThreshold = atMajorThreshold;

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

  // 月中已發生的事放在月報最前面；增減從上次月結算起，包含月中的委託、買賣與補給
  const lines: string[] = (state.monthLog ?? []).map((l) => `本月事務：${l}`);
  state.monthLog = [];
  const before: Resources = { ...(state.monthStart ?? state.resources) };
  const stops: StopReason[] = [];
  const readyBefore = new Set(allCharacters(state).filter(atThreshold).map((c) => c.id));
  const tournamentBefore = state.tournament?.year ?? null;
  const auctionBefore = state.auction?.id ?? null;

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
  const shortageBefore = shortageText(state, plan);
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
  const fallen: string[] = [];
  for (const c of allCharacters(state)) {
    if (c.schedule === 'breakthrough') {
      const o = odds.get(c.id);
      if (o && plan.breakthroughReady.includes(c.id)) {
        if (resolveBreakthrough(state, content, c, o, lines)) fallen.push(c.id);
      } else c.schedule = 'cultivate';
      continue;
    }
    const pill = plan.peiyuanTakers.includes(c.id) ? 'peiyuan' : plan.pillTakers.includes(c.id);
    const xp = monthlyXp(state, content, c, pill);
    addXp(c, xp.total, lines);
  }
  // 突破失敗身死道消的人（化神）：在修煉結算之後處理，掌門由繼承人接任
  passAway(state, fallen, 'breakthrough', lines, stops);
  tickInsight(state, content, allCharacters(state), lines);
  tickTraining(state, content, lines);
  tickPositions(state, lines);
  tickBeasts(state, content, plan.fedBeasts, lines);
  tickBody(state, lines);
  tickOuter(state, plan.foodShortfall, lines);

  // 5. 探索取得的物資入庫，探索行程結束
  if (Object.keys(state.pendingLoot).length) {
    addInto(produced, state.pendingLoot);
    gain(state.resources, state.pendingLoot);
    lines.push('探索帶回的物資已入庫。');
    state.pendingLoot = {};
  }
  resolveDispatches(state, content, produced, lines);
  state.exploration = null;
  state.exploredThisMonth = false;
  for (const c of allCharacters(state)) if (c.schedule === 'explore') c.schedule = c.injuryMonths > 0 ? 'heal' : (benchOf(state, c.id) ?? 'cultivate');
  // 壽元預警與坐化（弟子的職位、爐位隨之空出）
  tickLifespan(state, lines, stops);
  // 工作者若已不在工坊行程（例如外出受傷），從爐位移除
  tidyBenches(state, lines);

  state.trade = { soldLingshi: 0, boughtFood: 0 };
  state.outer.labor = 0;
  state.commissionsTaken = 0;
  rollMarket(state);

  // 6. 電腦宗門行動（影響下個月的坊市行情）、靈脈開標、大比截止
  tickSects(state, content);
  resolveAuction(state, content, lines);
  closeTournament(state, lines);

  // 7. 推進日期、產生事件、寫入月報
  const settled = { ...state.date };
  state.date = nextMonth(state.date);
  maybeRecruitment(state, content, lines);
  refreshBoard(state, content);
  maybeOpenTournament(state, lines);
  maybeStartAuction(state, lines);
  if (state.market.rumor) lines.push(`坊市消息：${state.market.rumor}`);

  for (const id of RESOURCE_IDS) {
    if (state.resources[id] < 0) throw new Error(`結算後資源為負：${id}`);
  }

  // 連續推進的停止條件
  for (const c of allCharacters(state)) {
    if (atThreshold(c) && !readyBefore.has(c.id))
      stops.push({ kind: 'breakthrough', text: `${c.name}修為圓滿，可以嘗試突破${MAJOR_NAMES[nextMajor(c.realm.major) ?? 'deity']}` });
  }
  if (state.tournament?.status === 'open' && state.tournament.year !== tournamentBefore) stops.push({ kind: 'tournament', text: '三年大比開始報名' });
  if (state.auction && state.auction.id !== auctionBefore) stops.push({ kind: 'auction', text: `靈脈競標開始：${state.auction.name}` });
  // 短缺只在剛出現時停一次，避免缺糧期間每個月都停
  const shortage = shortageText(state, planMonth(state, content));
  if (shortage && !shortageBefore) stops.push({ kind: 'shortage', text: shortage });
  if (lines.some((l) => l.includes('不堪飢餓離開'))) stops.push({ kind: 'shortage', text: '外門弟子挨餓離開' });
  if (state.events.some((e) => e.blocking)) stops.push({ kind: 'event', text: state.events.find((e) => e.blocking)?.title ?? '有事件待處理' });
  const delta: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const d = state.resources[id] - before[id];
    if (d) delta[id] = d;
  }
  const report: MonthReport = { date: settled, lines, delta, ...(stops.length ? { stops } : {}) };
  state.monthStart = { ...state.resources };
  state.reports.unshift(report);
  state.reports = state.reports.slice(0, REPORT_KEEP);
  state.stats.monthsAdvanced += 1;
  return report;
}

/** 連續推進要停下的短缺原因（缺糧、付不出維護費、糧食或靈石快用完）。 */
function shortageText(state: GameState, plan: MonthPlan): string | undefined {
  if (plan.foodShortfall > 0) return '下個月糧食不夠吃';
  if (plan.unpaidBuildings.length) return '下個月靈石不夠付建築維護';
  for (const id of ['food', 'lingshi'] as const) {
    const left = monthsUntilEmpty(state, plan, id);
    if (left !== null && left <= balance.lifespan.shortageMonths) return `${id === 'food' ? '糧食' : '靈石'}約 ${left} 個月後用完`;
  }
  return undefined;
}
