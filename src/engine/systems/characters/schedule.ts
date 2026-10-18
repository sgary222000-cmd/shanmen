import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import type { Character, GameState, ScheduleKind } from '../../types';
import { releaseFurnace } from '../alchemy/alchemy';
import { breakthroughOdds } from '../cultivation/cultivation';
import { isCraftSchedule, qiCapacity } from '../buildings/buildings';
import { isRegionOpen } from '../regions/regions';
import { findCharacter } from './characters';
import { libraryResearch } from '../talent/techniques';

export const SCHEDULE_NAMES: Record<ScheduleKind, string> = {
  cultivate: '日常修煉',
  seclusion: '閉關',
  teach: '授課',
  alchemy: '煉丹',
  forge: '煉器',
  talisman: '製符',
  heal: '療傷',
  breakthrough: '突破',
  research: '研究功法',
  explore: '探索',
  dispatch: '秘境派遣',
};

/** 尚未開放的主角行程（企畫書 §5），介面需明確標示。「交涉」由外事執事與宗門往來頁代替。 */
export const LOCKED_SCHEDULES: readonly string[] = [];

/** 玩家可直接選擇的行程（煉丹、煉器、製符由產業頁的爐位指派；探索、派遣由各自系統設定）。 */
export function selectableSchedules(c: Character): ScheduleKind[] {
  return c.role === 'protagonist'
    ? ['cultivate', 'seclusion', 'teach', 'research', 'heal', 'breakthrough']
    : ['cultivate', 'research', 'heal', 'breakthrough'];
}

export function seclusionInterruptCost(state: GameState): string {
  const s = state.protagonist.seclusion;
  if (!s) return '';
  const lost = Math.min(s.streak, balance.seclusionStreakMax) * balance.seclusionStreakPct;
  return lost
    ? `中斷閉關將失去已累積的連續閉關加成（目前 +${lost}%）。`
    : '中斷閉關沒有額外損失，但需重新累積連續閉關加成。';
}

export function setSchedule(
  state: GameState,
  content: ContentPack,
  characterId: string,
  schedule: ScheduleKind,
  months?: number,
): void {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  ensure(selectableSchedules(c).includes(schedule), `${c.name}不能直接安排「${SCHEDULE_NAMES[schedule]}」`);
  ensure(c.schedule !== 'explore', `${c.name}本月已出外探索，下月才能改變行程`);
  ensure(c.schedule !== 'dispatch', `${c.name}正在秘境派遣中，回來後才能改變行程`);
  if (schedule === 'research') ensure(libraryResearch(state, content) !== null, '需要運作中的藏經閣才能研究功法');
  if (c.role === 'protagonist') {
    ensure(!state.protagonist.seclusion, '主角閉關中，請先中斷閉關');
  }
  if (schedule === 'breakthrough') {
    const odds = breakthroughOdds(state, content, c);
    ensure(!odds.blocked, odds.blocked ?? '');
  }
  if (isCraftSchedule(c.schedule)) releaseFurnace(state, c.id);
  c.schedule = schedule;
  if (schedule === 'seclusion') {
    const m = months ?? 1;
    ensure(Number.isInteger(m) && m >= 1 && m <= 12, '閉關月數需為 1–12');
    state.protagonist.seclusion = { plannedMonths: m, remainingMonths: m, streak: 0 };
  }
}

export function interruptSeclusion(state: GameState): string {
  const p = state.protagonist;
  ensure(p.seclusion, '主角沒有在閉關');
  const note = seclusionInterruptCost(state);
  p.seclusion = null;
  p.schedule = 'cultivate';
  return note;
}

export function setTakePill(state: GameState, characterId: string, value: boolean): void {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  c.takePill = value;
}

/** 可以修煉的區域：已開放且有靈氣。 */
export function seatOptions(state: GameState, content: ContentPack): string[] {
  return [...content.regions.values()]
    .filter((r) => isRegionOpen(state, r.id) && qiCapacity(state, content, r.id) > 0)
    .map((r) => r.id);
}

/** 變更修煉地點。閉關中不能搬移。 */
export function setSeat(state: GameState, content: ContentPack, characterId: string, regionId: string): void {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  const region = content.regions.get(regionId);
  ensure(region, '沒有這個區域');
  ensure(seatOptions(state, content).includes(regionId), `${region.name}尚未開放或沒有靈氣，不能在此修煉`);
  if (c.role === 'protagonist') ensure(!state.protagonist.seclusion, '主角閉關中，請先中斷閉關');
  c.seat = regionId;
}
