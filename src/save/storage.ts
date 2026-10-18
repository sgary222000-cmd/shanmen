import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { GameState } from '../engine';
import { decode, parseText, toEnvelope, type DecodeResult } from './codec';
import type { SaveEnvelope, SaveSummary } from './schema';

// 本機存檔（IndexedDB）。
// - 自動存檔 3 格輪替；手動存檔 8 格；升版前備份另存。
// - 每次寫入在同一個交易內完成（資料與指標一起成功或一起失敗），寫到一半不會毀掉舊檔。
// - 匯入只能放進空欄位，不會覆蓋現有存檔。

export const AUTO_SLOTS = ['auto-1', 'auto-2', 'auto-3'] as const;
export const MANUAL_SLOTS = Array.from({ length: 8 }, (_, i) => `manual-${i + 1}`);
const DB_NAME = 'shanmen';

interface SaveDB extends DBSchema {
  saves: { key: string; value: { slot: string; envelope: SaveEnvelope } };
  meta: { key: string; value: { key: string; value: number } };
}

export interface SlotInfo {
  slot: string;
  kind: 'auto' | 'manual' | 'backup';
  label: string;
  summary: SaveSummary | null;
  savedAt: string | null;
  formatVersion: number | null;
}

export class SaveStorage {
  private constructor(private db: IDBPDatabase<SaveDB>) {}

  static async open(): Promise<SaveStorage> {
    const db = await openDB<SaveDB>(DB_NAME, 1, {
      upgrade(d) {
        d.createObjectStore('saves', { keyPath: 'slot' });
        d.createObjectStore('meta', { keyPath: 'key' });
      },
    });
    return new SaveStorage(db);
  }

  /** 請求瀏覽器持久保存，降低被自動清除的機會。回傳是否成功。 */
  static async requestPersistence(): Promise<boolean> {
    try {
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) return await navigator.storage.persist();
    } catch {
      // 某些瀏覽器不支援，忽略
    }
    return false;
  }

  private async put(slot: string, envelope: SaveEnvelope, meta?: { key: string; value: number }): Promise<void> {
    const tx = this.db.transaction(['saves', 'meta'], 'readwrite');
    await tx.objectStore('saves').put({ slot, envelope });
    if (meta) await tx.objectStore('meta').put(meta);
    await tx.done;
  }

  async saveAuto(state: GameState, savedAt: string): Promise<string> {
    const pointer = (await this.db.get('meta', 'autoPointer'))?.value ?? 0;
    const next = (pointer % AUTO_SLOTS.length) + 1;
    const slot = `auto-${next}`;
    await this.put(slot, toEnvelope(state, savedAt), { key: 'autoPointer', value: next });
    return slot;
  }

  async saveManual(slot: string, state: GameState, savedAt: string): Promise<void> {
    if (!MANUAL_SLOTS.includes(slot)) throw new Error('不是手動存檔欄位');
    await this.put(slot, toEnvelope(state, savedAt));
  }

  async list(): Promise<SlotInfo[]> {
    const all = await this.db.getAll('saves');
    const bySlot = new Map(all.map((r) => [r.slot, r.envelope]));
    const info = (slot: string, kind: SlotInfo['kind'], label: string): SlotInfo => {
      const env = bySlot.get(slot);
      return {
        slot,
        kind,
        label,
        summary: env?.summary ?? null,
        savedAt: env?.savedAt ?? null,
        formatVersion: env?.formatVersion ?? null,
      };
    };
    const backups = all
      .filter((r) => r.slot.startsWith('backup-'))
      .map((r) => info(r.slot, 'backup', `升版前備份（v${r.envelope.formatVersion}）`));
    return [
      ...AUTO_SLOTS.map((s, i) => info(s, 'auto', `自動存檔 ${i + 1}`)),
      ...MANUAL_SLOTS.map((s, i) => info(s, 'manual', `手動存檔 ${i + 1}`)),
      ...backups,
    ];
  }

  /** 最新的存檔（「繼續遊戲」用）。 */
  async latest(): Promise<string | null> {
    const all = await this.db.getAll('saves');
    const sorted = all.filter((r) => !r.slot.startsWith('backup-')).sort((a, b) => (a.envelope.savedAt < b.envelope.savedAt ? 1 : -1));
    return sorted[0]?.slot ?? null;
  }

  /** 讀檔。若需升版，先把原檔另存為備份再回傳升版後的狀態。 */
  async load(slot: string): Promise<DecodeResult> {
    const rec = await this.db.get('saves', slot);
    if (!rec) return { ok: false, error: '這個欄位沒有存檔' };
    const result = decode(rec.envelope);
    if (result.ok && result.migratedFrom !== null) {
      const backupSlot = `backup-${slot}-v${result.migratedFrom}`;
      if (!(await this.db.get('saves', backupSlot))) await this.put(backupSlot, rec.envelope);
    }
    return result;
  }

  async remove(slot: string): Promise<void> {
    await this.db.delete('saves', slot);
  }

  async exportText(slot: string): Promise<string> {
    const rec = await this.db.get('saves', slot);
    if (!rec) throw new Error('這個欄位沒有存檔');
    return JSON.stringify(rec.envelope);
  }

  /** 匯入存檔到第一個空的手動欄位；沒有空欄位時拒絕，不覆蓋現有存檔。 */
  async importText(
    text: string,
    savedAt: string,
  ): Promise<{ ok: true; slot: string; summary: SaveSummary; migratedFrom: number | null } | { ok: false; error: string }> {
    const result = parseText(text);
    if (!result.ok) return result;
    const used = new Set((await this.db.getAllKeys('saves')).map(String));
    const empty = MANUAL_SLOTS.find((s) => !used.has(s));
    if (!empty) return { ok: false, error: '手動存檔欄位已滿，請先刪除一個手動存檔再匯入' };
    const envelope = toEnvelope(result.state, savedAt);
    await this.put(empty, envelope);
    return { ok: true, slot: empty, summary: envelope.summary, migratedFrom: result.migratedFrom };
  }

  close(): void {
    this.db.close();
  }
}
