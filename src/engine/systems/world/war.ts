import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { LineageDef } from '../../../content/schema';
import { givenFemale, givenMale, surnames } from '../../../content/names';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { nextUint32, rng, seedState } from '../../rng';
import type { Building, Character, GameState, Realm, ResourceSite, SectState, StopReason, War } from '../../types';
import { activeEffects, hallLevel, innerLimit, levelDef, outerCapacity } from '../buildings/buildings';
import { characterFromCandidate, findCharacter, isInjured, powerLevel, rollCandidate } from '../characters/characters';
import { passAway } from '../characters/lifespan';
import { estimatePower, runBattle, unitFromCharacter, type Unit } from '../combat/combat';
import { allyUnit, healPctFor } from '../combat/party';
import { canJoinExpedition } from '../exploration/exploration';
import { isDistant, trustOf } from './diplomacy';

// 衝突與戰爭（P2 批次 D）：
// - 據點爭奪：派最多三人搶鄰宗的據點，一場自動戰鬥，輸了只會受傷。
// - 宣戰：雙方都要有準備期（我宗宣戰 3 個月、被宣戰 3–6 個月），期間可以談和、撤離資產、指定出戰的人；盟友會出兵相助。
// - 山門戰：三場兩勝。倒下的內門弟子可能戰死（開戰前顯示機率），主角不會死。護山大陣讓守方更強、更不容易死人。
// - 戰敗不會滅宗：損失靈石糧食、建築損毀待修、割讓據點。攻打得勝可以割地賠款、收為附屬或吞併。

const W = balance.war;
export const PLAYER = 'player';
const TEAM_SIZE = 3;

function sectOf(state: GameState, sectId: string): SectState {
  const sect = state.sects.find((s) => s.id === sectId);
  ensure(sect, '沒有這個宗門');
  return sect;
}

function nameOf(content: ContentPack, sectId: string): string {
  return content.sects.get(sectId)?.name ?? '';
}

/** 仍在世上、可以往來或交戰的鄰近宗門（不含已吞併的）。 */
export function activeNeighbor(content: ContentPack, sect: SectState): boolean {
  return !sect.annexed && !isDistant(content, sect.id);
}

export function graceOver(state: GameState): boolean {
  return state.date.year >= W.graceYears;
}

/** 修為等級換成境界（電腦宗門出戰的高手用）。 */
function realmOfLevel(L: number): Realm {
  if (L <= 9) return { major: 'qi', stage: Math.max(1, L) };
  if (L <= 21) return { major: 'foundation', stage: Math.min(4, Math.max(1, Math.ceil((L - 9) / 3))) };
  if (L <= 37) return { major: 'core', stage: Math.min(4, Math.max(1, Math.ceil((L - 21) / 4))) };
  return { major: 'nascent', stage: Math.min(4, Math.max(1, Math.ceil((L - 37) / 5))) };
}

/** 宗門實力換算成最強弟子的修為等級：實力 150 約金丹前期、210 約金丹後期。 */
function topLevelOf(power: number): number {
  return 2 + Math.floor(power / 6);
}

/** 給戰鬥用的假人物（電腦宗門高手、試煉傀儡）。 */
export function fakeFighter(id: string, name: string, realm: Realm, combat: number): Character {
  return {
    id,
    name,
    gender: 'male',
    role: 'inner',
    ageMonths: 600,
    realm,
    xp: 0,
    root: { grade: 'mid', elements: [] },
    health: 100,
    injuryMonths: 0,
    loyalty: 100,
    skills: { alchemy: 0, farming: 0, combat, forging: 0, talisman: 0, beast: 0, affairs: 0 },
    schedule: 'cultivate',
    takePill: false,
    seat: '',
    specialty: null,
    insight: 0,
    equipment: null,
  };
}

/** 實力 power 的宗門出戰的高手（強弱依實力，前兩人站前排）。 */
function fightersOf(power: number, lineage: LineageDef, sectName: string, sectId: string, count: number): Unit[] {
  const top = topLevelOf(power);
  const cs = Math.min(30, 2 + Math.floor(power / 8));
  return Array.from({ length: count }, (_, i) => {
    const realm = realmOfLevel(Math.max(1, top - i * 3));
    const fake = fakeFighter(`${sectId}#w${i}`, `${sectName}・${['首座', '長老', '執事'][i] ?? '弟子'}`, realm, cs);
    return { ...unitFromCharacter(fake, i < 2 ? 'front' : 'back', lineage), side: 'enemy' as const };
  });
}

/** 電腦宗門出戰的三名高手。 */
export function warFighters(state: GameState, content: ContentPack, sect: SectState, count = TEAM_SIZE): Unit[] {
  const def = content.sects.get(sect.id);
  const lineage = def ? content.lineages.get(def.lineage) : undefined;
  ensure(lineage, '宗門傳承資料錯誤');
  return fightersOf(sect.power, lineage, def?.name ?? '', sect.id, count);
}

/**
 * 我宗的實力，換算成電腦宗門實力的尺度：最強三人（含法器、功法）的戰力，
 * 相當於實力多少的宗門派出的三名高手。給電腦宗門判斷要不要動手、以及吞併門檻用。
 */
