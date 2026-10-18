import { useUi, useGame, type Page } from '../store';

const PAGES: [Page, string][] = [
  ['overview', '宗門總覽'],
  ['build', '建設'],
  ['protagonist', '主角'],
  ['disciples', '弟子'],
  ['industry', '產業'],
  ['explore', '探索'],
  ['reports', '月報與戰報'],
  ['saves', '存檔'],
  ['settings', '設定'],
];

const LOCKED = ['藏經與研究', '世界地圖', '外交'];

export function Nav() {
  const page = useUi((s) => s.page);
  const setPage = useUi((s) => s.setPage);
  const game = useGame();
  const pending = game.events.filter((e) => e.blocking).length;
  return (
    <nav className="nav">
      {PAGES.map(([id, label]) => (
        <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)} data-testid={`nav-${id}`}>
          {label}
          {id === 'overview' && pending > 0 && <span className="badge">{pending}</span>}
        </button>
      ))}
      <div style={{ marginTop: '1rem' }} className="muted small">
        尚未開放：
        {LOCKED.map((l) => (
          <div key={l}>
            <span className="tag locked">{l}（P1 起）</span>
          </div>
        ))}
      </div>
    </nav>
  );
}
