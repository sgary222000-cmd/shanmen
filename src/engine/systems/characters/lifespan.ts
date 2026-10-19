import { balance } from '../../../content/balance';
import { COMMON_EQUIPMENT } from '../../../content/equipment';
import type { ContentPack } from '../../../content/registry';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import type { Character, GameState, Protagonist, StopReason } from '../../types';
import { effectsOf, isOperating } from '../buildings/buildings';
import { characterFromCandidate, findCharacter, powerLevel, realmName, rollCandidate } from './characters';

// 壽元與繼承（企畫書 §5、P2 批次 A）：各境界有壽元上限，剩兩成、一成時預警；
// 壽終時弟子坐化、職位與工作自動空出；掌門坐化由親傳弟子接任，宗門進度全部保留。

export const ANCESTRAL = 'building.ancestral';

/** 壽元上限（月）：境界基礎壽元加上延壽。 */
export function lifespanMonths(c: Character): number {
  return balance.lifespan.years[c.realm.major] * 12 + (c.lifeBonusMonths ?? 0);
}

export function remainingLifeMonths(c: Character): number {
  return Math.max(0, lifespanMonths(c) - c.ageMonths);
}

/** 剩餘壽元的百分比（0–100）。 */
export function remainingLifePct(c: Character): number {
  return Math.floor((remainingLifeMonths(c) * 100) / lifespanMonths(c));
}

export function lifespanText(c: Character): string {
  const left = remainingLifeMonths(c);
  const rest = left >= 12 ? `還剩約 ${Math.floor(left / 12)} 年` : `只剩 ${left} 個月`;
  return `壽元 ${Math.floor(lifespanMonths(c) / 12)} 歲（${rest}）`;
}

/** 服用延壽丹的阻擋原因。 */
export function longevityBlocked(state: GameState, c: Character): string | undefined {
  if ((c.longevityPills ?? 0) >= balance.lifespan.pillMax) return `一生最多服用 ${balance.lifespan.pillMax} 顆延壽丹`;
  if (state.resources.pill_life < 1) return '庫存沒有延壽丹（煉丹房煉製，丹方在坊市購買）';
  return undefined;
}

/** 延壽丹每顆增加的壽元（月）。 */
export function longevityGain(c: Character): number {
  return Math.floor((balance.lifespan.years[c.realm.major] * 12 * balance.lifespan.pillPct) / 100);
}

export function takeLongevityPill(state: GameState, characterId: string): string {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  const blocked = longevityBlocked(state, c);
  ensure(!blocked, blocked ?? '');
  const gainMonths = longevityGain(c);
  state.resources.pill_life -= 1;
  c.lifeBonusMonths = (c.lifeBonusMonths ?? 0) + gainMonths;
  c.longevityPills = (c.longevityPills ?? 0) + 1;
  return `${c.name}服下延壽丹，壽元增加 ${Math.floor(gainMonths / 12)} 年。`;
}

export function heirOf(state: GameState): Character | undefined {
  return state.heirId ? state.disciples.find((d) => d.id === state.heirId) : undefined;
}

/** 指定親傳弟子（掌門繼承人）；null 表示取消。 */
export function setHeir(state: GameState, characterId: string | null): string {
  if (characterId === null) {
    state.heirId = null;
    return '已取消親傳弟子。';
  }
  const d = state.disciples.find((x) => x.id === characterId);
  ensure(d, '親傳弟子必須是內門弟子');
  state.heirId = d.id;
  return `${d.name}立為親傳弟子：修煉 +${balance.lifespan.heirXpPct}%，掌門坐化時由其接任。`;
}

/** 祖師殿目前的修煉加成（百分比）與效果。 */
export function ancestralHall(state: GameState, content: ContentPack) {
  const b = state.buildings.find((x) => x.defId === ANCESTRAL && isOperating(x));
  return b ? effectsOf(content, b) : undefined;
}

export function ancestorPct(state: GameState, content: ContentPack): number {
  const eff = ancestralHall(state, content);
  if (!eff?.ancestorBasePct) return 0;
  const n = state.ancestors?.length ?? 0;
  return Math.min(eff.ancestorMaxPct ?? 100, eff.ancestorBasePct + n * (eff.ancestorPerPct ?? 0));
}

/** 祖師顯靈是否可用（祖師殿 2 級且冷卻結束）。 */
export function blessingReady(state: GameState, content: ContentPack): boolean {
  if (!ancestralHall(state, content)?.blessing) return false;
  return (state.blessingReadyAt ?? 0) <= monthIndex(state.date);
}

