import { ensure } from '../../errors';
import type { ContentPack } from '../../../content/registry';
import type { AutoAssign, Character, GameState } from '../../types';
import { findCharacter } from '../characters/characters';
import { acceptCommission, commissionBlocked, escortOdds } from '../commissions/commissions';
import { dispatchBlocked, startDispatch } from './dispatch';
import { canJoinExpedition, realmDef } from './exploration';
import { runTrial, trialBlocked, trialUnavailable } from './trial';

// 自動出征（0.10.0）：宗門試煉、秘境派遣、護衛委託各存一份名單。
// 每月月初照名單安排；受傷、外出、閉關、突破或有其他行程（掌爐、研究等）的人自動略過，結果寫進月報。

export type AutoKind = keyof AutoAssign;
export const MAX_AUTO_TEAM = 3;

/** 名單中這個月能出去的人：只挑日常修煉中、沒受傷、沒外出的內門弟子。 */
function free(state: GameState, ids: string[], extra?: (c: Character) => string | undefined): string[] {
  return ids.filter((id) => {
    const c = findCharacter(state, id);
    if (!c || c.role === 'protagonist' || c.schedule !== 'cultivate') return false;
    return !canJoinExpedition(state, c) && !extra?.(c);
  });
}

export function runAutoAssignments(state: GameState, content: ContentPack, lines: string[]): void {
  const auto = state.auto;
  if (!auto) return;
  const say = (text: string) => lines.push(`自動出征：${text}`);

  // 宗門試煉：每年一月
  if (auto.trial && state.date.month === 1) {
    const ids = free(state, auto.trial.ids, (c) => trialUnavailable(state, c));
    const blocked = ids.length ? trialBlocked(state, ids) : '名單裡沒有能參加的弟子';
    if (blocked) say(`宗門試煉沒有舉辦（${blocked}）。`);
    else say(runTrial(state, content, ids, auto.trial.tier));
  }

  // 秘境派遣：小隊不在外面時再派
  if (auto.dispatch && !state.dispatches.some((d) => d.realmId === auto.dispatch!.realmId && !d.aidSectId)) {
    const ids = free(state, auto.dispatch.ids);
    const blocked = ids.length ? dispatchBlocked(state, content, auto.dispatch.realmId, ids) : '名單裡沒有能出發的弟子';
    if (blocked) {
      // 隊伍剛回來養傷時每月都會擋下，只在名單裡有人卻出不去時寫一次原因
      if (ids.length) say(`沒有派往${realmDef(content, auto.dispatch.realmId).name}（${blocked}）。`);
    } else say(startDispatch(state, content, auto.dispatch.realmId, ids));
  }

  // 護衛委託：勝率夠高才接，一個月最多一件
  if (auto.escort) {
    const ids = free(state, auto.escort.ids);
    const job = state.commissions.find((c) => c.kind === 'escort' && !commissionBlocked(state, c));
    if (job && ids.length) {
      const odds = escortOdds(state, content, job.id, ids);
      if (odds >= auto.escort.minOdds) say(`護衛委託「${job.title}」（預估勝率 ${odds}%）：${acceptCommission(state, content, job.id, { teamIds: ids })}`);
    }
  }

  // 試煉晉升等月中訊息，直接併進本月月報
  if (state.monthLog?.length) {
    lines.push(...state.monthLog);
    state.monthLog = [];
  }
}

/** 設定或關閉一種自動出征。 */
export function setAuto(state: GameState, content: ContentPack, kind: AutoKind, config: AutoAssign[AutoKind] | null): string {
  const auto = { ...(state.auto ?? {}) };
  if (!config) {
    delete auto[kind];
    state.auto = auto;
    return '已關閉自動出征。';
  }
  const ids = [...new Set(config.ids)].slice(0, MAX_AUTO_TEAM).filter((id) => findCharacter(state, id)?.role === 'inner');
  ensure(ids.length, '名單至少要有一名內門弟子');
  if (kind === 'dispatch') realmDef(content, (config as NonNullable<AutoAssign['dispatch']>).realmId);
  (auto as Record<string, unknown>)[kind] = { ...config, ids };
  state.auto = auto;
  return '已設定自動出征名單。';
}
