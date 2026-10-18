import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { applyCommand, monthIndex } from '../../src/engine';
import { checksum, decode, parseText, toEnvelope } from '../../src/save/codec';
import { FORMAT_VERSION } from '../../src/save/schema';
import { SaveStorage } from '../../src/save/storage';
import { botTurn } from '../../tools/bot';
import { advance, content, developed, fresh, run } from './helpers';

const T = (n: number) => `2026-10-18T00:00:${String(n).padStart(2, '0')}.000Z`;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

/** 用自動玩家玩一段時間，產生內容豐富的狀態。 */
function played(years: number) {
  let s = fresh(77);
  for (let i = 0; i < years * 12; i++) {
    s = botTurn(s, content, []);
    const r = applyCommand(s, content, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

describe('存檔往返', () => {
  it('存檔後讀回，狀態完全相同（含亂數狀態）', async () => {
    const s = played(5);
    const db = await SaveStorage.open();
    await db.saveManual('manual-1', s, T(1));
    const back = await db.load('manual-1');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(s));
    // 讀檔後繼續玩，與未存讀的分支結果一致
    const a = advance(back.state, 12);
    const b = advance(s, 12);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('自動存檔三格輪替', async () => {
    const db = await SaveStorage.open();
    let s = fresh();
    const slots: string[] = [];
    for (let i = 0; i < 4; i++) {
      s = advance(s);
      slots.push(await db.saveAuto(s, T(i)));
    }
    expect(slots).toEqual(['auto-1', 'auto-2', 'auto-3', 'auto-1']);
    const list = await db.list();
    expect(list.find((x) => x.slot === 'auto-1')?.summary?.date).toBe('第 1 年 5 月');
    expect(await db.latest()).toBe('auto-1');
  });

  it('損壞的存檔匯入會被拒絕，且不影響現有存檔', async () => {
    const db = await SaveStorage.open();
    const s = developed();
    await db.saveManual('manual-1', s, T(1));
    const text = await db.exportText('manual-1');
    const tampered = text.replace('"lingshi":2000', '"lingshi":999999');
    const r = await db.importText(tampered, T(2));
    expect(r.ok).toBe(false);
    expect((await db.importText('not json', T(3))).ok).toBe(false);
    expect((await db.importText('{"format":"other"}', T(4))).ok).toBe(false);
    const still = await db.load('manual-1');
    expect(still.ok && still.state.resources.lingshi).toBe(2000);
  });

  it('匯入放進空欄位，不覆蓋現有存檔；欄位滿時拒絕', async () => {
    const db = await SaveStorage.open();
    const s = developed();
    await db.saveManual('manual-1', s, T(1));
    const text = await db.exportText('manual-1');
    const r = await db.importText(text, T(2));
    expect(r.ok && r.slot).toBe('manual-2');
    for (let i = 3; i <= 8; i++) await db.saveManual(`manual-${i}`, s, T(i));
    const full = await db.importText(text, T(9));
    expect(full.ok).toBe(false);
  });

  it('資料不合法（資源為負）即使校驗碼正確也會被拒絕', () => {
    const s = structuredClone(developed());
    s.resources.food = -5;
    const env = toEnvelope(s, T(1));
    expect(env.checksum).toBe(checksum(JSON.stringify(s)));
    expect(decode(env).ok).toBe(false);
  });
});

describe('存檔升版', () => {
  it('v1 存檔可升到目前版本，並另存升版前備份', async () => {
    const fixture = (await import('../fixtures/save-v1.json')).default;
    const r = decode(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.state.version).toBe(FORMAT_VERSION);
    expect(r.state.trade).toEqual({ soldLingshi: 0, boughtFood: 0 });
    // 升版後可以繼續玩
    const after = run(r.state, { type: 'advanceMonth', expectMonth: monthIndex(r.state.date) });
    expect(after.stats.monthsAdvanced).toBe(r.state.stats.monthsAdvanced + 1);

    const db = await SaveStorage.open();
    const imported = await db.importText(JSON.stringify(fixture), T(1));
    expect(imported.ok).toBe(true);
  });

  it('讀取舊版存檔時先另存升版前備份', async () => {
    const fixture = (await import('../fixtures/save-v1.json')).default;
    const db = await SaveStorage.open();
    db.close();
    const { openDB } = await import('idb');
    const raw = await openDB('shanmen', 1);
    await raw.put('saves', { slot: 'manual-3', envelope: fixture });
    raw.close();
    const db2 = await SaveStorage.open();
    const r = await db2.load('manual-3');
    expect(r.ok).toBe(true);
    const list = await db2.list();
    const backup = list.find((x) => x.kind === 'backup');
    expect(backup?.formatVersion).toBe(1);
    expect(list.find((x) => x.slot === 'manual-3')?.formatVersion).toBe(1); // 原欄位不被改寫
  });

  it('比遊戲新的存檔版本會被拒絕', () => {
    const env = toEnvelope(fresh(), T(1));
    const r = parseText(JSON.stringify({ ...env, formatVersion: FORMAT_VERSION + 5 }));
    expect(r.ok).toBe(false);
  });
});