export function playerPower(state: GameState, content: ContentPack): number {
  const lineage = content.lineages.get(state.lineage);
  if (!lineage) return 0;
  const top = [state.protagonist, ...state.disciples]
    .sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp)
    .slice(0, TEAM_SIZE)
    .map((c, i) => allyUnit(state, content, c, i < 2 ? 'front' : 'back'));
  const ours = top.reduce((n, u) => n + estimatePower(u), 0);
  const theirs = (p: number) => fightersOf(p, lineage, '', 'x', TEAM_SIZE).reduce((n, u) => n + estimatePower(u), 0);
  let lo = 0;
  let hi = 600;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (theirs(mid) <= ours) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 不能出戰的原因：守山門時人在宗內就能上場（閉關、突破中也一樣），只有受傷與外出派遣的人不行。 */
export function warUnavailable(state: GameState, c: Character, defending = false): string | undefined {
  if (!defending) return canJoinExpedition(state, c);
  if (isInjured(c)) return `${c.name}受傷中`;
  if (c.schedule === 'dispatch') return `${c.name}外出派遣中，趕不回來`;
  return undefined;
}

export function availableFighters(state: GameState, defending = false): Character[] {
  return [state.protagonist, ...state.disciples]
    .filter((c) => !warUnavailable(state, c, defending))
    .sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp);
}

/** 出戰的人：指定的人裡還能打的；沒有指定時挑最強的三人。 */
export function warTeam(state: GameState, teamIds: string[], defending = false): Character[] {
  const avail = availableFighters(state, defending);
  if (teamIds.length) return avail.filter((c) => teamIds.includes(c.id)).slice(0, TEAM_SIZE);
  return avail.slice(0, TEAM_SIZE);
}

/** 守山門時護山大陣的加成。 */
export function arrayBonus(state: GameState, content: ContentPack): { defensePct: number; deathReducePct: number } {
  const e = activeEffects(state, content, 'building.grand_array');
  return { defensePct: e?.defensePct ?? 0, deathReducePct: e?.warDeathReducePct ?? 0 };
}

/** 倒下的內門弟子戰死的機率（萬分比）。 */
export function deathBp(state: GameState, content: ContentPack, defending: boolean): number {
  const reduce = defending ? arrayBonus(state, content).deathReducePct : 0;
  return Math.floor((W.deathBp * (100 - reduce)) / 100);
}

type Rand = { int(n: number): number; chance(bp: number): boolean };

export function localRng(seed: number): Rand {
  const s = seedState(seed);
  return {
    int: (n) => (n <= 0 ? 0 : nextUint32(s) % n),
    chance: (bp) => nextUint32(s) % 10000 < bp,
  };
}

interface RoundSetup {
  team: Character[];
  allyUnits: Unit[];
  enemies: Unit[];
  defending: boolean;
}

/** 攻打對方山門或據點時，對方的守山陣法讓守方生命、防禦提高。 */
function homeGuard(units: Unit[]): Unit[] {
  const pct = W.homeDefensePct;
  return units.map((u) => {
    const maxHp = Math.round((u.maxHp * (100 + pct)) / 100);
    return { ...u, maxHp, hp: maxHp, def: Math.round((u.def * (100 + pct)) / 100) };
  });
}

function ourUnits(state: GameState, content: ContentPack, setup: RoundSetup): Unit[] {
  const pct = setup.defending ? arrayBonus(state, content).defensePct : 0;
  const units = setup.team.map((c, i) => allyUnit(state, content, c, i < 2 ? 'front' : 'back'));
  for (const u of [...units, ...setup.allyUnits]) {
    u.maxHp = Math.round((u.maxHp * (100 + pct)) / 100);
    u.hp = u.maxHp;
    u.def = Math.round((u.def * (100 + pct)) / 100);
  }
  return [...units, ...setup.allyUnits.map((u, i) => ({ ...u, key: `ally#${i}`, side: 'ally' as const }))];
}

/** 打一場；回傳是否得勝與倒下的我方人物 ID。 */
function fight(state: GameState, content: ContentPack, setup: RoundSetup, r: Rand, pills: { heal: number }): { win: boolean; down: string[]; rounds: number } {
  const allies = ourUnits(state, content, setup);
  const out = runBattle({
    allies,
    enemies: setup.enemies.map((u) => ({ ...u, hp: u.maxHp })),
    strategy: { ...state.strategy, useTalismans: false },
    healPills: pills.heal,
    healPct: healPctFor(state, content),
    randInt: (n) => r.int(n),
  });
  pills.heal -= out.pillsUsed;
  const down = setup.team.filter((c) => (out.allies.find((u) => u.key === c.id)?.hp ?? 0) <= 0).map((c) => c.id);
  return { win: out.result === 'win', down, rounds: out.rounds };
}

function setupFor(state: GameState, content: ContentPack, war: War): RoundSetup {
  const sect = sectOf(state, war.sectId);
  return {
    team: warTeam(state, war.teamIds, war.side === 'defend'),
    allyUnits: war.allies.flatMap((id) => {
      const ally = state.sects.find((s) => s.id === id);
      return ally && !ally.annexed ? warFighters(state, content, ally, 1) : [];
    }),
    enemies: war.side === 'attack' ? homeGuard(warFighters(state, content, sect)) : warFighters(state, content, sect),
    defending: war.side === 'defend',
  };
}

