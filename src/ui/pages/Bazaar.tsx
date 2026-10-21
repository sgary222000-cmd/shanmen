import { useState } from 'react';
import { balance } from '../../content/balance';
import { monthIndex } from '../../engine';
import {
  activeAffairs,
  affairName,
  availableRep,
  exchangeOffers,
  grandAuctionBlocked,
  lotName,
  nextGrandAuctionYear,
  orderBlocked,
  orderGear,
  orderName,
  tierOpen,
  treasureName,
  treasuryBlocked,
} from '../../engine/systems/economy/bazaar';
import { gearDesc, qualityDef } from '../../engine/systems/talent/gear';
import { content, useGame, useUi } from '../store';

// 0.12.0 中期擴充批次三的坊市分頁：時事、聲望兌換、珍寶閣、拍賣會、收購單。

const B = balance.bazaar;

/** 委託榜上方：今年的時事。 */
export function AffairsBanner() {
  const game = useGame();
  const list = activeAffairs(game);
  return (
    <div className="panel small" data-testid="affairs">
      <b>今年時事：</b>
      {list.length ? (
        list.map((a) => (
          <span key={a.id} data-testid={`affair-${a.id}`}>
            <span className="tag gold">{affairName(a.id)}</span>
            {a.realmId && `（${content.secretRealms.get(a.realmId)?.name ?? ''}）`} {B.affairs.list[a.id]?.desc}。{' '}
          </span>
        ))
      ) : (
        <span className="muted">無（每年一月擲出新的時事）</span>
      )}
    </div>
  );
}

const TIER_ORDER = ['early', 'mid', 'late'] as const;

