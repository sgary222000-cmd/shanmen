import { useState } from 'react';
import { balance } from '../../content/balance';
import { formatDate, monthIndex } from '../../engine';
import { allCharacters, realmName } from '../../engine/systems/characters/characters';
import { goodDef } from '../../engine/systems/economy/market';
import { canJoinExpedition } from '../../engine/systems/exploration/exploration';
import { RESOURCE_NAMES } from '../../engine/resources';
import { envoyGiftPct } from '../../engine/systems/talent/positions';
import { favorName, giftFavor, GOAL_NAMES, sectTradeBlocked, sectTradePrice, TEMPERAMENT_NAMES } from '../../engine/systems/world/sects';
import { nextTournamentYear, tournamentBlocked } from '../../engine/systems/world/tournament';
import { Art } from '../components/Art';
import { useTabs } from '../components/Layout';
import { content, useGame, useUi } from '../store';

// 宗門往來（P1 批次 E）：鄰近三宗、送禮與交易、情報、三年大比、靈脈競標。P1 沒有宣戰（前期保護中）。

function Sects() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [gift, setGift] = useState(50);
  return (
    <div className="grid two">
      {game.sects.map((s) => {
        const def = content.sects.get(s.id);
        const lot = goodDef(s.wants).lot;
        const tradeBlocked = sectTradeBlocked(game, s, 1);
        return (
          <div key={s.id} className="panel sect-card2" data-testid={`sect-${s.id}`}>
            {def?.art && (
              <div className="room-head">
                <Art path={def.art} alt={def.name} />
                <span className="favor">好感 {s.favor}・{favorName(s.favor)}</span>
              </div>
            )}
            <h3>
              {def?.name} <span className="tag">{content.lineages.get(def?.lineage ?? '')?.name}</span>{' '}
              <span className="tag">{TEMPERAMENT_NAMES[def?.temperament ?? 'steady']}</span>
            </h3>
            <p className="small">{def?.description}</p>
            <p className="small">
              好感 <b>{s.favor}</b>（{favorName(s.favor)}）・實力 {s.power}・弟子 {s.population} 人・建築 {s.buildings} 級・今年目標：
              {GOAL_NAMES[s.goal]}
            </p>
            <div className="row small">
              送禮靈石
              <input type="number" min={balance.diplomacy.minGift} step={10} value={gift} onChange={(e) => setGift(Number(e.target.value))} />
              <button className="btn small" data-testid={`gift-${s.id}`} onClick={() => dispatch({ type: 'giftSect', sectId: s.id, lingshi: gift })}>
                拜訪送禮（好感 +{giftFavor(game, s, gift)}）
              </button>
            </div>
            <p className="muted small">
              每 {balance.diplomacy.giftUnit} 靈石好感 +1；同一年第 2 份禮效果減半、第 3 份剩三分之一，以此類推（今年已送 {s.giftsThisYear} 次）
              {envoyGiftPct(game) ? `；外事執事 +${envoyGiftPct(game)}%` : ''}。
            </p>
            <div className="row small">
              本月想收購：{RESOURCE_NAMES[s.wants]}（一批 {lot}，每批 {sectTradePrice(game, s)} 靈石）
              <button
                className="btn small secondary"
                data-testid={`sect-trade-${s.id}`}
                disabled={!!tradeBlocked}
                title={tradeBlocked}
                onClick={() => dispatch({ type: 'sectTrade', sectId: s.id, lots: 1 })}
              >
                賣一批
              </button>
            </div>
            <p className="muted small">
              好感 30 以上加價 5%、60 以上加價 10%；每月最多 {balance.diplomacy.tradeLots} 批（本月已賣 {s.tradedThisMonth}）。
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Tournament() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [team, setTeam] = useState<string[]>([]);
  const t = game.tournament;
  const T = balance.tournament;
  const open = t?.status === 'open';
  const blocked = tournamentBlocked(game, team);
  return (
    <div className="panel" data-testid="tournament">
      <h3>三年大比</h3>
      <p className="small">
        每 {T.intervalYears} 年 {T.month} 月舉行，下一屆：第 {nextTournamentYear(game)} 年。需聲望 {T.minReputation}（目前 {game.reputation}）。派最多{' '}
        {T.teamSize} 人與三宗一對一切磋（三戰兩勝），點到為止不會受傷。名次獎勵：第 1 名聲望 +30、靈石 200、築基丹 1；第 2 名聲望 +15、靈石 100；第
        3 名聲望 +8、靈石 50；第 4 名聲望 +3。
      </p>
      {open && (
        <>
          <div className="row small">
            {allCharacters(game).map((c) => {
              const reason = canJoinExpedition(game, c);
              return (
                <label key={c.id} title={reason}>
                  <input
                    type="checkbox"
                    data-testid={`t-team-${c.id}`}
                    disabled={!!reason}
                    checked={team.includes(c.id)}
                    onChange={() => setTeam(team.includes(c.id) ? team.filter((x) => x !== c.id) : [...team, c.id].slice(0, T.teamSize))}
                  />
                  {c.name}（{realmName(c.realm)}）
                </label>
              );
            })}
          </div>
          <button className="btn gold" data-testid="enter-tournament" disabled={!!blocked} onClick={() => dispatch({ type: 'enterTournament', teamIds: team })}>
            參加大比
          </button>
          {blocked && <span className="small muted"> {blocked}</span>}
          <p className="muted small">出賽順序依勾選順序，第一位對各宗最強的弟子。</p>
        </>
      )}
      {t && t.status !== 'open' && (
        <div>
          <p className="small">
            第 {t.year} 年大比：{t.status === 'skipped' ? '我宗未參加。' : `我宗名列第 ${t.rank} 名。`}
          </p>
          {t.standings.length > 0 && (
            <table className="small">
              <tbody>
                {t.standings.map((s, i) => (
                  <tr key={s.name}>
                    <td>第 {i + 1} 名</td>
                    <td>{s.name}</td>
                    <td>勝 {s.points} 場</td>
                    <td>勝 {s.duelWins} 局</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {t.log.length > 0 && (
            <details className="small">
              <summary>比賽紀錄</summary>
              <div className="log">
                {t.log.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function Auction() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const a = game.auction;
  const [bid, setBid] = useState(balance.auction.minBid);
  const now = monthIndex(game.date);
  return (
    <div className="panel" data-testid="auction">
      <h3>靈脈競標</h3>
      {a ? (
        <>
          <p className="small">
            <b>{a.name}</b>：得標後 {a.years} 年內每月靈礦 +{a.orePerMonth}。{a.deadline > now ? `下個月底開標。` : '本月底開標。'}
            各宗出價開標時才揭曉；我宗出價先預扣，落標全數退還。
          </p>
          <p className="small">我宗目前出價：{a.playerBid || '尚未出價'}</p>
          <div className="row small">
            <input type="number" min={balance.auction.minBid} step={10} value={bid} onChange={(e) => setBid(Number(e.target.value))} />
            <button className="btn small" data-testid="bid" onClick={() => dispatch({ type: 'bidAuction', amount: bid })}>
              出價
            </button>
          </div>
        </>
      ) : (
        <p className="muted small">目前沒有無主靈脈。偶爾會有，出現時月報會通知。</p>
      )}
      {game.veins.length > 0 && (
        <p className="small">
          我宗靈脈：
          {game.veins.map((v) => `${v.name}（每月靈礦 +${v.orePerMonth}，還有 ${Math.max(0, v.until - now + 1)} 個月）`).join('、')}
        </p>
      )}
    </div>
  );
}

export function WorldPage() {
  const game = useGame();
  const { tab, bar } = useTabs([
    { id: 'sects', label: '鄰近宗門' },
    { id: 'tournament', label: '三年大比' },
    { id: 'auction', label: '靈脈競標' },
    { id: 'intel', label: <>情報 <small>{game.intel.length}</small></> },
  ]);
  return (
    <div>
      <p className="muted small">
        <span className="tag gold">前期保護中</span> 目前各宗不會宣戰或攻打山門；往來只有送禮、交易、大比與競標。</p>
      {bar}
      {tab === 'sects' && <Sects />}
      {tab === 'tournament' && <Tournament />}
      {tab === 'auction' && <Auction />}
      {tab === 'intel' && (
      <div className="panel" data-testid="intel">
        <h3>情報紀錄</h3>
        {!game.intel.length && <p className="muted small">尚無消息。</p>}
        {game.intel.map((e, i) => (
          <div key={i} className="small">
            <span className="muted">{formatDate(e.date)}</span> {e.text}
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
