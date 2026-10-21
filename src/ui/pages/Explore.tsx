import { isCraftSchedule } from '../../engine/systems/buildings/buildings';
import { useState } from 'react';
import { formatDate, type BattleRecord, type Row } from '../../engine';
import { allCharacters, findCharacter, powerLevel, realmName } from '../../engine/systems/characters/characters';
import { canJoinExpedition, nodeView, realmLocked, retreatPct } from '../../engine/systems/exploration/exploration';
import { dispatchBlocked, dispatchOdds, realmNodeLoot } from '../../engine/systems/exploration/dispatch';
import { scaleResources } from '../../engine/resources';
import { trialBlocked, trialOdds, trialUnavailable } from '../../engine/systems/exploration/trial';
import { balance } from '../../content/balance';
import { Art } from '../components/Art';
import { AutoToggle } from '../components/AutoToggle';
import { artUrl, portraitOf } from '../art';
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
        <span className="muted small">（{formatDate(b.date)}・{b.rounds} 回合）</span>
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
  const view = nodeView(realm, run, node);
  const chosen = !!run.choices[node.id];
  const needsChoice = !!view.choices && !chosen;
  const lastBattle = game.battles[0];
  const finished = run.status !== 'active';
  return (
    <div>
      <div className="room-head run-head">
        <Art path={realm.art} alt={realm.name} />
        <h3>
          {realm.name}・{view.title}
        </h3>
      </div>
      <div className="panel">
        <div className="node-path small">
          {run.visited.map((id, i) => {
            const n = realm.nodes.find((x) => x.id === id);
            return (
              <span key={i} className={`n ${id === run.nodeId ? 'here' : 'done'}`}>
                {n && nodeView(realm, run, n).title}
              </span>
            );
          })}
        </div>
        <p>{view.text}</p>
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
          {finished ? (
            <>
              帶回物資：<ResList value={run.loot} />（月底入庫）
            </>
          ) : (
            <>
              目前收穫：<ResList value={run.loot} />（撤退保留 {retreatPct(game, content, realm)}%，戰敗全部失去）
            </>
          )}
        </p>
        {!finished && (
          <div className="row">
            {needsChoice &&
              view.choices?.map((ch) => (
                <button key={ch.id} className="btn" data-testid={`choice-${ch.id}`} onClick={() => dispatch({ type: 'exploreChoice', choiceId: ch.id })}>
                  {ch.label}
                  {ch.hpLossPct ? `（全隊損失 ${ch.hpLossPct}% 生命）` : ''}
                </button>
              ))}
            {!needsChoice &&
              node.next.map((id) => {
                const n = realm.nodes.find((x) => x.id === id);
                const danger = n?.enemies?.length ? `（敵人 ${n.enemies.length}）` : n?.pool ? '（隨機事件）' : '';
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

function Dispatches() {
  const game = useGame();
  if (!game.dispatches.length) return null;
  return (
    <div className="panel" data-testid="dispatch-list">
      <h3>派遣中的小隊</h3>
      {game.dispatches.map((d) => (
        <p key={d.id} className="small">
          {content.secretRealms.get(d.realmId)?.name}：
          {d.teamIds.map((id) => allCharacters(game).find((c) => c.id === id)?.name).join('、')}，還要 {d.monthsLeft} 個月回來
        </p>
      ))}
    </div>
  );
}

function DispatchPanel({ realmId, team }: { realmId: string; team: string[] }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const realm = content.secretRealms.get(realmId);
  if (!realm || !(game.realmClears[realmId] ?? 0)) return null;
  const blocked = dispatchBlocked(game, content, realmId, team);
  const odds = team.length ? dispatchOdds(game, content, realmId, team) : null;
  const loot = realmNodeLoot(game, content, realmId);
  const [lo, hi] = realm.dispatch.lootPct;
  return (
    <div className="panel" data-testid="dispatch-panel">
      <h3>派遣小隊（已通關，自動結算）</h3>
      <p className="small">
        花 {realm.dispatch.months} 個月與補給 <ResList value={realm.supplies} />，帶回節點物資的 {lo}–{hi}%（約 <ResList value={scaleResources(loot, lo)} /> 到{' '}
        <ResList value={scaleResources(loot, hi)} />）。沒有首次通關獎勵。小隊實力不足時可能失手：收穫打折、隊員負傷 1 個月。
      </p>
      <p className="small">
        建議小隊實力 {realm.dispatch.power}
        {odds && (
          <>
            ・目前勾選的小隊實力 <b>{odds.power}</b>・成功率 <b>{odds.bp / 100}%</b>
          </>
        )}
      </p>
      <button
        className="btn"
        data-testid="dispatch-start"
        disabled={!!blocked}
        title={blocked}
        onClick={() => dispatch({ type: 'dispatch', realmId, teamIds: team })}
      >
        派遣勾選的隊員
      </button>
      {blocked && team.length > 0 && <span className="small neg"> {blocked}</span>}
      <p className="muted small">派遣用上面同一份勾選名單；派遣不算本月的探索，同月還能親自探索別的秘境。</p>
      <AutoToggle kind="dispatch" config={{ ids: team, realmId }} label={`小隊回來、養好傷後，自動再派往${realm.name}。`} />
    </div>
  );
}

function Prepare() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [realmId, setRealmId] = useState('secret.abandoned_cave');
  const realm = content.secretRealms.get(realmId);
  const [team, setTeam] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  if (!realm) return null;
  const people = allCharacters(game);
  const clears = game.realmClears[realm.id] ?? 0;
  const toggle = (id: string) => setTeam(team.includes(id) ? team.filter((x) => x !== id) : [...team, id].slice(0, realm.maxTeam));
  const strongest = team
    .map((id) => findCharacter(game, id))
    .filter((c) => !!c)
    .sort((a, b) => powerLevel(b.realm) - powerLevel(a.realm))[0];
  const underpowered =
    strongest && realm.recommendLevel && powerLevel(strongest.realm) < realm.recommendLevel ? `${strongest.name}（${realmName(strongest.realm)}）` : '';
  return (
    <div>
      <div className="realm-strip">
        {[...content.secretRealms.values()].map((r) => (
          <button key={r.id} className={`realm-card ${r.id === realmId ? 'on' : ''}`} data-testid={`realm-tab-${r.id}`} onClick={() => setRealmId(r.id)}>
            <Art path={r.art} alt="" />
            <span className="nm">{r.group ? `${r.group.name} 第 ${r.group.floor} 層` : r.name}</span>
            <span className="rc">{realmLocked(game, content, r) ? '未開放' : `建議實力 ${r.recommend}`}</span>
            {(game.realmClears[r.id] ?? 0) > 0 && <span className="cleared">已通關</span>}
          </button>
        ))}
      </div>
      <Dispatches />
      <div className="grid two realm-info">
        <Art path={realm.art} alt={realm.name} />
        <div className="panel">
          <h3>
            {realm.name} {clears > 0 && <span className="tag gold">已通關 {clears} 次</span>}
          </h3>
          <p className="small">{realm.description}</p>
          <p className="small">
            建議實力：<b>{realm.recommend}</b>
          </p>
          <p className="small">已知風險：{realm.risk}</p>
          {realmLocked(game, content, realm) && (
            <p className="neg small" data-testid="realm-locked">
              {realmLocked(game, content, realm)}才能進入。
            </p>
          )}
          <p className="small">
            首次通關：
            {[
              ...realm.firstClear.recipes.map((r) => `丹方「${content.recipes.get(r)?.name}」`),
              ...(realm.firstClear.openRegion ? [`開放${content.regions.get(realm.firstClear.openRegion)?.name}`] : []),
              ...realm.firstClear.equipment.map((e) => `法器「${content.equipment.get(e)?.name}」`),
              ...(realm.firstClear.items.length ? ['珍貴典籍或秘法'] : []),
              ...(realm.firstClear.insight ? [`隊員功法領悟 +${realm.firstClear.insight}`] : []),
            ].join('、')}
            {Object.keys(realm.firstClear.resources).length > 0 && (
              <>
                ・<ResList value={realm.firstClear.resources} />
              </>
            )}
            {game.claimedRewards.includes(realm.firstClear.rewardId) && <span className="tag">已領取</span>}
          </p>
          <p className="small">
            補給：<ResList value={realm.supplies} />
            ・隊伍最多 {realm.maxTeam} 人
          </p>
          {clears > 0 && <p className="small muted">再次進入時節點物資減為 {realm.repeatLootPct}%，首次通關獎勵不會重複。也可以派小隊自動結算（見下方）。</p>}
        </div>
      </div>
      <div className="panel">
        <h3>組隊</h3>
        {game.exploredThisMonth && <p className="neg">本月已經探索過，請推進月份後再來。</p>}
        <div className="team-grid">
          {people.map((c) => {
            const reason = canJoinExpedition(game, c);
            const on = team.includes(c.id);
            return (
              <div key={c.id} className={`member ${on ? 'on' : ''} ${reason ? 'off' : ''}`}>
                <label>
                  <img src={artUrl(portraitOf(c))} alt="" />
                  <span className="t">
                    <b>
                      <input type="checkbox" data-testid={`team-${c.id}`} disabled={!!reason} checked={on} onChange={() => toggle(c.id)} />
                      {c.name}
                    </b>
                    <span>
                      {realmName(c.realm)}・健康 {c.health}
                    </span>
                  </span>
                </label>
                <select value={rows[c.id] ?? 'front'} onChange={(e) => setRows({ ...rows, [c.id]: e.target.value as Row })} aria-label="站位">
                  <option value="front">前排</option>
                  <option value="back">後排</option>
                </select>
                <span className="muted small why">{reason ?? (isCraftSchedule(c.schedule) ? '本月工坊停工，下月回到工坊' : '')}</span>
              </div>
            );
          })}
        </div>
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
          disabled={!team.length || game.exploredThisMonth || !!realmLocked(game, content, realm)}
          onClick={() => dispatch({ type: 'startExploration', realmId: realm.id, teamIds: team, rows })}
        >
          出發探索
        </button>
        {underpowered && (
          <p className="neg small" data-testid="underpowered">
            隊伍中最強的是{underpowered}，低於建議實力「{realm.recommend}」，很可能全滅並受重傷。
          </p>
        )}
      </div>
      <DispatchPanel realmId={realm.id} team={team} />
    </div>
  );
}

function TrialPanel() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [team, setTeam] = useState<string[]>([]);
  const [tier, setTier] = useState('normal');
  const T = balance.trial;
  const picked = team.filter((id) => game.disciples.some((d) => d.id === id && !trialUnavailable(game, d)));
  const blocked = trialBlocked(game, picked);
  const toggle = (id: string) => setTeam(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id].slice(0, T.maxTeam));
  return (
    <details className="panel" data-testid="trial-panel">
      <summary>
        <b>宗門試煉</b>
        <span className="muted small">（大殿 {T.hall} 級起；弟子每人每年一次，失敗不受傷）</span>
      </summary>
      <div className="room-head">
        <Art path="final/realm-trial.webp" alt="宗門試煉" />
      </div>
      <p className="small">
        讓內門弟子與試煉傀儡過招。傀儡依隊伍最強者的境界配置；通過的人得到下一階修為的一部分與功法領悟，沒通過只是生命降到一半、修為 +{T.loseXpPct}%。每人花費靈石 {T.lingshiPer}。
      </p>
      <div className="row small">
        {game.disciples.map((d) => {
          const why = trialUnavailable(game, d);
          return (
            <label key={d.id} title={why}>
              <input type="checkbox" data-testid={`trial-member-${d.id}`} disabled={!!why} checked={picked.includes(d.id)} onChange={() => toggle(d.id)} />
              {d.name}（{realmName(d.realm)}）{why ? <span className="muted">・{why}</span> : null}
            </label>
          );
        })}
        {!game.disciples.length && <span className="muted">還沒有內門弟子。</span>}
      </div>
      <div className="row small">
        {T.tiers.map((t) => (
          <label key={t.id}>
            <input type="radio" name="trial-tier" data-testid={`trial-tier-${t.id}`} checked={tier === t.id} onChange={() => setTier(t.id)} />
            {t.name}（修為 +{t.xpPct}%、領悟 +{t.insight}
            {picked.length > 0 && !blocked ? `，勝算約 ${trialOdds(game, content, picked, t.id)}%` : ''}）
          </label>
        ))}
      </div>
      <button className="btn" data-testid="trial-start" disabled={!!blocked} title={blocked} onClick={() => dispatch({ type: 'runTrial', teamIds: picked, tier })}>
        開始試煉
      </button>
      {blocked && picked.length > 0 && <span className="small neg"> {blocked}</span>}
      <AutoToggle kind="trial" config={{ ids: team, tier }} label={`每年一月用這份名單與「${T.tiers.find((t) => t.id === tier)?.name ?? ''}」難度自動舉辦。`} />
      {game.battles[0]?.title.startsWith('宗門試煉') && game.battles[0].date.year === game.date.year && game.battles[0].date.month === game.date.month && (
        <BattleView b={game.battles[0]} />
      )}
    </details>
  );
}

export function ExplorePage() {
  const game = useGame();
  return (
    <div>
      <h2>探索</h2>
      {game.exploration ? (
        <ActiveRun />
      ) : (
        <>
          <Prepare />
          <TrialPanel />
        </>
      )}
    </div>
  );
}
