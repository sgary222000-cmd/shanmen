import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { monthIndex, STATE_VERSION, type GameState } from '../../src/engine';
import {
  affairWeight,
  applyAffairs,
  availableRep,
  exchangeOffers,
  maybeBuyOrder,
  maybeOpenGrandAuction,
  nextGrandAuctionYear,
  onCommissionDone,
  resolveGrandAuction,
  restockTreasury,
  rollAffairs,
} from '../../src/engine/systems/economy/bazaar';
import { sellPrice } from '../../src/engine/systems/economy/market';
import type { Commission } from '../../src/engine/types';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, roomy, run, tryRun } from './helpers';

// 0.12.0：時事委託、聲望兌換、珍寶閣、拍賣會、收購單、v11 → v12 存檔升級。

const B = balance.bazaar;

/** 坊市 level 級、大殿 hall 級的宗門。 */
function withMarket(level = 2, hall = 3, seed = 1): GameState {
  return edit(developed(seed), (s) => {
    const h = s.buildings.find((b) => b.defId === 'building.hall');
    if (h) h.level = hall;
    s.buildings.push({ id: 'b190', defId: 'building.market', region: 'region.gate', level, status: 'active', construction: null });
  });
}

const setAffair = (s: GameState, id: string, realmId?: string) =>
  edit(s, (x) => {
    x.bazaar.affairs = [{ id, until: monthIndex(x.date) + 11, ...(realmId ? { realmId } : {}) }];
  });

const def = (id: string) => {
  const d = content.commissions.get(id);
  if (!d) throw new Error(id);
  return d;
};

const fakeCommission = (templateId: string, over: Partial<Commission> = {}): Commission =>
  ({ id: 'cm1', templateId, kind: 'deliver', reward: { lingshi: 100 }, deliver: { pill_heal: 4 }, expires: 9999, ...over }) as Commission;

describe('時事', () => {
  it('一月擲出 1–2 件時事；沒坊市不會擲到商路大開、沒通關秘境不會擲到秘境異動', () => {
    let two = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = developed(seed);
      const lines: string[] = [];
      rollAffairs(s, content, lines);
      expect(s.bazaar.affairs.length).toBeGreaterThanOrEqual(1);
      expect(s.bazaar.affairs.length).toBeLessThanOrEqual(2);
      if (s.bazaar.affairs.length === 2) two++;
      expect(s.bazaar.affairs.map((a) => a.id)).not.toContain('trade');
      expect(s.bazaar.affairs.map((a) => a.id)).not.toContain('realm_shift');
      expect(lines[0]).toContain('今年時事');
      expect(s.bazaar.affairs[0]?.until).toBe(monthIndex(s.date) + B.affairs.months - 1);
    }
    expect(two).toBeGreaterThan(0);
    expect(two).toBeLessThan(25);
  });

  it('時事委託只在時事期間出現；相關委託權重提高', () => {
    const s = developed();
    expect(affairWeight(s, def('commission.beast_tide'))).toBe(0);
    expect(affairWeight(s, def('commission.food'))).toBe(1);
    const tide = setAffair(s, 'beast_tide');
    expect(affairWeight(tide, def('commission.beast_tide'))).toBe(B.affairs.weightMult);
    const famine = setAffair(s, 'famine');
    expect(affairWeight(famine, def('commission.food'))).toBe(B.affairs.weightMult);
    expect(affairWeight(famine, def('commission.war_fire'))).toBe(0);
  });

  it('疫病：回春丹委託報酬加倍、數量多一半，並指定委託宗門；完成時好感上升', () => {
    const s = setAffair(developed(), 'plague');
    const c = fakeCommission('commission.pill_heal');
    applyAffairs(s, content, def('commission.pill_heal'), c);
    expect(c.reward.lingshi).toBe(200);
    expect(c.deliver?.pill_heal).toBe(6);
    expect(c.sectId).toBeDefined();
    const sect = s.sects.find((x) => x.id === c.sectId);
    const favor = sect?.favor ?? 0;
    const text = onCommissionDone(s, content, c);
    expect(text).toContain('好感');
    expect(sect?.favor).toBe(Math.min(balance.diplomacy.maxFavor, favor + B.affairs.favor));
  });

  it('時事改變坊市行情：獸潮壓低獸材收購價、歉收拉高糧價', () => {
    const s = developed();
    expect(sellPrice(setAffair(s, 'beast_tide'), 'beast_mat')).toBeLessThan(sellPrice(s, 'beast_mat'));
    expect(sellPrice(setAffair(s, 'famine'), 'food')).toBeGreaterThan(sellPrice(s, 'food'));
  });

  it('推進到一月會擲新時事', () => {
    let s = edit(developed(), (x) => {
      x.date = { year: 3, month: 12 };
    });
    s = advance(s);
    expect(s.date).toEqual({ year: 4, month: 1 });
    expect(s.bazaar.affairs.length).toBeGreaterThan(0);
  });
});

