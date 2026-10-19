import { useEffect, useMemo, useRef, useState } from 'react';
import { advanceBlockers, computeAlerts, formatDate, planMonth, type ResourceId } from '../../engine';
import { RESOURCE_IDS } from '../../engine/resources';
import { content, useGame, useUi } from '../store';
import { ResIcon } from './Icons';

export function TopBar() {
  const game = useGame();
  const advance = useUi((s) => s.advance);
  const busy = useUi((s) => s.busy);
  const running = useUi((s) => s.running);
  const advanceMany = useUi((s) => s.advanceMany);
  const stopRun = useUi((s) => s.stopRun);
  const [menu, setMenu] = useState(false);
  const setPage = useUi((s) => s.setPage);
  const page = useUi((s) => s.page);
  const multiRef = useRef<HTMLSpanElement>(null);
  // 選單打開時：點選單外面、按 Esc 或換頁都會收起
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!multiRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  useEffect(() => setMenu(false), [page]);
  const alerts = useMemo(() => computeAlerts(game, content), [game]);
  const blockers = advanceBlockers(game);
  const r = game.resources;
  const danger = alerts.filter((a) => a.level === 'danger').length;
  // 本月預估增減（與產業頁收支表的淨變化相同），顯示在數字旁
  const d = useMemo(() => {
    const plan = planMonth(game, content);
    const out: Partial<Record<ResourceId, number>> = {};
    for (const id of RESOURCE_IDS) out[id] = (plan.production[id] ?? 0) + (plan.expected[id] ?? 0) - (plan.consumption[id] ?? 0);
    return out;
  }, [game]);
  const pills = ['pill_qi', 'pill_heal', 'pill_foundation', 'pill_peiyuan', 'pill_core', 'pill_life', 'pill_nascent', 'pill_deity'] as const;
  const pillDelta = pills.reduce((n, id) => n + (d[id] ?? 0), 0);
  const chips: [string, string, number, number, string | undefined][] = [
    ['lingshi', '靈石', r.lingshi, d.lingshi ?? 0, 'res-lingshi'],
    ['food', '糧食', r.food, d.food ?? 0, undefined],
    ['stone', '石材', r.stone, d.stone ?? 0, undefined],
    ['wood', '靈木', r.wood, d.wood ?? 0, undefined],
    ['herb', '藥草', r.herb, d.herb ?? 0, undefined],
    ['pill', '丹藥', pills.reduce((n, id) => n + r[id], 0), pillDelta, undefined],
    ['reputation', '聲望', game.reputation, 0, 'reputation'],
  ];
  return (
    <header className="topbar">
      <span className="sect">{game.sectName}</span>
      <span className="date" data-testid="date">{formatDate(game.date)}</span>
      <span className="res">
        {chips.map(([id, label, value, delta, testId]) => (
          <span key={id} className="res-chip" title={`${label}（旁邊的數字是本月預估增減）`}>
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
        {running ? `推進中 ${running.done}/${running.total}` : '推進一月'}
      </button>
      <span className="advance-multi" ref={multiRef}>
        {running ? (
          <button className="btn small danger" data-testid="advance-stop" onClick={stopRun}>
            停止連續推進
          </button>
        ) : (
          <>
            {menu && (
              <span className="menu" data-testid="advance-menu">
                {[3, 6, 12, 60].map((n) => (
                  <button
                    key={n}
                    className="btn small"
                    data-testid={`advance-${n}`}
                    onClick={() => {
                      setMenu(false);
                      void advanceMany(n);
                    }}
                  >
                    {n === 60 ? '五年' : n === 12 ? '一年' : `${n} 個月`}
                  </button>
                ))}
                <span className="muted small">遇到重要事件會自動停下（可在設定頁調整）</span>
              </span>
            )}
            <button
              className="btn small secondary"
              data-testid="advance-many"
              disabled={busy || blockers.length > 0}
              title={blockers[0] ?? '一次推進好幾個月'}
              onClick={() => setMenu(!menu)}
            >
              連續推進 {menu ? '▴' : '▾'}
            </button>
          </>
        )}
      </span>
    </header>
  );
}