/** 開戰前預估：模擬多次（不動用遊戲亂數），回傳勝率與每人戰死機率。 */
export function warOdds(state: GameState, content: ContentPack, war: War): { winPct: number; deathPct: number; team: Character[] } {
  const setup = setupFor(state, content, war);
  if (!setup.team.length) return { winPct: 0, deathPct: deathBp(state, content, setup.defending) / 100, team: [] };
  let wins = 0;
  for (let i = 0; i < W.previewRuns; i++) {
    const r = localRng(monthIndex(state.date) * 7919 + i * 104729 + war.sectId.length);
    const pills = { heal: state.resources.pill_heal };
    let w = 0;
    let l = 0;
    while (w < 2 && l < 2) {
      if (fight(state, content, setup, r, pills).win) w++;
      else l++;
    }
    if (w >= 2) wins++;
  }
  return { winPct: Math.round((wins * 100) / W.previewRuns), deathPct: deathBp(state, content, setup.defending) / 100, team: setup.team };
}

// ── 據點爭奪 ──────────────────────────────────────────────

export function playerSites(state: GameState): ResourceSite[] {
  return state.sites.filter((s) => s.owner === PLAYER);
}

export function contestBlocked(state: GameState, content: ContentPack, siteId: string): string | undefined {
  const site = state.sites.find((s) => s.id === siteId);
  if (!site) return '沒有這處據點';
  if (site.owner === PLAYER) return '已是我宗的據點';
  if (hallLevel(state) < 3) return '宗門大殿 3 級後才能出兵爭奪據點';
  if (playerSites(state).length >= balance.sites.maxPerSect) return `我宗最多佔 ${balance.sites.maxPerSect} 處據點`;
  const now = monthIndex(state.date);
  if (site.contestedAt !== undefined && now - site.contestedAt < 12) return '這處據點今年已經爭奪過';
  if (!site.owner) {
    if (state.resources.lingshi < balance.sites.claimLingshi) return `佔下無主據點需要靈石 ${balance.sites.claimLingshi}`;
    return undefined;
  }
  const owner = state.sects.find((s) => s.id === site.owner);
  if (!owner) return undefined;
  const name = nameOf(content, owner.id);
  if (owner.treaty) return `與${name}有條約，要先解約才能動手`;
  if (owner.vassal) return `${name}是我宗附屬`;
  if (state.wars.some((w) => w.sectId === owner.id)) return `正與${name}交戰，據點在山門戰後一併處理`;
  if (!warTeam(state, []).length) return '沒有能出戰的人';
  return undefined;
}

/** 爭奪據點的預估勝率（出戰的是最強的三人）。 */
export function contestOdds(state: GameState, content: ContentPack, siteId: string): number {
  const site = state.sites.find((s) => s.id === siteId);
  const owner = site?.owner ? state.sects.find((s) => s.id === site.owner) : undefined;
  if (!owner) return 100;
  const setup: RoundSetup = { team: warTeam(state, []), allyUnits: [], enemies: homeGuard(warFighters(state, content, owner)), defending: false };
  if (!setup.team.length) return 0;
  let wins = 0;
  for (let i = 0; i < W.previewRuns; i++) {
    const r = localRng(monthIndex(state.date) * 6151 + i * 7727 + siteId.length);
    if (fight(state, content, setup, r, { heal: state.resources.pill_heal }).win) wins++;
  }
  return Math.round((wins * 100) / W.previewRuns);
}

export function contestSite(state: GameState, content: ContentPack, siteId: string): string {
  const blocked = contestBlocked(state, content, siteId);
  ensure(!blocked, blocked ?? '');
  const site = state.sites.find((s) => s.id === siteId);
  ensure(site, '沒有這處據點');
  site.contestedAt = monthIndex(state.date);
  if (!site.owner) {
    state.resources.lingshi -= balance.sites.claimLingshi;
    site.owner = PLAYER;
    return `派人佔下無主的${site.name}，每月多一份收入。`;
  }
  const owner = sectOf(state, site.owner);
  const name = nameOf(content, owner.id);
  const setup: RoundSetup = { team: warTeam(state, []), allyUnits: [], enemies: homeGuard(warFighters(state, content, owner)), defending: false };
  const r = rng(state, 'combat');
  const pills = { heal: state.resources.pill_heal };
  const res = fight(state, content, setup, r, pills);
  state.resources.pill_heal = pills.heal;
  const names = setup.team.map((c) => c.name).join('、');
  for (const id of res.down) {
    const c = findCharacter(state, id);
    if (c) c.injuryMonths = Math.max(c.injuryMonths, W.koInjuryMonths);
  }
  owner.favor = Math.max(0, owner.favor - 15);
  owner.trust = Math.max(0, trustOf(owner) - 10);
  const hurt = res.down.length ? `；${res.down.map((id) => findCharacter(state, id)?.name).join('、')}受傷 ${W.koInjuryMonths} 個月` : '';
  if (res.win) {
    site.owner = PLAYER;
    owner.power = Math.max(1, owner.power - balance.sites.lossPower);
    return `${names}出手，從${name}手中奪下${site.name}（${res.rounds} 回合）${hurt}。${name}好感 −15、信任 −10。`;
  }
  return `${names}爭奪${name}的${site.name}失利${hurt}。${name}好感 −15、信任 −10。`;
}

