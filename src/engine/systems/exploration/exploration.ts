import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { RealmNodeDef, SecretRealmDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { addInto, canAfford, formatResources, scaleResources, spend } from '../../resources';
import { rng } from '../../rng';
import type { BattleRecord, Character, ExplorationRun, GameState, Row } from '../../types';
import { findCharacter, isInjured } from '../characters/characters';
import { releaseFurnace } from '../alchemy/alchemy';
import { runBattle, unitFromCharacter, unitFromEnemy } from '../combat/combat';

// 秘境探索在「安排階段」當場進行：進入時佔用隊員本月行程，
// 取得的物資先放在探索紀錄，結束後轉入 pendingLoot，於月結算第 5 步入庫。

export function realmDef(content: ContentPack, id: string): SecretRealmDef {
  const def = content.secretRealms.get(id);
  ensure(def, '沒有這個秘境');
  return def;
}

export function nodeDef(realm: SecretRealmDef, id: string): RealmNodeDef {
  const node = realm.nodes.find((n) => n.id === id);
  ensure(node, '沒有這個節點');
  return node;
}

export function canJoinExpedition(state: GameState, c: Character): string | undefined {
  if (isInjured(c)) return `${c.name}受傷中`;
  if (c.role === 'protagonist' && state.protagonist.seclusion) return `${c.name}閉關中，需先中斷閉關`;
  if (c.schedule === 'breakthrough') return `${c.name}本月安排突破`;
  if (c.schedule === 'explore') return `${c.name}本月已探索過`;
  return undefined;
}

export function startExploration(
  state: GameState,
  content: ContentPack,
  realmId: string,
  teamIds: string[],
  rows: Record<string, Row>,
): void {
  const realm = realmDef(content, realmId);
  ensure(!state.exploration, '已有進行中的探索');
  ensure(!state.exploredThisMonth, '本月已進行過探索，請推進月份後再來');
  ensure(teamIds.length >= 1, '至少需要一名隊員');
  ensure(teamIds.length <= realm.maxTeam, `隊伍最多 ${realm.maxTeam} 人`);
  ensure(new Set(teamIds).size === teamIds.length, '隊伍中有重複人物');
  const members = teamIds.map((id) => {
    const c = findCharacter(state, id);
    ensure(c, '找不到隊員');
    const reason = canJoinExpedition(state, c);
    ensure(!reason, reason ?? '');
    return c;
  });
  ensure(canAfford(state.resources, realm.supplies), `補給不足（需要 ${formatResources(realm.supplies)}）`);
  spend(state.resources, realm.supplies);

  const lineage = content.lineages.get(state.lineage);
  ensure(lineage, '傳承資料錯誤');
  const hp: Record<string, number> = {};
  const fixedRows: Record<string, Row> = {};
  for (const c of members) {
    releaseFurnace(state, c.id);
    c.schedule = 'explore';
    fixedRows[c.id] = rows[c.id] ?? 'front';
    hp[c.id] = unitFromCharacter(c, fixedRows[c.id] ?? 'front', lineage).hp;
  }
  state.exploration = {
    realmId,
    teamIds: [...teamIds],
    rows: fixedRows,
    nodeId: realm.startNode,
    visited: [realm.startNode],
    hp,
    loot: {},
    unlocks: [],
    status: 'active',
    choices: {},
    log: [`補給：${formatResources(realm.supplies)}。進入${realm.name}。`],
    firstClear: !state.claimedRewards.includes(realm.firstClear.rewardId),
  };
  state.exploredThisMonth = true;
}

function lootPct(state: GameState, realm: SecretRealmDef): number {
  return (state.realmClears[realm.id] ?? 0) > 0 ? realm.repeatLootPct : 100;
}

function aliveTeam(run: ExplorationRun): string[] {
  return run.teamIds.filter((id) => (run.hp[id] ?? 0) > 0);
}

function fight(state: GameState, content: ContentPack, realm: SecretRealmDef, node: RealmNodeDef): BattleRecord {
  const run = state.exploration;
  ensure(run, '沒有進行中的探索');
  const lineage = content.lineages.get(state.lineage);
  ensure(lineage, '傳承資料錯誤');
  const allies = aliveTeam(run).map((id) => {
    const c = findCharacter(state, id);
    ensure(c, '找不到隊員');
    return unitFromCharacter(c, run.rows[id] ?? 'front', lineage, run.hp[id]);
  });
  const enemies = (node.enemies ?? []).map((eid, i) => {
    const def = content.enemies.get(eid);
    ensure(def, `敵人資料錯誤：${eid}`);
    return unitFromEnemy(def, i);
  });
  const r = rng(state, 'combat');
  const outcome = runBattle({
    allies,
    enemies,
    strategy: state.strategy,
    healPills: state.resources.pill_heal,
    randInt: (n) => r.int(n),
  });
  state.resources.pill_heal -= outcome.pillsUsed;
  for (const u of outcome.allies) run.hp[u.key] = u.hp;
  const record: BattleRecord = {
    id: newId(state, 'battle'),
    date: { ...state.date },
    title: `${realm.name}・${node.title}`,
    result: outcome.result,
    rounds: outcome.rounds,
    highlights: outcome.highlights,
    log: outcome.log,
    allies: outcome.allies.map((u) => ({ id: u.key, name: u.name, hp: u.hp, maxHp: u.maxHp })),
    enemies: outcome.enemies.map((u) => ({ id: u.key, name: u.name, hp: u.hp, maxHp: u.maxHp })),
  };
  state.battles.unshift(record);
  state.battles = state.battles.slice(0, 30);
  return record;
}

/** 前往下一個節點並立即處理節點內容（物資、戰鬥）。 */
export function moveTo(state: GameState, content: ContentPack, nextId: string): void {
  const run = state.exploration;
  ensure(run && run.status === 'active', '沒有進行中的探索');
  const realm = realmDef(content, run.realmId);
  const current = nodeDef(realm, run.nodeId);
  ensure(current.next.includes(nextId), '無法前往該處');
  ensure(!current.choices || run.choices[current.id], '請先決定如何處理此處');
  const node = nodeDef(realm, nextId);
  run.nodeId = nextId;
  run.visited.push(nextId);
  run.log.push(`前往「${node.title}」。${node.text}`);

  if (node.enemies?.length) {
    const record = fight(state, content, realm, node);
    run.log.push(`戰鬥：${record.highlights.join(' ')}`);
    if (record.result !== 'win') {
      finishRun(state, content, record.result === 'lose' ? 'defeated' : 'retreated');
      return;
    }
  }
  if (node.loot) {
    const got = scaleResources(node.loot, lootPct(state, realm));
    addInto(run.loot, got);
    run.log.push(`取得：${formatResources(got)}。`);
  }
  if (node.kind === 'exit') finishRun(state, content, 'completed');
}

export function chooseEvent(state: GameState, content: ContentPack, choiceId: string): void {
  const run = state.exploration;
  ensure(run && run.status === 'active', '沒有進行中的探索');
  const realm = realmDef(content, run.realmId);
  const node = nodeDef(realm, run.nodeId);
  const choice = node.choices?.find((c) => c.id === choiceId);
  ensure(choice, '沒有這個選項');
  ensure(!run.choices[node.id], '已經做過選擇');
  run.choices[node.id] = choice.id;
  run.log.push(`${choice.label}：${choice.result}`);
  if (choice.hpLossPct) {
    const lineage = content.lineages.get(state.lineage);
    for (const id of aliveTeam(run)) {
      const c = findCharacter(state, id);
      if (!c || !lineage) continue;
      const maxHp = unitFromCharacter(c, 'front', lineage, 0).maxHp;
      run.hp[id] = Math.max(1, (run.hp[id] ?? 0) - Math.floor((maxHp * choice.hpLossPct) / 100));
    }
  }
  if (choice.loot) addInto(run.loot, scaleResources(choice.loot, lootPct(state, realm)));
}

export function retreat(state: GameState, content: ContentPack): void {
  const run = state.exploration;
  ensure(run && run.status === 'active', '沒有進行中的探索');
  finishRun(state, content, 'retreated');
}

/** 結束探索：結算傷勢，物資轉入待入庫。 */
function finishRun(state: GameState, content: ContentPack, status: 'completed' | 'retreated' | 'defeated'): void {
  const run = state.exploration;
  ensure(run, '沒有進行中的探索');
  const realm = realmDef(content, run.realmId);
  const lineage = content.lineages.get(state.lineage);
  run.status = status;

  let kept = run.loot;
  if (status === 'retreated') kept = scaleResources(run.loot, realm.retreatLootPct);
  if (status === 'defeated') kept = {};
  if (status === 'completed') {
    state.realmClears[realm.id] = (state.realmClears[realm.id] ?? 0) + 1;
    if (!state.claimedRewards.includes(realm.firstClear.rewardId)) {
      state.claimedRewards.push(realm.firstClear.rewardId);
      kept = { ...kept };
      addInto(kept, realm.firstClear.resources);
      for (const recipe of realm.firstClear.recipes) {
        if (!state.recipes.includes(recipe)) state.recipes.push(recipe);
        run.unlocks.push(recipe);
      }
      run.log.push(`首次通關：${realm.firstClear.text}`);
      for (const recipe of realm.firstClear.recipes) {
        run.log.push(`習得丹方「${content.recipes.get(recipe)?.name ?? recipe}」。`);
      }
    }
  }
  addInto(state.pendingLoot, kept);
  const verdict = { completed: '探索完成', retreated: '撤退', defeated: '探索失敗' }[status];
  run.log.push(`${verdict}。帶回物資：${formatResources(kept)}（月底入庫）。`);

  // 傷勢：倒下者重傷，生命低於一半者輕傷
  for (const id of run.teamIds) {
    const c = findCharacter(state, id);
    if (!c || !lineage) continue;
    const maxHp = unitFromCharacter(c, 'front', lineage, 0).maxHp;
    const hp = run.hp[id] ?? 0;
    c.health = Math.max(1, Math.floor((hp * 100) / maxHp));
    if (hp <= 0) {
      c.injuryMonths = Math.max(c.injuryMonths, balance.combat.koInjuryMonths);
      run.log.push(`${c.name}重傷，需休養 ${balance.combat.koInjuryMonths} 個月。`);
    } else if (hp * 2 < maxHp) {
      c.injuryMonths = Math.max(c.injuryMonths, balance.combat.hurtInjuryMonths);
      run.log.push(`${c.name}負傷，需休養 ${balance.combat.hurtInjuryMonths} 個月。`);
    }
  }
  state.stats.explorations += 1;
}

/** 關閉探索視窗；探索紀錄保留到月底。 */
export function closeExploration(state: GameState): void {
  const run = state.exploration;
  ensure(run, '沒有探索紀錄');
  ensure(run.status !== 'active', '探索進行中，請先撤退或走到出口');
  state.exploration = null;
}
