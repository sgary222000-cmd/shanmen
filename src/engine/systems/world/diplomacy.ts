import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { SectDef } from '../../../content/schema';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { rng } from '../../rng';
import type { Character, GameState, ResourceSite, SectState, StopReason, TreatyKind } from '../../types';
import { activeEffects, hallLevel } from '../buildings/buildings';
import { releaseFurnace } from '../alchemy/alchemy';
import { findCharacter, powerLevel } from '../characters/characters';
import { canJoinExpedition } from '../exploration/exploration';

// 勢力與外交（P2 批次 C）：鄰近三宗完整模擬，遠方三個勢力簡化結算、大殿 4 級後才有往來。
// 好感靠送禮與交易；信任只能靠履行約定累積（企畫書：禮物買不到）。
// 條約在議事堂締結：互不侵犯（不再騷擾我宗）、聯盟（交易優待；盟友被攻打時會求援，要出資或出兵）。
// 宣戰、山門戰、吞併在批次 D。

const D = balance.diplomacy;

export const TREATY_NAMES: Record<TreatyKind, string> = { peace: '互不侵犯', alliance: '聯盟' };

export const SITE_KIND_NAMES: Record<ResourceSite['kind'], string> = { ore: '礦脈', herb: '藥田', lingshi: '靈泉', wood: '靈木林' };

/** 開局的資源據點：鄰近三宗各佔一處，其餘無主。 */
export function initialSites(): ResourceSite[] {
  return [
    { id: 'site.qingshi', name: '青石礦脈', kind: 'ore', owner: null },
    { id: 'site.yunwu', name: '雲霧藥谷', kind: 'herb', owner: 'sect.qingmu' },
    { id: 'site.chitong', name: '赤銅礦坑', kind: 'ore', owner: 'sect.chixia' },
    { id: 'site.lingquan', name: '靈泉眼', kind: 'lingshi', owner: 'sect.luoyun' },
    { id: 'site.gusong', name: '古松林', kind: 'wood', owner: null },
    { id: 'site.hantan', name: '寒潭藥圃', kind: 'herb', owner: null },
  ];
}

export function isDistant(content: ContentPack, sectId: string): boolean {
  return content.sects.get(sectId)?.scope === 'distant';
}

/** 鄰近宗門（坊市、大比、競標、據點都只有鄰近宗門參與）。 */
export function neighborSects(state: GameState, content: ContentPack): SectState[] {
  return state.sects.filter((s) => !isDistant(content, s.id) && !s.annexed);
}

export function trustOf(sect: SectState): number {
  return sect.trust ?? 20;
}

export function trustName(trust: number): string {
  if (trust >= 80) return '深信不疑';
  if (trust >= 50) return '可以託付';
  if (trust >= 20) return '將信將疑';
  return '心存戒備';
}

/** 與這個勢力是否已有往來；沒有時回傳原因。 */
export function contactBlocked(state: GameState, content: ContentPack, sectId: string): string | undefined {
  if (state.sects.find((s) => s.id === sectId)?.annexed) return '已併入我宗';
  if (!isDistant(content, sectId)) return undefined;
  if (hallLevel(state) < D.distantHall) return `遠方勢力要等宗門大殿 ${D.distantHall} 級、聲名遠播後才會往來`;
  return undefined;
}

function sectOf(state: GameState, sectId: string): SectState {
  const sect = state.sects.find((s) => s.id === sectId);
  ensure(sect, '沒有這個宗門');
  return sect;
}

function defOf(content: ContentPack, sectId: string): SectDef {
  const d = content.sects.get(sectId);
  ensure(d, '沒有這個宗門');
  return d;
}

/** 調整信任（重承諾的宗門加減都放大）。 */
export function addTrust(content: ContentPack, sect: SectState, delta: number): number {
  const honorable = content.sects.get(sect.id)?.temperament === 'honorable';
  const d = honorable ? Math.trunc((delta * D.honorablePct) / 100) : delta;
  sect.trust = Math.max(0, Math.min(100, trustOf(sect) + d));
  return d;
}

export function addFavor(sect: SectState, delta: number): void {
  sect.favor = Math.max(0, Math.min(D.maxFavor, sect.favor + delta));
}