/** 移除人物在宗門各處的工作與歸屬：職位、爐位、靈獸、派遣隊伍、法器、繼承人。 */
function releaseEverything(state: GameState, id: string): void {
  for (const pos of Object.keys(state.positions) as (keyof GameState['positions'])[]) {
    if (state.positions[pos] === id) state.positions[pos] = null;
  }
  for (const f of [...state.furnaces, ...state.workshops.forge, ...state.workshops.talisman]) {
    if (f.alchemistId === id) f.alchemistId = null;
  }
  for (const b of state.beasts) {
    if (b.ownerId === id) {
      b.ownerId = null;
      b.task = 'rest';
    }
  }
  for (const d of state.dispatches) d.teamIds = d.teamIds.filter((x) => x !== id);
  state.dispatches = state.dispatches.filter((d) => d.teamIds.length > 0);
  if (state.heirId === id) state.heirId = null;
}

function returnEquipment(state: GameState, c: Character): void {
  if (!c.equipment) return;
  if (c.equipment === COMMON_EQUIPMENT) state.resources.artifact += 1;
  else state.armory.push(c.equipment);
  c.equipment = null;
}

function asProtagonist(c: Character): Protagonist {
  return { ...c, role: 'protagonist', loyalty: 100, seclusion: null };
}

/** 把內門弟子升為掌門（不處理舊掌門）。 */
function promote(state: GameState, c: Character): void {
  state.disciples = state.disciples.filter((d) => d.id !== c.id);
  for (const pos of Object.keys(state.positions) as (keyof GameState['positions'])[]) {
    if (state.positions[pos] === c.id) state.positions[pos] = null;
  }
  if (state.heirId === c.id) state.heirId = null;
  state.protagonist = asProtagonist(c);
}

/** 依境界與修為排序的接任人選。 */
function rankSuccessors(state: GameState): Character[] {
  return [...state.disciples].sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp || b.loyalty - a.loyalty);
}

/** 掌門坐化：親傳弟子直接接任；沒有指定時由境界最高者暫代，並跳出繼承事件讓玩家改選。 */
function succeed(state: GameState, cause: DeathCause, lines: string[], stops: StopReason[]): void {
  const old = state.protagonist;
  (state.ancestors ??= []).push({
    name: old.name,
    gender: old.gender,
    realm: { ...old.realm },
    ageMonths: old.ageMonths,
    date: { ...state.date },
    cause,
  });
  releaseEverything(state, old.id);
  returnEquipment(state, old);
  const heir = heirOf(state);
  const ranked = rankSuccessors(state);
  let next = heir ?? ranked[0];
  let chosen = !!heir;
  if (!next) {
    // 沒有內門弟子：由外門推舉一人接任
  }
  const text = `${old.name}${deathText(old, cause)}${ancestralHall0(state) ? '牌位入祖師殿供奉。' : '牌位暫供於大殿。'}`;
  lines.push(`✝ 掌門${text}`);
  if (!next) {
    // 沒有內門弟子：由外門推舉一人接任（外門人數減一）
    const cand = rollCandidate(state, 0);
    next = characterFromCandidate(state, cand, 3);
    chosen = true;
    if (state.outer.count > 0) state.outer.count -= 1;
    lines.push(`宗門沒有內門弟子，外門推舉${next.name}接掌山門。`);
  }
  const interim = !chosen && state.disciples.length > 1;
  if (interim) state.interimLoyalty = { [next.id]: next.loyalty };
  promote(state, next);
  lines.push(
    interim
      ? `生前沒有指定親傳弟子，眾人暫推${next.name}代理掌門，請確認或改立繼承人。`
      : `★ ${next.name}接任掌門。宗門的建築、物資與傳承全部保留，境界與技藝是${next.name}自己的。`,
  );
  stops.push({ kind: 'death', text: `掌門${old.name}${cause === 'age' ? '坐化' : '隕落'}` });
  if (interim) {
    const others = rankSuccessors(state).slice(0, 4);
    state.events.push({
      id: newId(state, 'ev'),
      kind: 'succession',
      title: '掌門繼承',
      text: `${text}生前沒有指定親傳弟子，眾人暫推境界最高的${next.name}代掌門。你可以確認，或改立其他弟子。`,
      blocking: true,
      successors: [next.id, ...others.map((d) => d.id)],
    });
  }
}

