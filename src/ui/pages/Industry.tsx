import { useEffect, useState } from 'react';
import { balance } from '../../content/balance';
import { monthsUntilEmpty, planMonth, type OuterDisciples } from '../../engine';
import { RESOURCE_IDS, RESOURCE_NAMES } from '../../engine/resources';
import { furnaceCount } from '../../engine/systems/buildings/buildings';
import { allCharacters } from '../../engine/systems/characters/characters';
import { jobCapacity, OUTER_JOB_NAMES } from '../../engine/systems/characters/outer';
import { alchemyOdds } from '../../engine/systems/economy/flows';
import { furnaceRoom } from '../../engine/systems/buildings/buildings';
import { priceText, SELLABLE, sellCap, type Sellable } from '../../engine/systems/economy/trade';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

function Ledger() {
  const game = useGame();
  const plan = planMonth(game, content);
  return (
    <div className="panel" data-testid="ledger">
      <h3>本月收支預覽</h3>
      <table>
        <thead>
          <tr>
            <th>資源</th>
            <th className="num">庫存</th>
            <th className="num">消耗</th>
            <th className="num">產出</th>
            <th className="num">煉丹期望</th>
            <th className="num">淨變化</th>
            <th>預計耗盡</th>
          </tr>
        </thead>
        <tbody>
          {RESOURCE_IDS.map((id) => {
            const used = plan.consumption[id] ?? 0;
            const made = plan.production[id] ?? 0;
            const exp = plan.expected[id] ?? 0;
            const net = made + exp - used;
            const empty = monthsUntilEmpty(game, plan, id);
            return (
              <tr key={id}>
                <td>{RESOURCE_NAMES[id]}</td>
                <td className="num">{game.resources[id]}</td>
                <td className="num">{used ? `-${used}` : ''}</td>
                <td className="num">{made ? `+${made}` : ''}</td>
                <td className="num">{exp ? `≈+${exp}` : ''}</td>
                <td className={`num ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}`}>{net > 0 ? `+${net}` : net || ''}</td>
                <td>{empty === null ? '' : empty === 0 ? <span className="neg">本月</span> : `約 ${empty} 個月後`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        消耗依序扣除：糧食 → 建築維護 → 築基丹 → 聚氣丹 → 煉丹材料；不足的項目停工，不會產生負庫存。
        本月產出在月底入庫，下個月才能使用。糧食需求 {plan.foodNeed}。
      </p>
      {plan.notes.length > 0 && (
        <ul className="small">
          {plan.notes.map((n, i) => (
            <li key={i} className="neg">
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OuterJobs() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [jobs, setJobs] = useState<OuterDisciples['jobs']>(game.outer.jobs);
  useEffect(() => setJobs(game.outer.jobs), [game.outer.jobs]);
  const cap = jobCapacity(game, content);
  const total = jobs.field + jobs.quarry + jobs.lumber + jobs.errand;
  return (
    <div className="panel">
      <h3>外門分工（共 {game.outer.count} 人）</h3>
      <table>
        <tbody>
          {(['field', 'quarry', 'lumber', 'errand'] as const).map((k) => (
            <tr key={k}>
              <td>{OUTER_JOB_NAMES[k]}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={Number.isFinite(cap[k]) ? cap[k] : game.outer.count}
                  value={jobs[k]}
                  data-testid={`job-${k}`}
                  disabled={cap[k] === 0}
                  onChange={(e) => setJobs({ ...jobs, [k]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                />
              </td>
              <td className="muted small">
                {cap[k] === 0
                  ? '需要先建造對應建築'
                  : Number.isFinite(cap[k])
                    ? `工位 ${cap[k]}`
                    : `每人每月靈石 ${balance.outer.errandLingshi}`}
              </td>
            </tr>
          ))}
          <tr>
            <td>{OUTER_JOB_NAMES.cultivate}</td>
            <td>{Math.max(0, game.outer.count - total)}</td>
            <td className="muted small">未分工者修煉，提高培養度</td>
          </tr>
        </tbody>
      </table>
      <div className="row">
        <button className="btn" data-testid="apply-jobs" disabled={total > game.outer.count} onClick={() => dispatch({ type: 'setOuterJobs', jobs })}>
          套用分工
        </button>
        {total > game.outer.count && <span className="neg small">分工人數超過外門人數</span>}
      </div>
    </div>
  );
}

function Furnaces() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const count = furnaceCount(game, content);
  const plan = planMonth(game, content);
  if (!count) {
    return (
      <div className="panel">
        <h3>煉丹房</h3>
        <p className="muted">尚未建成煉丹房（需要大殿 2 級）。煉丹是宗門通用功能，不限傳承。</p>
      </div>
    );
  }
  const people = allCharacters(game);
  return (
    <div className="panel">
      <h3>煉丹房</h3>
      {Array.from({ length: count }, (_, i) => {
        const f = game.furnaces[i] ?? { alchemistId: null, recipeId: null, repeat: true };
        const fp = plan.furnaces.find((x) => x.index === i);
        const set = (patch: Partial<typeof f>) => {
          const next = { ...f, ...patch };
          dispatch({ type: 'setFurnace', index: i, alchemistId: next.alchemistId, recipeId: next.recipeId, repeat: next.repeat });
        };
        return (
          <div key={i} className="row" style={{ marginBottom: '.5rem' }}>
            <b>
              丹爐 {i + 1}
              <span className="muted small">（{content.regions.get(furnaceRoom(game, content, i)?.region ?? '')?.name}）</span>
            </b>
            掌爐：
            <select value={f.alchemistId ?? ''} data-testid={`furnace-${i}-alchemist`} onChange={(e) => set({ alchemistId: e.target.value || null })}>
              <option value="">（無）</option>
              {people.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（煉丹 {c.skills.alchemy}）
                </option>
              ))}
            </select>
            丹方：
            <select value={f.recipeId ?? ''} data-testid={`furnace-${i}-recipe`} onChange={(e) => set({ recipeId: e.target.value || null })}>
              <option value="">（無）</option>
              {game.recipes.map((id) => {
                const r = content.recipes.get(id);
                return (
                  <option key={id} value={id}>
                    {r?.name}
                  </option>
                );
              })}
            </select>
            <label>
              <input type="checkbox" checked={f.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> 重複煉製
            </label>
            {f.recipeId && f.alchemistId && (
              <span className="small">
                成丹率 {alchemyOdds(game, content, f.recipeId, f.alchemistId, i).bp / 100}%
                <span className="muted">（{alchemyOdds(game, content, f.recipeId, f.alchemistId, i).parts.join('・')}）</span>・材料{' '}
                <ResList value={content.recipes.get(f.recipeId)?.inputs ?? {}} />
                {fp && !fp.runs && <span className="neg">（{fp.reason}）</span>}
              </span>
            )}
          </div>
        );
      })}
      <p className="muted small">掌爐者本月行程改為煉丹，修煉效率降低。已知丹方：{game.recipes.map((r) => content.recipes.get(r)?.name).join('、')}。</p>
    </div>
  );
}

function Trade() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [res, setRes] = useState<Sellable>('stone');
  const [amount, setAmount] = useState(20);
  const [buy, setBuy] = useState(10);
  return (
    <div className="panel">
      <h3>山下商隊</h3>
      <p className="muted small">
        固定價格、每月限額，缺資源時的保底途徑。完整市場於 P1 開放。<span className="tag provisional">數值暫定</span>
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
        <span className="muted small">
          本月可買 {balance.trade.buyFoodCap - game.trade.boughtFood} 份
        </span>
      </div>
    </div>
  );
}

export function IndustryPage() {
  return (
    <div>
      <h2>產業</h2>
      <Ledger />
      <div className="grid two">
        <OuterJobs />
        <Trade />
      </div>
      <Furnaces />
    </div>
  );
}
