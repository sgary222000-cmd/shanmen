import { useMemo } from 'react';
import { advanceBlockers, computeAlerts, formatDate } from '../../engine';
import { content, useGame, useUi } from '../store';
import { ResIcon } from './Icons';

export function TopBar() {
  const game = useGame();
  const advance = useUi((s) => s.advance);
  const busy = useUi((s) => s.busy);
  const setPage = useUi((s) => s.setPage);
  const alerts = useMemo(() => computeAlerts(game, content), [game]);
  const blockers = advanceBlockers(game);
  const r = game.resources;
  const danger = alerts.filter((a) => a.level === 'danger').length;
  // 上月的資源增減，顯示在數字旁
  const d = game.reports[0]?.delta ?? {};
  const pillDelta = (d.pill_qi ?? 0) + (d.pill_heal ?? 0) + (d.pill_foundation ?? 0) + (d.pill_peiyuan ?? 0);
  const chips: [string, string, number, number, string | undefined][] = [
    ['lingshi', '靈石', r.lingshi, d.lingshi ?? 0, 'res-lingshi'],
    ['food', '糧食', r.food, d.food ?? 0, undefined],
    ['stone', '石材', r.stone, d.stone ?? 0, undefined],
    ['wood', '靈木', r.wood, d.wood ?? 0, undefined],
    ['herb', '藥草', r.herb, d.herb ?? 0, undefined],
    ['pill', '丹藥', r.pill_qi + r.pill_heal + r.pill_foundation + r.pill_peiyuan, pillDelta, undefined],
    ['reputation', '聲望', game.reputation, 0, 'reputation'],
  ];
  return (
    <header className="topbar">
      <span className="sect">{game.sectName}</span>
      <span className="date" data-testid="date">{formatDate(game.date)}</span>
      <span className="res">
        {chips.map(([id, label, value, delta, testId]) => (
          <span key={id} className="res-chip" title={label}>
            <ResIcon id={id} />
            <span className="lbl">{label}</span>
            {/* key 綁數值：數字改變時重新播放閃光 */}
            <b key={value} className="f" data-testid={testId}>
              {value}
            </b>
            {delta !== 0 && <span className={`d ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? `+${delta}` : delta}</span>}
          </span>
        ))}
      </span>
      <span className="spacer" />
      <button className="btn small alerts" onClick={() => setPage('overview')} title="查看警報">
        {danger ? '⛔' : '⚠'} 警報 {alerts.length}
      </button>
      <button
        className="btn advance"
        data-testid="advance"
        disabled={busy || blockers.length > 0}
        title={blockers[0] ?? '結算本月並進入下個月'}
        onClick={() => void advance()}
      >
        推進一月
      </button>
    </header>
  );
}
