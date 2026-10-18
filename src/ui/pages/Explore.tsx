import { isCraftSchedule } from '../../engine/systems/buildings/buildings';
import { useState } from 'react';
import type { BattleRecord, Row } from '../../engine';
import { allCharacters, realmName } from '../../engine/systems/characters/characters';
import { canJoinExpedition, retreatPct } from '../../engine/systems/exploration/exploration';
import { Art } from '../components/Art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

// 戰報中有圖的敵人（同種只顯示一張）
function EnemyArt({ units }: { units: BattleRecord['enemies'] }) {
  const defs = [...new Set(units.map((u) => u.id.split('#')[0] ?? ''))]
    .map((id) => content.enemies.get(id))
    .filter((d) => d?.art);
  if (!defs.length) return null;
  return (
    <div className="enemy-art">
      {defs.map((d) => d && <Art key={d.id} path={d.art!} alt={d.name} />)}
    </div>
  );
}

export function BattleView({ b, open }: { b: BattleRecord; open?: boolean }) {
  const [full, setFull] = useState(!!open);
  const label = { win: '勝利', lose: '戰敗', draw: '平局（撤出）' }[b.result];
  return (
    <div className="panel" data-testid="battle">
      <h3>
        {b.title}：<span className={b.result === 'win' ? 'pos' : 'neg'}>{label}</span>
        <span className="muted small">（{b.rounds} 回合）</span>
      </h3>
      <div className="grid two">
        {[
          ['我方', b.allies],
          ['敵方', b.enemies],
        ].map(([title, units]) => (
          <div key={title as string}>
            <b>{title as string}</b>
            {title === '敵方' && <EnemyArt units={units as BattleRecord['enemies']} />}
            {(units as BattleRecord['allies']).map((u) => (
              <div key={u.id} className="small">
                {u.name} {u.hp}/{u.maxHp}
                <div className="bar hp">
                  <div style={{ width: `${(u.hp * 100) / u.maxHp}%` }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <ul className="small">
        {b.highlights.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ul>
      <button className="btn small secondary" onClick={() => setFull(!full)}>
        {full ? '收起完整紀錄' : '查看完整紀錄'}
      </button>
      {full && (
        <div className="log">
          {b.log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActiveRun() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const run = game.exploration;
  if (!run) return null;
  const realm = content.secretRealms.get(run.realmId);
  const node = realm?.nodes.find((n) => n.id === run.nodeId);
  if (!realm || !node) return null;
  const chosen = !!run.choices[node.id];
  const needsChoice = !!node.choices && !chosen;
  const lastBattle = game.battles[0];
  const finished = run.status !== 'active';
  return (
    <div>
      <div className="panel">
        <h3>
          {realm.name}・{node.title}
        </h3>
        <div className="node-path small">
          {run.visited.map((id, i) => {
            const n = realm.nodes.find((x) => x.id === id);
            return (
              <span key={i} className={`n ${id === run.nodeId ? 'here' : 'done'}`}>
                {n?.title}
              </span>
            );
          })}
        </div>
        <p>{node.text}</p>
        <div className="row small">
          隊伍：
          {run.teamIds.map((id) => {
            const c = allCharacters(game).find((x) => x.id === id);
            return (
              <span key={id} className="tag">
                {c?.name} 生命 {run.hp[id]}
              </span>
            );
          })}
          ・回春丹 {game.resources.pill_heal}
        </div>
        <p className="small">
          目前收穫：<ResList value={run.loot} />（撤退保留 {retreatPct(game, content, realm)}%，戰敗全部失去）
        </p>
        {!finished && (
          <div className="row">
            {needsChoice &&
              node.choices?.map((ch) => (
                <button key={ch.id} className="btn" onClick={() => dispatch({ type: 'exploreChoice', choiceId: ch.id })}>
                  {ch.label}
                  {ch.hpLossPct ? `（全隊損失 ${ch.hpLossPct}% 生命）` : ''}
                </button>
              ))}
            {!needsChoice &&
              node.next.map((id) => {
                const n = realm.nodes.find((x) => x.id === id);
                const danger = n?.enemies?.length ? `（敵人 ${n.enemies.length}）` : '';
                return (
                  <button key={id} className="btn" data-testid={`go-${id}`} onClick={() => dispatch({ type: 'exploreMove', nodeId: id })}>
                    前往：{n?.title}
                    {danger}
                  </button>
                );
              })}
            <button className="btn danger" data-testid="retreat" onClick={() => dispatch({ type: 'exploreRetreat' })}>
              撤退
            </button>
          </div>
        )}
        {finished && (
          <div>
            <p>
              <b>{{ completed: '探索完成', retreated: '已撤退', defeated: '探索失敗' }[run.status as 'completed']}</b>
              ：帶回的物資會在本月結算時入庫。
            </p>
            <button className="btn" data-testid="explore-close" onClick={() => dispatch({ type: 'exploreClose' })}>
              返回
            </button>
          </div>
        )}
      </div>
      <div className="panel">
        <h3>探索紀錄</h3>
        <div className="log">
          {run.log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
      {lastBattle && lastBattle.title.startsWith(realm.name) && <BattleView b={lastBattle} />}
    </div>
  );
}

function Prepare() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const realm = content.secretRealms.get('secret.abandoned_cave');
  const [team, setTeam] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  if (!realm) return null;
  const people = allCharacters(game);
  const clears = game.realmClears[realm.id] ?? 0;
  const toggle = (id: string) => setTeam(team.includes(id) ? team.filter((x) => x !== id) : [...team, id].slice(0, realm.maxTeam));
  return (
    <div>
      <div className="grid two">
        <Art path={realm.art} alt={realm.name} />
        <div className="panel">
          <h3>
            {realm.name} {clears > 0 && <span className="tag gold">已通關 {clears} 次</span>}
          </h3>
          <p className="small">{realm.description}</p>
          <p className="small">已知風險：{realm.risk}</p>
          <p className="small">
            補給：<ResList value={realm.supplies} />
            ・隊伍最多 {realm.maxTeam} 人
          </p>
          {clears > 0 && <p className="small muted">再次進入時節點物資減為 {realm.repeatLootPct}%，首次通關獎勵不會重複。秘境派遣於 P1 開放。</p>}
        </div>
      </div>
      <div className="panel">
        <h3>組隊</h3>
        {game.exploredThisMonth && <p className="neg">本月已經探索過，請推進月份後再來。</p>}
        <table>
          <tbody>
            {people.map((c) => {
              const reason = canJoinExpedition(game, c);
              return (
                <tr key={c.id}>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        data-testid={`team-${c.id}`}
                        disabled={!!reason}
                        checked={team.includes(c.id)}
                        onChange={() => toggle(c.id)}
                      />{' '}
                      {c.name}
                    </label>
                  </td>
                  <td>{realmName(c.realm)}</td>
                  <td>健康 {c.health}</td>
                  <td>
                    <select value={rows[c.id] ?? 'front'} onChange={(e) => setRows({ ...rows, [c.id]: e.target.value as Row })}>
                      <option value="front">前排</option>
                      <option value="back">後排</option>
                    </select>
                  </td>
                  <td className="muted small">{reason ?? (isCraftSchedule(c.schedule) ? '出發後會離開工坊' : '')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">前排有人時，敵人只能攻擊前排。出發的人本月行程改為探索，不能閉關或在工坊工作。</p>
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={game.strategy.useHealPill}
              onChange={(e) => dispatch({ type: 'setStrategy', useHealPill: e.target.checked, focusLowest: game.strategy.focusLowest })}
            />{' '}
            生命低於 40% 時服用回春丹（庫存 {game.resources.pill_heal}）
          </label>
          <label>
            <input
              type="checkbox"
              checked={game.strategy.focusLowest}
              onChange={(e) => dispatch({ type: 'setStrategy', useHealPill: game.strategy.useHealPill, focusLowest: e.target.checked })}
            />{' '}
            優先攻擊生命最低的敵人
          </label>
          <label>
            <input
              type="checkbox"
              checked={game.strategy.useTalismans}
              data-testid="use-talismans"
              onChange={(e) =>
                dispatch({ type: 'setStrategy', useHealPill: game.strategy.useHealPill, focusLowest: game.strategy.focusLowest, useTalismans: e.target.checked })
              }
            />{' '}
            每場戰鬥開始各用一張護身符、火符（庫存 {game.resources.talisman_guard}／{game.resources.talisman_fire}）
          </label>
        </div>
        <button
          className="btn gold"
          style={{ marginTop: '.5rem' }}
          data-testid="explore-start"
          disabled={!team.length || game.exploredThisMonth}
          onClick={() => dispatch({ type: 'startExploration', realmId: realm.id, teamIds: team, rows })}
        >
          出發探索
        </button>
      </div>
      <p className="muted small">其他秘境（古修遺跡、靈獸山谷、地下靈礦等）於 P1 開放。</p>
    </div>
  );
}

export function ExplorePage() {
  const game = useGame();
  return (
    <div>
      <h2>探索</h2>
      {game.exploration ? <ActiveRun /> : <Prepare />}
    </div>
  );
}