/** 議事堂能同時維持的條約數；沒有議事堂時為 0。 */
export function treatyCapacity(state: GameState, content: ContentPack): number {
  return activeEffects(state, content, 'building.council')?.maxTreaties ?? 0;
}

export function treatyCount(state: GameState): number {
  return state.sects.filter((s) => s.treaty).length;
}

/** 議事堂讓外事執事的送禮效果再提高的百分比。 */
export function councilEnvoyPct(state: GameState, content: ContentPack): number {
  return activeEffects(state, content, 'building.council')?.envoyBonusPct ?? 0;
}

export function treatyBlocked(state: GameState, content: ContentPack, sectId: string, kind: TreatyKind): string | undefined {
  const sect = state.sects.find((s) => s.id === sectId);
  if (!sect) return '沒有這個宗門';
  const contact = contactBlocked(state, content, sectId);
  if (contact) return contact;
  const T = D.treaties[kind];
  if (!treatyCapacity(state, content)) return '需要先蓋議事堂（主峰或山門）';
  if (sect.vassal) return '已是我宗附屬，不必締約';
  if (state.wars?.some((w) => w.sectId === sectId)) return '正在交戰';
  if (sect.treaty?.kind === kind) return `已經締結${TREATY_NAMES[kind]}`;
  if (sect.treaty?.kind === 'alliance' && kind === 'peace') return '已經是盟友';
  if (!sect.treaty && treatyCount(state) >= treatyCapacity(state, content))
    return `議事堂最多同時維持 ${treatyCapacity(state, content)} 份條約（升級議事堂可以增加）`;
  if (sect.favor < T.favor) return `好感需達 ${T.favor}（目前 ${sect.favor}）`;
  if (trustOf(sect) < T.trust) return `信任需達 ${T.trust}（目前 ${trustOf(sect)}；信任要靠履行約定累積，送禮買不到）`;
  if (state.resources.lingshi < T.lingshi) return `締約儀式需要靈石 ${T.lingshi}`;
  return undefined;
}

export function signTreaty(state: GameState, content: ContentPack, sectId: string, kind: TreatyKind): string {
  const blocked = treatyBlocked(state, content, sectId, kind);
  ensure(!blocked, blocked ?? '');
  const sect = sectOf(state, sectId);
  const def = defOf(content, sectId);
  const T = D.treaties[kind];
  const now = monthIndex(state.date);
  state.resources.lingshi -= T.lingshi;
  sect.treaty = { kind, since: now, until: now + T.years * 12 };
  const effect =
    kind === 'peace'
      ? '對方不會再騷擾我宗。'
      : `交易加價 +${D.allianceTradePct}%、每月可多賣 ${D.allianceTradeLots} 批；盟友遭到攻打時會向我宗求援，履行約定能累積信任。`;
  return `與${def.name}締結${TREATY_NAMES[kind]}條約，期限 ${T.years} 年。${effect}`;
}

/** 提前解約的代價說明。 */
export function breakCostText(kind: TreatyKind): string {
  const T = D.treaties[kind];
  return `信任 −${T.breakTrust}、好感 −${T.breakFavor}、聲望 −${T.breakReputation}`;
}

export function breakTreaty(state: GameState, content: ContentPack, sectId: string): string {
  const sect = sectOf(state, sectId);
  const def = defOf(content, sectId);
  ensure(sect.treaty, `與${def.name}沒有條約`);
  const kind = sect.treaty.kind;
  const T = D.treaties[kind];
  addTrust(content, sect, -T.breakTrust);
  addFavor(sect, -T.breakFavor);
  state.reputation = Math.max(0, state.reputation - T.breakReputation);
  sect.treaty = null;
  state.events = state.events.filter((e) => !(e.kind === 'aid' && e.aid?.sectId === sectId));
  return `提前解除與${def.name}的${TREATY_NAMES[kind]}條約：${breakCostText(kind)}。`;
}

/** 盟友求援要出的靈石。 */
export function aidLingshi(sect: SectState): number {
  return D.aidBaseLingshi + sect.power * D.aidPerPower;
}

