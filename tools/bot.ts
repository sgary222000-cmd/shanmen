import type { ContentPack } from '../src/content/registry';
import { applyCommand, type Command, type GameState } from '../src/engine';
import { monthIndex } from '../src/engine/date';
import { allByDef, benchCount, benchList, hallLevel, isCraftSchedule, qiCapacity, innerLimit, newBuildOptions, upgradeOption } from '../src/engine/systems/buildings/buildings';
import { commissionBlocked, idleOuter } from '../src/engine/systems/commissions/commissions';
import { buyPrice, demandLeft, marketOpen, recipesForSale, stockLeft } from '../src/engine/systems/economy/market';
import { balance } from '../src/content/balance';
import type { ResourceId } from '../src/engine';
import { isRegionOpen, openRegionBlocked } from '../src/engine/systems/regions/regions';
import { jobCapacity } from '../src/engine/systems/characters/outer';
import { seatOptions } from '../src/engine/systems/characters/schedule';
import { breakthroughOdds } from '../src/engine/systems/cultivation/cultivation';
import { canJoinExpedition } from '../src/engine/systems/exploration/exploration';

// 自動玩家：用簡單規則代替人類操作，供模擬器與測試跑長時間遊戲。
// 只透過 applyCommand 操作，與玩家介面走同一條路徑。

export interface BotLog {
  month: number;
  text: string;
}

/**
 * 經營路線（驗收：至少兩條路線各跑 100 年不卡死）。
 * - alchemy：丹藥流（預設），靈泉谷種藥、煉丹自用與出售。
 * - craft：器符流，採礦煉器、製符，出售法器符籙換靈石。
 * - commission：委託外事流，外門大量做勞務委託，主角與內門接護衛委託，缺料上坊市買。
 */
export type BotRoute = 'alchemy' | 'craft' | 'commission';

function tryCmd(state: GameState, content: ContentPack, cmd: Command): GameState {
  const r = applyCommand(state, content, cmd);
  return r.ok ? r.state : state;
}

