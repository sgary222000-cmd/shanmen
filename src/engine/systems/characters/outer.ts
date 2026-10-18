import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import type { GameState, OuterDisciples } from '../../types';
import { FIELD, GARDEN, LUMBER, MINE, QUARRY, workerSlots } from '../buildings/buildings';
import { outerCultivating } from './characters';
import { stewardSatisfaction } from '../talent/positions';

export const OUTER_JOB_NAMES = {
  field: '耕作（靈田）',
  quarry: '採石（採石場）',
  lumber: '伐木（靈木場）',
  garden: '照料藥園',
  mine: '採礦（靈礦場）',
  errand: '下山打零工',
  cultivate: '修煉',
} as const;

/** 可分派的外門工作（修煉以外）。 */
export const OUTER_JOBS = ['field', 'quarry', 'lumber', 'garden', 'mine', 'errand'] as const;

export function jobCapacity(state: GameState, content: ContentPack): OuterDisciples['jobs'] {
  return {
    field: workerSlots(state, content, FIELD),
    quarry: workerSlots(state, content, QUARRY),
    lumber: workerSlots(state, content, LUMBER),
    garden: workerSlots(state, content, GARDEN),
    mine: workerSlots(state, content, MINE),
    errand: Number.POSITIVE_INFINITY,
  };
}

/** 設定外門分工；未列出的分工視為 0。 */
export function setOuterJobs(state: GameState, content: ContentPack, partial: Partial<OuterDisciples['jobs']>): void {
  const cap = jobCapacity(state, content);
  const jobs = Object.fromEntries(OUTER_JOBS.map((k) => [k, partial[k] ?? 0])) as OuterDisciples['jobs'];
  for (const key of OUTER_JOBS) {
    const v = jobs[key];
    ensure(Number.isInteger(v) && v >= 0, '人數必須是非負整數');
    ensure(v <= cap[key], `${OUTER_JOB_NAMES[key]}最多 ${cap[key]} 人`);
  }
  const total = OUTER_JOBS.reduce((n, k) => n + jobs[k], 0);
  const free = state.outer.count - state.outer.labor;
  ensure(
    total <= free,
    state.outer.labor
      ? `分工總數 ${total} 超過可用外門 ${free} 人（另有 ${state.outer.labor} 人本月外出做委託）`
      : `分工總數 ${total} 超過外門人數 ${state.outer.count}`,
  );
  state.outer.jobs = { ...jobs };
}

/** 外門人數減少導致分工超額時，從修煉以外的分工依序扣回（外出做委託的人不扣）。 */
export function trimJobs(state: GameState): void {
  const o = state.outer;
  let over = OUTER_JOBS.reduce((n, k) => n + o.jobs[k], 0) + o.labor - o.count;
  for (const job of ['errand', 'mine', 'garden', 'lumber', 'quarry', 'field'] as const) {
    if (over <= 0) break;
    const cut = Math.min(over, o.jobs[job]);
    o.jobs[job] -= cut;
    over -= cut;
  }
}

/** 月結算第 4 步：外門的生活與培養。 */
export function tickOuter(state: GameState, foodShortfall: number, lines: string[]): void {
  const o = state.outer;
  if (foodShortfall > 0) {
    o.hungerMonths += 1;
    o.satisfaction = Math.max(0, o.satisfaction - balance.outer.hungerSatisfactionLoss);
    lines.push(`⚠ 糧食不足，外門弟子挨餓（滿意度 ${o.satisfaction}）。`);
  } else {
    o.hungerMonths = 0;
    o.satisfaction = Math.min(100, o.satisfaction + balance.outer.satisfactionRecovery + stewardSatisfaction(state));
  }
  if (o.hungerMonths >= 2 && o.satisfaction < balance.outer.leaveThreshold && o.count > 0) {
    const leaving = Math.min(o.count, 1 + Math.floor(o.hungerMonths / 2));
    o.count -= leaving;
    trimJobs(state);
    lines.push(`⚠ ${leaving} 名外門弟子不堪飢餓離開宗門。`);
  }
  if (o.count > 0 && outerCultivating(state) > 0 && foodShortfall === 0) {
    const share = Math.floor((outerCultivating(state) * 100) / o.count);
    o.training = Math.min(100, o.training + Math.max(1, Math.floor((balance.outer.trainingGainPerMonth * share) / 100)));
  }
}
