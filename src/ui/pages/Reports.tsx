import { formatDate } from '../../engine';
import { ResList } from '../components/Res';
import { useGame } from '../store';
import { BattleView } from './Explore';

export function ReportsPage() {
  const game = useGame();
  return (
    <div>
      <h2>月報與戰報</h2>
      <div className="grid two">
        <div>
          <h3>月報（最近 {game.reports.length} 個月）</h3>
          {!game.reports.length && <p className="muted">尚未推進過月份。</p>}
          {game.reports.map((r, i) => (
            <div key={i} className="panel">
              <b>{formatDate(r.date)}</b>
              <div className="small">
                <ResList value={r.delta} signed />
              </div>
              <ul className="small">
                {r.lines.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div>
          <h3>戰報</h3>
          {!game.battles.length && <p className="muted">尚無戰鬥紀錄。</p>}
          {game.battles.map((b) => (
            <BattleView key={b.id} b={b} />
          ))}
        </div>
      </div>
    </div>
  );
}
