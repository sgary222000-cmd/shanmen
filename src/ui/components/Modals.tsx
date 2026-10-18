import { formatAge, formatDate } from '../../engine';
import { realmName, rootName } from '../../engine/systems/characters/characters';
import { innerLimit } from '../../engine/systems/buildings/buildings';
import { content, useGame, useUi } from '../store';
import { ResList } from './Res';

/** 需要決定的事件（例如山門招生）。處理前不能推進月份。 */
export function EventModal() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const ev = game.events.find((e) => e.blocking);
  if (!ev) return null;
  const full = game.disciples.length >= innerLimit(game, content);
  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-label={ev.title}>
        <h2>{ev.title}</h2>
        <p>{ev.text}</p>
        {ev.candidates && (
          <>
            {full && <p className="neg">內門人數已達大殿上限，這次無法收人。</p>}
            <table>
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>年齡</th>
                  <th>靈根</th>
                  <th className="num">煉丹</th>
                  <th className="num">耕作</th>
                  <th className="num">戰鬥</th>
                  <th className="num">安置靈石</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ev.candidates.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{formatAge(c.ageMonths)}</td>
                    <td>{rootName(c.root)}</td>
                    <td className="num">{c.skills.alchemy}</td>
                    <td className="num">{c.skills.farming}</td>
                    <td className="num">{c.skills.combat}</td>
                    <td className="num">{c.cost}</td>
                    <td>
                      <button
                        className="btn small"
                        disabled={full || game.resources.lingshi < c.cost}
                        onClick={() => dispatch({ type: 'resolveRecruitment', eventId: ev.id, candidateId: c.id })}
                      >
                        收入內門
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">內門弟子每兩人每月消耗糧食 1，並佔用靈氣 2。目前靈石 {game.resources.lingshi}。</p>
          </>
        )}
        <div className="row" style={{ marginTop: '.75rem' }}>
          <button
            className="btn secondary"
            data-testid="event-skip"
            onClick={() =>
              dispatch(
                ev.kind === 'recruitment'
                  ? { type: 'resolveRecruitment', eventId: ev.id, candidateId: null }
                  : { type: 'dismissEvent', eventId: ev.id },
              )
            }
          >
            {ev.kind === 'recruitment' ? '這次不收內門' : '知道了'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 推進月份後顯示的月報。 */
export function ReportModal() {
  const report = useUi((s) => s.lastReport);
  const close = useUi((s) => s.closeReport);
  const game = useGame();
  if (!report || game.events.some((e) => e.blocking)) return null;
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" role="dialog" aria-label="月報" onClick={(e) => e.stopPropagation()}>
        <h2>{formatDate(report.date)} 月報</h2>
        <p>
          資源變化：<ResList value={report.delta} signed />
        </p>
        {report.lines.length ? (
          <ul>
            {report.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">本月平靜無事。</p>
        )}
        <p className="muted small">
          主角：{realmName(game.protagonist.realm)}，修為 {game.protagonist.xp}。已自動存檔。
        </p>
        <button className="btn" data-testid="report-close" onClick={close}>
          繼續
        </button>
      </div>
    </div>
  );
}
