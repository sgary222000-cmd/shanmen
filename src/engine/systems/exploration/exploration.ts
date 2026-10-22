import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import type { ChoiceDef, PoolEventDef, RealmNodeDef, SecretRealmDef } from '../../../content/schema';
import { ensure } from '../../errors';
import { newId } from '../../ids';
import { addInto, canAfford, formatResources, scaleResources, spend } from '../../resources';
import { rng } from '../../rng';
import type { BattleRecord, Character, ExplorationRun, GameState, Row } from '../../types';
import { findCharacter, isInjured } from '../characters/characters';
import { ITEM_NAMES } from '../talent/items';
import { runBattle, unitFromEnemy } from '../combat/combat';
import { allyUnit, applyFormation, battleKit, characterMaxHp, companions, healPctFor, spendKit } from '../combat/party';
import { newGear } from '../talent/gear';
import { minorStats } from '../talent/minorTechniques';
import { rollRareDrops } from './rareDrops';

export { companions } from '../combat/party';

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

/** 事件池節點這次抽到的事件。 */
export function poolEventOf(realm: SecretRealmDef, run: ExplorationRun, nodeId: string): PoolEventDef | undefined {
  const id = run.events?.[nodeId];
  return id ? realm.eventPool.find((e) => e.id === id) : undefined;
}

/** 節點顯示的標題、說明與選項（事件池節點用抽到的事件）。 */
export function nodeView(realm: SecretRealmDef, run: ExplorationRun, node: RealmNodeDef): { title: string; text: string; choices?: ChoiceDef[] } {
  const ev = node.pool ? poolEventOf(realm, run, node.id) : undefined;
  return ev ? { title: ev.title, text: ev.text, choices: ev.choices } : { title: node.title, text: node.text, choices: node.choices };
}

/** 進入秘境的前提（多層秘境要先通關上一層）。 */
export function realmLocked(state: GameState, content: ContentPack, realm: SecretRealmDef): string | undefined {
  if (realm.requires && !(state.realmClears[realm.requires] ?? 0)) return `要先通關${content.secretRealms.get(realm.requires)?.name ?? '上一層'}`;
  return undefined;
}

export function canJoinExpedition(state: GameState, c: Character): string | undefined {
  if (isInjured(c)) return `${c.name}受傷中`;
  if (c.role === 'protagonist' && state.protagonist.seclusion) return `${c.name}閉關中，需先中斷閉關`;
  if (c.schedule === 'breakthrough') return `${c.name}本月安排突破`;
  if (c.schedule === 'explore') return `${c.name}本月已探索過`;
  if (c.schedule === 'dispatch') return `${c.name}正在秘境派遣中`;
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
  const locked = realmLocked(state, content, realm);
  ensure(!locked, locked ?? '');
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

  const hp: Record<string, number> = {};
  const fixedRows: Record<string, Row> = {};
  for (const c of members) {
    c.schedule = 'explore';
    fixedRows[c.id] = rows[c.id] ?? 'front';
    hp[c.id] = allyUnit(state, content, c, fixedRows[c.id] ?? 'front').hp;
  }
  for (const u of companions(state, content, teamIds, hp)) hp[u.key] = u.hp;
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
    events: {},
  };
  state.exploredThisMonth = true;
}

