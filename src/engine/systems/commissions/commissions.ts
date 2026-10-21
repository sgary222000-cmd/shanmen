import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { CommissionDef } from '../../../content/schema';
import { monthIndex } from '../../date';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { canAfford, formatResources, gain, RESOURCE_IDS, spend } from '../../resources';
import { rng } from '../../rng';
import type { Commission, GameState, Resources, Row } from '../../types';
import { hallLevel } from '../buildings/buildings';
import { findCharacter, outerCultivating } from '../characters/characters';
import { runBattle, unitFromEnemy, type Unit } from '../combat/combat';
import { localRng } from '../world/war';
import { allyUnit, applyFormation, battleKit, companions, healPctFor, spendKit, type BattleKit } from '../combat/party';
import { canJoinExpedition } from '../exploration/exploration';
import { envoyRewardPct } from '../talent/positions';

// 委託榜（企畫書 §8）：每月月底補到 3–5 件，榜上一定有一件勞務委託，只要有外門就能接。
// 三種委託：勞務（派外門幫工）、交付（交出物資）、護衛（主角或內門出戰）。
// 接下委託即當場結算，報酬馬上入庫，與坊市一樣屬於安排階段的即時行動。

export function reputationRecruitBonus(state: GameState): number {
  return Math.min(balance.reputation.recruitMax, Math.floor(state.reputation / balance.reputation.recruitPer));
}

/** 委託報酬（護衛類有劍修傳承靈石加成；外事執事加成全部委託的靈石）。 */
export function commissionReward(state: GameState, content: ContentPack, c: Commission, workers = 0): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const id of RESOURCE_IDS) {
    const v = c.reward[id];
    if (!v) continue;
    out[id] = c.kind === 'labor' ? v * workers : v;
  }
  const pct = (c.guard ? content.lineages.get(state.lineage)?.bonuses.guardRewardPct ?? 0 : 0) + envoyRewardPct(state);
  if (pct && out.lingshi) out.lingshi = Math.floor((out.lingshi * (100 + pct)) / 100);
  return out;
}

/** 可外出幫工的外門人數（正在修煉、沒有分工的人）。 */
export function idleOuter(state: GameState): number {
  return outerCultivating(state);
}

/** 接下委託前的檢查；undefined 表示可以接（護衛另需選隊員）。 */
export function commissionBlocked(state: GameState, c: Commission): string | undefined {
  if ((state.commissionsTaken ?? 0) >= balance.commissions.maxPerMonth) return `本月已接 ${balance.commissions.maxPerMonth} 件委託，下個月再來`;
  if (c.kind === 'labor' && idleOuter(state) < 1) return '沒有閒置的外門弟子（未分工、正在修煉的人才能外出幫工）';
  if (c.kind === 'deliver' && c.deliver && !canAfford(state.resources, c.deliver)) return `物資不足（需要 ${formatResources(c.deliver)}）`;
  return undefined;
}

function instantiate(state: GameState, def: CommissionDef): Commission {
  const r = rng(state, 'commission');
  const pct = r.range(balance.commissions.rollMinPct, balance.commissions.rollMaxPct);
  const scale = (m: Partial<Resources> | undefined, up: boolean) => {
    const out: Partial<Resources> = {};
    for (const id of RESOURCE_IDS) {
      const v = m?.[id];
      if (v) out[id] = Math.max(1, up ? Math.ceil((v * pct) / 100) : Math.floor((v * pct) / 100));
    }
    return out;
  };
  const c: Commission = {
    id: newId(state, 'job'),
    templateId: def.id,
    title: def.title,
    text: def.text,
    kind: def.kind,
    reward: def.kind === 'labor' ? { ...def.reward } : scale(def.reward, false),
    reputation: def.reputation,
    guard: def.guard,
    expires: monthIndex(state.date) + def.months - 1,
  };
  if (def.workers) c.workers = r.range(def.workers[0], def.workers[1]);
  if (def.deliver) c.deliver = scale(def.deliver, true);
  if (def.enemies) {
    c.enemies = [...def.enemies];
    c.maxTeam = def.maxTeam ?? 3;
  }
  return c;
}

