import { formatDate } from '../../engine';
import { ResList } from '../components/Res';
import { useGame } from '../store';
import { useTabs } from '../components/Layout';
import { BattleView } from './Explore';

export function ReportsPage() {
  const game = useGame();
  const { tab, bar } = useTabs([
    { id: 'reports', label: <>月報 <small>{game.reports.length}</small></> },
    { id: 'battles', label: <>戰報 <small>{game.battles.length}</small></> },
  ]);
  return (
    <div>
      <h2>月報與戰報</h2>
      {bar}
      <div className="report-cols">
        {tab === 'reports' && (
        <div>
          {!game.reports.length && <p className="muted">尚未推進過月份。</p>}
          {game.reports.map((r, i) => (
            <div key={i} className="panel">
              <h3>{formatDate(r.date)}</h3>
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
        )}
        {tab === 'battles' && (
        <div>
          {!game.battles.length && <p className="muted">尚無戰鬥紀錄。</p>}
          {game.battles.map((b) => (
            <BattleView key={b.id} b={b} />
          ))}
        </div>
        )}
      </div>
    </div>
  );
}
