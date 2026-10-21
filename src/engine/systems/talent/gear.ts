import { balance, type StatBonus } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { EquipmentDef } from '../../../content/schema';
import { newId } from '../../ids';
import { rng } from '../../rng';
import type { Character, GameState, GearEffect, GearItem, GearQuality, GearSlot, GearSub } from '../../types';

// 法器品質（0.11.0）：煉成時依機率決定凡品到仙品，主屬性乘上倍率，上品以上多帶副屬性，仙品另帶一個特效。
// 品質加成每 1 點：凡品機率 −1%，按 50：30：15：5 分給良品、上品、極品、仙品。

const G = balance.gear;
export const GEAR_SLOTS: GearSlot[] = ['weapon', 'armor', 'accessory'];
export const SLOT_NAMES: Record<GearSlot, string> = { weapon: '兵器', armor: '護具', accessory: '飾品' };
export const SUB_NAMES: Record<GearSub, string> = { agi: '敏捷', crit: '暴擊', dodge: '閃避', hp: '生命' };
export const EFFECT_NAMES: Record<GearEffect, string> = {
  first: '先機（第一回合先出手）',
  guard: '護命（致命傷時保留 1 點生命，一場一次）',
  drain: `吸血（傷害的 ${G.drainPct}% 回復自己）`,
  pierce: `破甲（無視對方 ${G.piercePct}% 防禦）`,
};
const SUBS: GearSub[] = ['agi', 'crit', 'dodge', 'hp'];
const EFFECTS: GearEffect[] = ['first', 'guard', 'drain', 'pierce'];

export function qualityDef(q: GearQuality) {
  const d = G.qualities.find((x) => x.id === q);
  if (!d) throw new Error(`沒有這個品質：${q}`);
  return d;
}

/** 各品質機率（百分比，可有小數）。 */
export function qualityChances(bonus: number): Record<GearQuality, number> {
  const [common, ...rest] = G.qualities;
  const shift = Math.max(0, Math.min(bonus, (common?.chancePct ?? 0) - G.minCommonPct));
  const out = { common: (common?.chancePct ?? 0) - shift } as Record<GearQuality, number>;
  for (const q of rest) out[q.id as GearQuality] = q.chancePct + (shift * q.shareOfBonus) / 100;
  return out;
}

/** 煉器的品質加成：煉器技藝每 5 點 +1、煉器坊每升一級 +2、加入稀有素材 +8。 */
export function forgeQualityBonus(forgeLevel: number, worker: Character | undefined, boosted: boolean): number {
  return Math.floor((worker?.skills.forging ?? 0) / G.skillPerPoint) + Math.max(0, forgeLevel - 1) * G.perForgeLevel + (boosted ? G.rareBonus : 0);
}

/** 新的一件法器；品質未給時依加成擲骰。 */
export function newGear(state: GameState, defId: string, quality?: GearQuality, bonus = 0): GearItem {
  const r = rng(state, 'alchemy');
  let q: GearQuality = quality ?? 'common';
  if (!quality) {
    const ch = qualityChances(bonus);
    let roll = r.int(10000) / 100;
    for (const d of [...G.qualities].reverse()) {
      const p = ch[d.id as GearQuality];
      if (roll < p) {
        q = d.id as GearQuality;
        break;
      }
      roll -= p;
    }
  }
  const def = qualityDef(q);
  const subs: GearItem['subs'] = [];
  for (let i = 0; i < def.subs; i++) {
    const stat = r.pick(SUBS);
    const [lo, hi] = G.subRanges[stat] as [number, number];
    subs.push({ stat, value: r.range(lo, hi) });
  }
  const item: GearItem = { id: newId(state, 'g'), defId, quality: q, subs };
  if (def.effect) item.effect = r.pick(EFFECTS);
  return item;
}

export interface GearStats {
  atk: number;
  def: number;
  hp: number;
  hpPct: number;
  agi: number;
  critPct: number;
  dodgePct: number;
  effects: GearEffect[];
}

export function emptyStats(): GearStats {
  return { atk: 0, def: 0, hp: 0, hpPct: 0, agi: 0, critPct: 0, dodgePct: 0, effects: [] };
}