export function botTurn(state: GameState, content: ContentPack, log: BotLog[], route: BotRoute = 'alchemy'): GameState {
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

  // 交易：坊市開了就照行情賣多餘物資（價格較好），沒有坊市時賣給山下商隊
  const keepStock: Partial<Record<ResourceId, number>> = {
    stone: 150,
    wood: 150,
    herb: 60,
    ore: route === 'craft' ? 20 : 8,
    paper: 12,
    spirit_herb: 12,
    beast_mat: 6,
    artifact: 0,
    talisman_fire: 6,
    talisman_guard: 6,
    pill_qi: 12,
    pill_heal: 8,
    food: 400,
  };
  if (marketOpen(s, content)) {
    for (const [res, keep] of Object.entries(keepStock) as [ResourceId, number][]) {
      const lot = balance.market.goods[res]?.lot ?? 0;
      if (!lot) continue;
      const lots = Math.min(demandLeft(s, content, res), Math.floor((s.resources[res] - keep) / lot));
      if (lots > 0) s = tryCmd(s, content, { type: 'marketSell', resource: res, lots });
    }
    // 缺糧或缺藥草時買一點
    for (const [res, low] of [['food', 60], ['herb', 15]] as const) {
      if (s.resources[res] >= low || stockLeft(s, content, res) < 1 || s.resources.lingshi < buyPrice(s, res) + 40) continue;
      s = tryCmd(s, content, { type: 'marketBuy', resource: res, lots: 1 });
    }
    // 有餘裕時買配方
    for (const r of recipesForSale(s, content)) {
      if (s.resources.lingshi >= (r.marketPrice ?? 0) + 200) {
        const before = s;
        s = tryCmd(s, content, { type: 'buyRecipe', recipeId: r.id });
        if (s !== before) note(`購買配方：${r.name}`);
      }
    }
  }
  for (const [res, keep] of [['stone', 150], ['wood', 150], ['herb', 60]] as const) {
    const extra = s.resources[res] - keep;
    for (const amount of [extra, Math.floor(extra / 2), Math.floor(extra / 4), 20]) {
      if (amount <= 0 || amount > extra) continue;
      const before = s;
      s = tryCmd(s, content, { type: 'sell', resource: res, amount });
      if (s !== before) break;
    }
  }

  // 區域：有餘裕時依序開放靈泉谷、後山、山門
  const regionOrder: [string, number][] =
    route === 'alchemy'
      ? [['region.valley', 0], ['region.gate', 120], ['region.back', 150], ['region.fire', 250]]
      : route === 'craft'
        ? [['region.gate', 80], ['region.valley', 0], ['region.fire', 150], ['region.back', 150]]
        : [['region.gate', 60], ['region.valley', 0], ['region.back', 150], ['region.fire', 300]];
  for (const [regionId, minLingshi] of regionOrder) {
    if (s.resources.lingshi < minLingshi) continue;
    if (!openRegionBlocked(s, content, regionId, hallLevel(s)) && s.resources.stone >= 120) {
      const before = s;
      s = tryCmd(s, content, { type: 'openRegion', regionId });
      if (s !== before) note(`開放區域：${content.regions.get(regionId)?.name}`);
    }
  }

  // 建設：先升級既有建築，再依偏好區域新建
  const reserve = 30;
  for (const b of s.buildings) {
    const opt = upgradeOption(s, content, b);
    if (!opt.blocked && (!opt.cost.lingshi || s.resources.lingshi - opt.cost.lingshi >= reserve)) {
      const before = s;
      s = tryCmd(s, content, { type: 'upgrade', buildingId: b.id });
      if (s !== before) note(`開工：${opt.def.name} → ${opt.next?.level} 級`);
    }
  }
  const wanted: [string, string[], number][] = [
    ['building.field', ['region.valley', 'region.main'], isRegionOpen(s, 'region.valley') ? 2 : 1],
    ['building.quarry', ['region.outer', 'region.main'], 1],
    ['building.lumber', ['region.outer', 'region.main'], 1],
    ['building.alchemy', ['region.fire', 'region.main'], 1],
    ['building.array', ['region.back', 'region.main'], isRegionOpen(s, 'region.back') ? 2 : 1],
    ['building.market', ['region.gate'], 1],
    ['building.garden', ['region.valley', 'region.back'], route === 'alchemy' ? 2 : 1],
    ['building.talisman', ['region.back', 'region.main'], route === 'craft' ? 2 : 1],
    ['building.mine', ['region.fire', 'region.outer'], route === 'craft' ? 2 : 1],
    ['building.forge', ['region.fire', 'region.main'], route === 'craft' ? 1 : 0],
  ];
  for (const [defId, prefer, count] of wanted) {
    if (allByDef(s, defId).length >= count) continue;
    for (const regionId of prefer) {
      const opt = newBuildOptions(s, content, regionId).find((o) => o.def.id === defId);
      if (!opt || opt.blocked || (opt.cost.lingshi && s.resources.lingshi - opt.cost.lingshi < reserve)) continue;
      const before = s;
      s = tryCmd(s, content, { type: 'build', defId, regionId });
      if (s !== before) {
        note(`開工：${content.regions.get(regionId)?.name}${opt.def.name}`);
        break;
      }
    }
  }

  // 修煉地點：主角移往靈氣容量最高的區域（同容量時偏好後山的修煉加成）
  if (!s.protagonist.seclusion) {
    const best = seatOptions(s, content).sort(
      (a, b) => qiCapacity(s, content, b) - qiCapacity(s, content, a) || Number(b === 'region.back') - Number(a === 'region.back'),
    )[0];
    if (best && best !== s.protagonist.seat && qiCapacity(s, content, best) > qiCapacity(s, content, s.protagonist.seat)) {
      s = tryCmd(s, content, { type: 'setSeat', characterId: s.protagonist.id, regionId: best });
    } else if (best === 'region.back' && s.protagonist.seat !== 'region.back' && qiCapacity(s, content, best) >= qiCapacity(s, content, s.protagonist.seat)) {
      s = tryCmd(s, content, { type: 'setSeat', characterId: s.protagonist.id, regionId: best });
    }
  }

  // 外門分工：糧食優先，其次石木、藥園、礦場，剩餘打零工；委託流留人做勞務委託
  const cap = jobCapacity(s, content);
  const n = s.outer.count - s.outer.labor;
  const field = Math.min(cap.field, Math.max(0, Math.ceil(n / 3)));
  const quarry = Math.min(cap.quarry, Math.max(0, Math.floor((n - field) / 4)));
  const lumber = Math.min(cap.lumber, Math.max(0, Math.floor((n - field - quarry) / 4)));
  let rest = n - field - quarry - lumber;
  const garden = Math.min(cap.garden, Math.max(0, Math.floor(rest / 3)));
  rest -= garden;
  const mine = Math.min(cap.mine, Math.max(0, Math.floor(rest / (route === 'craft' ? 2 : 3))));
  rest -= mine;
  const errand = route === 'commission' ? 0 : Math.max(0, rest - 2);
  s = tryCmd(s, content, { type: 'setOuterJobs', jobs: { field, quarry, lumber, garden, mine, errand } });

  // 委託：勞務委託派閒置外門；物資充裕時交付；委託流與缺靈石時由主角帶隊護衛
  for (const c of [...s.commissions]) {
    if (commissionBlocked(s, c)) continue;
    if (c.kind === 'labor' && idleOuter(s) > (route === 'commission' ? 0 : 2)) {
      const before = s;
      s = tryCmd(s, content, { type: 'acceptCommission', commissionId: c.id });
      if (s !== before) note(`勞務委託：${c.title}`);
    } else if (c.kind === 'deliver') {
      const enough = Object.entries(c.deliver ?? {}).every(([id, v]) => s.resources[id as ResourceId] - (v ?? 0) >= (keepStock[id as ResourceId] ?? 0) / 2);
      if (enough) s = tryCmd(s, content, { type: 'acceptCommission', commissionId: c.id });
    } else if (c.kind === 'escort' && (route === 'commission' || s.resources.lingshi < 60)) {
      const pro = s.protagonist;
      const strong = pro.realm.major === 'foundation' || pro.realm.stage >= 4;
      if (!strong || pro.schedule === 'breakthrough' || pro.injuryMonths || s.exploration) continue;
      if (pro.realm.major === 'qi' && pro.realm.stage === 9) continue; // 準備築基時不外出
      let t = pro.seclusion ? tryCmd(s, content, { type: 'interruptSeclusion' }) : s;
      const team = [t.protagonist, ...t.disciples].filter((x) => !canJoinExpedition(t, x) && x.schedule === 'cultivate').slice(0, c.maxTeam ?? 3);
      if (!team.length) continue;
      const r = applyCommand(t, content, { type: 'acceptCommission', commissionId: c.id, teamIds: team.map((x) => x.id) });
      if (r.ok) {
        t = r.state;
        s = t;
        note(`護衛委託：${c.title}：${r.message ?? ''}`);
      }
    }
  }

  // 存糧多時全部改種藥草，存糧少時改回糧食；第一塊田在存糧中等時種糧
  const fields = allByDef(s, 'building.field');
  fields.forEach((fieldB, i) => {
    const crop = s.resources.food > 300 ? 'herb' : s.resources.food < 120 || i === 0 ? 'food' : 'herb';
    if (fieldB.crop !== crop) s = tryCmd(s, content, { type: 'setCrop', buildingId: fieldB.id, crop });
  });

  // 內門：大殿修好後選拔一名
  if (hallLevel(s) >= 1 && s.disciples.length === 0 && s.resources.lingshi > 60) {
    s = tryCmd(s, content, { type: 'promoteOuter' });
    note('選拔內門弟子');
  }

  // 丹爐：第一位閒置內門掌爐；主角接近築基時保留 10 份藥草給築基丹
  const free = () => s.disciples.filter((d) => d.schedule === 'cultivate');
  const alchemist = s.disciples.find((d) => d.schedule === 'alchemy') ?? free()[0];
  const p = s.protagonist;
  const needFoundation =
    s.recipes.includes('recipe.foundation_pill') && p.realm.major === 'qi' && p.realm.stage >= 8 && s.resources.pill_foundation < 1;
  const anyFoundation = [p, ...s.disciples].some((c) => c.realm.major === 'foundation');
  const recipeId = needFoundation
    ? 'recipe.foundation_pill'
    : s.resources.pill_heal < 4
      ? 'recipe.heal_pill'
      : anyFoundation && s.recipes.includes('recipe.peiyuan_pill') && s.resources.spirit_herb >= 3 && s.resources.pill_peiyuan < 6
        ? 'recipe.peiyuan_pill'
        : 'recipe.qi_pill';
  const keep = needFoundation || (p.realm.major === 'qi' && p.realm.stage >= 8) ? (recipeId === 'recipe.foundation_pill' ? 0 : 10) : 0;
  if (alchemist && (s.furnaces[0]?.recipeId !== recipeId || (s.furnaces[0]?.keep ?? 0) !== keep || s.furnaces[0]?.alchemistId !== alchemist.id)) {
    s = tryCmd(s, content, { type: 'setFurnace', index: 0, alchemistId: alchemist.id, recipeId, repeat: true, keep });
  }

  // 符案與器爐：再由閒置內門負責
  if (benchCount(s, content, 'talisman') > 0) {
    const cur = benchList(s, 'talisman')[0];
    const worker = cur?.alchemistId ? s.disciples.find((d) => d.id === cur.alchemistId) : free()[0];
    const tRecipe =
      s.resources.paper < 6
        ? 'recipe.paper'
        : s.recipes.includes('recipe.guard_talisman') && s.resources.talisman_guard < s.resources.talisman_fire
          ? 'recipe.guard_talisman'
          : 'recipe.fire_talisman';
    if (worker && (cur?.recipeId !== tRecipe || cur?.alchemistId !== worker.id)) {
      s = tryCmd(s, content, { type: 'setFurnace', station: 'talisman', index: 0, alchemistId: worker.id, recipeId: tRecipe, repeat: true, keep: 0 });
    }
  }
  if (benchCount(s, content, 'forge') > 0) {
    const cur = benchList(s, 'forge')[0];
    const worker = cur?.alchemistId ? s.disciples.find((d) => d.id === cur.alchemistId) : free()[0];
    const fRecipe = s.recipes.includes('recipe.artifact_beast') && s.resources.beast_mat >= 2 ? 'recipe.artifact_beast' : 'recipe.artifact_ore';
    if (worker && (cur?.recipeId !== fRecipe || cur?.alchemistId !== worker.id)) {
      s = tryCmd(s, content, { type: 'setFurnace', station: 'forge', index: 0, alchemistId: worker.id, recipeId: fRecipe, repeat: true, keep: 0 });
    }
  }

  // 丹藥
  for (const c of [s.protagonist, ...s.disciples]) {
    const want = s.resources.pill_qi > 0 || (c.realm.major !== 'qi' && s.resources.pill_peiyuan > 0);
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
    const team = [s.protagonist, ...s.disciples].filter((c) => !canJoinExpedition(s, c) && !isCraftSchedule(c.schedule));
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