/** 電腦宗門攻打我宗據點：最強的三人自動迎戰（不會死人）。 */
export function defendSite(state: GameState, content: ContentPack, sect: SectState, site: ResourceSite, lines: string[], stops: StopReason[]): void {
  const name = nameOf(content, sect.id);
  const setup: RoundSetup = { team: warTeam(state, []), allyUnits: [], enemies: warFighters(state, content, sect), defending: false };
  let win = false;
  if (setup.team.length) {
    const pills = { heal: state.resources.pill_heal };
    const res = fight(state, content, setup, rng(state, 'combat'), pills);
    state.resources.pill_heal = pills.heal;
    win = res.win;
    for (const id of res.down) {
      const c = findCharacter(state, id);
      if (c) c.injuryMonths = Math.max(c.injuryMonths, W.koInjuryMonths);
    }
  }
  if (win) {
    sect.power = Math.max(1, sect.power - balance.sites.lossPower);
    lines.push(`⚔ ${name}來搶我宗的${site.name}，被${setup.team.map((c) => c.name).join('、')}擊退。`);
  } else {
    site.owner = sect.id;
    lines.push(`⚔ ${name}奪走了我宗的${site.name}${setup.team.length ? '' : '（宗內無人能出戰）'}。`);
  }
  sect.favor = Math.max(0, sect.favor - 5);
  stops.push({ kind: 'war', text: `${name}攻打${site.name}` });
}

// ── 宣戰 ──────────────────────────────────────────────────

function atWarWith(state: GameState, sectId: string): War | undefined {
  return state.wars.find((w) => w.sectId === sectId);
}

/** 我宗宣戰的正當理由；沒有時回傳 undefined。 */
export function casusBelli(state: GameState, content: ContentPack, sect: SectState): string | undefined {
  if (sect.favor < W.causeFavor) return `${nameOf(content, sect.id)}對我宗冷淡（好感 ${sect.favor}）`;
  if (sect.goal === 'expand') return `${nameOf(content, sect.id)}正在四處爭奪據點`;
  return undefined;
}

export function declareBlocked(state: GameState, content: ContentPack, sectId: string): string | undefined {
  const sect = state.sects.find((s) => s.id === sectId);
  if (!sect || !activeNeighbor(content, sect)) return '只能對鄰近宗門宣戰';
  const name = nameOf(content, sectId);
  if (!graceOver(state)) return `前期保護期間（到第 ${W.graceYears} 年）各宗都不興兵`;
  if (hallLevel(state) < 3) return '宗門大殿 3 級後才能宣戰';
  if (sect.vassal) return `${name}已是我宗附屬`;
  if (atWarWith(state, sectId)) return `已經在與${name}交戰`;
  if (sect.treaty) return `與${name}有條約，要先解約`;
  const now = monthIndex(state.date);
  if (sect.truceUntil !== undefined && now < sect.truceUntil) return `與${name}停戰中（還有約 ${Math.ceil((sect.truceUntil - now) / 12)} 年）`;
  if (state.resources.lingshi < W.declareLingshi) return `軍費需要靈石 ${W.declareLingshi}`;
  return undefined;
}

function startWar(state: GameState, content: ContentPack, sect: SectState, side: War['side'], reason: string, prep: number): War {
  const now = monthIndex(state.date);
  // 守山門時，信任夠的盟友會出兵相助
  const allies =
    side === 'defend'
      ? state.sects.filter((s) => s.id !== sect.id && s.treaty?.kind === 'alliance' && trustOf(s) >= W.allyTrust && !s.annexed).map((s) => s.id)
      : [];
  const war: War = { id: newId(state, 'war'), sectId: sect.id, side, reason, declared: now, resolveAt: now + prep, teamIds: [], hidden: 0, allies };
  state.wars.push(war);
  return war;
}

export function declareWar(state: GameState, content: ContentPack, sectId: string): string {
  const blocked = declareBlocked(state, content, sectId);
  ensure(!blocked, blocked ?? '');
  const sect = sectOf(state, sectId);
  const name = nameOf(content, sectId);
  const cause = casusBelli(state, content, sect);
  state.resources.lingshi -= W.declareLingshi;
  let text = `向${name}宣戰（軍費 ${W.declareLingshi} 靈石），${W.playerPrep} 個月後攻打對方山門。`;
  if (!cause) {
    state.reputation = Math.max(0, state.reputation - W.unjustReputation);
    text += `無故興兵，聲望 −${W.unjustReputation}。`;
  } else text += `理由：${cause}。`;
  sect.favor = 0;
  startWar(state, content, sect, 'attack', cause ?? '無故興兵', W.playerPrep);
  return text;
}

/** 談和：守方付錢求和；攻方撤兵。之後停戰 5 年。 */
export function peaceCost(state: GameState, war: War): number {
  const sect = sectOf(state, war.sectId);
  return war.side === 'defend' ? W.tributeBase + sect.power * W.tributePerPower : 0;
}