/** 可以出兵援助的內門弟子（境界高的優先，最多 aidTroops 人）。 */
export function aidTroops(state: GameState): Character[] {
  return state.disciples
    .filter((d) => !canJoinExpedition(state, d))
    .sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp)
    .slice(0, D.aidTroops);
}

/** 盟友遭到攻打或禍事，向我宗求援（同一盟友同時只會有一件）。 */
export function requestAid(state: GameState, content: ContentPack, sect: SectState, reason: string, lines: string[], stops: StopReason[]): void {
  if (state.events.some((e) => e.kind === 'aid' && e.aid?.sectId === sect.id)) return;
  if (state.dispatches.some((d) => d.aidSectId === sect.id)) return;
  const def = defOf(content, sect.id);
  const lingshi = aidLingshi(sect);
  state.events.push({
    id: newId(state, 'ev'),
    kind: 'aid',
    title: `${def.name}求援`,
    text: `${reason}盟友${def.name}依約請我宗相助：可以出資 ${lingshi} 靈石，或派最多 ${D.aidTroops} 名內門弟子前往 ${D.aidMonths} 個月（可能輕傷，不會戰死）。${D.aidDeadline} 個月內不回覆視同拒絕。`,
    blocking: false,
    aid: { sectId: sect.id, lingshi, deadline: monthIndex(state.date) + D.aidDeadline },
  });
  lines.push(`⚑ 盟友${def.name}求援：${reason}`);
  stops.push({ kind: 'diplomacy', text: `${def.name}求援` });
}

export type AidChoice = 'money' | 'troops' | 'refuse';

export function aidBlocked(state: GameState, eventId: string, choice: AidChoice): string | undefined {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev || ev.kind !== 'aid' || !ev.aid) return '沒有這件求援';
  if (choice === 'money' && state.resources.lingshi < ev.aid.lingshi) return `靈石不足（需要 ${ev.aid.lingshi}）`;
  if (choice === 'troops' && !aidTroops(state).length) return '沒有可以派出的內門弟子（受傷、外出或在閉關中的不算）';
  return undefined;
}

/** 拒絕援助（或逾期未回覆）：信任、好感下降；連續拒絕太多次，盟友解除聯盟。 */
function refuseAid(state: GameState, content: ContentPack, sect: SectState, late: boolean): string {
  const def = defOf(content, sect.id);
  const lost = addTrust(content, sect, -D.trustOnRefuse);
  addFavor(sect, -D.favorOnRefuse);
  let text = `${late ? '逾期沒有回覆' : '婉拒了'}${def.name}的求援：信任 ${lost}、好感 −${D.favorOnRefuse}。`;
  if (sect.treaty?.kind === 'alliance') {
    sect.treaty.refusals = (sect.treaty.refusals ?? 0) + 1;
    if (sect.treaty.refusals >= D.maxRefusals) {
      sect.treaty = null;
      text += `${def.name}認為我宗不足為盟，解除了聯盟。`;
    }
  }
  return text;
}

export function resolveAid(state: GameState, content: ContentPack, eventId: string, choice: AidChoice): string {
  const blocked = aidBlocked(state, eventId, choice);
  ensure(!blocked, blocked ?? '');
  const ev = state.events.find((e) => e.id === eventId);
  const aid = ev?.aid;
  ensure(aid, '沒有這件求援');
  state.events = state.events.filter((e) => e.id !== eventId);
  const sect = sectOf(state, aid.sectId);
  const def = defOf(content, aid.sectId);
  if (choice === 'refuse') return refuseAid(state, content, sect, false);
  if (choice === 'money') {
    state.resources.lingshi -= aid.lingshi;
    sect.resources.lingshi += aid.lingshi;
    return keepPromise(content, sect, `出資 ${aid.lingshi} 靈石援助${def.name}`);
  }
  const team = aidTroops(state);
  for (const c of team) {
    releaseFurnace(state, c.id);
    c.schedule = 'dispatch';
  }
  state.dispatches.push({
    id: newId(state, 'dsp'),
    realmId: aid.sectId,
    aidSectId: aid.sectId,
    teamIds: team.map((c) => c.id),
    monthsLeft: D.aidMonths,
  });
  return keepPromise(content, sect, `派${team.map((c) => c.name).join('、')}前往援助${def.name}（${D.aidMonths} 個月後回來）`);
}

