import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { rng } from '../../rng';
import type { BattleRecord, Character, GameState, Realm } from '../../types';
import { hallLevel } from '../buildings/buildings';
import { findCharacter, powerLevel, xpToNext } from '../characters/characters';
import { addXp } from '../cultivation/cultivation';
import { runBattle, unitFromCharacter, type Unit } from '../combat/combat';
import { allyUnit, healPctFor } from '../combat/party';
import { fakeFighter, localRng, warUnavailable } from '../world/war';

// 宗門試煉（P2 批次 E）：讓內門弟子和試煉傀儡過招。傀儡依隊伍最強者的境界配置，
// 通關給修為與功法領悟；失敗不受傷，只是生命降到一半。每人每年一次。

const T = balance.trial;
export type TrialTier = (typeof T.tiers)[number];

export function trialTier(id: string): TrialTier {
  const tier = T.tiers.find((t) => t.id === id);
  ensure(tier, '沒有這個難度');
  return tier;
}

function realmAt(L: number): Realm {
  if (L <= 9) return { major: 'qi', stage: Math.max(1, L) };
  if (L <= 21) return { major: 'foundation', stage: Math.min(4, Math.max(1, Math.ceil((L - 9) / 3))) };
  if (L <= 37) return { major: 'core', stage: Math.min(4, Math.max(1, Math.ceil((L - 21) / 4))) };
  if (L <= 57) return { major: 'nascent', stage: Math.min(4, Math.max(1, Math.ceil((L - 37) / 5))) };
  return { major: 'deity', stage: Math.min(4, Math.max(1, Math.ceil((L - 57) / 6))) };
}

/** 不能參加的原因（受傷、外出、今年已參加過）。 */
export function trialUnavailable(state: GameState, c: Character): string | undefined {
  if (c.role === 'protagonist') return '宗門試煉是給弟子的';
  if (state.trials[c.id] === state.date.year) return `${c.name}今年已參加過試煉`;
  if (c.schedule === 'explore') return `${c.name}本月外出探索`;
  return warUnavailable(state, c, true);
}

export function trialBlocked(state: GameState, teamIds: string[]): string | undefined {
  if (hallLevel(state) < T.hall) return `宗門大殿 ${T.hall} 級後才能舉辦宗門試煉`;
  if (!teamIds.length) return '至少要選一名弟子';
  if (teamIds.length > T.maxTeam) return `每次最多 ${T.maxTeam} 人`;
  if (new Set(teamIds).size !== teamIds.length) return '名單有重複';
  for (const id of teamIds) {
    const c = findCharacter(state, id);
    if (!c) return '找不到弟子';
    const why = trialUnavailable(state, c);
    if (why) return why;
  }
  const cost = T.lingshiPer * teamIds.length;
  if (state.resources.lingshi < cost) return `靈石不足（需要 ${cost}）`;
  return undefined;
}

function team(state: GameState, teamIds: string[]): Character[] {
  return teamIds.map((id) => findCharacter(state, id)).filter((c): c is Character => !!c);
}

/** 試煉傀儡：人數與隊伍相同，最強的一具等於隊伍最強者的等級加上難度差，之後每具低 1 級。 */
export function trialFoes(state: GameState, content: ContentPack, teamIds: string[], tierId: string): Unit[] {
  const members = team(state, teamIds);
  const lineage = content.lineages.get(state.lineage);
  ensure(lineage, '傳承資料錯誤');
  const top = Math.max(1, ...members.map((c) => powerLevel(c.realm))) + trialTier(tierId).levelOffset;
  const cs = Math.round(members.reduce((n, c) => n + c.skills.combat, 0) / Math.max(1, members.length));
  return members.map((_, i) => {
    const fake = fakeFighter(`trial#${i}`, `試煉傀儡・${['甲', '乙', '丙'][i] ?? '丁'}`, realmAt(Math.max(1, top - i)), cs);
    return { ...unitFromCharacter(fake, i < 2 ? 'front' : 'back', lineage), side: 'enemy' as const };
  });
}