describe('聲望兌換', () => {
  it('聲望與大殿等級達標才開放；兌換扣可用聲望，聲望本身不減', () => {
    let s = edit(withMarket(1, 2), (x) => {
      x.reputation = 150;
    });
    expect(exchangeOffers(s, content).find((o) => o.id === 'ex.heal')?.blocked).toContain('聲望達 200');
    s = edit(s, (x) => {
      x.reputation = 300;
    });
    const heal = s.resources.pill_heal;
    s = run(s, { type: 'exchange', offerId: 'ex.heal' });
    expect(s.resources.pill_heal).toBe(heal + 5);
    expect(s.reputation).toBe(300);
    expect(availableRep(s)).toBe(260);
    expect(exchangeOffers(s, content).find((o) => o.id === 'ex.core')?.blocked).toContain('聲望達 1000');
  });

  it('每年限量、永久屬性丹一年只能換一顆，隔年補回', () => {
    let s = edit(withMarket(1, 3), (x) => {
      x.reputation = 5000;
    });
    s = run(s, { type: 'exchange', offerId: 'ex.earthfire' });
    s = run(s, { type: 'exchange', offerId: 'ex.earthfire' });
    expect(tryRun(s, { type: 'exchange', offerId: 'ex.earthfire' }).ok).toBe(false);
    s = run(s, { type: 'exchange', offerId: 'ex.ape' });
    const eye = tryRun(s, { type: 'exchange', offerId: 'ex.eye' });
    expect(eye.ok).toBe(false);
    s = edit(s, (x) => {
      x.date = { year: x.date.year + 1, month: 1 };
    });
    expect(tryRun(s, { type: 'exchange', offerId: 'ex.eye' }).ok).toBe(true);
    expect(tryRun(s, { type: 'exchange', offerId: 'ex.earthfire' }).ok).toBe(true);
  });

  it('化神丹每 5 年一次；法器兌換放進庫房且品質不低於標示', () => {
    let s = edit(withMarket(1, 4), (x) => {
      x.reputation = 9000;
    });
    s = run(s, { type: 'exchange', offerId: 'ex.deity' });
    expect(s.resources.pill_deity).toBe(1);
    s = edit(s, (x) => {
      x.date = { year: x.date.year + 4, month: 1 };
    });
    expect(exchangeOffers(s, content).find((o) => o.id === 'ex.deity')?.blocked).toContain('每 5 年');
    s = edit(s, (x) => {
      x.date = { year: x.date.year + 1, month: 1 };
    });
    s = run(s, { type: 'exchange', offerId: 'ex.deity' });
    expect(s.resources.pill_deity).toBe(2);
    s = run(s, { type: 'exchange', offerId: 'ex.gear_rare' });
    expect(['rare', 'immortal']).toContain(s.armory.at(-1)?.quality);
  });

  it('坊市有賣的配方可以用原價一半的聲望換', () => {
    let s = edit(withMarket(1, 2), (x) => {
      x.reputation = 5000;
    });
    const offer = exchangeOffers(s, content).find((o) => o.id.startsWith('recipe:'));
    expect(offer).toBeDefined();
    if (!offer) return;
    const recipe = content.recipes.get(offer.id.slice(7));
    expect(offer.cost).toBe(Math.ceil((recipe?.marketPrice ?? 0) / 2));
    s = run(s, { type: 'exchange', offerId: offer.id });
    expect(s.recipes).toContain(recipe?.id);
    expect(exchangeOffers(s, content).some((o) => o.id === offer.id)).toBe(false);
  });
});