export function ExchangeTab() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const offers = exchangeOffers(game, content);
  return (
    <div className="panel" data-testid="exchange">
      <h3>聲望兌換</h3>
      <p className="small">
        可用聲望 <b data-testid="rep-available">{availableRep(game)}</b>（聲望 {game.reputation}，已兌換 {game.bazaar?.repSpent ?? 0}）。聲望達標就開放下一階段，兌換只扣可用聲望；每樣東西每年限量，一月補貨。
      </p>
      {TIER_ORDER.map((tier) => {
        const t = B.exchange.tiers[tier];
        const lock = tierOpen(game, tier);
        return (
          <div key={tier} data-testid={`tier-${tier}`}>
            <h4>
              {t.name}
              <span className={lock ? 'tag locked' : 'tag gold'}>{lock ?? '已開放'}</span>
            </h4>
            <table className="small">
              <tbody>
                {offers
                  .filter((o) => o.tier === tier)
                  .map((o) => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td>聲望 {o.cost}</td>
                      <td className="muted">{o.id.startsWith('recipe:') ? '' : `今年還能換 ${o.left} 次`}</td>
                      <td>
                        <button
                          className="btn small"
                          data-testid={`ex-${o.id}`}
                          disabled={!!o.blocked}
                          title={o.blocked}
                          onClick={() => dispatch({ type: 'exchange', offerId: o.id })}
                        >
                          兌換
                        </button>
                        {o.blocked && !lock && <span className="muted"> {o.blocked}</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="muted small">遊戲會記下歷代最高的聲望（目前 {Math.max(game.bazaar?.repBest ?? 0, game.reputation)}），飛升上界時換成開局獎勵。</p>
    </div>
  );
}

export function TreasuryTab() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const blocked = treasuryBlocked(game);
  const goods = game.bazaar?.treasury.year === game.date.year ? game.bazaar.treasury.goods : [];
  return (
    <div className="panel" data-testid="treasury">
      <h3>珍寶閣</h3>
      <p className="small muted">每年一月換 {B.treasury.slots} 件貨，每件只有一個。{blocked && <b>{blocked}。</b>}</p>
      {!blocked && !goods.length && <p className="muted small">下個月起開始進貨。</p>}
      <table className="small">
        <tbody>
          {goods.map((g) => (
            <tr key={g.id} data-testid={`treasure-${g.id}`}>
              <td>{g.gear ? <span className={`tag q-${g.gear.quality}`}>{treasureName(content, g)}</span> : treasureName(content, g)}</td>
              <td className="muted">{g.gear ? gearDesc(content, g.gear) : ''}</td>
              <td>{g.price} 靈石</td>
              <td>
                <button
                  className="btn small"
                  data-testid={`buy-treasure-${g.id}`}
                  disabled={g.sold || game.resources.lingshi < g.price}
                  onClick={() => dispatch({ type: 'buyTreasure', goodId: g.id })}
                >
                  {g.sold ? '已售出' : '買下'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BidRow({ lotId, reserve, current }: { lotId: string; reserve: number; current: number }) {
  const dispatch = useUi((s) => s.dispatch);
  const [amount, setAmount] = useState(Math.max(reserve, current + 100));
  return (
    <span className="row small">
      <input
        type="number"
        min={reserve}
        step={100}
        value={amount}
        style={{ width: '6em' }}
        data-testid={`bid-amount-${lotId}`}
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <button className="btn small" data-testid={`bid-${lotId}`} onClick={() => dispatch({ type: 'bidGrandAuction', lotId, amount })}>
        出價
      </button>
    </span>
  );
}

export function GrandAuctionTab() {
  const game = useGame();
  const a = game.bazaar?.grandAuction;
  const blocked = grandAuctionBlocked(game);
  return (
    <div className="panel" data-testid="grand-auction">
      <h3>拍賣會</h3>
      <p className="small muted">
        每 {balance.tournament.intervalYears} 年一次，大比隔年 {B.grandAuction.month} 月開拍、下個月開標。每件出一次暗標，跟財力最雄厚的 {B.grandAuction.bidders}{' '}
        個宗門競價，價高者得；出價先預扣，沒得標全數退還。
        {blocked ? <b> {blocked}。</b> : !a && ` 下一場：第 ${nextGrandAuctionYear(game)} 年 ${B.grandAuction.month} 月。`}
      </p>
      {a && (
        <>
          <p className="small">{a.deadline > monthIndex(game.date) ? '下個月底開標。' : '本月月底開標。'}</p>
          <table className="small">
            <tbody>
              {a.lots.map((l) => (
                <tr key={l.id} data-testid={`lot-${l.id}`}>
                  <td>
                    {l.gear ? <span className={`tag q-${l.gear.quality}`}>{lotName(content, l)}</span> : lotName(content, l)}
                    {l.gear && <div className="muted">{gearDesc(content, l.gear)}</div>}
                  </td>
                  <td>底價 {l.reserve}</td>
                  <td>我宗出價 {l.playerBid || '—'}</td>
                  <td>
                    <BidRow lotId={l.id} reserve={l.reserve} current={l.playerBid} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function BuyOrderTab() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const o = game.bazaar?.buyOrder;
  const blocked = orderBlocked(game, content);
  const gear = orderGear(game, content);
  return (
    <div className="panel" data-testid="buy-order">
      <h3>收購單</h3>
      <p className="small muted">
        每季（1、4、7、10 月）有一個鄰宗開出收購單，出價是坊市行情的 {B.buyOrders.pricePct[0]}–{B.buyOrders.pricePct[1]}%，期限 {B.buyOrders.months} 個月；交貨時對方好感 +
        {B.buyOrders.favor}。不算在每月委託件數裡。
      </p>
      {o ? (
        <div>
          <p>
            <b>{content.sects.get(o.sectId)?.name}</b>收購 <b>{orderName(content, o)}</b>，出價 <b>{o.lingshi}</b> 靈石，
            {o.expires > monthIndex(game.date) ? `剩 ${o.expires - monthIndex(game.date) + 1} 個月` : '本月截止'}。
          </p>
          {o.slot && gear.length > 0 && (
            <p className="small muted">
              會交出：{gear.map((g) => `${qualityDef(g.quality).name}${content.equipment.get(g.defId)?.name ?? ''}`).join('、')}
            </p>
          )}
          <button className="btn small gold" data-testid="fulfill-order" disabled={!!blocked} title={blocked} onClick={() => dispatch({ type: 'fulfillOrder' })}>
            交貨
          </button>
          {blocked && <span className="muted small"> {blocked}</span>}
        </div>
      ) : (
        <p className="muted small">目前沒有收購單{game.buildings.some((b) => b.defId === 'building.market') ? '' : '（要先建坊市）'}。</p>
      )}
    </div>
  );
}
