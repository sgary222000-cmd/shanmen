import { balance } from '../../content/balance';
import type { ResourceId } from '../../engine';
import { RESOURCE_NAMES } from '../../engine/resources';
import { content, useGame, useUi } from '../store';

// 戰前準備（0.11.0）：短效屬性丹、控制符（最多兩種）。秘境探索與護衛委託共用同一份戰鬥策略。

const CONTROL = Object.keys(balance.controlTalismans.rounds) as ResourceId[];
const BUFFS = Object.keys(balance.attributes.shortPills) as ResourceId[];
const CONTROL_DESC: Partial<Record<ResourceId, string>> = {
  talisman_bind: '最強一人不能行動',
  talisman_break: '全體防禦 −30%',
  talisman_slow: '全體敏捷 −30%',
  talisman_confuse: '全體命中下降',
  talisman_seal: '最強一人不能施展招式',
};

export function BattlePrep() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const st = game.strategy;
  const control = st.control ?? [];
  const set = (patch: { useBuffPills?: boolean; control?: ResourceId[] }) =>
    dispatch({ type: 'setStrategy', useHealPill: st.useHealPill, focusLowest: st.focusLowest, ...patch });
  const extra = content.lineages.get(game.lineage)?.bonuses.controlRounds ?? 0;
  return (
    <div className="small" data-testid="battle-prep">
      <label>
        <input type="checkbox" data-testid="use-buff-pills" checked={!!st.useBuffPills} onChange={(e) => set({ useBuffPills: e.target.checked })} />{' '}
        戰前每人服一顆短效屬性丹（{BUFFS.map((id) => `${RESOURCE_NAMES[id]} ${game.resources[id]}`).join('、')}）
      </label>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        戰前祭出控制符（最多兩種，每種一張{extra ? `；符陣傳承持續 +${extra} 回合` : ''}）：
        {CONTROL.map((id) => {
          const on = control.includes(id);
          return (
            <label key={id} title={CONTROL_DESC[id]}>
              <input
                type="checkbox"
                data-testid={`control-${id}`}
                checked={on}
                disabled={!on && control.length >= balance.controlTalismans.maxKinds}
                onChange={() => set({ control: on ? control.filter((x) => x !== id) : [...control, id] })}
              />
              {RESOURCE_NAMES[id]}（{CONTROL_DESC[id]}，庫存 {game.resources[id]}）
            </label>
          );
        })}
      </div>
    </div>
  );
}
