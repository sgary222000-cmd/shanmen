import type { ContentPack } from '../src/content/registry';
import { applyCommand, type Command, type GameState } from '../src/engine';
import { monthIndex } from '../src/engine/date';
import { aidTroops, contactBlocked, treatyBlocked, treatyCapacity, treatyCount } from '../src/engine/systems/world/diplomacy';
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
import { dispatchBlocked, dispatchOdds } from '../src/engine/systems/exploration/dispatch';
import { atMajorThreshold, powerLevel, readyForFoundation, xpToNext } from '../src/engine/systems/characters/characters';
import { canAfford } from '../src/engine/resources';
import { ascendBlocked, guardianBeast, guardianNextCost, hatchBlocked, raiseBlocked } from '../src/engine/systems/beasts/beasts';
import { libraryResearch } from '../src/engine/systems/talent/techniques';
import { tournamentBlocked } from '../src/engine/systems/world/tournament';
import { COMMON_EQUIPMENT } from '../src/content/equipment';
import { remainingLifePct } from '../src/engine/systems/characters/lifespan';

/** 自動玩家探索秘境的順序與主角最低綜合等級（煉氣 n 層 = n；築基前期 12、後期 18）。 */
const REALM_PLAN: [string, number][] = [
  ['secret.abandoned_cave', 4],
  ['secret.underground_mine', 7],
  ['secret.beast_valley', 12],
  ['secret.ancient_ruins', 18],
];

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

/** 主角金丹後期起準備凝嬰丹、元嬰後期起準備化神丹：要的丹方與材料（含煉製用靈石）。 */
function lateGoal(s: GameState, content: ContentPack): (Partial<Record<ResourceId, number>> & { recipe: string }) | undefined {
  const p = s.protagonist;
  const goal =
    p.realm.major === 'core' && p.realm.stage >= 3 && s.resources.pill_nascent < 1
      ? 'recipe.nascent_pill'
      : p.realm.major === 'nascent' && p.realm.stage >= 3 && s.resources.pill_deity < 1
        ? 'recipe.deity_pill'
        : undefined;
  if (!goal || !s.recipes.includes(goal)) return undefined;
  return { recipe: goal, ...content.recipes.get(goal)?.inputs };
}

/** 金丹以後下一個要升的關鍵建築（大殿 4 級、後山聚靈陣 3 級、洞府 3 級）需要的石木。 */
function lateBuildNeed(s: GameState, content: ContentPack): { stone: number; wood: number; lingshi: number; buildingId?: string } {
  if (!['core', 'nascent', 'deity'].includes(s.protagonist.realm.major)) return { stone: 0, wood: 0, lingshi: 0 };
  const targets: [string, number][] = [['building.hall', 4], ['building.cave_abode', 3], ['building.array', 3]];
  for (const [defId, level] of targets) {
    const b = s.buildings.find((x) => x.defId === defId && (defId === 'building.hall' || x.region === 'region.back'));
    if (!b || b.level >= level || b.construction) continue;
    const cost = upgradeOption(s, content, b).cost;
    return { stone: cost.stone ?? 0, wood: cost.wood ?? 0, lingshi: cost.lingshi ?? 0, buildingId: b.id };
  }
  return { stone: 0, wood: 0, lingshi: 0 };
}