/** 單件法器的能力（主屬性 × 品質倍率＋副屬性）。 */
export function gearStats(content: ContentPack, item: GearItem): GearStats {
  const def = content.equipment.get(item.defId);
  const out = emptyStats();
  if (!def) return out;
  const pct = qualityDef(item.quality).statPct;
  const m = (v: number) => Math.floor((v * pct) / 100);
  out.atk = m(def.atk);
  out.def = m(def.def);
  out.hp = m(def.hp);
  out.agi = m(def.agi);
  out.critPct = m(def.critPct);
  out.dodgePct = m(def.dodgePct);
  for (const s of item.subs) {
    if (s.stat === 'agi') out.agi += s.value;
    else if (s.stat === 'crit') out.critPct += s.value;
    else if (s.stat === 'dodge') out.dodgePct += s.value;
    else out.hpPct += s.value;
  }
  if (item.effect) out.effects.push(item.effect);
  return out;
}

/** 一個人三格裝備的總和。 */
export function characterGear(content: ContentPack, c: Character): GearStats {
  const sum = emptyStats();
  for (const slot of GEAR_SLOTS) {
    const it = c.gear?.[slot];
    if (!it) continue;
    const s = gearStats(content, it);
    sum.atk += s.atk;
    sum.def += s.def;
    sum.hp += s.hp;
    sum.hpPct += s.hpPct;
    sum.agi += s.agi;
    sum.critPct += s.critPct;
    sum.dodgePct += s.dodgePct;
    sum.effects.push(...s.effects);
  }
  return sum;
}

/** 靈根與永久丹帶來的屬性加成。 */
export function innateBonus(c: Character): Required<StatBonus> {
  const R = balance.roots;
  const out: Required<StatBonus> = { agi: 0, critPct: 0, dodgePct: 0, atkPct: 0, hpPct: 0, defPct: 0 };
  const grade = c.root?.grade ?? 'mid';
  const base = R.gradePct[grade];
  out.atkPct += base;
  out.hpPct += base;
  out.defPct += base;
  const mult = R.gradeMultPct[grade];
  for (const e of c.root?.elements ?? []) {
    const b: StatBonus = R.element[e];
    for (const k of Object.keys(b) as (keyof StatBonus)[]) out[k] += Math.floor(((b[k] ?? 0) * mult) / 100);
  }
  for (const [id, n] of Object.entries(c.permPills ?? {})) {
    const b = balance.attributes.permPills[id as keyof typeof balance.attributes.permPills];
    if (!b || !n) continue;
    for (const k of Object.keys(b) as (keyof StatBonus)[]) out[k] += (b[k] ?? 0) * n;
  }
  return out;
}

/** 顯示用名稱，例如「上品地火劍」。 */
export function gearName(content: ContentPack, item: GearItem): string {
  return `${qualityDef(item.quality).name}${content.equipment.get(item.defId)?.name ?? item.defId}`;
}

/** 一行能力說明。 */
export function gearDesc(content: ContentPack, item: GearItem): string {
  const s = gearStats(content, item);
  const parts: string[] = [];
  if (s.atk) parts.push(`攻 +${s.atk}`);
  if (s.def) parts.push(`防 +${s.def}`);
  if (s.hp) parts.push(`生命 +${s.hp}`);
  if (s.hpPct) parts.push(`生命 +${s.hpPct}%`);
  if (s.agi) parts.push(`敏捷 +${s.agi}`);
  if (s.critPct) parts.push(`暴擊 +${s.critPct}%`);
  if (s.dodgePct) parts.push(`閃避 +${s.dodgePct}%`);
  for (const e of s.effects) parts.push(EFFECT_NAMES[e]);
  return parts.join('、');
}

/** 估價用的分數：一件凡品制式法器約等於 1。 */
export function gearScore(def: EquipmentDef | undefined): number {
  if (!def) return 1;
  const raw = def.atk + def.def + def.hp / 5 + def.agi + def.critPct + def.dodgePct;
  return Math.max(1, Math.round(raw / 8));
}
