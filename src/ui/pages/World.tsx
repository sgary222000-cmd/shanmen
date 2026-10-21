import { useMemo, useState, type ReactNode } from 'react';
import { balance } from '../../content/balance';
import { formatDate, monthIndex } from '../../engine';
import { allCharacters, realmName } from '../../engine/systems/characters/characters';
import { goodDef } from '../../engine/systems/economy/market';
import { canJoinExpedition } from '../../engine/systems/exploration/exploration';
import { RESOURCE_NAMES } from '../../engine/resources';
import { favorName, giftEnvoyPct, giftFavor, GOAL_NAMES, sectTradeBlocked, sectTradeLots, sectTradePrice, TEMPERAMENT_NAMES } from '../../engine/systems/world/sects';
import {
  aidBlocked,
  aidTroops,
  breakCostText,
  contactBlocked,
  SITE_KIND_NAMES,
  treatyBlocked,
  treatyCapacity,
  treatyCount,
  TREATY_NAMES,
  trustName,
  trustOf,
} from '../../engine/systems/world/diplomacy';
import type { SectState, War } from '../../engine/types';
import {
  activeNeighbor,
  arrayBonus,
  casusBelli,
  contestBlocked,
  contestOdds,
  declareBlocked,
  evacuateBlocked,
  graceOver,
  peaceBlocked,
  peaceCost,
  PLAYER,
  playerPower,
  vassalTribute,
  warOdds,
  warTeam,
  warThreatBp,
  warUnavailable,
} from '../../engine/systems/world/war';
import { nextTournamentYear, tournamentBlocked } from '../../engine/systems/world/tournament';
import { artUrl } from '../art';
import { Art } from '../components/Art';
import { useTabs } from '../components/Layout';
import { content, useGame, useUi } from '../store';

// 宗門往來（P1 批次 E；P2 批次 C 加入遠方勢力、信任、條約、盟友求援、資源據點；P2 批次 D 加入據點爭奪、戰事、附屬與吞併）。

function AidRequests() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const now = monthIndex(game.date);
  const requests = game.events.filter((e) => e.kind === 'aid' && e.aid);
  if (!requests.length) return null;
  const troops = aidTroops(game);
  return (
    <div className="panel" data-testid="aid-requests" style={{ borderLeft: '3px solid var(--danger, #a8352a)' }}>
      <h3>盟友求援</h3>
      {requests.map((ev) => {
        const aid = ev.aid!;
        const left = aid.deadline - now;
        return (
          <div key={ev.id} className="small" style={{ marginBottom: '.5rem' }}>
            <p>
              <b>{ev.title}</b>：{ev.text}（{left > 0 ? `還有 ${left} 個月可以回覆` : '本月底前要回覆'}）
            </p>
            <div className="row">
              <button
                className="btn small"
                data-testid={`aid-money-${aid.sectId}`}
                disabled={!!aidBlocked(game, ev.id, 'money')}
                title={aidBlocked(game, ev.id, 'money')}
                onClick={() => dispatch({ type: 'resolveAid', eventId: ev.id, choice: 'money' })}
              >
                出資 {aid.lingshi} 靈石
              </button>
              <button
                className="btn small"
                data-testid={`aid-troops-${aid.sectId}`}
                disabled={!!aidBlocked(game, ev.id, 'troops')}
                title={aidBlocked(game, ev.id, 'troops')}
                onClick={() => dispatch({ type: 'resolveAid', eventId: ev.id, choice: 'troops' })}
              >
                出兵（{troops.length ? troops.map((c) => c.name).join('、') : '沒有可派的人'}）
              </button>
              <button
                className="btn small secondary"
                data-testid={`aid-refuse-${aid.sectId}`}
                onClick={() => dispatch({ type: 'resolveAid', eventId: ev.id, choice: 'refuse' })}
              >
                婉拒
              </button>
            </div>
          </div>
        );
      })}
      <p className="muted small">
        履行援助：信任 +{balance.diplomacy.trustOnAid}、好感 +{balance.diplomacy.favorOnAid}；婉拒或逾期：信任 −{balance.diplomacy.trustOnRefuse}、好感 −
        {balance.diplomacy.favorOnRefuse}，連續 {balance.diplomacy.maxRefusals} 次盟友會解除聯盟。
      </p>
    </div>
  );
}

