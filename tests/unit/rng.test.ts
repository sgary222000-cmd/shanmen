import { describe, expect, it } from 'vitest';
import { nextUint32, seedState } from '../../src/engine/rng';
import { fresh } from './helpers';

describe('可保存的亂數', () => {
  it('同種子產生相同序列', () => {
    const a = seedState(42);
    const b = seedState(42);
    for (let i = 0; i < 100; i++) expect(nextUint32(a)).toBe(nextUint32(b));
  });

  it('保存狀態後可接續相同序列', () => {
    const s = seedState(7);
    for (let i = 0; i < 10; i++) nextUint32(s);
    const saved = JSON.parse(JSON.stringify(s));
    const expected = [nextUint32(s), nextUint32(s), nextUint32(s)];
    expect([nextUint32(saved), nextUint32(saved), nextUint32(saved)]).toEqual(expected);
  });

  it('同種子建立相同新遊戲', () => {
    expect(JSON.stringify(fresh(99))).toBe(JSON.stringify(fresh(99)));
    expect(JSON.stringify(fresh(99))).not.toBe(JSON.stringify(fresh(100)));
  });

  it('引擎程式碼不使用 Math.random 或系統時間', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.ts$/.test(f)) {
          const src = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '');
          if (/Math\.random|Date\.now|new Date\(/.test(src)) offenders.push(p);
        }
      }
    };
    walk('src/engine');
    walk('src/content');
    expect(offenders).toEqual([]);
  });
});
