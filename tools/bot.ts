import type { ContentPack } from '../src/content/registry';
import { applyCommand, type Command, type GameState } from '../src/engine';
import { monthIndex } from '../src/engine/date';
import { buildOptions, hallLevel, innerLimit } from '../src/engine/systems/buildings/buildings';
import { jobCapacity } from '../src/engine/systems/characters/outer';
import { breakthroughOdds } from '../src/engine/systems/cultivation/cultivation';
import { canJoinExpedition } from '../src/engine/systems/exploration/exploration';

// 自動玩家：用簡單規則代替人類操作，供模擬器與測試跑長時間遊戲。
// 只透過 applyCommand 操作，與玩家介面走同一條路徑。

export interface BotLog {
  month: number;
  text: string;
}

function tryCmd(state: GameState, content: ContentPack, cmd: Command): GameState {
  const r = applyCommand(state, content, cmd);
  return r.ok ? r.state : state;
}

export function botTurn(state: GameState, content: ContentPack, log: BotLog[]): GameState {
  let s = state;
  const note = (text: string) => log.push({ month: monthIndex(s.date), text });

  // 事件：收最便宜、付得起的候選人
  for (const ev of s.events) {
    if (ev.kind === 'recruitment') {
      const affordable = (ev.candidates ?? [])
        .filter((c) => c.cost <= s.resources.lingshi - 60)
        .sort((a, b) => a.cost - b.cost)[0];
      const pick = s.disciples.length < innerLimit(s, content) ? affordable?.id ?? null : null;
      s = tryCmd(s, content, { type: 'resolveRecruitment', eventId: ev.id, candidateId: pick });
      if (pick) note(`招收內門弟子`);
    } else s = tryCmd(s, content, { type: 'dismissEvent', eventId: ev.id });
  }

  // 交易：賣出多餘石木藥草換靈石
  for (const [res, keep] of [['stone', 150], ['wood', 150], ['herb', 60]] as const) {
    const extra = s.resources[res] - keep;
    for (const amount of [extra, Math.floor(extra / 2), Math.floor(extra / 4), 20]) {
      if (amount <= 0 || amount > extra) continue;
      const before = s;
      s = tryCmd(s, content, { type: 'sell', resource: res, amount });
      if (s !== before) break;
    }
  }

  // 建設：依序修復、建造、升級
  const order = [
    'building.hall',
    'building.field',
    'building.quarry',
    'building.lumber',
    'building.alchemy',
    'building.array',
    'building.dorm',
  ];
  for (const defId of order) {
    const opt = buildOptions(s, content).find((o) => o.def.id === defId);
    if (opt && !opt.blocked && s.resources.lingshi - (opt.next?.cost.lingshi ?? 0) >= 30) {
      const before = s;
      s = tryCmd(s, content, { type: 'build', defId });
      if (s !== before) note(`開工：${opt.def.name} → ${opt.next?.level} 級`);
    }
  }

  // 外門分工：糧食優先，其次石木，剩餘接委託
  const cap = jobCapacity(s, content);
  const n = s.outer.count;
  const field = Math.min(cap.field, Math.max(0, Math.ceil(n / 3)));
  const quarry = Math.min(cap.quarry, Math.max(0, Math.floor((n - field) / 4)));
  const lumber = Math.min(cap.lumber, Math.max(0, Math.floor((n - field - quarry) / 4)));
  const errand = Math.max(0, Math.min(n - field - quarry - lumber - 2, n));
  s = tryCmd(s, content, { type: 'setOuterJobs', jobs: { field, quarry, lumber, errand } });
  const fieldB = s.buildings.find((b) => b.defId === 'building.field');
  if (fieldB) {
    const crop = s.resources.food > 120 ? 'herb' : 'food';
    if (fieldB.crop !== crop) s = tryCmd(s, content, { type: 'setCrop', buildingId: fieldB.id, crop });
  }

  // 內門：大殿修好後選拔一名
  if (hallLevel(s) >= 1 && s.disciples.length === 0 && s.resources.lingshi > 60) {
    s = tryCmd(s, content, { type: 'promoteOuter' });
    note('選拔內門弟子');
  }

  // 丹爐
  const alchemist = s.disciples.find((d) => d.schedule === 'cultivate' || d.schedule === 'alchemy');
  const p = s.protagonist;
  const needFoundation =
    s.recipes.includes('recipe.foundation_pill') && p.realm.major === 'qi' && p.realm.stage >= 8 && s.resources.pill_foundation < 1;
  const recipeId = needFoundation ? 'recipe.foundation_pill' : s.resources.pill_heal < 4 ? 'recipe.heal_pill' : 'recipe.qi_pill';
  if (alchemist && s.furnaces[0]?.recipeId !== recipeId) {
    s = tryCmd(s, content, { type: 'setFurnace', index: 0, alchemistId: alchemist.id, recipeId, repeat: true });
  }

  // 丹藥
  for (const c of [s.protagonist, ...s.disciples]) {
    const want = s.resources.pill_qi > 0;
    if (c.takePill !== want) s = tryCmd(s, content, { type: 'setTakePill', characterId: c.id, value: want });
  }

  // 突破
  if (!breakthroughOdds(s, content, s.protagonist).blocked) {
    if (s.protagonist.seclusion) s = tryCmd(s, content, { type: 'interruptSeclusion' });
    s = tryCmd(s, content, { type: 'setSchedule', characterId: p.id, schedule: 'breakthrough' });
    note('主角嘗試築基');
  }

  // 探索：主角煉氣三層以上、未通關或丹藥需求
  const pro = s.protagonist;
  const cleared = (s.realmClears['secret.abandoned_cave'] ?? 0) > 0;
  if (!cleared && pro.realm.stage >= 4 && !s.exploredThisMonth && pro.schedule !== 'breakthrough') {
    if (pro.seclusion) s = tryCmd(s, content, { type: 'interruptSeclusion' });
    const team = [s.protagonist, ...s.disciples].filter((c) => !canJoinExpedition(s, c) && c.schedule !== 'alchemy');
    if (team.length) {
      const rows = Object.fromEntries(team.map((c, i) => [c.id, i === 0 ? 'front' : 'back'] as const));
      let e = tryCmd(s, content, { type: 'startExploration', realmId: 'secret.abandoned_cave', teamIds: team.map((c) => c.id), rows });
      if (e !== s) {
        let guard = 0;
        while (e.exploration?.status === 'active' && guard++ < 20) {
          const realm = content.secretRealms.get(e.exploration.realmId);
          const node = realm?.nodes.find((x) => x.id === e.exploration?.nodeId);
          if (node?.choices && !e.exploration.choices[node.id]) {
            e = tryCmd(e, content, { type: 'exploreChoice', choiceId: node.choices[0]?.id ?? '' });
            continue;
          }
          const nxt = node?.next[0];
          if (!nxt) break;
          e = tryCmd(e, content, { type: 'exploreMove', nodeId: nxt });
        }
        note(`探索荒廢洞府：${e.exploration?.status}`);
        s = tryCmd(e, content, { type: 'exploreClose' });
      }
    }
  }

  // 主角閉關
  if (s.protagonist.schedule === 'cultivate' && !s.protagonist.injuryMonths) {
    s = tryCmd(s, content, { type: 'setSchedule', characterId: s.protagonist.id, schedule: 'seclusion', months: 6 });
  }
  return s;
}
