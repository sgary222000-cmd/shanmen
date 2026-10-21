import { useState } from 'react';
import { balance } from '../../content/balance';
import { monthIndex, type Commission, type ResourceId } from '../../engine';
import { RESOURCE_NAMES } from '../../engine/resources';
import { allCharacters } from '../../engine/systems/characters/characters';
import { commissionBlocked, commissionReward, escortOdds, idleOuter, reputationRecruitBonus } from '../../engine/systems/commissions/commissions';
import {
  buyPrice,
  demandLeft,
  discountPct,
  MARKET_GOODS,
  marketOpen,
  recipesForSale,
  sellPrice,
  stockLeft,
} from '../../engine/systems/economy/market';
import { priceText, SELLABLE, sellCap, type Sellable } from '../../engine/systems/economy/trade';
import { canJoinExpedition } from '../../engine/systems/exploration/exploration';
import { AutoToggle } from '../components/AutoToggle';
import { ResList } from '../components/Res';
import { useTabs } from '../components/Layout';
import { content, useGame, useUi } from '../store';

const KIND_NAMES = { labor: '勞務', deliver: '交付', escort: '護衛' } as const;

function CommissionCard({ c }: { c: Commission }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const max = Math.min(c.workers ?? 0, idleOuter(game));
  const [workers, setWorkers] = useState(max);
  const [team, setTeam] = useState<string[]>([]);
  const blocked = commissionBlocked(game, c);
  const left = c.expires - monthIndex(game.date) + 1;
  const people = allCharacters(game);
  const n = Math.min(workers || max, max);
  const reward = commissionReward(game, content, c, c.kind === 'labor' ? Math.max(1, n) : 0);
  return (
    <div className={`panel notice kind-${c.kind}`} data-testid={`commission-${c.templateId}`}>
      <span className="kind-stamp">{KIND_NAMES[c.kind]}</span>
      <h3>{c.title}</h3>
      <span className={`due ${left <= 1 ? 'soon' : ''}`}>{left <= 1 ? '本月截止' : `剩 ${left} 個月`}</span>
      <p className="small">{c.text}</p>
      {c.kind === 'labor' && (
        <p className="small">
          最多派 {c.workers} 名閒置外門（目前閒置 {idleOuter(game)} 人）。每人報酬：<ResList value={c.reward} />
        </p>
      )}
      {c.kind === 'deliver' && (
        <p className="small">
          交出：<ResList value={c.deliver ?? {}} />
        </p>
      )}
      {c.kind === 'escort' && (
        <p className="small">
          敵人：{(c.enemies ?? []).map((e) => content.enemies.get(e)?.name ?? e).join('、')}・隊伍最多 {c.maxTeam} 人・出戰者本月行程改為外出
        </p>
      )}
      <p className="small">
        報酬：<ResList value={reward} />
        {c.kind === 'labor' && n > 1 && `（${n} 人）`}・聲望 +{c.reputation}
        {c.guard && (content.lineages.get(game.lineage)?.bonuses.guardRewardPct ?? 0) > 0 && <span className="tag gold">劍修護衛加成</span>}
      </p>
      {c.kind === 'labor' && (
        <div className="row small">
          派出
          <input
            type="number"
            min={1}
            max={max}
            value={n}
            data-testid={`workers-${c.templateId}`}
            onChange={(e) => setWorkers(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
          />
          人
        </div>
      )}
      {c.kind === 'escort' && (
        <div className="row small" style={{ flexWrap: 'wrap' }}>
          {people.map((p) => {
            const reason = canJoinExpedition(game, p);
            return (
              <label key={p.id} title={reason}>
                <input
                  type="checkbox"
                  disabled={!!reason}
                  checked={team.includes(p.id)}
                  data-testid={`team-${c.templateId}-${p.id}`}
                  onChange={(e) => setTeam(e.target.checked ? [...team, p.id] : team.filter((x) => x !== p.id))}
                />
                {p.name}
                {reason && <span className="muted">（{reason.replace(p.name, '')}）</span>}
              </label>
            );
          })}
        </div>
      )}
      <button
        className="btn small gold"
        disabled={!!blocked || (c.kind === 'escort' && (team.length === 0 || team.length > (c.maxTeam ?? 3)))}
        title={blocked}
        data-testid={`accept-${c.templateId}`}
        onClick={() =>
          dispatch(
            c.kind === 'labor'
              ? { type: 'acceptCommission', commissionId: c.id, workers: n }
              : c.kind === 'escort'
                ? { type: 'acceptCommission', commissionId: c.id, teamIds: team }
                : { type: 'acceptCommission', commissionId: c.id },
          )
        }
      >
        {c.kind === 'escort' ? '出發' : '接下'}
      </button>
      {blocked && <span className="muted small"> {blocked}</span>}
      {c.kind === 'escort' && team.length > 0 && !blocked && (
        <span className="small" data-testid={`escort-odds-${c.templateId}`}> 預估勝率 {escortOdds(game, content, c.id, team)}%</span>
      )}
    </div>
  );
}

function Board() {
  const game = useGame();
  return (
    <div>
      <p className="muted small">
        每月月底更新，榜上至少有一件勞務委託（只要有閒置的外門就能接）。接下即當場結算，報酬立即入庫。
        <span className="tag provisional">數值暫定</span>
      </p>
      <p className="small" data-testid="commissions-taken">
        本月已接 <b>{game.commissionsTaken ?? 0}</b> / {balance.commissions.maxPerMonth} 件委託。
      </p>
      <div className="grid three fill">
        {game.commissions.map((c) => (
          <CommissionCard key={c.id} c={c} />
        ))}
      </div>
      {game.commissions.length === 0 && <p className="muted">本月委託都接完了，下個月會有新委託。</p>}
      <AutoEscort />
    </div>
  );
}

/** 護衛委託自動出征：勾選名單與最低勝率。 */
function AutoEscort() {
  const game = useGame();
  const cur = game.auto?.escort;
  const [ids, setIds] = useState<string[]>(cur?.ids ?? []);
  const [minOdds, setMinOdds] = useState(cur?.minOdds ?? 70);
  return (
    <div className="panel" data-testid="auto-escort-panel">
      <h3>護衛委託自動出征</h3>
      <div className="row small" style={{ flexWrap: 'wrap' }}>
        {game.disciples.map((d) => (
          <label key={d.id}>
            <input
              type="checkbox"
              data-testid={`auto-escort-member-${d.id}`}
              checked={ids.includes(d.id)}
              onChange={(e) => setIds(e.target.checked ? [...ids, d.id].slice(0, 3) : ids.filter((x) => x !== d.id))}
            />
            {d.name}
          </label>
        ))}
        {!game.disciples.length && <span className="muted">還沒有內門弟子。</span>}
      </div>
      <div className="row small">
        預估勝率達到
        <select value={minOdds} onChange={(e) => setMinOdds(Number(e.target.value))} aria-label="最低勝率">
          {[50, 60, 70, 80, 90].map((v) => (
            <option key={v} value={v}>
              {v}%
            </option>
          ))}
        </select>
        才接
      </div>
      <AutoToggle kind="escort" config={{ ids, minOdds }} label="每月月初，榜上有護衛委託而且名單隊伍的預估勝率夠高時自動接一件（算在每月件數內）。" />
    </div>
  );
}

function MarketTable() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [lots, setLots] = useState<Partial<Record<ResourceId, number>>>({});
  if (!marketOpen(game, content)) {
    return (
      <div className="panel">
        <h3>坊市</h3>
        <p className="muted">
          尚未建成坊市。先修復山門（建設 → 山門），再在山門區建造坊市，就能按行情買賣各種物資與配方。
        </p>
      </div>
    );
  }
  const forSale = recipesForSale(game, content);
  return (
    <div className="panel" data-testid="market">
      <h3>坊市</h3>
      <p className="muted small">
        以「一批」為單位買賣；價格每月在基準價 ±30% 內浮動，買價比賣價高約 25%，貨量與收購量有限。
        {discountPct(game) > 0 && `聲望讓買價便宜 ${discountPct(game)}%。`}
        <span className="tag provisional">數值暫定</span>
      </p>
      {game.market.rumor && <p className="small gold" data-testid="market-rumor">消息：{game.market.rumor}</p>}
      <table>
        <thead>
          <tr>
            <th>商品</th>
            <th className="num">一批</th>
            <th className="num">行情</th>
            <th className="num">買價</th>
            <th className="num">賣價</th>
            <th className="num">可買</th>
            <th className="num">可賣</th>
            <th className="num">庫存</th>
            <th>批數</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {MARKET_GOODS.map((id) => {
            const def = balance.market.goods[id];
            const g = game.market.goods[id];
            if (!def || !g) return null;
            const n = lots[id] ?? 1;
            return (
              <tr key={id} data-testid={`good-${id}`}>
                <td>{RESOURCE_NAMES[id]}</td>
                <td className="num">{def.lot}</td>
                <td className={`num ${g.pct > 100 ? 'neg' : g.pct < 100 ? 'pos' : ''}`}>{g.pct}%</td>
                <td className="num">{buyPrice(game, id)}</td>
                <td className="num">{sellPrice(game, id)}</td>
                <td className="num">{stockLeft(game, content, id)}</td>
                <td className="num">{demandLeft(game, content, id)}</td>
                <td className="num">{game.resources[id]}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    style={{ width: '3.5em' }}
                    value={n}
                    data-testid={`lots-${id}`}
                    onChange={(e) => setLots({ ...lots, [id]: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                  />
                </td>
                <td>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn small" data-testid={`buy-${id}`} onClick={() => dispatch({ type: 'marketBuy', resource: id, lots: n })}>
                      買
                    </button>
                    <button
                      className="btn small secondary"
                      data-testid={`sell-${id}`}
                      onClick={() => dispatch({ type: 'marketSell', resource: id, lots: n })}
                    >
                      賣
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h3 style={{ marginTop: '.8rem' }}>配方</h3>
      {forSale.length === 0 ? (
        <p className="muted small">坊市販售的配方都已學會。</p>
      ) : (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {forSale.map((r) => (
            <span key={r.id} className="row small">
              {r.name}（{r.description}）
              <button
                className="btn small gold"
                disabled={game.resources.lingshi < (r.marketPrice ?? 0)}
                data-testid={`recipe-${r.id}`}
                onClick={() => dispatch({ type: 'buyRecipe', recipeId: r.id })}
              >
                {r.marketPrice} 靈石
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Caravan() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [res, setRes] = useState<Sellable>('stone');
  const [amount, setAmount] = useState(20);
  const [buy, setBuy] = useState(10);
  return (
    <div className="panel">
      <h3>山下商隊</h3>
      <p className="muted small">
        固定價格、每月限額，價錢比坊市差，但永遠可用，是缺資源時的保底途徑。<span className="tag provisional">數值暫定</span>
      </p>
      <div className="row">
        賣出
        <select value={res} onChange={(e) => setRes(e.target.value as Sellable)}>
          {SELLABLE.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_NAMES[r]}（{priceText(r)}）
            </option>
          ))}
        </select>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
        <button className="btn small" onClick={() => dispatch({ type: 'sell', resource: res, amount })}>
          賣出
        </button>
        <span className="muted small">
          本月收購額度 {sellCap(game, content) - game.trade.soldLingshi} / {sellCap(game, content)} 靈石
        </span>
      </div>
      <div className="row" style={{ marginTop: '.4rem' }}>
        以靈石
        <input type="number" min={1} value={buy} onChange={(e) => setBuy(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
        買糧食 {buy * balance.trade.foodPerLingshi}
        <button className="btn small" onClick={() => dispatch({ type: 'buyFood', lingshi: buy })}>
          買入
        </button>
        <span className="muted small">本月可買 {balance.trade.buyFoodCap - game.trade.boughtFood} 份</span>
      </div>
    </div>
  );
}

export function MarketPage() {
  const game = useGame();
  const recruit = reputationRecruitBonus(game);
  const { tab, bar } = useTabs([
    { id: 'board', label: <>委託榜 <small>{game.commissions.length}</small></> },
    { id: 'market', label: '坊市' },
    { id: 'caravan', label: '山下商隊' },
  ]);
  return (
    <div>
      <h2>坊市與委託</h2>
      <div className="stats">
        <div className="stat hl">
          <div className="k">聲望</div>
          <div className="v">{game.reputation}</div>
        </div>
        <div className="stat">
          <div className="k">招生外門</div>
          <div className="v">+{recruit}<small> 人</small></div>
          <div className="s">每 {balance.reputation.recruitPer} 聲望 +1，最多 +{balance.reputation.recruitMax}</div>
        </div>
        <div className="stat">
          <div className="k">坊市買價</div>
          <div className="v">−{discountPct(game)}<small>%</small></div>
          <div className="s">每 {balance.market.repPerDiscount} 聲望 −1%，最多 −{balance.market.maxDiscount}%</div>
        </div>
      </div>
      {bar}
      {tab === 'board' && <Board />}
      {tab === 'market' && <MarketTable />}
      {tab === 'caravan' && <Caravan />}
    </div>
  );
}
