import { useEffect, useRef, useState } from 'react';
import type { SlotInfo } from '../../save/storage';
import { useGame, useUi } from '../store';

function download(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SavesPage() {
  const game = useGame();
  const storage = useUi((s) => s.storage);
  const toast = useUi((s) => s.toast);
  const loadSlot = useUi((s) => s.loadSlot);
  const setScreen = useUi((s) => s.setScreen);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = async () => setSlots(storage ? await storage.list() : []);
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, game.date]);

  if (!storage) return <p className="neg">無法使用本機存檔（可能是無痕模式或瀏覽器封鎖網站資料）。</p>;

  const save = async (slot: string) => {
    await storage.saveManual(slot, game, new Date().toISOString());
    toast('ok', '已存檔。');
    setConfirm(null);
    await refresh();
  };
  const exportSlot = async (s: SlotInfo) => {
    const text = await storage.exportText(s.slot);
    // 檔名只用英數字，避免部分系統處理中文檔名出問題
    const stamp = (s.savedAt ?? '').slice(0, 10);
    download(`shanmen-${s.slot}-${stamp}.json`, text);
  };

  return (
    <div>
      <h2>存檔</h2>
      <p className="muted small">
        每次推進月份後自動存檔（三格輪替）。存檔保存在這個瀏覽器、這個網址底下；換瀏覽器、清除網站資料或使用無痕模式都會看不到。
        重要進度請「匯出」成檔案備份。
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>欄位</th>
              <th>內容</th>
              <th>存檔時間</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {slots.map((s) => (
              <tr key={s.slot} data-testid={`slot-${s.slot}`}>
                <td>{s.label}</td>
                <td>
                  {s.summary ? `${s.summary.sectName}・${s.summary.protagonistName}・${s.summary.realm}・${s.summary.date}` : <span className="muted">（空）</span>}
                </td>
                <td className="small">{s.savedAt ? new Date(s.savedAt).toLocaleString('zh-TW') : ''}</td>
                <td>
                  <div className="row">
                    {s.kind === 'manual' &&
                      (s.summary && confirm !== s.slot ? (
                        <button className="btn small secondary" onClick={() => setConfirm(s.slot)}>
                          覆蓋存檔
                        </button>
                      ) : (
                        <button className="btn small" data-testid={`save-${s.slot}`} onClick={() => void save(s.slot)}>
                          {s.summary ? '確定覆蓋' : '存在這裡'}
                        </button>
                      ))}
                    {s.summary && (
                      <>
                        <button className="btn small secondary" onClick={() => void loadSlot(s.slot)}>
                          讀取
                        </button>
                        <button className="btn small secondary" onClick={() => void exportSlot(s)}>
                          匯出
                        </button>
                        {s.kind !== 'auto' && (
                          <button
                            className="btn small danger"
                            onClick={async () => {
                              await storage.remove(s.slot);
                              toast('info', '已刪除存檔。');
                              await refresh();
                            }}
                          >
                            刪除
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: '.6rem' }}>
          <button className="btn secondary" onClick={() => fileRef.current?.click()}>
            匯入存檔檔案（放進空的手動欄位）
          </button>
          <button className="btn secondary" onClick={() => setScreen('title')}>
            回到標題畫面
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              const r = await storage.importText(await f.text(), new Date().toISOString());
              if (r.ok) toast('ok', `已匯入：${r.summary.sectName}・${r.summary.date}`);
              else toast('error', r.error);
              await refresh();
            }}
          />
        </div>
      </div>
    </div>
  );
}