export function peaceBlocked(state: GameState, warId: string): string | undefined {
  const war = state.wars.find((w) => w.id === warId);
  if (!war) return '沒有這場戰事';
  const cost = peaceCost(state, war);
  if (state.resources.lingshi < cost) return `求和需要靈石 ${cost}`;
  return undefined;
}

function endWar(state: GameState, war: War, truceYears: number): void {
  state.wars = state.wars.filter((w) => w.id !== war.id);
  state.resources.lingshi += war.hidden;
  const sect = state.sects.find((s) => s.id === war.sectId);
  if (sect) sect.truceUntil = monthIndex(state.date) + truceYears * 12;
}

export function makePeace(state: GameState, content: ContentPack, warId: string): string {
  const blocked = peaceBlocked(state, warId);
  ensure(!blocked, blocked ?? '');
  const war = state.wars.find((w) => w.id === warId);
  ensure(war, '沒有這場戰事');
  const sect = sectOf(state, war.sectId);
  const name = nameOf(content, sect.id);
  const back = war.hidden ? `撤離的 ${war.hidden} 靈石已取回。` : '';
  if (war.side === 'defend') {
    const cost = peaceCost(state, war);
    state.resources.lingshi -= cost;
    sect.resources.lingshi += cost;
    sect.favor = Math.min(100, sect.favor + 10);
    endWar(state, war, W.peaceTruceYears);
    return `向${name}送上 ${cost} 靈石求和，對方退兵，停戰 ${W.peaceTruceYears} 年。${back}`;
  }
  state.reputation = Math.max(0, state.reputation - W.withdrawReputation);
  endWar(state, war, W.peaceTruceYears);
  return `撤回攻打${name}的兵馬，聲望 −${W.withdrawReputation}，停戰 ${W.peaceTruceYears} 年。`;
}

export function evacuateBlocked(state: GameState, warId: string): string | undefined {
  const war = state.wars.find((w) => w.id === warId);
  if (!war) return '沒有這場戰事';
  if (war.side !== 'defend') return '只有守山門時才需要撤離';
  if (war.hidden > 0) return '已經撤離過了';
  if (state.resources.lingshi < 2) return '沒有靈石可以撤離';
  return undefined;
}

/** 撤離資產：把一半靈石藏進後山密庫，山門失守也搶不走，戰後取回（期間不能用）。 */
export function evacuate(state: GameState, warId: string): string {
  const blocked = evacuateBlocked(state, warId);
  ensure(!blocked, blocked ?? '');
  const war = state.wars.find((w) => w.id === warId);
  ensure(war, '沒有這場戰事');
  const amount = Math.floor((state.resources.lingshi * W.evacuatePct) / 100);
  state.resources.lingshi -= amount;
  war.hidden = amount;
  return `把 ${amount} 靈石撤到後山密庫，山門失守也不會被搶，戰事結束後取回。`;
}

export function setWarTeamBlocked(state: GameState, warId: string, teamIds: string[]): string | undefined {
  if (!state.wars.some((w) => w.id === warId)) return '沒有這場戰事';
  if (teamIds.length > TEAM_SIZE) return `最多 ${TEAM_SIZE} 人`;
  if (new Set(teamIds).size !== teamIds.length) return '隊伍中有重複人物';
  for (const id of teamIds) if (!findCharacter(state, id)) return '找不到弟子';
  return undefined;
}

export function setWarTeam(state: GameState, warId: string, teamIds: string[]): string {
  const blocked = setWarTeamBlocked(state, warId, teamIds);
  ensure(!blocked, blocked ?? '');
  const war = state.wars.find((w) => w.id === warId);
  ensure(war, '沒有這場戰事');
  war.teamIds = [...teamIds];
  return teamIds.length ? `出戰：${teamIds.map((id) => findCharacter(state, id)?.name).join('、')}。` : '出戰改為自動挑選最強的三人。';
}

// ── 山門戰結算 ────────────────────────────────────────────

function damageBuildings(state: GameState, content: ContentPack, n: number, r: ReturnType<typeof rng>): Building[] {
  const pool = state.buildings.filter((b) => b.level >= 1 && !b.damaged && b.defId !== 'building.hall' && b.defId !== 'building.dorm');
  const out: Building[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const b = pool.splice(r.int(pool.length), 1)[0];
    if (!b) break;
    b.damaged = true;
    out.push(b);
  }
  return out;
}

function annexedInner(state: GameState, content: ContentPack, sect: SectState): Character[] {
  const room = Math.max(0, innerLimit(state, content) - state.disciples.length);
  const n = Math.min(room, W.annexInner);
  const top = topLevelOf(sect.power);
  const r = rng(state, 'sects');
  return Array.from({ length: n }, (_, i) => {
    const c = characterFromCandidate(state, rollCandidate(state, 0), 1);
    c.realm = realmOfLevel(Math.max(10, top - 6 - i * 3));
    c.loyalty = W.annexLoyalty;
    c.ageMonths = 12 * r.range(40, 90);
    const gender = r.chance(5000) ? 'male' : 'female';
    c.gender = gender;
    c.name = `${r.pick(surnames)}${r.pick(gender === 'male' ? givenMale : givenFemale)}`;
    return c;
  });
}

