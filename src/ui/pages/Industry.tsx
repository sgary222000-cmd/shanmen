import { useEffect, useState } from 'react';
import { balance } from '../../content/balance';
import { monthsUntilEmpty, planMonth, type OuterDisciples, type Station } from '../../engine';
import { RESOURCE_IDS, RESOURCE_NAMES } from '../../engine/resources';
import { benchCount, benchList, benchRoom, STATION_INFO, STATIONS } from '../../engine/systems/buildings/buildings';
import { allCharacters } from '../../engine/systems/characters/characters';
import { jobCapacity, OUTER_JOB_NAMES, OUTER_JOBS } from '../../engine/systems/characters/outer';
import { SCHEDULE_NAMES } from '../../engine/systems/characters/schedule';
import { craftOdds } from '../../engine/systems/economy/flows';
import { SKILL_NAMES } from '../components/CharacterPanel';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

/** 收支表一定列出的資源（P0 就有的八種）；批次 B 的新資源有庫存或有收支時才列出。 */
const BASIC = ['lingshi', 'food', 'stone', 'wood', 'herb', 'pill_qi', 'pill_heal', 'pill_foundation'];

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
            <th className="num">工坊期望</th>
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
            if (!BASIC.includes(id) && !game.resources[id] && !used && !made && !exp) return null;
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
        消耗依序扣除：糧食 → 建築維護 → 築基丹 → 修煉丹藥 → 煉丹、煉器、製符材料；不足的項目停工，不會產生負庫存。
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
  const total = OUTER_JOBS.reduce((n, k) => n + jobs[k], 0);
  const free = game.outer.count - game.outer.labor;
  return (
    <div className="panel">
      <h3>外門分工（共 {game.outer.count} 人）</h3>
      <p className="muted small">藥園、靈礦場的工位要先蓋好建築才會出現。</p>
      <table>
        <tbody>
          {OUTER_JOBS.filter((k) => cap[k] > 0 || jobs[k] > 0 || ['field', 'quarry', 'lumber', 'errand'].includes(k)).map((k) => (
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
            <td>{Math.max(0, free - total)}</td>
            <td className="muted small">未分工者修煉，提高培養度</td>
          </tr>
        </tbody>
      </table>
      <div className="row">
        <button className="btn" data-testid="apply-jobs" disabled={total > free} onClick={() => dispatch({ type: 'setOuterJobs', jobs })}>
          套用分工
        </button>
        {total > free && <span className="neg small">分工人數超過可用外門人數</span>}
        {game.outer.labor > 0 && <span className="muted small">另有 {game.outer.labor} 人本月外出做勞務委託</span>}
      </div>
    </div>
  );
}

const STATION_HINT: Record<Station, string> = {
  alchemy: '尚未建成煉丹房（需要大殿 2 級）。煉丹是宗門通用功能，不限傳承。',
  forge: '尚未建成煉器坊（需要大殿 2 級；主峰或地火峰）。',
  talisman: '尚未建成符陣閣（需要大殿 1 級；主峰或後山）。',
};

function Workshop({ station }: { station: Station }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const info = STATION_INFO[station];
  const count = benchCount(game, content, station);
  const plan = planMonth(game, content);
  const prefix = station === 'alchemy' ? 'furnace' : station;
  if (!count) {
    return (
      <div className="panel">
        <h3>{info.room}</h3>
        <p className="muted">{STATION_HINT[station]}</p>
      </div>
    );
  }
  const people = allCharacters(game);
  const known = game.recipes.filter((id) => content.recipes.get(id)?.station === station);
  const list = benchList(game, station);
  return (
    <div className="panel" data-testid={`station-${station}`}>
      <h3>{info.room}</h3>
      {Array.from({ length: count }, (_, i) => {
        const f = list[i] ?? { alchemistId: null, recipeId: null, repeat: true };
        const fp = plan.furnaces.find((x) => x.station === station && x.index === i);
        const set = (patch: Partial<typeof f>) => {
          const next = { ...f, ...patch };
          dispatch({
            type: 'setFurnace',
            station,
            index: i,
            alchemistId: next.alchemistId,
            recipeId: next.recipeId,
            repeat: next.repeat,
            keep: next.keep ?? 0,
          });
        };
        const odds = f.recipeId && f.alchemistId ? craftOdds(game, content, station, f.recipeId, f.alchemistId, i) : null;
        return (
          <div key={i} className="row" style={{ marginBottom: '.5rem', flexWrap: 'wrap' }}>
            <b>
              {info.bench} {i + 1}
              <span className="muted small">（{content.regions.get(benchRoom(game, content, station, i)?.region ?? '')?.name}）</span>
            </b>
            {info.worker}：
            <select value={f.alchemistId ?? ''} data-testid={`${prefix}-${i}-alchemist`} onChange={(e) => set({ alchemistId: e.target.value || null })}>
              <option value="">（無）</option>
              {people.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}（{SKILL_NAMES[info.skill]} {c.skills[info.skill]}）
                </option>
              ))}
            </select>
            配方：
            <select value={f.recipeId ?? ''} data-testid={`${prefix}-${i}-recipe`} onChange={(e) => set({ recipeId: e.target.value || null })}>
              <option value="">（無）</option>
              {known.map((id) => (
                <option key={id} value={id}>
                  {content.recipes.get(id)?.name}
                </option>
              ))}
            </select>
            <label>
              <input type="checkbox" checked={f.repeat} onChange={(e) => set({ repeat: e.target.checked })} /> 重複製作
            </label>
            <label className="small" title="做完後任何材料（靈石除外）會低於這個數量就停工，避免把突破要用的材料用光">
              保留材料
              <input
                type="number"
                min={0}
                style={{ width: '4.5em' }}
                value={f.keep ?? 0}
                data-testid={`${prefix}-${i}-keep`}
                onChange={(e) => set({ keep: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              />
            </label>
            {f.recipeId && f.alchemistId && odds && (
              <span className="small">
                {info.odds} {odds.bp / 100}%<span className="muted">（{odds.parts.join('・')}）</span>・材料{' '}
                <ResList value={content.recipes.get(f.recipeId)?.inputs ?? {}} />→ <ResList value={content.recipes.get(f.recipeId)?.outputs ?? {}} />
                {fp && !fp.runs && <span className="neg">（{fp.reason}）</span>}
              </span>
            )}
          </div>
        );
      })}
      <p className="muted small">
        {info.worker}者本月行程改為{SCHEDULE_NAMES[info.schedule]}，修煉效率降低。已知配方：
        {known.map((r) => content.recipes.get(r)?.name).join('、') || '無'}。
        {station !== 'alchemy' && '更多配方可在坊市購買。'}
      </p>
    </div>
  );
}

export function IndustryPage() {
  return (
    <div>
      <h2>產業</h2>
      <Ledger />
      <OuterJobs />
      {STATIONS.map((st) => (
        <Workshop key={st} station={st} />
      ))}
    </div>
  );
}
