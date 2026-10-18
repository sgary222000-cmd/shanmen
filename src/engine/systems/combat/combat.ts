import { balance } from '../../../content/balance';
import type { EnemyDef, LineageDef } from '../../../content/schema';
import type { Character, CombatStrategy, Row } from '../../types';
import { powerLevel } from '../characters/characters';

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
}

export interface BattleInput {
  allies: Unit[];
  enemies: Unit[];
  strategy: CombatStrategy;
  healPills: number;
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
}

export function unitFromCharacter(c: Character, row: Row, lineage: LineageDef, hp?: number): Unit {
  const L = powerLevel(c.realm);
  const cs = c.skills.combat;
  const maxHp = 60 + 12 * L + 3 * cs;
  return {
    key: c.id,
    name: c.name,
    side: 'ally',
    row,
    hp: Math.min(maxHp, hp ?? Math.floor((maxHp * c.health) / 100)),
    maxHp,
    atk: 10 + 3 * L + cs,
    def: 3 + L,
    spd: 9 + Math.floor(L / 2) + Math.floor(cs / 2),
    hit: 8 + L,
    res: 4 + Math.floor(L / 2),
    mp: 20 + 2 * L,
    skill: {
      name: lineage.skill.name,
      multiplierPct: lineage.skill.multiplierPct,
      mpCost: lineage.skill.mpCost,
      piercePct: lineage.skill.piercePct,
    },
    turns: 0,
  };
}

export function unitFromEnemy(def: EnemyDef, index: number): Unit {
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

export function estimatePower(u: Unit): number {
  return Math.floor(u.maxHp / 4 + u.atk * 2 + u.def * 2 + u.spd);
}

export function runBattle(input: BattleInput): BattleOutcome {
  const allies = input.allies.map((u) => ({ ...u }));
  const enemies = input.enemies.map((u) => ({ ...u }));
  const log: string[] = [];
  const highlights: string[] = [];
  let pills = input.healPills;
  let pillsUsed = 0;
  const { maxRounds, healThresholdPct, healPct } = balance.combat;

  const order = [...allies, ...enemies].sort((a, b) => {
    if (b.spd !== a.spd) return b.spd - a.spd;
    if (a.side !== b.side) return a.side === 'ally' ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  let round = 0;
  let result: BattleOutcome['result'] = 'draw';
  outer: for (round = 1; round <= maxRounds; round++) {
    log.push(`── 第 ${round} 回合 ──`);
    for (const actor of order) {
      if (actor.hp <= 0) continue;
      const foes = actor.side === 'ally' ? enemies : allies;
      const friends = actor.side === 'ally' ? allies : enemies;
      if (!alive(foes).length) break;
      actor.turns += 1;

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
      const sk = actor.skill;
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

      const hitBp = Math.max(5000, Math.min(9800, 8500 + (actor.hit - target.res) * 200));
      if (input.randInt(10000) >= hitBp) {
        log.push(`${actor.name}${skillName ? `施展${skillName}，` : '出手，'}被${target.name}閃過。`);
        continue;
      }
      const variance = 90 + input.randInt(21);
      const raw = Math.floor((actor.atk * multiplier * variance) / 10000);
      const mitigated = Math.floor((target.def * (100 - pierce)) / 100);
      const dmg = Math.max(1, raw - mitigated);
      target.hp = Math.max(0, target.hp - dmg);
      log.push(`${actor.name}${skillName ? `施展${skillName}，` : '攻擊'}${target.name}，造成 ${dmg} 傷害。`);
      if (target.hp === 0) {
        const line = `${target.name}倒下。`;
        log.push(line);
        highlights.push(`第 ${round} 回合：${line}`);
      }
      if (!alive(enemies).length) {
        result = 'win';
        break outer;
      }
      if (!alive(allies).length) {
        result = 'lose';
        break outer;
      }
    }
  }
  const rounds = Math.min(round, maxRounds);
  if (result === 'draw') highlights.push(`${maxRounds} 回合內未分勝負，我方撤出戰場。`);
  if (result === 'win') highlights.push(`第 ${rounds} 回合獲勝。`);
  if (result === 'lose') highlights.push(`第 ${rounds} 回合，我方全員倒下。`);
  if (pillsUsed) highlights.push(`使用回春丹 ${pillsUsed} 顆。`);
  return { result, rounds, log, highlights, allies, enemies, pillsUsed };
}
