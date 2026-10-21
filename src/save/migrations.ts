// 存檔升版遷移。每次世界狀態格式改變：STATE_VERSION +1，並在這裡加入一支「舊版 → 新版」函式。
// 讀到舊存檔時依序執行；遷移前原檔會另存為升版前備份（見 storage.ts）。

import { emptyBazaar } from '../engine/systems/economy/bazaar';
import { content } from '../content/registry';
import { balance } from '../content/balance';
import type { GameDate, GameState } from '../engine';
import { monthIndex } from '../engine/date';
import { refreshBoard } from '../engine/systems/commissions/commissions';
import { emptyMarket, rollMarket } from '../engine/systems/economy/market';
import { RESOURCE_IDS } from '../engine/resources';
import { seedState } from '../engine/rng';
import { emptyPositions } from '../engine/systems/talent/positions';
import { initialSects } from '../engine/systems/world/sects';
import { initialSites } from '../engine/systems/world/diplomacy';

type World = Record<string, unknown>;

export const migrations: Record<number, (w: World) => World> = {
  // v1 → v2：加入山下商隊交易紀錄與自動戰鬥策略。
  // （v1 是 P0 開發初期的格式，保留這支遷移作為遷移流程的實際範例與測試對象。）
  1: (w) => ({
    ...w,
    version: 2,
    trade: { soldLingshi: 0, boughtFood: 0 },
    strategy: { useHealPill: true, focusLowest: true },
  }),
  // v2 → v3（P1 批次 A）：區域、建築所在區域、修煉地點、技藝擴充、靈獸。
  // P0 的建築全部算在主峰，照常運作；傳承保留原本的劍修。
  2: (w) => {
    const skills = (c: Record<string, unknown>) => ({
      forging: 0,
      talisman: 0,
      beast: 0,
      affairs: 0,
      ...(c.skills as Record<string, number>),
    });
    const person = (c: Record<string, unknown>) => ({ ...c, skills: skills(c), seat: c.seat ?? 'region.main' });
    return {
      ...w,
      version: 3,
      protagonist: person(w.protagonist as Record<string, unknown>),
      disciples: (w.disciples as Record<string, unknown>[]).map(person),
      buildings: (w.buildings as Record<string, unknown>[]).map((b) => ({ ...b, region: b.region ?? 'region.main' })),
      regions: {
        'region.main': { status: 'open', construction: null },
        'region.outer': { status: 'open', construction: null },
        'region.valley': { status: 'locked', construction: null },
        'region.fire': { status: 'locked', construction: null },
        'region.back': { status: 'locked', construction: null },
        'region.gate': { status: 'locked', construction: null },
      },
      beasts: [],
    };
  },
  // v3 → v4（P1 批次 B）：新資源、藥園與靈礦場的分工、煉器與製符工坊、坊市、委託榜、聲望。
  // 新的亂數流由既有的 world 流狀態衍生，同一份存檔升級結果固定；傳承開局配方補進已學配方。
  3: (w) => {
    const resources = Object.fromEntries(RESOURCE_IDS.map((id) => [id, (w.resources as Record<string, number>)[id] ?? 0]));
    const outer = w.outer as Record<string, unknown>;
    const rngs = w.rng as Record<string, [number, number, number, number]>;
    const world = rngs.world ?? [1, 2, 3, 4];
    const lineage = content.lineages.get(w.lineage as string);
    const recipes = new Set(w.recipes as string[]);
    for (const r of content.recipes.values()) if (r.knownAtStart) recipes.add(r.id);
    for (const r of lineage?.start.recipes ?? []) recipes.add(r);
    const next = {
      ...w,
      version: 4,
      resources,
      outer: { ...outer, jobs: { garden: 0, mine: 0, ...(outer.jobs as Record<string, number>) }, labor: 0 },
      workshops: { forge: [], talisman: [] },
      market: emptyMarket(),
      commissions: [],
      reputation: 0,
      recipes: [...recipes],
      rng: {
        ...rngs,
        market: seedState((world[0] ^ 0x6d61726b) >>> 0),
        commission: seedState((world[1] ^ 0x636f6d6d) >>> 0),
      },
      strategy: { useTalismans: true, ...(w.strategy as Record<string, boolean>) },
    } as unknown as GameState;
    rollMarket(next);
    refreshBoard(next, content);
    return next as unknown as World;
  },
  // v4 → v5（P1 批次 C、D、E）：專長、功法領悟、法器欄、職位、靈獸成長與安排、傳承分支、
  // 秘境派遣、電腦宗門、大比、靈脈競標。舊的靈獸視為幼年、隨主人出戰；新亂數流由 world 流衍生。
  4: (w) => {
    const person = (c: Record<string, unknown>) => ({ specialty: null, insight: 0, equipment: null, ...c });
    const rngs = w.rng as Record<string, [number, number, number, number]>;
    const world = rngs.world ?? [1, 2, 3, 4];
    const resources = Object.fromEntries(RESOURCE_IDS.map((id) => [id, (w.resources as Record<string, number>)[id] ?? 0]));
    return {
      ...w,
      version: 5,
      resources,
      protagonist: person(w.protagonist as Record<string, unknown>),
      disciples: (w.disciples as Record<string, unknown>[]).map(person),
      beasts: (w.beasts as Record<string, unknown>[]).map((b) => ({ stage: 'young', growth: 0, task: 'follow', ...b })),
      positions: emptyPositions(),
      armory: [],
      items: [],
      branches: [],
      dispatches: [],
      sects: initialSects(content),
      intel: [],
      tournament: null,
      auction: null,
      veins: [],
      rng: {
        ...rngs,
        beast: seedState((world[2] ^ 0x62656173) >>> 0),
        sects: seedState((world[3] ^ 0x73656374) >>> 0),
      },
    };
  },
  // v5 → v6（P2 批次 A）：新資源延壽丹；壽元、親傳弟子、歷代掌門都是選填欄位，舊存檔不需要補。
  5: (w) => {
    const resources = Object.fromEntries(RESOURCE_IDS.map((id) => [id, (w.resources as Record<string, number>)[id] ?? 0]));
    return { ...w, version: 6, resources, heirId: null, ancestors: [] };
  },
  // v6 → v7（P2 批次 B）：新資源凝嬰丹、化神丹；境界多了元嬰、化神，舊資料不需要改。
  6: (w) => {
    const resources = Object.fromEntries(RESOURCE_IDS.map((id) => [id, (w.resources as Record<string, number>)[id] ?? 0]));
    return { ...w, version: 7, resources };
  },
  // v7 → v8（P2 批次 C）：各宗補上信任與條約欄位、加入三個遠方勢力、資源據點。
  7: (w) => {
    const fresh = initialSects(content);
    const old = (w.sects as Record<string, unknown>[]).map((s) => ({
      trust: fresh.find((f) => f.id === s.id)?.trust ?? 20,
      treaty: null,
      ...s,
    }));
    const added = fresh.filter((f) => !old.some((s) => (s as { id?: string }).id === f.id));
    return { ...w, version: 8, sects: [...old, ...added], sites: initialSites() };
  },
  // 0.7.x → 0.8.0（P2 批次 D）：戰事、吞併整合費
  8: (w) => ({ ...w, version: 9, wars: [], integrations: [] }),
  // 0.8.x → 0.9.0（P2 批次 E）：宗門試煉紀錄；已有的附屬從現在起算 30 年期滿
  9: (w) => {
    const until = monthIndex(w.date as GameDate) + balance.war.vassalYears * 12;
    const sects = (w.sects as Record<string, unknown>[]).map((s) => (s.vassal && s.vassalUntil === undefined ? { ...s, vassalUntil: until } : s));
    return { ...w, version: 10, sects, trials: {} };
  },
  // 0.10.x → 0.11.0（中期擴充批次二）：新資源（屬性丹、控制符、稀有素材）；裝備改成三格、法器每件個別存放（舊的都算凡品）
  10: (w) => {
    let next = (w.nextId as number) ?? 1;
    const item = (defId: string) => ({ id: `g${next++}`, defId, quality: 'common', subs: [] });
    const slotOf = (defId: string) => content.equipment.get(defId)?.slot ?? 'weapon';
    const person = (c: Record<string, unknown>) => {
      const { equipment, ...rest } = c;
      const gear: Record<string, unknown> = {};
      if (typeof equipment === 'string' && content.equipment.has(equipment)) gear[slotOf(equipment)] = item(equipment);
      return { ...rest, gear };
    };
    const resources = Object.fromEntries(RESOURCE_IDS.map((id) => [id, (w.resources as Record<string, number>)[id] ?? 0]));
    const protagonist = person(w.protagonist as Record<string, unknown>);
    const disciples = (w.disciples as Record<string, unknown>[]).map(person);
    const armory = ((w.armory as unknown[]) ?? []).filter((x): x is string => typeof x === 'string' && content.equipment.has(x)).map(item);
    return { ...w, version: 11, resources, protagonist, disciples, armory, nextId: next };
  },
  // 0.11.x → 0.12.0（中期擴充批次三）：聲望兌換、時事、珍寶閣、拍賣會、收購單；可用聲望從目前的聲望開始
  11: (w) => ({ ...w, version: 12, bazaar: { ...emptyBazaar(), repBest: (w.reputation as number) ?? 0 } }),
};

export function migrate(world: World, from: number, to: number): World {
  let w = world;
  for (let v = from; v < to; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`缺少存檔遷移：v${v} → v${v + 1}`);
    w = step(w);
  }
  return w;
}
