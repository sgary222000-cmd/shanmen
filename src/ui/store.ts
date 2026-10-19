import { create } from 'zustand';
import { content } from '../content/registry';
import { advanceBlockers, applyCommand, monthIndex, newGame, type Command, type GameState, type MonthReport, type NewGameOptions } from '../engine';
import { SaveStorage } from '../save/storage';
import { readDisabledStops } from './autoStop';

// 畫面狀態。世界狀態只透過 dispatch（引擎指令）改變；畫面重繪不會改動世界。

export type Page =
  | 'overview'
  | 'build'
  | 'protagonist'
  | 'disciples'
  | 'lineage'
  | 'beasts'
  | 'industry'
  | 'market'
  | 'explore'
  | 'world'
  | 'reports'
  | 'saves'
  | 'settings';
export type Screen = 'title' | 'newgame' | 'game';

interface Toast {
  id: number;
  kind: 'ok' | 'error' | 'info';
  text: string;
}

interface UiState {
  screen: Screen;
  page: Page;
  game: GameState | null;
  storage: SaveStorage | null;
  storageError: string | null;
  persisted: boolean;
  lastReport: MonthReport | null;
  toasts: Toast[];
  busy: boolean;
  /** 連續推進中：剩餘月數；使用者按停止時設 stopRequested */
  running: { done: number; total: number; stopRequested: boolean } | null;
  /** 連續推進結束時的摘要，顯示在月報上方 */
  runSummary: string | null;
  setScreen: (s: Screen) => void;
  setPage: (p: Page) => void;
  init: () => Promise<void>;
  startNew: (opts: Omit<NewGameOptions, 'seed'>) => boolean;
  dispatch: (cmd: Command) => boolean;
  advance: () => Promise<void>;
  advanceMany: (months: number) => Promise<void>;
  stopRun: () => void;
  loadSlot: (slot: string) => Promise<boolean>;
  toast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  closeReport: () => void;
  replaceGame: (s: GameState) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  screen: 'title',
  page: 'overview',
  game: null,
  storage: null,
  storageError: null,
  persisted: false,
  lastReport: null,
  toasts: [],
  busy: false,
  running: null,
  runSummary: null,

  setScreen: (screen) => set({ screen }),
  setPage: (page) => {
    set({ page });
    if (page === 'industry' && get().game && !get().game?.tutorial.viewedLedger) get().dispatch({ type: 'markLedgerViewed' });
  },

  init: async () => {
    try {
      const storage = await SaveStorage.open();
      const persisted = await SaveStorage.requestPersistence();
      set({ storage, persisted });
    } catch (e) {
      set({ storageError: `無法開啟本機存檔（${(e as Error).message}）。無痕模式或封鎖網站資料時無法存檔。` });
    }
  },

  startNew: (opts) => {
    try {
      // 新遊戲的種子取自目前時間；之後所有隨機都由存檔內的狀態決定。
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      const game = newGame(content, { ...opts, seed });
      set({ game, screen: 'game', page: 'overview', lastReport: null });
      return true;
    } catch (e) {
      get().toast('error', (e as Error).message);
      return false;
    }
  },

  dispatch: (cmd) => {
    const game = get().game;
    if (!game) return false;
    const r = applyCommand(game, content, cmd);
    if (!r.ok) {
      get().toast('error', r.error);
      return false;
    }
    set({ game: r.state });
    if (r.message) get().toast('info', r.message);
    return true;
  },

  advance: async () => {
    const { game, busy } = get();
    if (!game || busy) return;
    set({ busy: true, runSummary: null });
    try {
      await advanceOnce(get, set, true);
    } finally {
      set({ busy: false });
    }
  },

  // 連續推進：每個月照常結算、自動存檔，結果和一個月一個月按完全一樣；遇到停止條件就停下
  advanceMany: async (months) => {
    const { game, busy } = get();
    if (!game || busy) return;
    set({ busy: true, runSummary: null, lastReport: null, running: { done: 0, total: months, stopRequested: false } });
    const disabled = new Set(readDisabledStops());
    let last: MonthReport | null = null;
    let reason = '';
    try {
      for (let i = 0; i < months; i++) {
        const g = get().game;
        if (!g) break;
        const blockers = advanceBlockers(g);
        if (blockers.length) {
          reason = blockers[0] ?? '';
          break;
        }
        const report = await advanceOnce(get, set, false);
        if (!report) {
          reason = '結算失敗';
          break;
        }
        last = report;
        set({ running: { ...(get().running ?? { total: months, stopRequested: false }), done: i + 1 } });
        const stop = (report.stops ?? []).filter((x) => x.kind === 'event' || !disabled.has(x.kind));
        if (stop.length) {
          reason = stop.map((x) => x.text).join('、');
          break;
        }
        if (get().running?.stopRequested) {
          reason = '你按了停止';
          break;
        }
        // 讓畫面有機會更新日期與進度
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally {
      const done = get().running?.done ?? 0;
      set({
        busy: false,
        running: null,
        lastReport: last,
        runSummary: done ? `連續推進了 ${done} 個月${reason ? `${done === months ? '，最後一個月出現' : '，因為'}「${reason}」${done === months ? '' : '停下'}` : '，已全部完成'}。這是最後一個月的月報，之前各月在「月報」頁。` : null,
      });
      if (!done && reason) get().toast('info', `無法推進：${reason}`);
    }
  },

  stopRun: () => {
    const r = get().running;
    if (r) set({ running: { ...r, stopRequested: true } });
  },

  loadSlot: async (slot) => {
    const storage = get().storage;
    if (!storage) return false;
    const r = await storage.load(slot);
    if (!r.ok) {
      get().toast('error', r.error);
      return false;
    }
    set({ game: r.state, screen: 'game', page: 'overview', lastReport: null });
    get().toast(
      'ok',
      r.migratedFrom !== null ? `已讀取存檔，並從 v${r.migratedFrom} 升級到目前版本（原檔已另存備份）。` : '已讀取存檔。',
    );
    return true;
  },

  toast: (kind, text) => {
    const id = ++toastId;
    set({ toasts: [...get().toasts.slice(-3), { id, kind, text }] });
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 6000 : 3500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  closeReport: () => set({ lastReport: null, runSummary: null }),
  replaceGame: (game) => set({ game }),
}));

/** 結算一個月並自動存檔；失敗時顯示錯誤並回傳 null。showReport 為 true 時同時顯示月報。 */
async function advanceOnce(get: () => UiState, set: (p: Partial<UiState>) => void, showReport: boolean): Promise<MonthReport | null> {
  const game = get().game;
  if (!game) return null;
  const r = applyCommand(game, content, { type: 'advanceMonth', expectMonth: monthIndex(game.date) });
  if (!r.ok) {
    get().toast('error', r.error);
    return null;
  }
  // 日期與月報同時更新，畫面不會先看到新月份、後跳出月報
  set(showReport ? { game: r.state, lastReport: r.report ?? null } : { game: r.state });
  const storage = get().storage;
  if (storage) {
    try {
      await storage.saveAuto(r.state, new Date().toISOString());
    } catch (e) {
      get().toast('error', `自動存檔失敗：${(e as Error).message}`);
    }
  }
  return r.report ?? null;
}

export function useGame(): GameState {
  const g = useUi((s) => s.game);
  if (!g) throw new Error('沒有進行中的遊戲');
  return g;
}

export { content };