function pickTemplate(state: GameState, pool: CommissionDef[]): CommissionDef | undefined {
  const total = pool.reduce((n, d) => n + d.weight, 0);
  if (!total) return undefined;
  let roll = rng(state, 'commission').int(total);
  for (const d of pool) {
    if (roll < d.weight) return d;
    roll -= d.weight;
  }
  return pool[pool.length - 1];
}

/** 月底（與開局）更新委託榜：移除過期的，補到 3–5 件，並保證至少有一件勞務委託。 */
export function refreshBoard(state: GameState, content: ContentPack): void {
  const now = monthIndex(state.date);
  state.commissions = state.commissions.filter((c) => c.expires >= now);
  const hall = hallLevel(state);
  const available = () =>
    [...content.commissions.values()].filter(
      (d) =>
        d.minHall <= hall &&
        (!d.requiresClear || (state.realmClears[d.requiresClear] ?? 0) > 0) &&
        !state.commissions.some((c) => c.templateId === d.id) &&
        (d.kind !== 'escort' || state.commissions.filter((c) => c.kind === 'escort').length < balance.commissions.maxEscortOnBoard),
    );
  if (!state.commissions.some((c) => c.kind === 'labor')) {
    const def = pickTemplate(state, available().filter((d) => d.kind === 'labor'));
    if (def) state.commissions.push(instantiate(state, def));
  }
  const target = rng(state, 'commission').range(balance.commissions.minBoard, balance.commissions.maxBoard);
  while (state.commissions.length < target) {
    const def = pickTemplate(state, available());
    if (!def) break;
    state.commissions.push(instantiate(state, def));
  }
}

export interface AcceptOptions {
  /** 勞務：派出人數（預設為上限與閒置人數取小） */
  workers?: number;
  /** 護衛：出戰的人物 */
  teamIds?: string[];
  rows?: Record<string, Row>;
}

function escortSetup(state: GameState, content: ContentPack, c: Commission, teamIds: string[], rows?: Record<string, Row>) {
  const members = teamIds.map((id) => findCharacter(state, id)).filter((m): m is NonNullable<typeof m> => !!m);
  const allies = members.map((m, i) => allyUnit(state, content, m, rows?.[m.id] ?? (i === 0 ? 'front' : 'back')));
  allies.push(...companions(state, content, teamIds));
  const formation = applyFormation(state, content, allies);
  const enemies = (c.enemies ?? []).map((eid, i) => {
    const def = content.enemies.get(eid);
    ensure(def, `敵人資料錯誤：${eid}`);
    return unitFromEnemy(def, i);
  });
  const kit = battleKit(state, content, allies);
  return { allies, enemies, formation, kit };
}

function escortBattle(state: GameState, content: ContentPack, allies: Unit[], enemies: Unit[], kit: BattleKit, randInt: (n: number) => number) {
  return runBattle({
    allies,
    enemies,
    strategy: state.strategy,
    healPills: state.resources.pill_heal,
    talismans: { fire: state.resources.talisman_fire, guard: state.resources.talisman_guard },
    control: kit.control,
    controlExtraRounds: kit.extraRounds,
    healPct: healPctFor(state, content),
    randInt,
  });
}

/** 護衛委託的預估勝率（不消耗遊戲亂數），給自動出征判斷用。 */
export function escortOdds(state: GameState, content: ContentPack, id: string, teamIds: string[]): number {
  const c = state.commissions.find((x) => x.id === id);
  if (!c || c.kind !== 'escort' || !teamIds.length) return 0;
  const runs = 20;
  let wins = 0;
  for (let i = 0; i < runs; i++) {
    const { allies, enemies, kit } = escortSetup(state, content, c, teamIds);
    const r = localRng(monthIndex(state.date) * 4099 + i * 131 + id.length);
    if (escortBattle(state, content, allies, enemies, kit, (n) => r.int(n)).result === 'win') wins++;
  }
  return Math.round((wins * 100) / runs);
}

