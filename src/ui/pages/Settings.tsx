import { useState } from 'react';
import { useUi } from '../store';
import type { StopKind } from '../../engine';
import { readDisabledStops, STOP_OPTIONS, writeDisabledStops } from '../autoStop';

const KEY = 'shanmen.fontScale';

function readScale(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v >= 0.85 && v <= 1.4 ? v : 1;
  } catch {
    return 1;
  }
}

export function applyFontScale(scale = readScale()): void {
  document.documentElement.style.setProperty('--font-scale', String(scale));
}

export function SettingsPage() {
  const [scale, setScale] = useState(readScale());
  const persisted = useUi((s) => s.persisted);
  const [disabled, setDisabled] = useState<StopKind[]>(readDisabledStops());
  const toggleStop = (kind: StopKind, on: boolean) => {
    const next = on ? disabled.filter((k) => k !== kind) : [...disabled, kind];
    setDisabled(next);
    writeDisabledStops(next);
  };
  const change = (v: number) => {
    setScale(v);
    applyFontScale(v);
    try {
      localStorage.setItem(KEY, String(v));
    } catch {
      // 無法保存偏好時仍可使用
    }
  };
  return (
    <div>
      <h2>設定</h2>
      <div className="panel">
        <h3>字體大小</h3>
        <div className="row">
          {[0.9, 1, 1.1, 1.25].map((v) => (
            <button key={v} className={`btn small ${scale === v ? '' : 'secondary'}`} onClick={() => change(v)}>
              {Math.round(v * 100)}%
            </button>
          ))}
        </div>
      </div>
      <div className="panel" data-testid="auto-stop">
        <h3>連續推進的自動停止</h3>
        <p className="small muted">連續推進時，遇到勾選的情況會停下來讓你處理。招生、掌門繼承等需要做決定的事件一定會停。</p>
        {STOP_OPTIONS.map((o) => (
          <label key={o.kind} className="small row">
            <input type="checkbox" checked={!disabled.includes(o.kind)} onChange={(e) => toggleStop(o.kind, e.target.checked)} />
            {o.label}
          </label>
        ))}
      </div>
      <div className="panel">
        <h3>存檔保護</h3>
        <p>
          瀏覽器持久保存：{persisted ? <span className="pos">已啟用</span> : <span className="muted">未啟用（瀏覽器可能在空間不足時清除資料，請定期匯出備份）</span>}
        </p>
      </div>
      <div className="panel">
        <h3>尚未開放的設定</h3>
        <div className="row">
          {['音量', '通知'].map((x) => (
            <span key={x} className="tag locked">
              {x}（之後的版本）
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