function keepPromise(content: ContentPack, sect: SectState, what: string): string {
  const gained = addTrust(content, sect, D.trustOnAid);
  addFavor(sect, D.favorOnAid);
  if (sect.treaty) sect.treaty.refusals = 0;
  return `${what}：信任 +${gained}、好感 +${D.favorOnAid}。`;
}

/** 出兵援助的弟子回宗（在派遣結算中呼叫）。 */
export function returnAidTeam(state: GameState, content: ContentPack, teamIds: string[], sectId: string, lines: string[]): void {
  const r = rng(state, 'sects');
  const names: string[] = [];
  const hurt: string[] = [];
  for (const id of teamIds) {
    const c = findCharacter(state, id);
    if (!c) continue;
    names.push(c.name);
    if (r.chance(D.aidInjuryBp)) {
      c.injuryMonths = Math.max(c.injuryMonths, 1);
      hurt.push(c.name);
    }
    c.schedule = c.injuryMonths > 0 ? 'heal' : 'cultivate';
  }
  const name = content.sects.get(sectId)?.name ?? '';
  if (names.length) lines.push(`援助${name}的${names.join('、')}回宗${hurt.length ? `，${hurt.join('、')}輕傷` : '，全員平安'}。`);
}

/** 據點每月帶給佔有者的收入（寫進電腦宗門的帳本）。 */
export function siteIncome(state: GameState): void {
  for (const site of state.sites ?? []) {
    const sect = site.owner ? state.sects.find((s) => s.id === site.owner) : undefined;
    if (!sect) continue;
    const inc = balance.sites.income[site.kind] as { lingshi?: number; wood?: number };
    sect.resources.lingshi += inc.lingshi ?? 0;
    sect.resources.wood += inc.wood ?? 0;
  }
}

/** 月結算第 6 步之後：條約期限與信任、遠方盟友的禍事、逾期的求援、好戰宗門的騷擾。 */
export function tickDiplomacy(state: GameState, content: ContentPack, lines: string[], stops: StopReason[]): void {
  const now = monthIndex(state.date);
  const r = rng(state, 'sects');
  // 逾期未回覆的求援視同拒絕
  for (const ev of [...state.events]) {
    if (ev.kind !== 'aid' || !ev.aid || ev.aid.deadline > now) continue;
    state.events = state.events.filter((e) => e.id !== ev.id);
    const sect = state.sects.find((s) => s.id === ev.aid?.sectId);
    if (sect) lines.push(`⚠ ${refuseAid(state, content, sect, true)}`);
  }
  for (const sect of state.sects) {
    const def = content.sects.get(sect.id);
    if (!def) continue;
    const t = sect.treaty;
    if (t) {
      const months = now - t.since;
      if (months > 0 && months % 12 === 0) addTrust(content, sect, D.trustPerYear);
      if (now >= t.until) {
        const gained = addTrust(content, sect, D.trustOnExpiry);
        lines.push(`與${def.name}的${TREATY_NAMES[t.kind]}條約期滿，雙方都守住了約定，信任 +${gained}。可以在議事堂續約。`);
        stops.push({ kind: 'diplomacy', text: `與${def.name}的條約期滿` });
        sect.treaty = null;
        continue;
      }
      if (t.kind === 'alliance' && def.scope === 'distant' && r.chance(D.distantTroubleBp))
        requestAid(state, content, sect, `${def.name}遭妖獸潮侵擾，`, lines, stops);
    } else if (
      def.temperament === 'warlike' &&
      def.scope !== 'distant' &&
      !sect.annexed &&
      !sect.vassal &&
      sect.favor < D.harassFavor &&
      r.chance(D.harassBp)
    ) {
      const lost = Math.min(D.harassMax, Math.floor((state.resources.lingshi * D.harassPct) / 100));
      if (lost > 0) {
        state.resources.lingshi -= lost;
        sect.resources.lingshi += lost;
        lines.push(`⚠ ${def.name}弟子在山下截走我宗商隊，損失靈石 ${lost}。提高好感或締結互不侵犯條約可以避免。`);
        stops.push({ kind: 'diplomacy', text: `${def.name}騷擾商隊` });
      }
    }
  }
}
