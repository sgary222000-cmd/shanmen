import { useEffect, useRef, useState } from 'react';
import type { SlotInfo } from '../../save/storage';
import { Art } from '../components/Art';
import { useUi } from '../store';

export function TitlePage() {
  const storage = useUi((s) => s.storage);
  const storageError = useUi((s) => s.storageError);
  const setScreen = useUi((s) => s.setScreen);
  const loadSlot = useUi((s) => s.loadSlot);
  const toast = useUi((s) => s.toast);
  const [latest, setLatest] = useState<SlotInfo | null>(null);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [showLoad, setShowLoad] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    if (!storage) return;
    const list = await storage.list();
    setSlots(list.filter((s) => s.summary));
    const slot = await storage.latest();
    setLatest(list.find((s) => s.slot === slot) ?? null);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);

  const onImport = async (file: File) => {
    if (!storage) return;
    const r = await storage.importText(await file.text(), new Date().toISOString());
    if (r.ok) {
      toast('ok', `已匯入到 ${r.slot}：${r.summary.sectName}・${r.summary.date}`);
      await refresh();
    } else toast('error', r.error);
  };

  return (
    <div className="title-screen">
      <h1>山門長生錄</h1>
      <p className="muted">單機修仙宗門經營・P0 核心試玩版（暫名）</p>
      <div className="box">
        <Art path="placeholder/panorama.svg" alt="宗門全景" />
      </div>
      <div className="box stack">
        {storageError && <p className="neg">{storageError}</p>}
        {latest?.summary && (
          <button className="btn gold" data-testid="continue" onClick={() => void loadSlot(latest.slot)}>
            繼續：{latest.summary.sectName}・{latest.summary.date}（{latest.label}）
          </button>
        )}
        <button className="btn" data-testid="new-game" onClick={() => setScreen('newgame')}>
          開創新局
        </button>
        <button className="btn secondary" disabled={!slots.length} onClick={() => setShowLoad(!showLoad)}>
          讀取存檔
        </button>
        {showLoad && (
          <div className="panel">
            {slots.map((s) => (
              <div key={s.slot} className="row" style={{ justifyContent: 'space-between' }}>
                <span>
                  {s.label}：{s.summary?.sectName}・{s.summary?.protagonistName}・{s.summary?.realm}・{s.summary?.date}
                </span>
                <button className="btn small" onClick={() => void loadSlot(s.slot)}>
                  讀取
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="btn secondary" disabled={!storage} onClick={() => fileRef.current?.click()}>
          匯入存檔檔案
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = '';
          }}
        />
        <p className="muted small">
          存檔保存在這個瀏覽器中（同一個網址）。請勿使用無痕模式，並定期在「存檔」頁匯出備份。
        </p>
      </div>
    </div>
  );
}