describe('珍寶閣', () => {
  it('坊市 2 級才開；每年進 4 件貨，一件只能買一次', () => {
    const low = withMarket(1);
    restockTreasury(low, content);
    expect(low.bazaar.treasury.goods).toHaveLength(0);
    let s = edit(withMarket(2), (x) => {
      x.resources.lingshi = 50000;
    });
    restockTreasury(s, content);
    expect(s.bazaar.treasury.goods).toHaveLength(B.treasury.slots);
    const g = s.bazaar.treasury.goods[0];
    if (!g) return;
    const before = s.resources.lingshi;
    s = run(s, { type: 'buyTreasure', goodId: g.id });
    expect(s.resources.lingshi).toBe(before - g.price);
    expect(tryRun(s, { type: 'buyTreasure', goodId: g.id }).ok).toBe(false);
    // 同一年不會再換貨
    const ids = s.bazaar.treasury.goods.map((x) => x.id);
    restockTreasury(s, content);
    expect(s.bazaar.treasury.goods.map((x) => x.id)).toEqual(ids);
  });
});

describe('拍賣會', () => {
  it('大比隔年 9 月開拍三件；出價預扣；沒得標全數退還、得標拿到拍品', () => {
    let s = edit(roomy(withMarket(2, 3)), (x) => {
      x.date = { year: 4, month: 9 };
      x.resources.lingshi = 20000;
    });
    expect(nextGrandAuctionYear(s)).toBe(4);
    const lines: string[] = [];
    maybeOpenGrandAuction(s, content, lines);
    const a = s.bazaar.grandAuction;
    expect(a?.lots).toHaveLength(3);
    if (!a) return;
    const [gear, second, mats] = a.lots;
    if (!gear || !second || !mats) return;
    s = run(s, { type: 'bidGrandAuction', lotId: gear.id, amount: 9999 });
    s = run(s, { type: 'bidGrandAuction', lotId: mats.id, amount: mats.reserve });
    expect(s.resources.lingshi).toBe(20000 - 9999 - mats.reserve);
    expect(tryRun(s, { type: 'bidGrandAuction', lotId: second.id, amount: second.reserve - 1 }).ok).toBe(false);
    // 讓電腦宗門必定出價高過底價：給足靈石
    s = edit(s, (x) => {
      for (const sect of x.sects) sect.resources.lingshi = 10_000;
    });
    const armory = s.armory.length;
    s = advance(s);
    expect(s.date.month).toBe(10);
    s = advance(s);
    expect(s.bazaar.grandAuction).toBeNull();
    expect(s.armory.length).toBe(armory + 1);
    expect(s.reports.some((r) => r.lines.some((l) => l.includes('我宗以 9999 靈石標得')))).toBe(true);
  });

  it('不是拍賣年、坊市不夠都不會開拍', () => {
    const off = edit(withMarket(2, 3), (x) => {
      x.date = { year: 5, month: 9 };
    });
    maybeOpenGrandAuction(off, content, []);
    expect(off.bazaar.grandAuction).toBeNull();
    const low = edit(withMarket(1, 3), (x) => {
      x.date = { year: 4, month: 9 };
    });
    maybeOpenGrandAuction(low, content, []);
    expect(low.bazaar.grandAuction).toBeNull();
    expect(nextGrandAuctionYear(edit(low, (x) => (x.date = { year: 4, month: 10 })))).toBe(7);
  });

  it('沒得標退還出價', () => {
    const s = edit(withMarket(2, 3), (x) => {
      x.date = { year: 4, month: 9 };
      x.resources.lingshi = 5000;
      for (const sect of x.sects) sect.resources.lingshi = 1_000_000;
    });
    maybeOpenGrandAuction(s, content, []);
    const lot = s.bazaar.grandAuction?.lots[2];
    if (!lot || !s.bazaar.grandAuction) return;
    lot.playerBid = lot.reserve;
    s.resources.lingshi -= lot.reserve;
    // 電腦宗門出價下限是底價 70%，上限 190%；連跑幾個種子至少有一次輸標
    s.bazaar.grandAuction.deadline = monthIndex(s.date);
    const lines: string[] = [];
    resolveGrandAuction(s, content, lines);
    const won = lines.some((l) => l.includes('我宗以'));
    expect(s.resources.lingshi).toBe(won ? 5000 - lot.reserve : 5000);
  });
});

