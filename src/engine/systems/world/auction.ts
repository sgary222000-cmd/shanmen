import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { rng } from '../../rng';
import type { GameState } from '../../types';
import { sectPowerCap } from './sects';

// 靈脈競標：偶爾出現無主靈脈，各宗出價，得標者若干年內每月有靈礦收入。
// 我宗的出價先預扣靈石，落標全數退還。電腦宗門的出價在開標時才決定，事前看不到。

const A = balance.auction;
const VEIN_NAMES = ['青石嶺靈脈', '赤砂谷靈脈', '鳴泉坡靈脈', '落霞溝靈脈', '寒松崖靈脈'];

export function maybeStartAuction(state: GameState, lines: string[]): void {
  if (state.auction) return;
  const r = rng(state, 'sects');
  if (!r.chance(A.chanceBp)) return;
  state.auction = {
    id: newId(state, 'auc'),
    name: r.pick(VEIN_NAMES),
    orePerMonth: r.range(A.orePerMonth[0], A.orePerMonth[1]),
    years: r.range(A.years[0], A.years[1]),
    deadline: monthIndex(state.date) + A.months - 1,
    playerBid: 0,
  };
  lines.push(`山中發現無主的${state.auction.name}，各宗競標中（到「宗門往來」頁出價）。`);
}

export function bidAuction(state: GameState, amount: number): string {
  const a = state.auction;
  ensure(a, '目前沒有靈脈競標');
  ensure(Number.isInteger(amount) && amount >= A.minBid, `出價至少 ${A.minBid} 靈石`);
  ensure(amount > a.playerBid, `新出價要高於目前的 ${a.playerBid}`);
  const extra = amount - a.playerBid;
  ensure(state.resources.lingshi >= extra, `靈石不足（需再付 ${extra}）`);
  state.resources.lingshi -= extra;
  a.playerBid = amount;
  return `對${a.name}出價 ${amount} 靈石（已預扣，落標退還）。`;
}

/** 月結算第 6 步：到截止月就開標。 */
export function resolveAuction(state: GameState, content: ContentPack, lines: string[]): void {
  const a = state.auction;
  if (!a || monthIndex(state.date) < a.deadline) return;
  const r = rng(state, 'sects');
  let best: { sectId: string; bid: number } | null = null;
  for (const s of state.sects) {
    const def = content.sects.get(s.id);
    const temper = def ? A.temperamentPct[def.temperament] : 100;
    const bid = Math.floor((s.resources.lingshi * r.range(A.sectBidPct[0], A.sectBidPct[1]) * temper) / 10000);
    if (!best || bid > best.bid) best = { sectId: s.id, bid };
  }
  const now = monthIndex(state.date);
  if (a.playerBid > 0 && (!best || a.playerBid > best.bid)) {
    state.veins.push({ name: a.name, orePerMonth: a.orePerMonth, until: now + a.years * 12 });
    lines.push(`★ 我宗以 ${a.playerBid} 靈石標得${a.name}：未來 ${a.years} 年每月靈礦 +${a.orePerMonth}。`);
  } else {
    if (a.playerBid > 0) state.resources.lingshi += a.playerBid;
    const winner = best ? state.sects.find((s) => s.id === best?.sectId) : undefined;
    const name = winner ? content.sects.get(winner.id)?.name ?? '' : '';
    if (winner && best) {
      winner.resources.lingshi -= best.bid;
      winner.power = Math.max(winner.power, Math.min(sectPowerCap(state, content, winner), winner.power + 3));
      state.intel.unshift({ date: { ...state.date }, sectId: winner.id, text: `${name}以 ${best.bid} 靈石標得${a.name}。` });
    }
    lines.push(`${a.name}由${name || '他人'}得標${a.playerBid > 0 ? `，我宗出價 ${a.playerBid} 靈石已退還` : ''}。`);
  }
  state.auction = null;
  state.veins = state.veins.filter((v) => v.until >= now);
}
