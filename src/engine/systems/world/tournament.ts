import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { givenFemale, givenMale, surnames } from '../../../content/names';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { formatResources, gain } from '../../resources';
import { rng } from '../../rng';
import type { Character, GameState, Resources, SectState, TournamentStanding } from '../../types';
import { findCharacter } from '../characters/characters';
import { runBattle, unitFromCharacter, type Unit } from '../combat/combat';
import { allyUnit } from '../combat/party';
import { canJoinExpedition } from '../exploration/exploration';
import { sectPowerCap } from './sects';

// 三年大比（每 3 年 9 月）：各宗派三名弟子一對一切磋，三戰兩勝為勝一場。
// 我宗與三個電腦宗門循環對戰，依勝場排名，名次決定聲望與獎品。切磋點到為止，不會受傷。

const T = balance.tournament;
const DUEL_STRATEGY = { useHealPill: false, useTalismans: false, focusLowest: true };

export function isTournamentMonth(state: GameState): boolean {
  return state.date.month === T.month && state.date.year % T.intervalYears === 0;
}

/** 下一次大比的年份。 */
export function nextTournamentYear(state: GameState): number {
  const y = state.date.year;
  const pastThisYear = state.date.month > T.month || (state.date.month === T.month && state.tournament?.year === y && state.tournament.status !== 'open');
  let next = Math.ceil(y / T.intervalYears) * T.intervalYears;
  if (next === y && pastThisYear) next += T.intervalYears;
  return next;
}

/** 電腦宗門出戰的三名弟子：強弱依宗門實力。 */
export function sectFighters(state: GameState, content: ContentPack, sect: SectState): Unit[] {
  const def = content.sects.get(sect.id);
  const lineage = def ? content.lineages.get(def.lineage) : undefined;
  ensure(lineage, '宗門傳承資料錯誤');
  const top = Math.max(3, Math.min(30, 2 + Math.floor(sect.power / 8)));
  const cs = Math.min(15, 2 + Math.floor(sect.power / 15));
  return [0, 2, 4].map((drop, i) => {
    const L = Math.max(1, top - drop);
    const realm = L <= 9 ? { major: 'qi' as const, stage: L } : { major: 'foundation' as const, stage: Math.min(4, Math.max(1, Math.round((L - 9) / 3))) };
    const r = rng(state, 'sects');
    const gender = r.chance(5000) ? 'male' : 'female';
    const fake: Character = {
      id: `${sect.id}#${i}`,
      name: `${def?.name ?? ''}・${r.pick(surnames)}${r.pick(gender === 'male' ? givenMale : givenFemale)}`,
      gender,
      role: 'inner',
      ageMonths: 240,
      realm,
      xp: 0,
      root: { grade: 'mid', elements: [] },
      health: 100,
      injuryMonths: 0,
      loyalty: 100,
      skills: { alchemy: 0, farming: 0, combat: cs, forging: 0, talisman: 0, beast: 0, affairs: 0 },
      schedule: 'cultivate',
      takePill: false,
      seat: '',
      specialty: null,
      insight: 0,
      equipment: null,
    };
    return unitFromCharacter(fake, 'front', lineage);
  });
}

/** 一場比賽（三戰兩勝）：回傳 a 方勝的局數。 */
function match(state: GameState, a: Unit[], b: Unit[], log: string[], aName: string, bName: string): number {
  let wins = 0;
  for (let i = 0; i < T.teamSize; i++) {
    const x = a[i];
    const y = b[i];
    if (!x && !y) continue;
    if (!x) continue;
    if (!y) {
      wins += 1;
      continue;
    }
    const r = rng(state, 'combat');
    const out = runBattle({
      allies: [{ ...x, hp: x.maxHp, side: 'ally', row: 'front' }],
      enemies: [{ ...y, hp: y.maxHp, side: 'enemy', row: 'front' }],
      strategy: DUEL_STRATEGY,
      healPills: 0,
      randInt: (n) => r.int(n),
    });
    if (out.result === 'win') wins += 1;
    log.push(`${aName}・${x.name.replace(/^.*・/, '')} 對 ${bName}・${y.name.replace(/^.*・/, '')}：${out.result === 'win' ? '勝' : '負'}（${out.rounds} 回合）`);
  }
  return wins;
}

