import { lazy, Suspense, useEffect } from 'react';
import { EventModal, ReportModal } from './components/Modals';
import { Nav } from './components/Nav';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { BuildPage } from './pages/Build';
import { DisciplesPage } from './pages/Disciples';
import { ExplorePage } from './pages/Explore';
import { IndustryPage } from './pages/Industry';
import { MarketPage } from './pages/Market';
import { NewGamePage } from './pages/NewGame';
import { OverviewPage } from './pages/Overview';
import { ProtagonistPage } from './pages/Protagonist';
import { ReportsPage } from './pages/Reports';
import { SavesPage } from './pages/Saves';
import { SettingsPage, applyFontScale } from './pages/Settings';
import { TitlePage } from './pages/Title';
import { useUi } from './store';

// 開發工具只在開發模式載入，正式建置不包含。
const DevPanel = import.meta.env.DEV ? lazy(() => import('../dev/DevPanel')) : null;

function GameScreen() {
  const page = useUi((s) => s.page);
  return (
    <div className="app">
      <TopBar />
      <div className="body">
        <Nav />
        <main className="main">
          {page === 'overview' && <OverviewPage />}
          {page === 'build' && <BuildPage />}
          {page === 'protagonist' && <ProtagonistPage />}
          {page === 'disciples' && <DisciplesPage />}
          {page === 'industry' && <IndustryPage />}
          {page === 'market' && <MarketPage />}
          {page === 'explore' && <ExplorePage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'saves' && <SavesPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
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
