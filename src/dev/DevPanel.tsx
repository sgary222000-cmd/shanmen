import { useState } from 'react';
import type { GameState } from '../engine';
import { monthIndex } from '../engine';
import { applyCommand } from '../engine';
import { xpToNext } from '../engine/systems/characters/characters';
import { content, useUi } from '../ui/store';

// 開發測試工具：只在 `npm run dev` 出現，正式建置不包含。會直接修改狀態，僅供測試。
export default function DevPanel() {
  const game = useUi((s) => s.game);
  const replace = useUi((s) => s.replaceGame);
  const [open, setOpen] = useState(false);
  if (!game) return null;
  const edit = (fn: (s: GameState) => void) => {
    const s = structuredClone(game);
    fn(s);
    replace(s);
  };
  const skipMonths = (n: number) => {
    let s = game;
    for (let i = 0; i < n; i++) {
      for (const ev of s.events) {
        const r = applyCommand(s, content, ev.kind === 'recruitment' ? { type: 'resolveRecruitment', eventId: ev.id, candidateId: null } : { type: 'dismissEvent', eventId: ev.id });
        if (r.ok) s = r.state;
      }
      const r = applyCommand(s, content, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
      if (!r.ok) break;
      s = r.state;
    }
    replace(s);
  };
  return (
    <div className="dev">
      <button onClick={() => setOpen(!open)}>開發工具</button>
      {open && (
        <div>
          <button onClick={() => edit((s) => { for (const k of Object.keys(s.resources) as (keyof typeof s.resources)[]) s.resources[k] += 500; })}>資源 +500</button>
          <button onClick={() => skipMonths(12)}>快轉 12 個月</button>
          <button onClick={() => edit((s) => { s.protagonist.xp = xpToNext(s.protagonist.realm); })}>主角修為滿</button>
          <button onClick={() => edit((s) => { for (const c of [s.protagonist, ...s.disciples]) { c.injuryMonths = 0; c.health = 100; } })}>全員痊癒</button>
          <button onClick={() => edit((s) => { s.exploredThisMonth = false; })}>重置本月探索</button>
        </div>
      )}
    </div>
  );
}
