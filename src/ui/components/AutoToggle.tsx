import type { AutoAssign } from '../../engine';
import { findCharacter } from '../../engine/systems/characters/characters';
import { content, useGame, useUi } from '../store';

// 自動出征（0.10.0）：用目前勾選的名單設定，或關閉。名單裡有其他行程的人到時會自動略過。

type Kind = keyof AutoAssign;

export function AutoToggle<K extends Kind>({ kind, config, label }: { kind: K; config: NonNullable<AutoAssign[K]>; label: string }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const cur = game.auto?.[kind];
  const ids = config.ids.filter((id) => findCharacter(game, id)?.role === 'inner').slice(0, 3);
  const names = (list: string[]) =>
    list
      .map((id) => findCharacter(game, id)?.name)
      .filter(Boolean)
      .join('、');
  const where = cur && 'realmId' in cur ? `・${content.secretRealms.get(cur.realmId as string)?.name ?? ''}` : '';
  return (
    <div className="small auto-toggle" data-testid={`auto-${kind}`}>
      <b>自動出征</b>：
      {cur ? (
        <span className="pos">
          已開啟（{names(cur.ids) || '名單裡的人都不在了'}
          {where}）
        </span>
      ) : (
        <span className="muted">未開啟</span>
      )}{' '}
      <button
        className="btn small secondary"
        data-testid={`auto-${kind}-set`}
        disabled={!ids.length}
        title={ids.length ? undefined : '先勾選內門弟子（最多 3 人，掌門不算）'}
        onClick={() => dispatch({ type: 'setAuto', kind, config: { ...config, ids } })}
      >
        用目前勾選的人{cur ? '更新' : '開啟'}
      </button>
      {cur && (
        <button className="btn small secondary" data-testid={`auto-${kind}-off`} onClick={() => dispatch({ type: 'setAuto', kind, config: null })}>
          關閉
        </button>
      )}
      <div className="muted">{label}名單裡受傷、外出、閉關、突破或有其他行程（掌爐、研究等）的人會自動略過，結果寫進月報。</div>
    </div>
  );
}