function TreatyRow({ s }: { s: SectState }) {
  const game = useGame();
  const dispatch = useUi((st) => st.dispatch);
  const now = monthIndex(game.date);
  const t = s.treaty;
  return (
    <div className="small" data-testid={`treaty-${s.id}`}>
      {t ? (
        <p>
          條約：<b>{TREATY_NAMES[t.kind]}</b>（還有約 {Math.max(1, Math.ceil((t.until - now) / 12))} 年到期）{' '}
          <button
            className="btn small secondary"
            data-testid={`break-${s.id}`}
            title={`提前解約：${breakCostText(t.kind)}`}
            onClick={() => dispatch({ type: 'breakTreaty', sectId: s.id })}
          >
            提前解約
          </button>
        </p>
      ) : (
        <p>條約：無</p>
      )}
      {treatyCapacity(game, content) > 0 &&
        (['peace', 'alliance'] as const).map((kind) => {
          const blocked = treatyBlocked(game, content, s.id, kind);
          if (t?.kind === kind || (t?.kind === 'alliance' && kind === 'peace')) return null;
          const T = balance.diplomacy.treaties[kind];
          return (
            <div key={kind} className="row">
              <button
                className="btn small"
                data-testid={`sign-${kind}-${s.id}`}
                disabled={!!blocked}
                title={blocked}
                onClick={() => dispatch({ type: 'signTreaty', sectId: s.id, kind })}
              >
                締結{TREATY_NAMES[kind]}（好感 {T.favor}、信任 {T.trust}、靈石 {T.lingshi}）
              </button>
              {blocked && <span className="muted small">{blocked}</span>}
            </div>
          );
        })}
    </div>
  );
}

