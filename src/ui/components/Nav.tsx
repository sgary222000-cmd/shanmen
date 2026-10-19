import { useUi, useGame, type Page } from '../store';

// 底部功能列：每頁一枚印章圖示。宗門總覽就是全景主畫面，不另列按鈕。
const PAGES: [Page, string, string][] = [
  ['build', '建設', '建'],
  ['protagonist', '掌門', '主'],
  ['disciples', '弟子', '徒'],
  ['lineage', '傳承', '法'],
  ['beasts', '靈獸', '獸'],
  ['industry', '產業', '產'],
  ['market', '坊市', '市'],
  ['explore', '探索', '探'],
  ['world', '往來', '交'],
  ['reports', '月報', '報'],
  ['saves', '存檔', '存'],
  ['settings', '設定', '設'],
];

export const PAGE_TITLES: Record<Page, string> = {
  overview: '宗門總覽',
  build: '建設',
  protagonist: '主角',
  disciples: '弟子',
  lineage: '傳承與功法',
  beasts: '靈獸苑',
  industry: '產業',
  market: '坊市與委託',
  explore: '探索',
  world: '宗門往來',
  reports: '月報與戰報',
  saves: '存檔',
  settings: '設定',
};

export function Dock() {
  const page = useUi((s) => s.page);
  const setPage = useUi((s) => s.setPage);
  const game = useGame();
  const pending = game.events.filter((e) => e.blocking).length;
  return (
    <nav className="dock">
      <button className={page === 'overview' ? 'active home' : 'home'} onClick={() => setPage('overview')} data-testid="nav-overview">
        <span className="seal">宗</span>
        <span className="lb">山門</span>
        {pending > 0 && <span className="badge">{pending}</span>}
      </button>
      {PAGES.map(([id, label, seal]) => (
        <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)} data-testid={`nav-${id}`}>
          <span className="seal">{seal}</span>
          <span className="lb">{label}</span>
        </button>
      ))}
    </nav>
  );
}