export type VictoryChoice = 'tribute' | 'vassal' | 'annex';

export function annexBlocked(state: GameState, content: ContentPack, sectId: string): string | undefined {
  const sect = state.sects.find((s) => s.id === sectId);
  if (!sect) return '沒有這個宗門';
  if (hallLevel(state) < W.annexHall) return `宗門大殿 ${W.annexHall} 級才有能力整合別派`;
  const limit = Math.floor((playerPower(state, content) * W.annexPowerPct) / 100);
  if (sect.power > limit) return `${nameOf(content, sectId)}實力 ${sect.power}，要不到我宗的 ${W.annexPowerPct}%（${limit}）才能吞併`;
  return undefined;
}

export function victoryBlocked(state: GameState, content: ContentPack, eventId: string, choice: VictoryChoice): string | undefined {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev || ev.kind !== 'victory' || !ev.victory) return '沒有這件事';
  if (choice === 'annex') return annexBlocked(state, content, ev.victory.sectId);
  return undefined;
}

export function vassalTribute(sect: SectState): number {
  return W.vassalBase + Math.floor(sect.power / W.vassalPerPower);
}

export function resolveVictory(state: GameState, content: ContentPack, eventId: string, choice: VictoryChoice): string {
  const blocked = victoryBlocked(state, content, eventId, choice);
  ensure(!blocked, blocked ?? '');
  const ev = state.events.find((e) => e.id === eventId);
  const sectId = ev?.victory?.sectId;
  ensure(sectId, '沒有這件事');
  state.events = state.events.filter((e) => e.id !== eventId);
  const sect = sectOf(state, sectId);
  const name = nameOf(content, sectId);
  if (choice === 'tribute') {
    const theirs = state.sites.filter((s) => s.owner === sectId);
    const room = Math.max(0, balance.sites.maxPerSect - playerSites(state).length);
    const taken = theirs.slice(0, Math.min(W.cedeSites, room));
    for (const s of taken) s.owner = PLAYER;
    const pay = Math.min(sect.resources.lingshi, W.indemnityBase + sect.power * W.indemnityPerPower);
    sect.resources.lingshi -= pay;
    state.resources.lingshi += pay;
    sect.favor = Math.max(0, sect.favor - 20);
    return `${name}割地賠款：${taken.length ? `${taken.map((s) => s.name).join('、')}歸我宗、` : ''}賠償靈石 ${pay}。`;
  }
  if (choice === 'vassal') {
    sect.vassal = true;
    sect.vassalUntil = monthIndex(state.date) + W.vassalYears * 12;
    sect.treaty = null;
    sect.favor = Math.max(sect.favor, 40);
    return `${name}成為我宗附屬 ${W.vassalYears} 年，每月進貢約 ${vassalTribute(sect)} 靈石，期間不再與我宗為敵。`;
  }
  // 吞併
  sect.annexed = true;
  sect.treaty = null;
  const sites = state.sites.filter((s) => s.owner === sectId);
  for (const s of sites) s.owner = PLAYER;
  const outer = Math.min(Math.max(0, outerCapacity(state, content) - state.outer.count), Math.floor(sect.population / 3));
  state.outer.count += outer;
  state.outer.satisfaction = Math.max(0, state.outer.satisfaction - W.annexSatisfaction);
  const inner = annexedInner(state, content, sect);
  state.disciples.push(...inner);
  const gold = Math.floor(sect.resources.lingshi / 2);
  state.resources.lingshi += gold;
  const now = monthIndex(state.date);
  state.integrations.push({ sectId, lingshi: W.integrationLingshi, until: now + W.integrationYears * 12 });
  state.reputation += W.annexReputation;
  for (const other of state.sects) if (other.id !== sectId && !other.annexed) other.favor = Math.max(0, other.favor - W.annexFear);
  return (
    `吞併${name}：外門 +${outer} 人、${inner.length ? `內門 ${inner.map((c) => c.name).join('、')}（忠誠 ${W.annexLoyalty}）、` : ''}靈石 +${gold}` +
    `${sites.length ? `、據點 ${sites.map((s) => s.name).join('、')}` : ''}；聲望 +${W.annexReputation}。` +
    `之後 ${W.integrationYears} 年每月整合費 ${W.integrationLingshi} 靈石，外門滿意度 −${W.annexSatisfaction}，其他宗門好感 −${W.annexFear}。`
  );
}

