import { writeFileSync } from 'node:fs';
import { content } from '../src/content/registry';
import { newGame } from '../src/engine';
import { checksum } from '../src/save/codec';

// 產生 v1 格式的範例存檔，供遷移測試使用。只在格式變更時需要重新產生。
const s = newGame(content, { sectName: '舊檔宗', protagonistName: '舊檔', gender: 'female', lineage: 'lineage.sword', seed: 1 });
const world: Record<string, unknown> = { ...s, version: 1 };
delete world.trade;
delete world.strategy;
const env = {
  format: 'shanmen-save',
  formatVersion: 1,
  gameVersion: '0.0.1',
  savedAt: '2026-10-18T00:00:00.000Z',
  summary: { sectName: '舊檔宗', protagonistName: '舊檔', realm: '煉氣一層', date: '第 1 年 1 月' },
  checksum: checksum(JSON.stringify(world)),
  world,
};
writeFileSync('tests/fixtures/save-v1.json', JSON.stringify(env, null, 2));
console.log('wrote tests/fixtures/save-v1.json');
