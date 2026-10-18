import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { rng } from '../../rng';
import type { GameState } from '../../types';
import { activeEffects, hallLevel, HALL, innerLimit, outerCapacity } from '../buildings/buildings';
import { characterFromCandidate, rollCandidate, realmName } from '../characters/characters';
import { trimJobs } from '../characters/outer';
import { reputationRecruitBonus } from '../commissions/commissions';

/** 月結算第 7 步：到期時產生山門招生事件（需處理才能繼續推進）。 */
export function maybeRecruitment(state: GameState, content: ContentPack, lines: string[]): void {
  if (hallLevel(state) < 1) return;
  const now = monthIndex(state.date);
  if (now < state.nextRecruitMonth) return;
  state.nextRecruitMonth = now + balance.recruit.intervalMonths;

  const r = rng(state, 'recruit');
  const bonus = activeEffects(state, content, HALL)?.recruitOuterBonus ?? 0;
  const room = Math.max(0, outerCapacity(state, content) - state.outer.count);
  const repBonus = reputationRecruitBonus(state);
  const joined = Math.min(room, r.range(balance.recruit.outerMin, balance.recruit.outerMax) + bonus + repBonus);
  state.outer.count += joined;

  const candidates = Array.from({ length: balance.recruit.candidates }, () => rollCandidate(state, 0));
  state.events.push({
    id: newId(state, 'ev'),
    kind: 'recruitment',
    title: '山門招生',
    text:
      `本次招生有 ${joined} 人加入外門` +
      (repBonus ? `（宗門聲望多吸引了 ${repBonus} 人）` : '') +
      (room < balance.recruit.outerMin ? '（弟子居所將滿）' : '') +
      `。另有 ${candidates.length} 名資質較佳的少年求入內門，最多收一人，需支付安置靈石。`,
    blocking: true,
    candidates,
    outerJoined: joined,
  });
  lines.push(`山門招生：外門 +${joined} 人，有內門候選人等待決定。`);
}

export function resolveRecruitment(
  state: GameState,
  content: ContentPack,
  eventId: string,
  candidateId: string | null,
): void {
  const ev = state.events.find((e) => e.id === eventId);
  ensure(ev && ev.kind === 'recruitment', '沒有這個招生事件');
  if (candidateId) {
    const cand = ev.candidates?.find((c) => c.id === candidateId);
    ensure(cand, '沒有這名候選人');
    ensure(state.disciples.length < innerLimit(state, content), '內門人數已達大殿上限');
    ensure(state.resources.lingshi >= cand.cost, `靈石不足（需要 ${cand.cost}）`);
    state.resources.lingshi -= cand.cost;
    state.disciples.push(characterFromCandidate(state, cand, 1));
  }
  state.events = state.events.filter((e) => e.id !== eventId);
}

/** 從外門選拔一人晉升內門。外門培養度越高，資質越好。 */
export function promoteOuter(state: GameState, content: ContentPack): string {
  ensure(hallLevel(state) >= 1, '需要先修復宗門大殿');
  ensure(state.outer.count > 0, '沒有外門弟子');
  ensure(state.outer.count > state.outer.labor, '外門弟子都外出做委託了，下月再選拔');
  ensure(state.disciples.length < innerLimit(state, content), '內門人數已達大殿上限');
  ensure(state.resources.lingshi >= balance.recruit.promoteCost, `靈石不足（需要 ${balance.recruit.promoteCost}）`);
  state.resources.lingshi -= balance.recruit.promoteCost;
  const cand = rollCandidate(state, state.outer.training * 20);
  const stage = 1 + Math.floor(state.outer.training / 40);
  const c = characterFromCandidate(state, cand, stage);
  state.disciples.push(c);
  state.outer.count -= 1;
  // 若人數減少導致分工超額，從修煉以外的分工中依序扣回
  trimJobs(state);
  state.outer.training = Math.max(0, state.outer.training - 10);
  return `${c.name}（${realmName(c.realm)}）晉升內門。`;
}