function ancestralHall0(state: GameState): boolean {
  return state.buildings.some((b) => b.defId === ANCESTRAL && b.level >= 1);
}

/** 暫代掌門升任前的忠誠（升任時記下），退回內門時恢復。 */
function interimLoyalty(state: GameState, id: string): number {
  return state.interimLoyalty?.[id] ?? 80;
}

/** 繼承結果補記在宣布坐化的那份月報上，月報頁看得到最後由誰接任。 */
function record(state: GameState, text: string): string {
  state.reports[0]?.lines.push(`→ ${text}`);
  if (state.interimLoyalty) delete state.interimLoyalty;
  return text;
}

/** 處理繼承事件：確認暫代掌門，或改立其他弟子。 */
export function resolveSuccession(state: GameState, eventId: string, characterId: string): string {
  const ev = state.events.find((e) => e.id === eventId);
  ensure(ev && ev.kind === 'succession', '沒有這個繼承事件');
  ensure(ev.successors?.includes(characterId), '這個人不在接任人選之中');
  state.events = state.events.filter((e) => e.id !== eventId);
  const keep = '宗門的建築、物資與傳承全部保留。';
  if (characterId === state.protagonist.id) return record(state, `${state.protagonist.name}正式接任掌門。${keep}`);
  const chosen = state.disciples.find((d) => d.id === characterId);
  ensure(chosen, '找不到這名弟子');
  const interim = state.protagonist;
  const { seclusion: _s, ...rest } = interim;
  const back: Character = { ...rest, role: 'inner', loyalty: interimLoyalty(state, interim.id) };
  if (back.schedule === 'seclusion' || back.schedule === 'teach') back.schedule = 'cultivate';
  promote(state, chosen);
  state.disciples.push(back);
  return record(state, `${chosen.name}接任掌門，${back.name}退回內門。${keep}`);
}

/** 月結算：年齡增長後檢查壽元預警與壽終。 */
export function tickLifespan(state: GameState, lines: string[], stops: StopReason[]): void {
  const dead: Character[] = [];
  for (const c of [state.protagonist, ...state.disciples]) {
    const span = lifespanMonths(c);
    const left = span - c.ageMonths;
    if (left <= 0) {
      dead.push(c);
      continue;
    }
    for (const pct of balance.lifespan.warnPct) {
      const t = Math.floor((span * pct) / 100);
      if (left === t) {
        const who = c.role === 'protagonist' ? `掌門${c.name}` : c.name;
        const hint =
          c.role === 'protagonist' && !heirOf(state) ? '尚未指定親傳弟子，建議盡早指定繼承人。' : '可服延壽丹或突破下一個大境界延長壽元。';
        lines.push(`⚠ ${who}壽元只剩${pct === 20 ? '兩成' : '一成'}（約 ${Math.floor(left / 12)} 年）。${hint}`);
        stops.push({ kind: 'lifespan', text: `${who}壽元只剩${pct === 20 ? '兩成' : '一成'}` });
      }
    }
  }
  passAway(
    state,
    dead.map((c) => c.id),
    'age',
    lines,
    stops,
  );
}

export type DeathCause = 'age' | 'breakthrough';

function deathText(c: Character, cause: DeathCause): string {
  const age = Math.floor(c.ageMonths / 12);
  return cause === 'age'
    ? `壽元已盡，以${realmName(c.realm)}之身坐化，享壽 ${age} 歲。`
    : `衝擊化神失敗，以${realmName(c.realm)}之身隕落，享年 ${age} 歲。`;
}

/** 人物死亡：弟子的職位與工作空出；掌門由親傳弟子接任（或跳出繼承選擇）。先處理弟子，再處理掌門，避免同月過世的弟子被立為新掌門。 */
export function passAway(state: GameState, ids: string[], cause: DeathCause, lines: string[], stops: StopReason[]): void {
  for (const id of ids) {
    const c = state.disciples.find((d) => d.id === id);
    if (!c) continue;
    releaseEverything(state, c.id);
    returnEquipment(state, c);
    state.disciples = state.disciples.filter((d) => d.id !== c.id);
    lines.push(`✝ ${c.name}${deathText(c, cause)}職位與工作已空出。`);
    stops.push({ kind: 'death', text: `${c.name}${cause === 'age' ? '坐化' : '隕落'}` });
  }
  if (ids.includes(state.protagonist.id)) succeed(state, cause, lines, stops);
}