export function tournamentBlocked(state: GameState, teamIds: string[]): string | undefined {
  const t = state.tournament;
  if (!t || t.status !== 'open') return '目前沒有舉行大比';
  if (state.reputation < T.minReputation) return `聲望需達 ${T.minReputation} 才有參賽資格（目前 ${state.reputation}）`;
  if (!teamIds.length) return '至少派一名弟子';
  if (teamIds.length > T.teamSize) return `最多派 ${T.teamSize} 人`;
  if (new Set(teamIds).size !== teamIds.length) return '隊伍中有重複人物';
  for (const id of teamIds) {
    const c = findCharacter(state, id);
    if (!c) return '找不到弟子';
    const reason = canJoinExpedition(state, c);
    if (reason) return reason;
  }
  return undefined;
}

export function enterTournament(state: GameState, content: ContentPack, teamIds: string[]): string {
  const blocked = tournamentBlocked(state, teamIds);
  ensure(!blocked, blocked ?? '');
  const t = state.tournament;
  ensure(t, '目前沒有舉行大比');
  const ours = teamIds.map((id) => {
    const c = findCharacter(state, id);
    ensure(c, '找不到弟子');
    c.schedule = 'explore';
    return allyUnit(state, content, c, 'front', 99999);
  });
  const sides: { sectId: string | null; name: string; units: Unit[] }[] = [
    { sectId: null, name: state.sectName, units: ours },
    ...state.sects.map((s) => ({ sectId: s.id, name: content.sects.get(s.id)?.name ?? s.id, units: sectFighters(state, content, s) })),
  ];
  const table: TournamentStanding[] = sides.map((s) => ({ sectId: s.sectId, name: s.name, points: 0, duelWins: 0 }));
  const log: string[] = [];
  for (let i = 0; i < sides.length; i++) {
    for (let j = i + 1; j < sides.length; j++) {
      const A = sides[i];
      const B = sides[j];
      const a = table[i];
      const b = table[j];
      if (!A || !B || !a || !b) continue;
      const aw = match(state, A.units, B.units, log, A.name, B.name);
      const played = Math.max(A.units.length, B.units.length);
      const bw = played - aw;
      a.duelWins += aw;
      b.duelWins += bw;
      if (aw > bw) a.points += 1;
      else b.points += 1; // 平手（人數不足時）算對方勝
      log.push(`── ${A.name} ${aw}：${bw} ${B.name}`);
    }
  }
  const order = [...table].sort((x, y) => y.points - x.points || y.duelWins - x.duelWins || Number(x.sectId !== null) - Number(y.sectId !== null));
  const rank = order.findIndex((s) => s.sectId === null) + 1;
  const reward = T.rewards[rank - 1] ?? {};
  const { reputation = 0, ...items } = reward;
  gain(state.resources, items as Partial<Resources>);
  state.reputation += reputation;
  for (const s of state.sects) {
    const place = order.findIndex((x) => x.sectId === s.id);
    s.power = Math.max(s.power, Math.min(sectPowerCap(state, content, s), s.power + Math.max(0, 3 - place)));
  }
  state.tournament = { year: t.year, status: 'done', standings: order, log, rank };
  state.events.push({
    id: newId(state, 'ev'),
    kind: 'notice',
    title: '大比結果',
    text: `本屆大比我宗名列第 ${rank}，聲望 +${reputation}${Object.keys(items).length ? `，獲得 ${formatResources(items as Partial<Resources>)}` : ''}。`,
    blocking: false,
  });
  return `大比結束：${state.sectName}名列第 ${rank}。`;
}

/** 月結算第 7 步（日期推進後）：大比當月開放報名。 */
export function maybeOpenTournament(state: GameState, lines: string[]): void {
  if (!isTournamentMonth(state)) return;
  state.tournament = { year: state.date.year, status: 'open', standings: [], log: [], rank: null };
  lines.push(`三年大比本月舉行，可在「宗門往來」頁派最多 ${T.teamSize} 名弟子參加（需聲望 ${T.minReputation}）。`);
  state.events.push({
    id: newId(state, 'ev'),
    kind: 'notice',
    title: '三年大比',
    text: `第 ${state.date.year} 年的大比本月舉行。到「宗門往來」頁選最多 ${T.teamSize} 名弟子參加；本月不參加就算棄權。`,
    blocking: false,
  });
}

/** 月結算：大比月沒參加就算棄權。 */
export function closeTournament(state: GameState, lines: string[]): void {
  if (state.tournament?.status === 'open') {
    state.tournament.status = 'skipped';
    lines.push('本屆大比我宗未參加。');
  }
}