/** 撤退時保留物資的比例：秘境規定與傳承加成取較高者。 */
export function retreatPct(state: GameState, content: ContentPack, realm: SecretRealmDef): number {
  return Math.max(realm.retreatLootPct, content.lineages.get(state.lineage)?.bonuses.retreatLootPct ?? 0);
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
  const allies = aliveTeam(run).map((id) => {
    const c = findCharacter(state, id);
    ensure(c, '找不到隊員');
    return allyUnit(state, content, c, run.rows[id] ?? 'front', run.hp[id]);
  });
  allies.push(...companions(state, content, aliveTeam(run), run.hp));
  const formation = applyFormation(state, content, allies);
  const enemies = (node.enemies ?? []).map((eid, i) => {
    const def = content.enemies.get(eid);
    ensure(def, `敵人資料錯誤：${eid}`);
    return unitFromEnemy(def, i, node.kind === 'boss' && i === 0);
  });
  const kit = battleKit(state, content, allies);
  const r = rng(state, 'combat');
  const outcome = runBattle({
    allies,
    enemies,
    strategy: state.strategy,
    healPills: state.resources.pill_heal,
    talismans: { fire: state.resources.talisman_fire, guard: state.resources.talisman_guard },
    control: kit.control,
    controlExtraRounds: kit.extraRounds,
    healPct: healPctFor(state, content),
    randInt: (n) => r.int(n),
  });
  if (formation) outcome.highlights.unshift(formation);
  spendKit(state, kit, outcome.controlUsed);
  state.resources.pill_heal -= outcome.pillsUsed;
  state.resources.talisman_fire -= outcome.talismansUsed.fire;
  state.resources.talisman_guard -= outcome.talismansUsed.guard;
  for (const u of outcome.allies) run.hp[u.key] = u.hp;
  // 輔修功法《回春訣》：戰後回復生命
  for (const u of outcome.allies) {
    const c = u.companion ? undefined : findCharacter(state, u.key);
    const heal = c ? minorStats(c).healPct : 0;
    if (heal && u.hp > 0) run.hp[u.key] = Math.min(u.maxHp, u.hp + Math.floor((u.maxHp * heal) / 100));
  }
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
  ensure(!nodeView(realm, run, current).choices || run.choices[current.id], '請先決定如何處理此處');
  const node = nodeDef(realm, nextId);
  run.nodeId = nextId;
  run.visited.push(nextId);
  if (node.pool) {
    const taken = new Set(Object.values(run.events ?? {}));
    const pool = realm.eventPool.filter((e) => !taken.has(e.id) && !(e.unique && state.claimedRewards.includes(e.unique.rewardId)));
    const ev = pool[rng(state, 'combat').int(pool.length)];
    if (ev) (run.events ??= {})[node.id] = ev.id;
  }
  const view = nodeView(realm, run, node);
  run.log.push(`前往「${view.title}」。${view.text}`);

  if (node.enemies?.length) {
    const record = fight(state, content, realm, node);
    run.log.push(`戰鬥：${record.highlights.join(' ')}`);
    if (record.result !== 'win') {
      finishRun(state, content, record.result === 'lose' ? 'defeated' : 'retreated');
      return;
    }
    if (node.kind === 'boss') {
      const drop = rollRareDrops(state, content, realm.id);
      if (Object.keys(drop.loot).length) {
        addInto(run.loot, drop.loot);
        run.log.push(`首領掉落：${formatResources(drop.loot)}。`);
      }
      run.log.push(...drop.lines);
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
  const choice = nodeView(realm, run, node).choices?.find((c) => c.id === choiceId);
  ensure(choice, '沒有這個選項');
  ensure(!run.choices[node.id], '已經做過選擇');
  run.choices[node.id] = choice.id;
  run.log.push(`${choice.label}：${choice.result}`);
  if (choice.hpLossPct) {
    for (const id of aliveTeam(run)) {
      const c = findCharacter(state, id);
      if (!c) continue;
      const maxHp = characterMaxHp(state, content, c);
      run.hp[id] = Math.max(1, (run.hp[id] ?? 0) - Math.floor((maxHp * choice.hpLossPct) / 100));
    }
  }
  if (choice.loot) addInto(run.loot, scaleResources(choice.loot, lootPct(state, realm)));
  const unique = choice.unique ? poolEventOf(realm, run, node.id)?.unique : undefined;
  if (unique && !state.claimedRewards.includes(unique.rewardId)) {
    state.claimedRewards.push(unique.rewardId);
    run.log.push(`機緣：${unique.text}${Object.keys(unique.resources).length ? `取得${formatResources(unique.resources)}（月底入庫，撤退或戰敗也不會失去）。` : ''}`);
    addInto(state.pendingLoot, unique.resources);
    for (const e of unique.equipment) {
      state.armory.push(newGear(state, e, 'common'));
      run.log.push(`取得法器「${content.equipment.get(e)?.name ?? e}」（可在弟子頁裝備）。`);
    }
    if (unique.insight) {
      for (const id of aliveTeam(run)) {
        const c = findCharacter(state, id);
        if (c) c.insight = Math.min(balance.technique.maxInsight, c.insight + unique.insight);
      }
      run.log.push(`倖存隊員功法領悟 +${unique.insight}。`);
    }
  }
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
  run.status = status;

  let kept = run.loot;
  if (status === 'retreated') kept = scaleResources(run.loot, retreatPct(state, content, realm));
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
      for (const item of realm.firstClear.items) {
        if (!state.items.includes(item)) state.items.push(item);
        run.log.push(`取得「${ITEM_NAMES[item] ?? item}」。`);
      }
      for (const e of realm.firstClear.equipment) {
        state.armory.push(newGear(state, e, 'common'));
        run.log.push(`取得法器「${content.equipment.get(e)?.name ?? e}」（可在弟子頁裝備）。`);
      }
      const open = realm.firstClear.openRegion;
      if (open && state.regions[open]?.status !== 'open') {
        state.regions[open] = { status: 'open', construction: null };
        run.log.push(`${content.regions.get(open)?.name ?? open}已經打通，可以建設。`);
      }
      if (realm.firstClear.insight) {
        for (const id of aliveTeam(run)) {
          const c = findCharacter(state, id);
          if (c) c.insight = Math.min(balance.technique.maxInsight, c.insight + realm.firstClear.insight);
        }
        run.log.push(`倖存隊員功法領悟 +${realm.firstClear.insight}。`);
      }
    }
  }
  addInto(state.pendingLoot, kept);
  // 結束後畫面上的收穫改為實際帶回的物資（含撤退折扣與首次通關獎勵）
  run.loot = { ...kept };
  const verdict = { completed: '探索完成', retreated: '撤退', defeated: '探索失敗' }[status];
  run.log.push(`${verdict}。帶回物資：${formatResources(kept)}（月底入庫）。`);
  (state.monthLog ??= []).push(`${realm.name}${verdict}，帶回${formatResources(kept) || '無'}。`);

  // 傷勢：倒下者重傷，生命低於一半者輕傷
  for (const id of run.teamIds) {
    const c = findCharacter(state, id);
    if (!c) continue;
    const maxHp = characterMaxHp(state, content, c);
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
