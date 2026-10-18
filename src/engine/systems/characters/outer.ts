import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import type { GameState, OuterDisciples } from '../../types';
import { FIELD, LUMBER, QUARRY, workerSlots } from '../buildings/buildings';
import { outerCultivating } from './characters';

export const OUTER_JOB_NAMES = {
  field: '耕作（靈田）',
  quarry: '採石（採石場）',
  lumber: '伐木（靈木場）',
  errand: '下山接委託',
  cultivate: '修煉',
} as const;

export function jobCapacity(state: GameState, content: ContentPack): OuterDisciples['jobs'] {
  return {
    field: workerSlots(state, content, FIELD),
    quarry: workerSlots(state, content, QUARRY),
    lumber: workerSlots(state, content, LUMBER),
    errand: Number.POSITIVE_INFINITY,
  };
}

export function setOuterJobs(state: GameState, content: ContentPack, jobs: OuterDisciples['jobs']): void {
  const cap = jobCapacity(state, content);
  for (const key of ['field', 'quarry', 'lumber', 'errand'] as const) {
    const v = jobs[key];
    ensure(Number.isInteger(v) && v >= 0, '人數必須是非負整數');
    ensure(v <= cap[key], `${OUTER_JOB_NAMES[key]}最多 ${cap[key]} 人`);
  }
  const total = jobs.field + jobs.quarry + jobs.lumber + jobs.errand;
  ensure(total <= state.outer.count, `分工總數 ${total} 超過外門人數 ${state.outer.count}`);
  state.outer.jobs = { ...jobs };
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
    o.satisfaction = Math.min(100, o.satisfaction + balance.outer.satisfactionRecovery);
  }
  if (o.hungerMonths >= 2 && o.satisfaction < balance.outer.leaveThreshold && o.count > 0) {
    const leaving = Math.min(o.count, 1 + Math.floor(o.hungerMonths / 2));
    o.count -= leaving;
    let over = o.jobs.field + o.jobs.quarry + o.jobs.lumber + o.jobs.errand - o.count;
    for (const job of ['errand', 'lumber', 'quarry', 'field'] as const) {
      if (over <= 0) break;
      const cut = Math.min(over, o.jobs[job]);
      o.jobs[job] -= cut;
      over -= cut;
    }
    lines.push(`⚠ ${leaving} 名外門弟子不堪飢餓離開宗門。`);
  }
  if (o.count > 0 && outerCultivating(state) > 0 && foodShortfall === 0) {
    const share = Math.floor((outerCultivating(state) * 100) / o.count);
    o.training = Math.min(100, o.training + Math.max(1, Math.floor((balance.outer.trainingGainPerMonth * share) / 100)));
  }
}