/** 山門戰：三場兩勝。 */
function resolveWar(state: GameState, content: ContentPack, war: War, lines: string[], stops: StopReason[]): void {
  const sect = sectOf(state, war.sectId);
  const name = nameOf(content, sect.id);
  const setup = setupFor(state, content, war);
  const defending = war.side === 'defend';
  const r = rng(state, 'combat');
  const pills = { heal: state.resources.pill_heal };
  const killBp = deathBp(state, content, defending);
  if (setup.team.some((c) => c.id === state.protagonist.id) && state.protagonist.seclusion) {
    state.protagonist.seclusion = null;
    state.protagonist.schedule = 'cultivate';
    lines.push(`${state.protagonist.name}出關迎戰。`);
  }
  const dead: string[] = [];
  const hurt = new Set<string>();
  let w = 0;
  let l = 0;
  const log: string[] = [];
  const allyNames = war.allies.map((id) => nameOf(content, id)).filter(Boolean);
  while (w < 2 && l < 2 && setup.team.length) {
    const res = fight(state, content, setup, r, pills);
    if (res.win) w++;
    else l++;
    log.push(`第 ${w + l} 場${res.win ? '勝' : '負'}`);
    for (const id of res.down) {
      hurt.add(id);
      if (id !== state.protagonist.id && r.chance(killBp)) dead.push(id);
    }
    // 戰死的人不再出戰
    setup.team = setup.team.filter((c) => !dead.includes(c.id));
  }
  if (!setup.team.length && w < 2) l = 2;
  state.resources.pill_heal = pills.heal;
  for (const id of hurt) {
    if (dead.includes(id)) continue;
    const c = findCharacter(state, id);
    if (c) c.injuryMonths = Math.max(c.injuryMonths, id === state.protagonist.id ? W.protagonistInjuryMonths : W.koInjuryMonths);
  }
  const won = w >= 2;
  const head = `⚔ ${defending ? `${name}攻打我宗山門` : `我宗攻打${name}山門`}${allyNames.length ? `（盟友${allyNames.join('、')}出兵相助）` : ''}：${log.join('、')}，${won ? '得勝' : '落敗'}。`;
  lines.push(head);
  if (dead.length) {
    const names = dead.map((id) => findCharacter(state, id)?.name ?? '').join('、');
    passAway(state, dead, 'war', lines, stops);
    lines.push(`此役${names}戰死。`);
  }
  const out: string[] = [];
  if (defending && won) {
    sect.power = Math.max(1, Math.floor((sect.power * (100 - W.defendWinPowerPct)) / 100));
    const pay = Math.min(sect.resources.lingshi, W.reparationBase + sect.power * W.reparationPerPower);
    sect.resources.lingshi -= pay;
    state.resources.lingshi += pay;
    state.reputation += W.defendWinReputation;
    out.push(`守住山門！${name}賠償 ${pay} 靈石，聲望 +${W.defendWinReputation}。`);
  } else if (defending) {
    const lootL = Math.floor((state.resources.lingshi * W.lootLingshiPct) / 100);
    const lootF = Math.floor((state.resources.food * W.lootFoodPct) / 100);
    state.resources.lingshi -= lootL;
    state.resources.food -= lootF;
    sect.resources.lingshi += lootL;
    sect.power += 5;
    const broken = damageBuildings(state, content, W.damagedBuildings, r);
    const ours = playerSites(state);
    const ceded = ours.length ? ours[r.int(ours.length)] : undefined;
    if (ceded) ceded.owner = sect.id;
    state.reputation = Math.max(0, state.reputation - W.defendLoseReputation);
    out.push(
      `山門失守：被搶走靈石 ${lootL}、糧食 ${lootF}` +
        `${broken.length ? `；${broken.map((b) => content.buildings.get(b.defId)?.name ?? b.defId).join('、')}損毀，修好前停用` : ''}` +
        `${ceded ? `；割讓${ceded.name}` : ''}；聲望 −${W.defendLoseReputation}。宗門仍在，養好傷再圖後計。`,
    );
  } else if (won) {
    sect.power = Math.max(1, Math.floor((sect.power * (100 - W.attackWinPowerPct)) / 100));
    state.reputation += W.attackWinReputation;
    state.events.push({
      id: newId(state, 'ev'),
      kind: 'victory',
      title: `攻破${name}山門`,
      text: `${name}戰敗求降。可以要求割地賠款、收為附屬，或在對方實力夠弱時直接吞併。`,
      blocking: true,
      victory: { sectId: sect.id },
    });
    out.push(`攻破${name}山門，聲望 +${W.attackWinReputation}，等待掌門決定如何處置。`);
  } else {
    state.reputation = Math.max(0, state.reputation - W.attackLoseReputation);
    sect.favor = Math.max(0, sect.favor - 20);
    out.push(`攻打${name}失利，聲望 −${W.attackLoseReputation}。`);
  }
  if (war.hidden) out.push(`撤離的 ${war.hidden} 靈石已取回。`);
  lines.push(...out);
  stops.push({ kind: 'war', text: `與${name}的山門戰${won ? '得勝' : '落敗'}` });
  endWar(state, war, W.truceYears);
}

/** 電腦宗門這個月對我宗宣戰的機率（萬分比）；0 表示不會。 */
export function warThreatBp(state: GameState, content: ContentPack, sect: SectState): number {
  const def = content.sects.get(sect.id);
  if (!graceOver(state) || !def || !activeNeighbor(content, sect) || sect.vassal || sect.treaty) return 0;
  if (atWarWith(state, sect.id)) return 0;
  const now = monthIndex(state.date);
  if (sect.truceUntil !== undefined && now < sect.truceUntil) return 0;
  const ours = Math.round((playerPower(state, content) * (100 + arrayBonus(state, content).defensePct / 2)) / 100);
  // 積怨：好感太低、好戰或正在擴張，而且實力不輸我宗太多
  if (sect.favor < W.declareFavor && (def.temperament === 'warlike' || sect.goal === 'expand') && sect.power * 100 >= ours * W.declarePowerPct)
    return W.declareBp;
  // 恃強：好戰又在擴張的宗門，實力明顯比我宗強時，好感普通也可能興兵
  if (def.temperament === 'warlike' && sect.goal === 'expand' && sect.favor < W.causeFavor + 10 && sect.power * 100 >= ours * W.bullyPowerPct)
    return W.bullyBp;
  return 0;
}

