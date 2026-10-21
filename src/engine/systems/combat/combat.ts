import { balance } from '../../../content/balance';
import type { BeastSpeciesDef, EnemyDef, LineageDef } from '../../../content/schema';
import type { Beast, Character, CombatStrategy, GearEffect, ResourceId, Row } from '../../types';
import { powerLevel } from '../characters/characters';
import { emptyStats, innateBonus, type GearStats } from '../talent/gear';

// 自動回合戰鬥。純函式：同樣的輸入與亂數序列一定得到同樣的結果。

export interface Unit {
  key: string;
  name: string;
  side: 'ally' | 'enemy';
  row: Row;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  hit: number;
  res: number;
  mp: number;
  skill?: { name: string; multiplierPct: number; mpCost?: number; piercePct?: number; cooldown?: number };
  turns: number;
  /** 暴擊率、閃避率（百分比，0.11.0） */
  crit: number;
  dodge: number;
  /** 仙品法器特效 */
  effects?: GearEffect[];
  boss?: boolean;
  /** 靈獸等隨行者：全隊只剩隨行者時視為落敗 */
  companion?: boolean;
  /** 戰鬥中的狀態（剩餘回合）：定身、封靈、破甲、遲緩、亂神 */
  stun?: number;
  seal?: number;
  defDown?: number;
  slow?: number;
  confuse?: number;
  guardUsed?: boolean;
}

export interface BattleInput {
  allies: Unit[];
  enemies: Unit[];
  strategy: CombatStrategy;
  healPills: number;
  /** 庫存的火符、護身符；策略開啟時戰鬥開始各用一張 */
  talismans?: { fire: number; guard: number };
  /** 戰前祭出的控制符（已確認有庫存，每種一張）與符陣傳承多出的回合 */
  control?: ResourceId[];
  controlExtraRounds?: number;
  /** 回春丹回復最大生命的百分比；未填用 balance.combat.healPct */
  healPct?: number;
  /** 回傳 [0, n) 的整數 */
  randInt: (n: number) => number;
}

export interface BattleOutcome {
  result: 'win' | 'lose' | 'draw';
  rounds: number;
  log: string[];
  highlights: string[];
  allies: Unit[];
  enemies: Unit[];
  pillsUsed: number;
  talismansUsed: { fire: number; guard: number };
  controlUsed: ResourceId[];
}

/** 功法層數給的屬性（0.13.0）。 */
export interface TechniqueMods {
  atkPct: number;
  hpPct: number;
  defPct: number;
  critPct: number;
  dodgePct: number;
  agi: number;
}

/** 人物戰力的額外來源：三格法器、功法層數、短效屬性丹。靈根與永久丹由人物本身計算。 */
export interface UnitMods {
  gear?: GearStats;
  technique?: TechniqueMods;
  /** 護宗神獸加成 */
  guardianAtkPct?: number;
  guardianHpPct?: number;
}

/** 金丹以上修士的傳承招式威力提高 */
const CORE_SKILL_BONUS_PCT = 30;

export function unitFromCharacter(c: Character, row: Row, lineage: LineageDef, hp?: number, mods: UnitMods = {}): Unit {
  const L = powerLevel(c.realm);
  const cs = c.skills.combat;
  const tm = mods.technique;
  const tech = 100 + (tm?.hpPct ?? 0);
  const techAtk = 100 + (tm?.atkPct ?? 0);
  const g = mods.gear ?? emptyStats();
  const inn = innateBonus(c);
  const A = balance.attributes;
  const maxHp =
    Math.floor(
      (Math.floor((Math.floor(((60 + 12 * L + 3 * cs) * tech) / 100) * (100 + (mods.guardianHpPct ?? 0))) / 100) *
        (100 + inn.hpPct + g.hpPct)) /
        100,
    ) + g.hp;
  return {
    key: c.id,
    name: c.name,
    side: 'ally',
    row,
    hp: Math.min(maxHp, hp ?? Math.floor((maxHp * c.health) / 100)),
    maxHp,
    atk:
      Math.round(
        ((10 + 3 * L + cs) * (100 + lineage.bonuses.combatAtkPct) * techAtk * (100 + (mods.guardianAtkPct ?? 0)) * (100 + inn.atkPct)) /
          100000000,
      ) + g.atk,
    def: Math.round(((3 + L) * (100 + lineage.bonuses.combatDefPct) * (100 + inn.defPct + (tm?.defPct ?? 0))) / 10000) + g.def,
    spd: 9 + Math.floor(L / 2) + Math.floor(cs / 2) + inn.agi + g.agi + (tm?.agi ?? 0),
    crit: A.baseCritPct + inn.critPct + g.critPct + (tm?.critPct ?? 0),
    dodge: A.baseDodgePct + inn.dodgePct + g.dodgePct + (tm?.dodgePct ?? 0),
    ...(g.effects.length ? { effects: [...g.effects] } : {}),
    hit: 8 + L,
    res: 4 + Math.floor(L / 2),
    mp: 20 + 2 * L,
    skill: {
      name: lineage.skill.name,
      multiplierPct: lineage.skill.multiplierPct + (powerLevel(c.realm) > 21 ? CORE_SKILL_BONUS_PCT : 0),
      mpCost: lineage.skill.mpCost,
      piercePct: lineage.skill.piercePct,
    },
    turns: 0,
  };
}