describe('收購單', () => {
  it('季初有坊市就開單；交貨拿靈石與好感；過期就消失', () => {
    let s = edit(withMarket(1), (x) => {
      x.date = { year: 3, month: 4 };
    });
    maybeBuyOrder(s, content, []);
    const o = s.bazaar.buyOrder;
    expect(o).not.toBeNull();
    if (!o) return;
    expect(o.expires).toBe(monthIndex(s.date) + 2);
    // 換成固定的回春丹收購，方便驗證
    s = edit(s, (x) => {
      x.bazaar.buyOrder = { ...o, resource: 'pill_heal', slot: undefined, amount: 10, lingshi: 500 };
      x.resources.pill_heal = 12;
    });
    const sect = s.sects.find((x) => x.id === o.sectId);
    const before = s.resources.lingshi;
    s = run(s, { type: 'fulfillOrder' });
    expect(s.resources.pill_heal).toBe(2);
    expect(s.resources.lingshi).toBe(before + 500);
    expect(s.sects.find((x) => x.id === o.sectId)?.favor).toBe(Math.min(balance.diplomacy.maxFavor, (sect?.favor ?? 0) + B.buyOrders.favor));
    expect(s.bazaar.buyOrder).toBeNull();

    const late = edit(s, (x) => {
      x.bazaar.buyOrder = { ...o, expires: monthIndex(x.date) - 1 };
      x.date = { year: 3, month: 5 };
    });
    const lines: string[] = [];
    maybeBuyOrder(late, content, lines);
    expect(late.bazaar.buyOrder).toBeNull();
    expect(lines[0]).toContain('過期');
  });

  it('收購價高於坊市行情；不夠貨不能交', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = edit(withMarket(1, 2, seed), (x) => {
        x.date = { year: 3, month: 1 };
        x.resources.pill_heal = 0;
        x.resources.pill_qi = 0;
        x.resources.pill_peiyuan = 0;
        x.resources.talisman_fire = 0;
        x.resources.talisman_guard = 0;
      });
      maybeBuyOrder(s, content, []);
      const o = s.bazaar.buyOrder;
      if (!o) continue;
      if (o.resource) {
        const g = balance.market.goods[o.resource];
        if (g) expect(o.lingshi).toBeGreaterThanOrEqual(Math.floor((sellPrice(s, o.resource) * o.amount * 150) / 100 / g.lot));
      }
      expect(tryRun(s, { type: 'fulfillOrder' }).ok).toBe(false);
    }
  });
});

describe('存檔', () => {
  it('0.11.x 的存檔升級：補上坊市新欄位，歷代最高聲望取目前聲望，推進一年不出錯', () => {
    const v11 = JSON.parse(readFileSync('tests/fixtures/save-v11-mid2.json', 'utf8'));
    const r = decode(v11);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(11);
    const s = r.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.bazaar.repSpent).toBe(0);
    expect(s.bazaar.repBest).toBe(s.reputation);
    expect(availableRep(s)).toBe(s.reputation);
    const later = advance(s, 12);
    expect(later.bazaar.affairs.length).toBeGreaterThan(0);
    expect(Object.values(later.resources).every((v) => v >= 0)).toBe(true);
  });
});