/** 月結算：附屬進貢、吞併整合費、電腦宗門宣戰、準備期到了打山門戰。 */
export function tickWar(state: GameState, content: ContentPack, lines: string[], stops: StopReason[]): void {
  const now = monthIndex(state.date);
  for (const sect of state.sects) {
    if (sect.annexed || !sect.vassal) continue;
    if (sect.vassalUntil !== undefined && now >= sect.vassalUntil) {
      sect.vassal = false;
      delete sect.vassalUntil;
      sect.favor = W.vassalEndFavor;
      sect.truceUntil = now + W.truceYears * 12;
      lines.push(`${nameOf(content, sect.id)}附屬 ${W.vassalYears} 年期滿，恢復自立（好感 ${W.vassalEndFavor}，之後停戰 ${W.truceYears} 年）。`);
      continue;
    }
    const pay = Math.min(sect.resources.lingshi, vassalTribute(sect));
    sect.resources.lingshi -= pay;
    state.resources.lingshi += pay;
  }
  state.integrations = state.integrations.filter((x) => x.until > now);
  for (const x of state.integrations) {
    const pay = Math.min(state.resources.lingshi, x.lingshi);
    state.resources.lingshi -= pay;
    if (pay < x.lingshi) {
      for (const c of state.disciples) if (c.loyalty < 70) c.loyalty = Math.max(0, c.loyalty - 2);
      lines.push(`吞併${nameOf(content, x.sectId)}的整合費不足，新附弟子人心浮動。`);
    }
  }
  if (graceOver(state)) {
    const r = rng(state, 'sects');
    for (const sect of state.sects) {
      const bp = warThreatBp(state, content, sect);
      if (!bp || !r.chance(bp)) continue;
      const prep = r.range(W.prepMin, W.prepMax);
      const name = nameOf(content, sect.id);
      // 月結算中宣戰：準備期從下個月算起
      const war = startWar(state, content, sect, 'defend', sect.favor < W.declareFavor ? `${name}對我宗積怨已深` : `${name}恃強擴張`, prep + 1);
      const allyNames = war.allies.map((id) => nameOf(content, id));
      lines.push(
        `⚔ ${name}向我宗宣戰，${prep} 個月後攻打山門！可以在「往來 → 戰事」求和、撤離資產或指定出戰弟子。` +
          (allyNames.length ? `盟友${allyNames.join('、')}答應出兵相助。` : ''),
      );
      stops.push({ kind: 'war', text: `${name}宣戰` });
    }
  }
  for (const war of [...state.wars]) if (now + 1 >= war.resolveAt) resolveWar(state, content, war, lines, stops);
}

/** 修復損毀建築的費用。 */
export function repairCost(content: ContentPack, b: Building): { lingshi: number; stone: number; wood: number } {
  const def = content.buildings.get(b.defId);
  const lv = def ? levelDef(def, b.level) : undefined;
  const pct = W.repairPct;
  return {
    lingshi: Math.ceil(((lv?.cost.lingshi ?? 0) * pct) / 100),
    stone: Math.ceil(((lv?.cost.stone ?? 0) * pct) / 100),
    wood: Math.ceil(((lv?.cost.wood ?? 0) * pct) / 100),
  };
}

export function repairBlocked(state: GameState, content: ContentPack, buildingId: string): string | undefined {
  const b = state.buildings.find((x) => x.id === buildingId);
  if (!b) return '沒有這座建築';
  if (!b.damaged) return '這座建築沒有損毀';
  const c = repairCost(content, b);
  if (state.resources.lingshi < c.lingshi || state.resources.stone < c.stone || state.resources.wood < c.wood)
    return `修復需要靈石 ${c.lingshi}、石材 ${c.stone}、靈木 ${c.wood}`;
  return undefined;
}

export function repairBuilding(state: GameState, content: ContentPack, buildingId: string): string {
  const blocked = repairBlocked(state, content, buildingId);
  ensure(!blocked, blocked ?? '');
  const b = state.buildings.find((x) => x.id === buildingId);
  ensure(b, '沒有這座建築');
  const c = repairCost(content, b);
  state.resources.lingshi -= c.lingshi;
  state.resources.stone -= c.stone;
  state.resources.wood -= c.wood;
  delete b.damaged;
  return `${content.buildings.get(b.defId)?.name ?? ''}修復完成，恢復運作。`;
}

/** 據點每月給我宗的收入（算進產業頁的預估與月結算）。 */
export function playerSiteIncome(state: GameState): { lingshi: number; wood: number } {
  let lingshi = 0;
  let wood = 0;
  for (const site of playerSites(state)) {
    const inc = balance.sites.income[site.kind] as { lingshi?: number; wood?: number };
    lingshi += inc.lingshi ?? 0;
    wood += inc.wood ?? 0;
  }
  return { lingshi, wood };
}
