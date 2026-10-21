import type { GameState } from '../engine';
import { formatDate } from '../engine/date';
import { realmName } from '../engine/systems/characters/characters';
import { migrate } from './migrations';
import { envelopeSchema, FORMAT_VERSION, SAVE_FORMAT, worldSchema, type SaveEnvelope, type SaveSummary } from './schema';

export const GAME_VERSION = '0.10.0';

/** FNV-1a 32 位元雜湊，用於偵測存檔損壞（不是防作弊）。 */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function summarize(state: GameState): SaveSummary {
  return {
    sectName: state.sectName,
    protagonistName: state.protagonist.name,
    realm: realmName(state.protagonist.realm),
    date: formatDate(state.date),
  };
}

export function toEnvelope(state: GameState, savedAt: string): SaveEnvelope {
  return {
    format: SAVE_FORMAT,
    formatVersion: FORMAT_VERSION,
    gameVersion: GAME_VERSION,
    savedAt,
    summary: summarize(state),
    checksum: checksum(JSON.stringify(state)),
    world: state,
  };
}

export type DecodeResult =
  | { ok: true; state: GameState; envelope: SaveEnvelope; migratedFrom: number | null }
  | { ok: false; error: string };

/** 驗證並解開存檔；必要時遷移到目前版本。不會修改傳入的資料。 */
export function decode(input: unknown): DecodeResult {
  const env = envelopeSchema.safeParse(input);
  if (!env.success) return { ok: false, error: '不是有效的山門長生錄存檔' };
  const envelope = env.data;
  if (envelope.formatVersion > FORMAT_VERSION) {
    return { ok: false, error: `存檔版本 v${envelope.formatVersion} 比遊戲新（v${FORMAT_VERSION}），請更新遊戲` };
  }
  if (checksum(JSON.stringify(envelope.world)) !== envelope.checksum) {
    return { ok: false, error: '存檔內容已損壞（校驗碼不符）' };
  }
  let world = structuredClone(envelope.world) as Record<string, unknown>;
  let migratedFrom: number | null = null;
  if (envelope.formatVersion < FORMAT_VERSION) {
    try {
      world = migrate(world, envelope.formatVersion, FORMAT_VERSION);
      migratedFrom = envelope.formatVersion;
    } catch (e) {
      return { ok: false, error: `存檔升版失敗：${(e as Error).message}` };
    }
  }
  const parsed = worldSchema.safeParse(world);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `存檔資料不完整：${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}` };
  }
  return { ok: true, state: world as unknown as GameState, envelope, migratedFrom };
}

export function parseText(text: string): DecodeResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: '檔案不是有效的 JSON' };
  }
  return decode(json);
}