/** 金丹以後要存的靈石：下一個關鍵建築，或還沒買的凝嬰丹、化神丹丹方。 */
function lateReserve(s: GameState, content: ContentPack, need: { lingshi: number }): number {
  const p = s.protagonist;
  if (!['core', 'nascent'].includes(p.realm.major)) return 0;
  const recipe = p.realm.major === 'core' ? 'recipe.nascent_pill' : 'recipe.deity_pill';
  const price = s.recipes.includes(recipe) ? 0 : (content.recipes.get(recipe)?.marketPrice ?? 0);
  return Math.max(need.lingshi, price);
}

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
    } else if (ev.kind === 'aid' && ev.aid) {
      // 盟友求援：靈石夠就出資，不然出兵，都不行才婉拒
      const choice = s.resources.lingshi >= ev.aid.lingshi + 200 ? 'money' : aidTroops(s).length ? 'troops' : 'refuse';
      s = tryCmd(s, content, { type: 'resolveAid', eventId: ev.id, choice });
      note(`回覆求援：${choice}`);
    } else if (ev.kind === 'succession') {
      s = tryCmd(s, content, { type: 'resolveSuccession', eventId: ev.id, characterId: ev.successors?.[0] ?? s.protagonist.id });
      note(`確認新掌門 ${s.protagonist.name}`);
    } else s = tryCmd(s, content, { type: 'dismissEvent', eventId: ev.id });
  }

  // 外交：有議事堂後，條件夠就締約（先互不侵犯，信任夠了改結盟）；好戰宗門好感太低時送點禮
  if (treatyCapacity(s, content)) {
    for (const sect of s.sects) {
      for (const kind of ['alliance', 'peace'] as const) {
        if (!treatyBlocked(s, content, sect.id, kind) && s.resources.lingshi >= balance.diplomacy.treaties[kind].lingshi + 300) {
          const before = s;
          s = tryCmd(s, content, { type: 'signTreaty', sectId: sect.id, kind });
          if (s !== before) note(`締約：${sect.id} ${kind}`);
          break;
        }
      }
    }
  }
  // 送禮只在有議事堂、還能再締約、手頭寬裕時才送，一年最多送一家，免得把存款送光
  if (treatyCapacity(s, content) > treatyCount(s) && s.resources.lingshi >= 1500) {
    const target = s.sects.find(
      (sect) => !sect.treaty && sect.giftsThisYear === 0 && !contactBlocked(s, content, sect.id) && sect.favor < balance.diplomacy.treaties.peace.favor,
    );
    if (target && !s.sects.some((x) => x.giftsThisYear > 0)) s = tryCmd(s, content, { type: 'giftSect', sectId: target.id, lingshi: 100 });
  }

  // 傳承：指定境界最高的內門為親傳弟子；壽元剩兩成時服延壽丹
  const strongest = [...s.disciples].sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp)[0];
  if (strongest && !s.disciples.some((d) => d.id === s.heirId)) {
    s = tryCmd(s, content, { type: 'setHeir', characterId: strongest.id });
    note(`立 ${strongest.name} 為親傳弟子`);
  }
  for (const c of [s.protagonist, ...s.disciples]) {
    if (s.resources.pill_life > 0 && remainingLifePct(c) < 20) s = tryCmd(s, content, { type: 'takeLongevityPill', characterId: c.id });
  }

  // 交易：坊市開了就照行情賣多餘物資（價格較好），沒有坊市時賣給山下商隊
  // 御獸傳承結丹後要養護宗神獸，獸材與靈藥多留一些
  const keepForGuardian = s.lineage === 'lineage.beast' && s.protagonist.realm.major === 'core' ? guardianNextCost(s) : undefined;
  // 準備凝嬰、化神：存丹藥材料，不夠時上坊市買
  const late = lateGoal(s, content);
  // 金丹以後要蓋大殿 4 級、後山聚靈陣與洞府 3 級，石木先存起來
  const lateBuild = lateBuildNeed(s, content);
  // 大殿 3 級（P1 建設大致完成）後才開始為後期存錢；100 靈石以內的小工程照蓋
  const lateSave = hallLevel(s) >= 3 ? lateReserve(s, content, lateBuild) + (late?.lingshi ?? 0) : 0;
  const keepStock: Partial<Record<ResourceId, number>> = {
    stone: Math.max(150, lateBuild.stone),
    wood: Math.max(150, lateBuild.wood),
    herb: 60,
    ore: Math.max(route === 'craft' ? 20 : 8, late?.ore ?? 0),
    paper: 12,
    spirit_herb: Math.max(12, keepForGuardian?.spirit_herb ?? 0, late?.spirit_herb ?? 0),
    beast_mat: Math.max(6, keepForGuardian?.beast_mat ?? 0, late?.beast_mat ?? 0),
    artifact: 2,
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
    // 準備凝嬰、化神丹的材料
    for (const res of ['spirit_herb', 'ore', 'beast_mat'] as const) {
      const need = late?.[res] ?? 0;
      while (s.resources[res] < need && stockLeft(s, content, res) > 0 && s.resources.lingshi >= buyPrice(s, res) + (late?.lingshi ?? 0)) {
        const before = s;
        s = tryCmd(s, content, { type: 'marketBuy', resource: res, lots: 1 });
        if (s === before) break;
      }
    }
    // 缺糧或缺藥草時買一點
    for (const [res, low] of [['food', 60], ['herb', 15]] as const) {
      if (s.resources[res] >= low || stockLeft(s, content, res) < 1 || s.resources.lingshi < buyPrice(s, res) + 40) continue;
      s = tryCmd(s, content, { type: 'marketBuy', resource: res, lots: 1 });
    }
    // 有餘裕時買配方
    for (const r of recipesForSale(s, content)) {
      const lateRecipe = r.id === 'recipe.nascent_pill' || r.id === 'recipe.deity_pill';
      if (s.resources.lingshi >= (r.marketPrice ?? 0) + 200 + (lateRecipe ? 0 : lateSave)) {
        const before = s;
        s = tryCmd(s, content, { type: 'buyRecipe', recipeId: r.id });
        if (s !== before) note(`購買配方：${r.name}`);
      }
    }
  }
  for (const [res, keep] of [['stone', keepStock.stone ?? 150], ['wood', keepStock.wood ?? 150], ['herb', 60]] as const) {
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
  // 準備結丹：主角築基後期起，靈石優先留給後山聚靈陣 2 級與洞府
  const me0 = s.protagonist;
  const coreFocus = me0.realm.major === 'foundation' && me0.realm.stage >= 3 && isRegionOpen(s, 'region.back') && qiCapacity(s, content, 'region.back') < 40;
  // 御獸傳承主角結丹後，靈獸苑 2 級且有成年靈獸時，先存資源晉升、供奉護宗神獸
  const guardianGoal =
    s.lineage === 'lineage.beast' &&
    me0.realm.major === 'core' &&
    s.buildings.some((b) => b.defId === 'building.beast_garden' && b.level >= balance.beasts.guardian.gardenLevel) &&
    (guardianBeast(s) ? !!guardianNextCost(s) : s.beasts.some((b) => b.stage === 'adult'))
      ? guardianNextCost(s)
      : undefined;
  const reserve = (guardianGoal ? (guardianGoal.lingshi ?? 0) + 30 : 30) + lateSave;
  for (const b of s.buildings) {
    if (b.id === lateBuild.buildingId) {
      const before = s;
      s = tryCmd(s, content, { type: 'upgrade', buildingId: b.id });
      if (s !== before) note(`開工：${upgradeOption(before, content, b).def.name} → ${b.level + 1} 級`);
      continue;
    }
    if (coreFocus && !(b.region === 'region.back' && (b.defId === 'building.array' || b.defId === 'building.cave_abode'))) continue;
    const opt = upgradeOption(s, content, b);
    const keep = (opt.cost.lingshi ?? 0) <= 100 ? reserve - lateSave : reserve;
    if (!opt.blocked && (!opt.cost.lingshi || s.resources.lingshi - opt.cost.lingshi >= (coreFocus ? 0 : keep))) {
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
    ['building.library', ['region.main', 'region.gate', 'region.back'], 1],
    ['building.cave_abode', ['region.back'], 1],
    ['building.training', ['region.outer', 'region.main'], 1],
    ['building.ancestral', ['region.main'], 1],
    ['building.council', ['region.gate', 'region.main'], 1],
    ['building.beast_garden', ['region.valley', 'region.back'], 1],
    ['building.talisman', ['region.back', 'region.main'], route === 'craft' ? 2 : 1],
    ['building.mine', ['region.fire', 'region.outer'], route === 'craft' ? 2 : 1],
    ['building.forge', ['region.fire', 'region.main'], route === 'craft' ? 1 : 0],
  ];
  if (coreFocus) wanted.splice(0, wanted.length, ['building.cave_abode', ['region.back'], 1], ['building.array', ['region.back', 'region.main'], 2]);
  for (const [defId, prefer, count] of wanted) {
    if (allByDef(s, defId).length >= count) continue;
    for (const regionId of prefer) {
      const opt = newBuildOptions(s, content, regionId).find((o) => o.def.id === defId);
      const keep = (opt?.cost.lingshi ?? 0) <= 100 ? reserve - lateSave : reserve;
      if (!opt || opt.blocked || (opt.cost.lingshi && s.resources.lingshi - opt.cost.lingshi < keep)) continue;
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
  // 準備結丹時石木夠用就改打零工，多攢靈石
  const saving = (coreFocus && s.resources.lingshi < 300) || !!guardianGoal;
  const quarry = saving && s.resources.stone >= 150 ? 0 : Math.min(cap.quarry, Math.max(0, Math.floor((n - field) / 4)));
  const lumber = saving && s.resources.wood >= 150 ? 0 : Math.min(cap.lumber, Math.max(0, Math.floor((n - field - quarry) / 4)));
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
  const anyFoundation = [p, ...s.disciples].some((c) => c.realm.major !== 'qi' && !(c.realm.stage === 4 && c.xp >= xpToNext(c.realm)));
  const needCore =
    s.recipes.includes('recipe.core_liquid') && p.realm.major === 'foundation' && p.realm.stage >= 3 && s.resources.pill_core < 1;
  // 主角結丹後，替煉氣圓滿的內門弟子備築基丹
  const discipleFoundation =
    p.realm.major === 'core' &&
    s.recipes.includes('recipe.foundation_pill') &&
    s.resources.pill_foundation < 1 &&
    s.disciples.some((d) => readyForFoundation(d));
  const lateRecipe = late && canAfford(s.resources, late) ? late.recipe : undefined;
  const recipeId = lateRecipe
    ? lateRecipe
    : needFoundation || (discipleFoundation && s.resources.herb >= 10)
    ? 'recipe.foundation_pill'
    : needCore && s.resources.spirit_herb >= 10 && s.resources.ore >= 5 && s.resources.lingshi >= 100
      ? 'recipe.core_liquid'
    : s.resources.pill_heal < 4
      ? 'recipe.heal_pill'
      : anyFoundation && s.recipes.includes('recipe.peiyuan_pill') && s.resources.spirit_herb >= (needCore ? 13 : 3) && s.resources.pill_peiyuan < 6
        ? 'recipe.peiyuan_pill'
        : 'recipe.qi_pill';
  const keep = needFoundation || (p.realm.major === 'qi' && p.realm.stage >= 8) ? (recipeId === 'recipe.foundation_pill' ? 0 : 10) : 0;
  if (alchemist && (s.furnaces[0]?.recipeId !== recipeId || (s.furnaces[0]?.keep ?? 0) !== keep || s.furnaces[0]?.alchemistId !== alchemist.id)) {
    s = tryCmd(s, content, { type: 'setFurnace', index: 0, alchemistId: alchemist.id, recipeId, repeat: true, keep });
  }

  // 符案與器爐：再由閒置內門負責
  if (coreFocus || needCore) {
    // 存靈石準備結丹：停掉符案與器爐
    for (const station of ['talisman', 'forge'] as const) {
      const cur = benchList(s, station)[0];
      if (cur?.recipeId) s = tryCmd(s, content, { type: 'setFurnace', station, index: 0, alchemistId: null, recipeId: null, repeat: false, keep: 0 });
    }
  } else if (benchCount(s, content, 'talisman') > 0) {
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
  if (!coreFocus && !needCore && benchCount(s, content, 'forge') > 0) {
    const cur = benchList(s, 'forge')[0];
    const worker = cur?.alchemistId ? s.disciples.find((d) => d.id === cur.alchemistId) : free()[0];
    const fRecipe = s.recipes.includes('recipe.artifact_beast') && s.resources.beast_mat >= (guardianGoal?.beast_mat ?? 0) + 2 ? 'recipe.artifact_beast' : 'recipe.artifact_ore';
    if (worker && (cur?.recipeId !== fRecipe || cur?.alchemistId !== worker.id)) {
      s = tryCmd(s, content, { type: 'setFurnace', station: 'forge', index: 0, alchemistId: worker.id, recipeId: fRecipe, repeat: true, keep: 0 });
    }
  }

  // 丹藥
  for (const c of [s.protagonist, ...s.disciples]) {
    const capped = c.xp >= xpToNext(c.realm) && (c.realm.major === 'qi' ? c.realm.stage === 9 : c.realm.stage === 4);
    const want = !capped && (s.resources.pill_qi > 0 || (c.realm.major !== 'qi' && s.resources.pill_peiyuan > 0));
    if (c.takePill !== want) s = tryCmd(s, content, { type: 'setTakePill', characterId: c.id, value: want });
  }

  // 突破
  if (!breakthroughOdds(s, content, s.protagonist).blocked) {
    if (s.protagonist.seclusion) s = tryCmd(s, content, { type: 'interruptSeclusion' });
    s = tryCmd(s, content, { type: 'setSchedule', characterId: p.id, schedule: 'breakthrough' });
    note('主角嘗試突破');
  }
  if (p.realm.major === 'core') {
    for (const d of s.disciples) {
      if (s.resources.pill_foundation < 1 || !readyForFoundation(d) || d.schedule !== 'cultivate') continue;
      if (d.seat !== p.seat) s = tryCmd(s, content, { type: 'setSeat', characterId: d.id, regionId: p.seat });
      if (breakthroughOdds(s, content, d).blocked) continue;
      s = tryCmd(s, content, { type: 'setSchedule', characterId: d.id, schedule: 'breakthrough' });
      note(`${d.name}嘗試築基`);
      break;
    }
  }

  // 探索：依序挑戰下一個未通關的秘境（主角達到建議實力時）
  const pro = s.protagonist;
  const nextRealm = REALM_PLAN.find(([id]) => !(s.realmClears[id] ?? 0));
  const ready = nextRealm && powerLevel(pro.realm) >= nextRealm[1] && !(pro.realm.major === 'qi' && pro.realm.stage === 9 && pro.xp > 0);
  if (nextRealm && ready && !s.exploredThisMonth && pro.schedule !== 'breakthrough' && !pro.injuryMonths && pro.health >= 80) {
    if (pro.seclusion) s = tryCmd(s, content, { type: 'interruptSeclusion' });
    const team = [s.protagonist, ...s.disciples]
      .filter((c) => !canJoinExpedition(s, c) && !isCraftSchedule(c.schedule))
      .sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm))
      .slice(0, 5);
    if (team.length >= Math.min(3, 1 + s.disciples.length)) {
      const rows = Object.fromEntries(team.map((c, i) => [c.id, i < 2 ? 'front' : 'back'] as const));
      let e = tryCmd(s, content, { type: 'startExploration', realmId: nextRealm[0], teamIds: team.map((c) => c.id), rows });
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
        note(`探索${content.secretRealms.get(nextRealm[0])?.name}：${e.exploration?.status}`);
        s = tryCmd(e, content, { type: 'exploreClose' });
      }
    }
  }

  // 派遣：閒置內門組隊去最難、成功率夠高的已通關秘境
  const idle = s.disciples.filter((d) => d.schedule === 'cultivate' && !d.injuryMonths && !Object.values(s.positions).includes(d.id));
  if (idle.length >= 2) {
    for (const [realmId] of [...REALM_PLAN].reverse()) {
      const teamIds = idle.slice(0, 3).map((d) => d.id);
      if (dispatchBlocked(s, content, realmId, teamIds)) continue;
      if (dispatchOdds(s, content, realmId, teamIds).bp < 7000) continue;
      const before = s;
      s = tryCmd(s, content, { type: 'dispatch', realmId, teamIds });
      if (s !== before) {
        note(`派遣${content.secretRealms.get(realmId)?.name}`);
        break;
      }
    }
  }

  // 職位：煉丹執事給掌爐的人；庶務、外事給庶務最高的閒人；三人以上時設傳功
  const holders = () => Object.values(s.positions).filter(Boolean) as string[];
  const furnaceWorker = s.furnaces[0]?.alchemistId;
  if (!s.positions.alchemy && furnaceWorker && s.disciples.some((d) => d.id === furnaceWorker) && !holders().includes(furnaceWorker)) {
    s = tryCmd(s, content, { type: 'setPosition', position: 'alchemy', characterId: furnaceWorker });
  }
  for (const pos of ['steward', 'envoy', 'mentor'] as const) {
    if (s.positions[pos] || (pos === 'mentor' && s.disciples.length < 4)) continue;
    const pick = s.disciples
      .filter((d) => !holders().includes(d.id))
      .sort((a, b) => (pos === 'mentor' ? powerLevel(b.realm) - powerLevel(a.realm) : b.skills.affairs - a.skills.affairs))[0];
    if (pick && (pos === 'mentor' || s.disciples.length >= 3)) s = tryCmd(s, content, { type: 'setPosition', position: pos, characterId: pick.id });
  }

  // 法器：獨特法器給主角，制式法器依序給沒有法器的人
  for (const id of [...s.armory]) {
    const def = content.equipment.get(id);
    const cur = s.protagonist.equipment ? content.equipment.get(s.protagonist.equipment) : undefined;
    const target = !cur || (def && def.atk + def.def > cur.atk + cur.def) ? s.protagonist : s.disciples.find((d) => !d.equipment || d.equipment === COMMON_EQUIPMENT);
    if (target && !(s.exploration?.status === 'active')) s = tryCmd(s, content, { type: 'equip', characterId: target.id, itemId: id });
  }
  for (const c of [s.protagonist, ...s.disciples]) {
    if (s.resources.artifact < 1) break;
    if (!c.equipment) s = tryCmd(s, content, { type: 'equip', characterId: c.id, itemId: COMMON_EQUIPMENT });
  }

  // 靈獸：能孵就孵；沒有主人的去採集，沒有靈獸的人優先領養出戰
  if (!hatchBlocked(s, content)) {
    s = tryCmd(s, content, { type: 'hatchBeast' });
    note('孵化靈獸');
  }
  // 護宗神獸：資源夠就晉升第一隻成年靈獸，之後再供奉升級
  if (guardianGoal && !guardianBeast(s)) {
    const adult = s.beasts.find((b) => b.stage === 'adult' && !ascendBlocked(s, content, b.id));
    if (adult) {
      s = tryCmd(s, content, { type: 'ascendGuardian', beastId: adult.id });
      note(`晉升護宗神獸：${adult.name}`);
    }
  } else if (guardianGoal && !raiseBlocked(s)) {
    s = tryCmd(s, content, { type: 'raiseGuardian' });
    note('供奉護宗神獸');
  }
  for (const b of s.beasts) {
    if (b.ownerId || b.guardian) continue;
    const owner = [s.protagonist, ...s.disciples].find((c) => !s.beasts.some((x) => x.ownerId === c.id));
    if (owner && b.stage === 'adult') s = tryCmd(s, content, { type: 'setBeast', beastId: b.id, ownerId: owner.id, task: 'follow' });
    else if (b.task !== 'gather') s = tryCmd(s, content, { type: 'setBeast', beastId: b.id, ownerId: null, task: 'gather' });
  }

  // 大比：派最強的三人
  if (s.tournament?.status === 'open') {
    const team = [s.protagonist, ...s.disciples]
      .filter((c) => !canJoinExpedition(s, c) && !isCraftSchedule(c.schedule) && c.schedule !== 'breakthrough')
      .sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm))
      .slice(0, 3)
      .map((c) => c.id);
    if (!tournamentBlocked(s, team)) {
      const r = applyCommand(s, content, { type: 'enterTournament', teamIds: team });
      if (r.ok) {
        s = r.state;
        note(r.message ?? '參加大比');
      }
    }
  }

  // 靈脈競標：靈石寬裕時出價一次
  if (s.auction && !s.auction.playerBid && s.resources.lingshi > 600) s = tryCmd(s, content, { type: 'bidAuction', amount: 200 });

  // 主角：築基後功法未小成且有藏經閣時去研究，否則閉關
  const me = s.protagonist;
  const needInsight = atMajorThreshold(me) && me.insight < (me.realm.major === 'core' ? 300 : me.realm.major === 'nascent' ? 400 : 0);
  const wantResearch = ((me.realm.major === 'foundation' && me.insight < 100) || needInsight) && libraryResearch(s, content) !== null;
  if (wantResearch && (me.schedule === 'cultivate' || me.schedule === 'seclusion')) {
    if (me.seclusion) s = tryCmd(s, content, { type: 'interruptSeclusion' });
    s = tryCmd(s, content, { type: 'setSchedule', characterId: me.id, schedule: 'research' });
  } else if (!wantResearch && me.schedule === 'research') {
    s = tryCmd(s, content, { type: 'setSchedule', characterId: me.id, schedule: 'cultivate' });
  }
  if (s.protagonist.schedule === 'cultivate' && !s.protagonist.injuryMonths) {
    s = tryCmd(s, content, { type: 'setSchedule', characterId: s.protagonist.id, schedule: 'seclusion', months: 6 });
  }
  return s;
}
