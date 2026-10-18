import { create } from 'zustand';
import { content } from '../content/registry';
import { applyCommand, monthIndex, newGame, type Command, type GameState, type MonthReport, type NewGameOptions } from '../engine';
import { SaveStorage } from '../save/storage';

// 畫面狀態。世界狀態只透過 dispatch（引擎指令）改變；畫面重繪不會改動世界。

export type Page = 'overview' | 'build' | 'protagonist' | 'disciples' | 'industry' | 'explore' | 'reports' | 'saves' | 'settings';
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
  setScreen: (s: Screen) => void;
  setPage: (p: Page) => void;
  init: () => Promise<void>;
  startNew: (opts: Omit<NewGameOptions, 'seed'>) => boolean;
  dispatch: (cmd: Command) => boolean;
  advance: () => Promise<void>;
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
    set({ busy: true });
    try {
      const r = applyCommand(game, content, { type: 'advanceMonth', expectMonth: monthIndex(game.date) });
      if (!r.ok) {
        get().toast('error', r.error);
        return;
      }
      set({ game: r.state, lastReport: r.report ?? null });
      const storage = get().storage;
      if (storage) {
        try {
          await storage.saveAuto(r.state, new Date().toISOString());
        } catch (e) {
          get().toast('error', `自動存檔失敗：${(e as Error).message}`);
        }
      }
    } finally {
      set({ busy: false });
    }
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
  closeReport: () => set({ lastReport: null }),
  replaceGame: (game) => set({ game }),
}));

export function useGame(): GameState {
  const g = useUi((s) => s.game);
  if (!g) throw new Error('沒有進行中的遊戲');
  return g;
}

export { content };