function SectCard({ s }: { s: SectState }) {
  const game = useGame();
  const dispatch = useUi((st) => st.dispatch);
  const [gift, setGift] = useState(50);
  const def = content.sects.get(s.id);
  const distant = def?.scope === 'distant';
  const contact = contactBlocked(game, content, s.id);
  const lot = goodDef(s.wants).lot;
  const tradeBlocked = sectTradeBlocked(game, content, s, 1);
  const trust = trustOf(s);
  const owned = (game.sites ?? []).filter((x) => x.owner === s.id);
  return (
    <div className="panel sect-card2" data-testid={`sect-${s.id}`}>
      {def?.art && (
        <div className="room-head">
          <Art path={def.art} alt={def.name} />
          <span className="favor">好感 {s.favor}・{favorName(s.favor)}</span>
        </div>
      )}
      <h3>
        {def?.name} <span className="tag">{content.lineages.get(def?.lineage ?? '')?.name}</span>{' '}
        <span className="tag">{TEMPERAMENT_NAMES[def?.temperament ?? 'steady']}</span>
        {distant && <span className="tag">遠方</span>}
        {s.vassal && <span className="tag gold">我宗附屬</span>}
        {game.wars.some((w) => w.sectId === s.id) && <span className="tag neg">交戰中</span>}
      </h3>
      <p className="small">{def?.description}</p>
      <p className="small">
        好感 <b>{s.favor}</b>（{favorName(s.favor)}）・信任 <b>{trust}</b>（{trustName(trust)}）・實力 {s.power}・弟子 {s.population} 人
        {!distant && `・今年目標：${GOAL_NAMES[s.goal]}`}
        {owned.length > 0 && `・據點：${owned.map((x) => x.name).join('、')}`}
      </p>
      {contact ? (
        <p className="muted small">{contact}。</p>
      ) : (
        <>
          <TreatyRow s={s} />
          <div className="row small">
            送禮靈石
            <input type="number" min={balance.diplomacy.minGift} step={10} value={gift} onChange={(e) => setGift(Number(e.target.value))} />
            <button className="btn small" data-testid={`gift-${s.id}`} onClick={() => dispatch({ type: 'giftSect', sectId: s.id, lingshi: gift })}>
              拜訪送禮（好感 +{giftFavor(game, content, s, gift)}）
            </button>
          </div>
          <p className="muted small">
            每 {balance.diplomacy.giftUnit} 靈石好感 +1；同一年第 2 份禮效果減半、第 3 份剩三分之一，以此類推（今年已送 {s.giftsThisYear} 次）
            {giftEnvoyPct(game, content) ? `；外事執事 +${giftEnvoyPct(game, content)}%` : ''}。禮物只增加好感，信任要靠履行約定。
          </p>
          {!distant && (
            <>
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
                好感 30 以上加價 5%、60 以上加價 10%{s.treaty?.kind === 'alliance' ? `、盟友再 +${balance.diplomacy.allianceTradePct}%` : ''}；每月最多{' '}
                {sectTradeLots(s)} 批（本月已賣 {s.tradedThisMonth}）。
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Sects() {
  const game = useGame();
  const cap = treatyCapacity(game, content);
  const near = game.sects.filter((s) => content.sects.get(s.id)?.scope !== 'distant' && !s.annexed);
  const far = game.sects.filter((s) => content.sects.get(s.id)?.scope === 'distant');
  return (
    <div>
      <AidRequests />
      <p className="small">
        {cap
          ? `議事堂：可同時維持 ${cap} 份條約（目前 ${treatyCount(game)} 份）。`
          : '蓋好議事堂（大殿 3 級，主峰或山門）後，可以和各宗締結互不侵犯、聯盟條約。'}
        互不侵犯：對方不再騷擾我宗。聯盟：交易優待，盟友被攻打時會求援。
      </p>
      <h3>鄰近宗門</h3>
      <div className="grid two">
        {near.map((s) => (
          <SectCard key={s.id} s={s} />
        ))}
      </div>
      <h3>遠方勢力</h3>
      <div className="grid two">
        {far.map((s) => (
          <SectCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

function ownerName(owner: string | null): string {
  if (owner === PLAYER) return '我宗';
  return owner ? (content.sects.get(owner)?.name ?? '') : '無主';
}

// 勢力地圖上各地點的位置（圖片寬、高的百分比），依 assets/final/world-map.webp 量出。
const MAP_SPOTS: Record<string, [number, number]> = {
  [PLAYER]: [50, 47],
  'sect.qingmu': [35, 22],
  'sect.chixia': [77, 20],
  'sect.luoyun': [46, 76],
  'sect.tianyan': [55, 6],
  'sect.tiejian': [14, 8],
  'sect.wanbao': [91, 40],
  'site.qingshi': [25, 41],
  'site.yunwu': [42, 31],
  'site.chitong': [66, 39],
  'site.lingquan': [62, 57],
  'site.gusong': [31, 59],
  'site.hantan': [70, 68],
};

function WorldMap() {
  const game = useGame();
  const spot = (id: string, label: ReactNode, cls: string) => {
    const pos = MAP_SPOTS[id];
    if (!pos) return null;
    return (
      <span key={id} className={`map-spot ${cls}`} style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }} data-testid={`map-${id}`}>
        {label}
      </span>
    );
  };
  return (
    <div className="world-map" data-testid="world-map">
      <Art path="final/world-map.webp" alt="勢力地圖" />
      {spot(PLAYER, game.sectName, 'mine')}
      {game.sects.map((s) => spot(s.id, content.sects.get(s.id)?.name, 'sect'))}
      {(game.sites ?? []).map((x) =>
        spot(x.id, <>{x.name}<small>{ownerName(x.owner)}</small></>, `site${x.owner === PLAYER ? ' mine' : ''}`),
      )}
    </div>
  );
}

function Sites() {
  const game = useGame();
  const dispatch = useUi((st) => st.dispatch);
  const odds = useMemo(
    () => Object.fromEntries((game.sites ?? []).map((x) => [x.id, x.owner && x.owner !== PLAYER ? contestOdds(game, content, x.id) : 100])),
    [game],
  );
  const team = warTeam(game, []);
  return (
    <div className="panel" data-testid="sites">
      <h3>資源據點</h3>
      <WorldMap />
      <p className="muted small">
        山門附近的礦脈、藥田、靈泉，佔有的宗門每月多一份收入（我宗佔有的算進產業頁的收入）。無主的花 {balance.sites.claimLingshi} 靈石就能佔下；鄰宗的要派人去搶，
        由最強的三人（{team.length ? team.map((c) => c.name).join('、') : '目前沒有能出戰的人'}）出手，對方守在自家地盤生命、防禦 +{balance.war.homeDefensePct}%。
        輸了只會受傷，不會死人；不論輸贏，對方好感 −15、信任 −10。每處據點每年最多爭奪一次，我宗最多佔 {balance.sites.maxPerSect} 處。
      </p>
      <table className="small">
        <tbody>
          {(game.sites ?? []).map((x) => {
            const inc = balance.sites.income[x.kind] as Partial<Record<'lingshi' | 'wood', number>>;
            const blocked = contestBlocked(game, content, x.id);
            return (
              <tr key={x.id} data-testid={`site-${x.id}`}>
                <td className="site-thumb">
                  {artUrl(`final/${x.id.replace('.', '-')}.webp`) && <Art path={`final/${x.id.replace('.', '-')}.webp`} alt="" />}
                </td>
                <td>{x.name}</td>
                <td>{SITE_KIND_NAMES[x.kind]}</td>
                <td>{x.owner === PLAYER ? <b>我宗</b> : ownerName(x.owner)}</td>
                <td className="muted">
                  每月 {inc.lingshi ? `靈石 ${inc.lingshi}` : ''}
                  {inc.wood ? `、靈木 ${inc.wood}` : ''}
                </td>
                <td>
                  {x.owner !== PLAYER && (
                    <>
                      <button
                        className="btn small"
                        data-testid={`contest-${x.id}`}
                        disabled={!!blocked}
                        title={blocked}
                        onClick={() => dispatch({ type: 'contestSite', siteId: x.id })}
                      >
                        {x.owner ? `出兵爭奪（勝算約 ${odds[x.id]}%）` : `佔下（${balance.sites.claimLingshi} 靈石）`}
                      </button>
                      {blocked && <span className="muted"> {blocked}</span>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function WarCard({ war }: { war: War }) {
  const game = useGame();
  const dispatch = useUi((st) => st.dispatch);
  const odds = useMemo(() => warOdds(game, content, war), [game, war]);
  const name = content.sects.get(war.sectId)?.name ?? '';
  const left = war.resolveAt - monthIndex(game.date);
  const defending = war.side === 'defend';
  const peace = peaceBlocked(game, war.id);
  const evac = evacuateBlocked(game, war.id);
  const W = balance.war;
  const people = [game.protagonist, ...game.disciples];
  const toggle = (id: string) => {
    const cur = war.teamIds.length ? war.teamIds : odds.team.map((c) => c.id);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(0, 3);
    dispatch({ type: 'setWarTeam', warId: war.id, teamIds: next });
  };
  return (
    <div className="panel" data-testid={`war-${war.sectId}`} style={{ borderLeft: '3px solid var(--danger, #a8352a)' }}>
      <div className="room-head">
        <Art path="final/siege.webp" alt="山門戰" />
      </div>
      <h3>
        {defending ? `${name}來犯` : `攻打${name}`}
        <span className="tag neg">{left > 1 ? `${left} 個月後開戰` : '本月底開戰'}</span>
      </h3>
      <p className="small">
        起因：{war.reason}。山門戰三場兩勝。預估勝算約 <b data-testid={`war-odds-${war.sectId}`}>{odds.winPct}%</b>；每場倒下的內門弟子有{' '}
        <b>{odds.deathPct}%</b> 會戰死（掌門不會死，只會重傷 {W.protagonistInjuryMonths} 個月）。
        {defending && arrayBonus(game, content).defensePct > 0 && `護山大陣：生命、防禦 +${arrayBonus(game, content).defensePct}%。`}
        {war.allies.length > 0 && `盟友${war.allies.map((id) => content.sects.get(id)?.name).join('、')}會各派一名高手相助。`}
      </p>
      <p className="small">
        出戰（最多 3 人，{war.teamIds.length ? '已指定' : '目前自動挑最強的'}）：{odds.team.map((c) => `${c.name}（${realmName(c.realm)}）`).join('、') || '沒有能出戰的人'}
      </p>
      <details className="small">
        <summary>指定出戰的人</summary>
        <div className="row small">
          {people.map((c) => {
            const reason = warUnavailable(game, c, defending);
            const on = odds.team.some((x) => x.id === c.id);
            return (
              <label key={c.id} title={reason}>
                <input type="checkbox" data-testid={`war-team-${c.id}`} checked={on} onChange={() => toggle(c.id)} />
                {c.name}（{realmName(c.realm)}）{reason ? <span className="muted">・{reason}</span> : null}
              </label>
            );
          })}
          {war.teamIds.length > 0 && (
            <button className="btn small secondary" onClick={() => dispatch({ type: 'setWarTeam', warId: war.id, teamIds: [] })}>
              改回自動
            </button>
          )}
        </div>
      </details>
      <div className="row">
        <button className="btn small" data-testid={`war-peace-${war.sectId}`} disabled={!!peace} title={peace} onClick={() => dispatch({ type: 'makePeace', warId: war.id })}>
          {defending ? `求和（${peaceCost(game, war)} 靈石，停戰 ${W.peaceTruceYears} 年）` : `撤兵（聲望 −${W.withdrawReputation}）`}
        </button>
        {defending && (
          <button className="btn small secondary" data-testid={`war-evacuate-${war.sectId}`} disabled={!!evac} title={evac} onClick={() => dispatch({ type: 'evacuate', warId: war.id })}>
            {war.hidden ? `已撤離 ${war.hidden} 靈石` : `撤離資產（把 ${W.evacuatePct}% 靈石藏進後山）`}
          </button>
        )}
      </div>
      <p className="muted small">
        {defending
          ? `守住：對方賠償靈石、聲望 +${W.defendWinReputation}。失守：被搶 ${W.lootLingshiPct}% 靈石（撤離的不算）與 ${W.lootFoodPct}% 糧食、${W.damagedBuildings} 座建築損毀待修、割讓一處據點；宗門不會被滅。`
          : `得勝：可以要求割地賠款、收為附屬（${W.vassalYears} 年），或在對方夠弱時吞併。落敗：聲望 −${W.attackLoseReputation}。`}
      </p>
    </div>
  );
}

function Wars() {
  const game = useGame();
  const dispatch = useUi((st) => st.dispatch);
  const W = balance.war;
  const now = monthIndex(game.date);
  const near = game.sects.filter((s) => activeNeighbor(content, s));
  return (
    <div>
      {game.wars.map((w) => (
        <WarCard key={w.id} war={w} />
      ))}
      <div className="panel" data-testid="war-declare">
        <h3>各宗動向</h3>
        <p className="small">
          我宗實力約 <b>{playerPower(game, content)}</b>（最強三人的戰力，換算成各宗實力的尺度）。
          {graceOver(game)
            ? '好戰而冷淡、或正在擴張又比我宗強的宗門可能宣戰；宣戰後有 3–6 個月準備期。締結互不侵犯或聯盟就不會被宣戰。'
            : `前期保護到第 ${W.graceYears} 年，之前各宗都不興兵。`}
        </p>
        <table className="small">
          <tbody>
            {near.map((s) => {
              const name = content.sects.get(s.id)?.name;
              const blocked = declareBlocked(game, content, s.id);
              const cause = casusBelli(game, content, s);
              const threat = warThreatBp(game, content, s);
              return (
                <tr key={s.id}>
                  <td>{name}</td>
                  <td>實力 {s.power}</td>
                  <td>
                    {s.vassal
                      ? `附屬，每月進貢約 ${vassalTribute(s)} 靈石${s.vassalUntil !== undefined ? `（約 ${Math.ceil((s.vassalUntil - now) / 12)} 年後期滿）` : ''}`
                      : s.truceUntil !== undefined && s.truceUntil > now
                        ? `停戰中（約 ${Math.ceil((s.truceUntil - now) / 12)} 年）`
                        : threat
                          ? <span className="neg">可能對我宗宣戰</span>
                          : '暫無敵意'}
                  </td>
                  <td>
                    <button
                      className="btn small secondary"
                      data-testid={`declare-${s.id}`}
                      disabled={!!blocked}
                      title={blocked}
                      onClick={() => dispatch({ type: 'declareWar', sectId: s.id })}
                    >
                      宣戰（{W.declareLingshi} 靈石{cause ? '' : `，無故興兵聲望 −${W.unjustReputation}`}）
                    </button>
                    {blocked && <span className="muted"> {blocked}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {game.sects.some((s) => s.annexed) && (
          <p className="muted small">已併入我宗：{game.sects.filter((s) => s.annexed).map((s) => content.sects.get(s.id)?.name).join('、')}。</p>
        )}
        {game.integrations.length > 0 && (
          <p className="muted small">
            整合費：{game.integrations.map((x) => `${content.sects.get(x.sectId)?.name} 每月 ${x.lingshi} 靈石（到第 ${Math.floor(x.until / 12) + 1} 年）`).join('、')}。
          </p>
        )}
      </div>
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
      <div className="room-head">
        <Art path="final/tournament.webp" alt="三年大比" />
      </div>
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
    { id: 'sects', label: <>各方勢力{game.events.some((e) => e.kind === 'aid') ? <small> 求援</small> : null}</> },
    { id: 'sites', label: '資源據點' },
    { id: 'war', label: <>戰事{game.wars.length ? <small> {game.wars.length}</small> : null}</> },
    { id: 'tournament', label: '三年大比' },
    { id: 'auction', label: '靈脈競標' },
    { id: 'intel', label: <>情報 <small>{game.intel.length}</small></> },
  ]);
  return (
    <div>
      {graceOver(game) ? (
        <p className="muted small">
          {game.wars.length ? <span className="tag neg">戰事 {game.wars.length}</span> : <span className="tag">前期保護已結束</span>}{' '}
          好戰而冷淡、或恃強擴張的宗門可能宣戰或搶奪我宗據點；締結互不侵犯或聯盟可以避免，蓋護山大陣能讓守山門更有把握。
        </p>
      ) : (
        <p className="muted small">
          <span className="tag gold">前期保護中</span> 到第 {balance.war.graceYears} 年之前各宗不會宣戰或攻打山門；好戰而冷淡的宗門可能騷擾我宗商隊，締結互不侵犯可以避免。
        </p>
      )}
      {bar}
      {tab === 'sects' && <Sects />}
      {tab === 'sites' && <Sites />}
      {tab === 'war' && <Wars />}
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
