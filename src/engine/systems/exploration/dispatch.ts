import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { addInto, canAfford, formatResources, gain, scaleResources, spend } from '../../resources';
import { rng } from '../../rng';
import type { GameState, Resources } from '../../types';
import { releaseFurnace } from '../alchemy/alchemy';
import { findCharacter } from '../characters/characters';
import { estimatePower } from '../combat/combat';
import { allyUnit, companions } from '../combat/party';
import { canJoinExpedition, realmDef } from './exploration';
import { returnAidTeam } from '../world/diplomacy';

// 秘境派遣（企畫書 §12）：已通關的秘境，可派小隊花 1–2 個月自動結算。
// 收益為節點物資的 30–50%，沒有唯一獎勵；小隊實力不足時可能失手、負傷。

/** 小隊實力：各隊員與隨行靈獸的戰力估計總和（與戰鬥用的能力相同）。 */
export function teamPower(state: GameState, content: ContentPack, teamIds: string[]): number {
  let total = 0;
  for (const id of teamIds) {
    const c = findCharacter(state, id);
    if (c) total += estimatePower(allyUnit(state, content, c, 'front'));
  }
  for (const u of companions(state, content, teamIds)) total += estimatePower(u);
  return total;
}

export function dispatchOdds(state: GameState, content: ContentPack, realmId: string, teamIds: string[]) {
  const realm = realmDef(content, realmId);
  const D = balance.dispatch;
  const power = teamPower(state, content, teamIds);
  const bp = Math.max(D.minBp, Math.min(D.maxBp, D.baseBp + Math.floor((D.scaleBp * power) / realm.dispatch.power)));
  return { bp, power, need: realm.dispatch.power };
}

/** 秘境所有節點的物資總和（不含事件選項與首次通關獎勵）。 */
export function realmNodeLoot(state: GameState, content: ContentPack, realmId: string): Partial<Resources> {
  const realm = realmDef(content, realmId);
  const total: Partial<Resources> = {};
  for (const n of realm.nodes) if (n.loot) addInto(total, n.loot);
  return total;
}

export function dispatchBlocked(state: GameState, content: ContentPack, realmId: string, teamIds: string[]): string | undefined {
  const realm = content.secretRealms.get(realmId);
  if (!realm) return '沒有這個秘境';
  if (!(state.realmClears[realmId] ?? 0)) return '需要先親自通關一次才能派遣';
  if (state.dispatches.some((d) => d.realmId === realmId && !d.aidSectId)) return '已有小隊在這個秘境';
  if (!teamIds.length) return '至少需要一名隊員';
  if (teamIds.length > realm.maxTeam) return `隊伍最多 ${realm.maxTeam} 人`;
  if (new Set(teamIds).size !== teamIds.length) return '隊伍中有重複人物';
  for (const id of teamIds) {
    const c = findCharacter(state, id);
    if (!c) return '找不到隊員';
    const reason = canJoinExpedition(state, c);
    if (reason) return reason;
  }
  if (!canAfford(state.resources, realm.supplies)) return `補給不足（需要 ${formatResources(realm.supplies)}）`;
  return undefined;
}

export function startDispatch(state: GameState, content: ContentPack, realmId: string, teamIds: string[]): string {
  const blocked = dispatchBlocked(state, content, realmId, teamIds);
  ensure(!blocked, blocked ?? '');
  const realm = realmDef(content, realmId);
  const odds = dispatchOdds(state, content, realmId, teamIds);
  spend(state.resources, realm.supplies);
  for (const id of teamIds) {
    const c = findCharacter(state, id);
    if (!c) continue;
    releaseFurnace(state, c.id);
    c.schedule = 'dispatch';
  }
  state.dispatches.push({ id: newId(state, 'dsp'), realmId, teamIds: [...teamIds], monthsLeft: realm.dispatch.months });
  return `派出 ${teamIds.length} 人前往${realm.name}，${realm.dispatch.months} 個月後回來（預估成功率 ${odds.bp / 100}%）。`;
}

/** 月結算第 5 步：派遣倒數，到期的小隊結算收穫並回宗。 */
export function resolveDispatches(state: GameState, content: ContentPack, produced: Partial<Resources>, lines: string[]): void {
  const D = balance.dispatch;
  const remaining = [];
  for (const d of state.dispatches) {
    d.monthsLeft -= 1;
    if (d.monthsLeft > 0) {
      remaining.push(d);
      continue;
    }
    if (d.aidSectId) {
      returnAidTeam(state, content, d.teamIds, d.aidSectId, lines);
      continue;
    }
    const realm = realmDef(content, d.realmId);
    const odds = dispatchOdds(state, content, d.realmId, d.teamIds);
    const r = rng(state, 'explore');
    const ok = r.chance(odds.bp);
    let pct = r.range(realm.dispatch.lootPct[0], realm.dispatch.lootPct[1]);
    if (!ok) pct = Math.floor((pct * D.failLootPct) / 100);
    const loot = scaleResources(realmNodeLoot(state, content, d.realmId), pct);
    gain(state.resources, loot);
    addInto(produced, loot);
    const names: string[] = [];
    for (const id of d.teamIds) {
      const c = findCharacter(state, id);
      if (!c) continue;
      names.push(c.name);
      if (!ok) c.injuryMonths = Math.max(c.injuryMonths, D.failInjuryMonths);
      c.schedule = c.injuryMonths > 0 ? 'heal' : 'cultivate';
    }
    lines.push(
      ok
        ? `派遣${realm.name}的小隊（${names.join('、')}）平安歸來，帶回 ${formatResources(loot)}。`
        : `派遣${realm.name}的小隊（${names.join('、')}）遭遇強敵、負傷撤回，只帶回 ${formatResources(loot)}。`,
    );
  }
  state.dispatches = remaining;
}
