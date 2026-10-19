import type { StopKind } from '../engine';

// 連續推進的自動停止條件。屬於個人偏好，存在瀏覽器裡，不寫進存檔。

const KEY = 'shanmen.autoStop';

/** 可以在設定頁關掉的條件；有事件要處理（招生、繼承等）一定會停。 */
export const STOP_OPTIONS: { kind: StopKind; label: string }[] = [
  { kind: 'lifespan', label: '壽元預警（剩兩成、一成）' },
  { kind: 'death', label: '有人壽終坐化' },
  { kind: 'breakthrough', label: '修為圓滿、可以突破' },
  { kind: 'shortage', label: '糧食或靈石快用完' },
  { kind: 'tournament', label: '三年大比開始報名' },
  { kind: 'auction', label: '靈脈競標開始' },
];

export function readDisabledStops(): StopKind[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as StopKind[]) : [];
  } catch {
    return [];
  }
}

export function writeDisabledStops(kinds: StopKind[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(kinds));
  } catch {
    // 無法保存偏好時仍可使用，只是重新整理後恢復預設
  }
}