/** 靈獸隨主人出戰，能力依主人境界與御獸技藝換算。 */
export function unitFromBeast(beast: Beast, species: BeastSpeciesDef, owner: Character, lineage: LineageDef, hp?: number): Unit {
  const base = unitFromCharacter(owner, species.row, lineage);
  const grown = beast.stage === 'adult' ? species.adultPct : 100;
  const bonus = Math.floor(((100 + owner.skills.beast * balance.beasts.ownerSkillPct) * grown) / 100);
  const maxHp = Math.floor((base.maxHp * species.hpPct * bonus) / 10000);
  return {
    key: beast.id,
    name: beast.name,
    side: 'ally',
    row: species.row,
    hp: Math.min(maxHp, hp ?? maxHp),
    maxHp,
    atk: Math.floor((base.atk * species.atkPct * bonus) / 10000),
    def: base.def,
    spd: species.spd + Math.floor(owner.skills.beast / 2),
    hit: base.hit,
    res: base.res,
    mp: 0,
    turns: 0,
    crit: balance.attributes.baseCritPct,
    dodge: balance.attributes.baseDodgePct,
    companion: true,
  };
}

export function unitFromEnemy(def: EnemyDef, index: number, boss = false): Unit {
  const A = balance.attributes;
  return {
    key: `${def.id}#${index}`,
    name: def.name,
    side: 'enemy',
    row: def.row,
    hp: def.hp,
    maxHp: def.hp,
    atk: def.atk,
    def: def.def,
    spd: def.spd,
    hit: def.hit,
    res: def.res,
    mp: 0,
    ...(def.skill ? { skill: { ...def.skill } } : {}),
    turns: 0,
    crit: boss ? A.bossCritPct : A.enemyCritPct,
    dodge: boss ? A.bossDodgePct : A.enemyDodgePct,
    ...(boss ? { boss: true } : {}),
  };
}

function alive(units: Unit[]): Unit[] {
  return units.filter((u) => u.hp > 0);
}

/** 前排有人時只能攻擊前排。 */
function targetable(units: Unit[]): Unit[] {
  const living = alive(units);
  const front = living.filter((u) => u.row === 'front');
  return front.length ? front : living;
}

/** 戰力：生命 ÷ 4＋攻擊 × 2＋防禦 × 2＋敏捷＋暴擊與閃避的換算。 */
export function estimatePower(u: Unit): number {
  const A = balance.attributes;
  return Math.floor(
    u.maxHp / 4 + u.atk * 2 + u.def * 2 + u.spd + (u.atk * u.crit * A.powerCritBp) / 10000 + (u.maxHp * u.dodge * A.powerDodgeBp) / 10000,
  );
}

const CONTROL_NAMES: Partial<Record<ResourceId, string>> = {
  talisman_bind: '定身符',
  talisman_break: '破甲符',
  talisman_slow: '遲緩符',
  talisman_confuse: '亂神符',
  talisman_seal: '封靈符',
};

/** 戰鬥中的敏捷（遲緩時 −30%）。 */
function agiOf(u: Unit): number {
  return u.slow ? Math.floor((u.spd * (100 - balance.controlTalismans.slowPct)) / 100) : u.spd;
}

function strongest(units: Unit[]): Unit | undefined {
  return alive(units).sort((a, b) => estimatePower(b) - estimatePower(a) || (a.key < b.key ? -1 : 1))[0];
}