function fightOnce(state: GameState, content: ContentPack, teamIds: string[], tierId: string, randInt: (n: number) => number) {
  const allies = team(state, teamIds).map((c, i) => allyUnit(state, content, c, i < 2 ? 'front' : 'back'));
  return runBattle({
    allies,
    enemies: trialFoes(state, content, teamIds, tierId),
    strategy: { ...state.strategy, useHealPill: false, useTalismans: false },
    healPills: 0,
    healPct: healPctFor(state, content),
    randInt,
  });
}

/** 預估勝率（不消耗亂數）。 */
export function trialOdds(state: GameState, content: ContentPack, teamIds: string[], tierId: string): number {
  if (!team(state, teamIds).length) return 0;
  let wins = 0;
  for (let i = 0; i < T.previewRuns; i++) {
    const r = localRng(monthIndex(state.date) * 6151 + i * 7919 + teamIds.length * 31 + tierId.length);
    if (fightOnce(state, content, teamIds, tierId, (n) => r.int(n)).result === 'win') wins++;
  }
  return Math.round((wins * 100) / T.previewRuns);
}

export function runTrial(state: GameState, content: ContentPack, teamIds: string[], tierId: string): string {
  const blocked = trialBlocked(state, teamIds);
  ensure(!blocked, blocked ?? '');
  const tier = trialTier(tierId);
  state.resources.lingshi -= T.lingshiPer * teamIds.length;
  const r = rng(state, 'combat');
  const out = fightOnce(state, content, teamIds, tierId, (n) => r.int(n));
  const win = out.result === 'win';
  const lines: string[] = [];
  for (const c of team(state, teamIds)) {
    state.trials[c.id] = state.date.year;
    const pct = win ? tier.xpPct : T.loseXpPct;
    addXp(c, Math.floor((xpToNext(c.realm) * pct) / 100), lines);
    if (win) c.insight = Math.min(balance.technique.maxInsight, c.insight + tier.insight);
    else c.health = Math.min(c.health, T.loseHealth);
  }
  const record: BattleRecord = {
    id: newId(state, 'battle'),
    date: { ...state.date },
    title: `宗門試煉・${tier.name}`,
    result: out.result,
    rounds: out.rounds,
    highlights: out.highlights,
    log: out.log,
    allies: out.allies.map((u) => ({ id: u.key, name: u.name, hp: u.hp, maxHp: u.maxHp })),
    enemies: out.enemies.map((u) => ({ id: u.key, name: u.name, hp: u.hp, maxHp: u.maxHp })),
  };
  state.battles.unshift(record);
  state.battles = state.battles.slice(0, 30);
  const names = team(state, teamIds)
    .map((c) => c.name)
    .join('、');
  let extra = '';
  if (win) {
    // 0.11.0：試煉玉髓；「登峰」第一次獲勝學會天眼丹方
    const jade = balance.rareDrops.trialJade[tier.id] ?? 0;
    if (jade) {
      state.resources.mat_jade += jade;
      extra += `得到試煉玉髓 ${jade}。`;
    }
    const recipe = balance.rareDrops.trialHardRecipe;
    if (tier.id === 'hard' && !state.recipes.includes(recipe)) {
      state.recipes.push(recipe);
      extra += `首次登峰，學會「${content.recipes.get(recipe)?.name ?? recipe}」的丹方。`;
    }
  }
  const text = win
    ? `宗門試煉（${tier.name}）：${names}通過，修為 +${tier.xpPct}%、功法領悟 +${tier.insight}。${extra}`
    : `宗門試煉（${tier.name}）：${names}未能通過，修為 +${T.loseXpPct}%，沒有受傷。`;
  if (lines.length) (state.monthLog ??= []).push(...lines);
  return text;
}
