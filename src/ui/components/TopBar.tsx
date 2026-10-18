import { useMemo } from 'react';
import { advanceBlockers, computeAlerts, formatDate } from '../../engine';
import { content, useGame, useUi } from '../store';

export function TopBar() {
  const game = useGame();
  const advance = useUi((s) => s.advance);
  const busy = useUi((s) => s.busy);
  const setPage = useUi((s) => s.setPage);
  const alerts = useMemo(() => computeAlerts(game, content), [game]);
  const blockers = advanceBlockers(game);
  const r = game.resources;
  const danger = alerts.filter((a) => a.level === 'danger').length;
  return (
    <header className="topbar">
      <span className="sect">{game.sectName}</span>
      <span className="date" data-testid="date">{formatDate(game.date)}</span>
      <span className="res">
        <span>靈石<b data-testid="res-lingshi">{r.lingshi}</b></span>
        <span>糧食<b>{r.food}</b></span>
        <span>石材<b>{r.stone}</b></span>
        <span>靈木<b>{r.wood}</b></span>
        <span>藥草<b>{r.herb}</b></span>
        <span>丹藥<b>{r.pill_qi + r.pill_heal + r.pill_foundation + r.pill_peiyuan}</b></span>
        <span>聲望<b data-testid="reputation">{game.reputation}</b></span>
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
