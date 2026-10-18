import type { GameState, RngState, RngStream } from './types';

// xoshiro128**：狀態可完整存進存檔，讀檔後序列一致。
// 引擎內禁止使用 Math.random，所有隨機都必須經過這裡。

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

export function nextUint32(s: RngState): number {
  const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
  const t = (s[1] << 9) >>> 0;
  s[2] = (s[2] ^ s[0]) >>> 0;
  s[3] = (s[3] ^ s[1]) >>> 0;
  s[1] = (s[1] ^ s[2]) >>> 0;
  s[0] = (s[0] ^ s[3]) >>> 0;
  s[2] = (s[2] ^ t) >>> 0;
  s[3] = rotl(s[3], 11);
  return result;
}

/** splitmix32，用來從一個種子展開出完整狀態。 */
function splitmix32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

export function seedState(seed: number): RngState {
  const sm = splitmix32(seed);
  const s: RngState = [sm(), sm(), sm(), sm()];
  if (s.every((v) => v === 0)) s[0] = 1;
  return s;
}

// 新的亂數流只能加在最後，既有種子產生的序列才不會改變。
export const RNG_STREAMS: RngStream[] = ['world', 'recruit', 'alchemy', 'combat', 'explore', 'cultivation', 'market', 'commission'];

export function seedAll(seed: number): Record<RngStream, RngState> {
  const out = {} as Record<RngStream, RngState>;
  RNG_STREAMS.forEach((stream, i) => {
    out[stream] = seedState((seed ^ Math.imul(i + 1, 0x27d4eb2d)) >>> 0);
  });
  return out;
}

/** 依存檔中的狀態取得亂數工具；會直接推進 state.rng。 */
export function rng(state: GameState, stream: RngStream) {
  const s = state.rng[stream];
  return {
    /** [0, n) 的整數 */
    int(n: number): number {
      if (n <= 0) return 0;
      return nextUint32(s) % n;
    },
    /** [min, max] 的整數 */
    range(min: number, max: number): number {
      return min + (nextUint32(s) % (max - min + 1));
    },
    /** 以萬分比判定成功 */
    chance(bp: number): boolean {
      return nextUint32(s) % 10000 < bp;
    },
    pick<T>(arr: readonly T[]): T {
      const v = arr[nextUint32(s) % arr.length];
      if (v === undefined) throw new Error('pick from empty array');
      return v;
    },
  };
}
