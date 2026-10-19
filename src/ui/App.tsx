import { lazy, Suspense, useEffect } from 'react';
import { EventModal, ReportModal } from './components/Modals';
import { Dock, PAGE_TITLES } from './components/Nav';
import { SceneBackdrop } from './pages/Overview';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { BuildPage } from './pages/Build';
import { BeastsPage } from './pages/Beasts';
import { LineagePage } from './pages/Lineage';
import { WorldPage } from './pages/World';
import { DisciplesPage } from './pages/Disciples';
import { ExplorePage } from './pages/Explore';
import { IndustryPage } from './pages/Industry';
import { MarketPage } from './pages/Market';
import { NewGamePage } from './pages/NewGame';
import { OverviewPage, TutorialStrip } from './pages/Overview';
import { ProtagonistPage } from './pages/Protagonist';
import { ReportsPage } from './pages/Reports';
import { SavesPage } from './pages/Saves';
import { SettingsPage, applyFontScale } from './pages/Settings';
import { TitlePage } from './pages/Title';
import { useUi } from './store';

// 開發工具只在開發模式載入，正式建置不包含。
const DevPanel = import.meta.env.DEV ? lazy(() => import('../dev/DevPanel')) : null;

// 遊戲畫面：宗門全景鋪滿整個視窗當主畫面，資源、掌門與任務浮在上面；
// 其他頁面以「卷軸視窗」開在全景上方，關閉後回到全景。
function GameScreen() {
  const page = useUi((s) => s.page);
  const setPage = useUi((s) => s.setPage);
  return (
    <div className="game">
      <SceneBackdrop />
      <TopBar />
      {/* 開著視窗時 HUD 被遮住，不必渲染，也避免月報文字在畫面上重複 */}
      {page === 'overview' && <OverviewPage />}
      {page !== 'overview' && (
        <div className="window-back" onClick={() => setPage('overview')}>
          <section className="window" onClick={(e) => e.stopPropagation()} data-page={page}>
            <header className="window-head">
              <h2>{PAGE_TITLES[page]}</h2>
              <button className="window-close" aria-label="關閉" onClick={() => setPage('overview')}>
                ✕
              </button>
            </header>
            <TutorialStrip />
            <div className="window-body main" key={page}>
              {page === 'build' && <BuildPage />}
              {page === 'protagonist' && <ProtagonistPage />}
              {page === 'disciples' && <DisciplesPage />}
              {page === 'lineage' && <LineagePage />}
              {page === 'beasts' && <BeastsPage />}
              {page === 'industry' && <IndustryPage />}
              {page === 'market' && <MarketPage />}
              {page === 'explore' && <ExplorePage />}
              {page === 'world' && <WorldPage />}
              {page === 'reports' && <ReportsPage />}
              {page === 'saves' && <SavesPage />}
              {page === 'settings' && <SettingsPage />}
            </div>
          </section>
        </div>
      )}
      <Dock />
      <EventModal />
      <ReportModal />
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </div>
  );
}

export function App() {
  const screen = useUi((s) => s.screen);
  const init = useUi((s) => s.init);
  useEffect(() => {
    applyFontScale();
    void init();
  }, [init]);
  return (
    <>
      {screen === 'title' && <TitlePage />}
      {screen === 'newgame' && <NewGamePage />}
      {screen === 'game' && <GameScreen />}
      <Toasts />
    </>
  );
}