export function acceptCommission(state: GameState, content: ContentPack, id: string, opts: AcceptOptions = {}): string {
  const c = state.commissions.find((x) => x.id === id);
  ensure(c, '委託榜上沒有這件委託');
  const blocked = commissionBlocked(state, c);
  ensure(!blocked, blocked ?? '');
  const done = (text: string, reward: Partial<Resources>) => {
    gain(state.resources, reward);
    state.reputation += c.reputation;
    state.commissionsTaken = (state.commissionsTaken ?? 0) + 1;
    state.commissions = state.commissions.filter((x) => x.id !== id);
    return `${text}得到 ${formatResources(reward)}，聲望 +${c.reputation}。`;
  };

  if (c.kind === 'labor') {
    const max = Math.min(c.workers ?? 0, idleOuter(state));
    const n = opts.workers ?? max;
    ensure(Number.isInteger(n) && n >= 1, '至少派出一人');
    ensure(n <= max, `最多只能派 ${max} 人`);
    state.outer.labor += n;
    return done(`派出 ${n} 名外門弟子「${c.title}」，本月不能再分工。`, commissionReward(state, content, c, n));
  }

  if (c.kind === 'deliver') {
    spend(state.resources, c.deliver ?? {});
    return done(`交付 ${formatResources(c.deliver ?? {})}，完成「${c.title}」。`, commissionReward(state, content, c));
  }

  // 護衛：當場自動戰鬥
  const teamIds = opts.teamIds ?? [];
  ensure(teamIds.length >= 1, '至少需要一名隊員');
  ensure(teamIds.length <= (c.maxTeam ?? 3), `隊伍最多 ${c.maxTeam ?? 3} 人`);
  ensure(new Set(teamIds).size === teamIds.length, '隊伍中有重複人物');
  const members = teamIds.map((cid) => {
    const m = findCharacter(state, cid);
    ensure(m, '找不到隊員');
    const reason = canJoinExpedition(state, m);
    ensure(!reason, reason?.replace('本月已探索過', '本月已外出') ?? '');
    return m;
  });
  const { allies, enemies, formation, kit } = escortSetup(state, content, c, teamIds, opts.rows);
  const r = rng(state, 'combat');
  const outcome = escortBattle(state, content, allies, enemies, kit, (n) => r.int(n));
  spendKit(state, kit, outcome.controlUsed);
  if (formation) outcome.highlights.unshift(formation);
  state.resources.pill_heal -= outcome.pillsUsed;
  state.resources.talisman_fire -= outcome.talismansUsed.fire;
  state.resources.talisman_guard -= outcome.talismansUsed.guard;
  state.battles.unshift({
    id: newId(state, 'battle'),
    date: { ...state.date },
    title: `委託・${c.title}`,
    result: outcome.result,
    rounds: outcome.rounds,
    highlights: outcome.highlights,
    log: outcome.log,
    allies: outcome.allies.map((u) => ({ id: u.key, name: u.name, hp: u.hp, maxHp: u.maxHp })),
    enemies: outcome.enemies.map((u) => ({ id: u.key, name: u.name, hp: u.hp, maxHp: u.maxHp })),
  });
  state.battles = state.battles.slice(0, 30);

  // 隊員本月外出；傷勢與探索相同：倒下者重傷，生命低於一半者輕傷
  const notes: string[] = [];
  for (const m of members) {
    // 掌爐者外出一個月：爐位保留，本月停工，月底回到工坊
    m.schedule = 'explore';
    const u = outcome.allies.find((x) => x.key === m.id);
    if (!u) continue;
    m.health = Math.max(1, Math.floor((u.hp * 100) / u.maxHp));
    if (u.hp <= 0) {
      m.injuryMonths = Math.max(m.injuryMonths, balance.combat.koInjuryMonths);
      notes.push(`${m.name}重傷`);
    } else if (u.hp * 2 < u.maxHp) {
      m.injuryMonths = Math.max(m.injuryMonths, balance.combat.hurtInjuryMonths);
      notes.push(`${m.name}負傷`);
    }
  }
  const hurt = notes.length ? `（${notes.join('、')}）` : '';
  if (outcome.result !== 'win') {
    state.commissions = state.commissions.filter((x) => x.id !== id);
    return `「${c.title}」失敗${hurt}，委託已撤下。戰報可在「月報與戰報」查看。`;
  }
  return done(`「${c.title}」獲勝${hurt}。`, commissionReward(state, content, c));
}