export function runBattle(input: BattleInput): BattleOutcome {
  const allies = input.allies.map((u) => ({ ...u }));
  const enemies = input.enemies.map((u) => ({ ...u }));
  const log: string[] = [];
  const highlights: string[] = [];
  let pills = input.healPills;
  let pillsUsed = 0;
  const { maxRounds, healThresholdPct } = balance.combat;
  const A = balance.attributes;
  const C = balance.controlTalismans;
  const healPct = input.healPct ?? balance.combat.healPct;
  const talismansUsed = { fire: 0, guard: 0 };
  const controlUsed: ResourceId[] = [];
  const note = (line: string) => {
    log.push(line);
    highlights.push(line);
  };

  // 戰前用符：護身符提高全隊防禦，火符對每個敵人造成固定傷害
  if (input.strategy.useTalismans && input.talismans) {
    if (input.talismans.guard > 0) {
      talismansUsed.guard = 1;
      for (const u of allies) u.def += balance.talismanCombat.guardDef;
      note(`祭出護身符，全隊防禦 +${balance.talismanCombat.guardDef}。`);
    }
    if (input.talismans.fire > 0) {
      talismansUsed.fire = 1;
      for (const u of enemies) u.hp = Math.max(0, u.hp - balance.talismanCombat.fireDamage);
      note(`打出火符，每個敵人受到 ${balance.talismanCombat.fireDamage} 傷害。`);
      for (const u of enemies) if (u.hp === 0) log.push(`${u.name}倒下。`);
    }
  }

  // 控制符（0.11.0）：定身、封靈對最強的一人，破甲、遲緩、亂神對敵方全體
  if (alive(enemies).length) {
    for (const kind of (input.control ?? []).slice(0, C.maxKinds)) {
      const rounds = (C.rounds[kind] ?? 1) + (input.controlExtraRounds ?? 0);
      const name = CONTROL_NAMES[kind];
      if (!name) continue;
      controlUsed.push(kind);
      if (kind === 'talisman_bind' || kind === 'talisman_seal') {
        const t = strongest(enemies);
        if (!t) continue;
        if (t.boss && input.randInt(100) < C.bossResistPct) {
          note(`祭出${name}，被${t.name}掙脫。`);
          continue;
        }
        if (kind === 'talisman_bind') t.stun = rounds;
        else t.seal = rounds;
        note(`祭出${name}，${t.name}${kind === 'talisman_bind' ? '動彈不得' : '招式被封'}（${rounds} 回合）。`);
      } else {
        for (const u of alive(enemies)) {
          if (kind === 'talisman_break') u.defDown = rounds;
          else if (kind === 'talisman_slow') u.slow = rounds;
          else u.confuse = rounds;
        }
        const what = kind === 'talisman_break' ? `防禦 −${C.defDownPct}%` : kind === 'talisman_slow' ? `敏捷 −${C.slowPct}%` : '命中下降';
        note(`祭出${name}，敵方全體${what}（${rounds} 回合）。`);
      }
    }
  }

  // 出手順序依敏捷，每回合重排（遲緩會改變順序）；先機特效第一回合最先出手
  const orderFor = (round: number) =>
    [...allies, ...enemies].sort((a, b) => {
      if (round === 1) {
        const fa = a.effects?.includes('first') ? 1 : 0;
        const fb = b.effects?.includes('first') ? 1 : 0;
        if (fa !== fb) return fb - fa;
      }
      if (agiOf(b) !== agiOf(a)) return agiOf(b) - agiOf(a);
      if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

  let round = 0;
  let result: BattleOutcome['result'] = alive(enemies).length ? 'draw' : 'win';
  outer: for (round = 1; result === 'draw' && round <= maxRounds; round++) {
    log.push(`── 第 ${round} 回合 ──`);
    for (const actor of orderFor(round)) {
      if (actor.hp <= 0) continue;
      const foes = actor.side === 'ally' ? enemies : allies;
      const friends = actor.side === 'ally' ? allies : enemies;
      if (!alive(foes).length) break;
      actor.turns += 1;
      if (actor.stun) {
        log.push(`${actor.name}被定身，無法行動。`);
        continue;
      }

      if (actor.side === 'ally' && input.strategy.useHealPill && pills > 0) {
        const hurt = alive(friends)
          .filter((u) => u.hp * 100 < u.maxHp * healThresholdPct)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) {
          const amount = Math.floor((hurt.maxHp * healPct) / 100);
          hurt.hp = Math.min(hurt.maxHp, hurt.hp + amount);
          pills -= 1;
          pillsUsed += 1;
          log.push(`${actor.name}為${hurt.name}服下回春丹，回復 ${amount} 生命。`);
          continue;
        }
      }

      const candidates = targetable(foes);
      let target: Unit | undefined;
      if (actor.side === 'ally') {
        target = input.strategy.focusLowest
          ? [...candidates].sort((a, b) => a.hp - b.hp || (a.key < b.key ? -1 : 1))[0]
          : candidates[0];
      } else {
        target = candidates[input.randInt(candidates.length)];
      }
      if (!target) break;

      let multiplier = 100;
      let pierce = 0;
      let skillName = '';
      const sk = actor.seal ? undefined : actor.skill;
      if (sk) {
        if (sk.mpCost !== undefined && actor.mp >= sk.mpCost) {
          actor.mp -= sk.mpCost;
          multiplier = sk.multiplierPct;
          pierce = sk.piercePct ?? 0;
          skillName = sk.name;
        } else if (sk.cooldown && actor.turns % sk.cooldown === 0) {
          multiplier = sk.multiplierPct;
          skillName = sk.name;
        }
      }
      if (actor.effects?.includes('pierce')) pierce = Math.min(100, pierce + balance.gear.piercePct);

      const hitBase = Math.max(5000, Math.min(9800, 8500 + (actor.hit - target.res) * 200));
      const hitBp = actor.confuse ? Math.max(3000, hitBase - C.hitDownBp) : hitBase;
      if (input.randInt(10000) >= hitBp) {
        log.push(`${actor.name}${skillName ? `施展${skillName}，` : '出手，'}被${target.name}閃過。`);
        continue;
      }
      const dodgeBp = Math.min(A.maxDodgePct * 100, target.dodge * 100 + Math.max(0, agiOf(target) - agiOf(actor)) * A.agiDodgeBp);
      if (input.randInt(10000) < dodgeBp) {
        log.push(`${target.name}身形一晃，避開了${actor.name}的${skillName || '攻擊'}。`);
        continue;
      }
      const variance = 90 + input.randInt(21);
      let raw = Math.floor((actor.atk * multiplier * variance) / 10000);
      const crit = input.randInt(10000) < Math.min(A.maxCritPct, actor.crit) * 100;
      if (crit) raw = Math.floor((raw * A.critDamagePct) / 100);
      const def = target.defDown ? Math.floor((target.def * (100 - C.defDownPct)) / 100) : target.def;
      const mitigated = Math.floor((def * (100 - pierce)) / 100);
      const dmg = Math.max(1, raw - mitigated);
      target.hp = Math.max(0, target.hp - dmg);
      if (target.hp === 0 && target.effects?.includes('guard') && !target.guardUsed) {
        target.hp = 1;
        target.guardUsed = true;
        note(`第 ${round} 回合：${target.name}的法器護主，硬撐下一口氣。`);
      }
      log.push(`${actor.name}${skillName ? `施展${skillName}，擊中` : '攻擊'}${target.name}，${crit ? '暴擊！' : ''}造成 ${dmg} 傷害。`);
      if (actor.effects?.includes('drain') && actor.hp > 0) {
        actor.hp = Math.min(actor.maxHp, actor.hp + Math.floor((dmg * balance.gear.drainPct) / 100));
      }
      if (target.hp === 0) {
        const line = `${target.name}倒下。`;
        log.push(line);
        highlights.push(`第 ${round} 回合：${line}`);
      }
      if (!alive(enemies).length) {
        result = 'win';
        break outer;
      }
      if (!alive(allies).some((u) => !u.companion)) {
        result = 'lose';
        break outer;
      }
    }
    for (const u of [...allies, ...enemies]) {
      if (u.stun) u.stun -= 1;
      if (u.seal) u.seal -= 1;
      if (u.defDown) u.defDown -= 1;
      if (u.slow) u.slow -= 1;
      if (u.confuse) u.confuse -= 1;
    }
  }
  const rounds = Math.min(round, maxRounds);
  if (result === 'draw') highlights.push(`${maxRounds} 回合內未分勝負，我方撤出戰場。`);
  if (result === 'win') highlights.push(`第 ${rounds} 回合獲勝。`);
  if (result === 'lose') highlights.push(`第 ${rounds} 回合，我方全員倒下。`);
  if (pillsUsed) highlights.push(`使用回春丹 ${pillsUsed} 顆。`);
  return { result, rounds, log, highlights, allies, enemies, pillsUsed, talismansUsed, controlUsed };
}
