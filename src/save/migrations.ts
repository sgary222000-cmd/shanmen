// 存檔升版遷移。每次世界狀態格式改變：STATE_VERSION +1，並在這裡加入一支「舊版 → 新版」函式。
// 讀到舊存檔時依序執行；遷移前原檔會另存為升版前備份（見 storage.ts）。

type World = Record<string, unknown>;

export const migrations: Record<number, (w: World) => World> = {
  // v1 → v2：加入山下商隊交易紀錄與自動戰鬥策略。
  // （v1 是 P0 開發初期的格式，保留這支遷移作為遷移流程的實際範例與測試對象。）
  1: (w) => ({
    ...w,
    version: 2,
    trade: { soldLingshi: 0, boughtFood: 0 },
    strategy: { useHealPill: true, focusLowest: true },
  }),
};

export function migrate(world: World, from: number, to: number): World {
  let w = world;
  for (let v = from; v < to; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`缺少存檔遷移：v${v} → v${v + 1}`);
    w = step(w);
  }
  return w;
}
