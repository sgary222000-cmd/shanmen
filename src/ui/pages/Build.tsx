import { balance } from '../../content/balance';
import { buildOptions, CANCEL_REFUND_PCT, usedSlots } from '../../engine/systems/buildings/buildings';
import { Art } from '../components/Art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

export function BuildPage() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const options = buildOptions(game, content);
  return (
    <div>
      <h2>建設・主峰</h2>
      <p className="muted">
        建築槽位 {usedSlots(game)} / {balance.slots}。材料於開工時付清；完工後下個月才開始運作；取消施工退還 {CANCEL_REFUND_PCT}% 材料。
        <span className="tag provisional">數值暫定</span>
      </p>
      <p className="muted small">P0 只有主峰一個區域，其他區域（外山、靈泉谷、地火峰、後山、山門）於 P1 開放。</p>
      <div className="grid three">
        {options.map(({ def, existing, next, blocked }) => {
          const current = existing && existing.level > 0 ? def.levels[existing.level - 1] : undefined;
          const locked = !existing && def.unlockHall > (game.buildings.find((b) => b.defId === 'building.hall')?.level ?? 0);
          const action = !existing ? '建造' : existing.level === 0 ? (def.id === 'building.hall' ? '修復' : '建造') : '升級';
          return (
            <div key={def.id} className="panel" style={{ opacity: locked ? 0.6 : 1 }} data-testid={`building-${def.id}`}>
              <Art path={def.art} alt={def.name} />
              <h3 style={{ marginTop: '.5rem' }}>
                {def.name}{' '}
                {existing ? (
                  <span className="tag">{existing.level ? `${existing.level} 級` : '殘破'}</span>
                ) : (
                  <span className="tag locked">未建</span>
                )}
                {existing?.status === 'disabled' && <span className="tag neg">停用：{existing.disabledReason}</span>}
              </h3>
              <p className="small">{def.description}</p>
              {current && <p className="small">目前：{current.summary}　維護：<ResList value={current.maintenance} /></p>}
              {existing?.construction ? (
                <div>
                  <p>
                    施工中 → {existing.construction.targetLevel} 級，剩 {existing.construction.remainingMonths} 個月
                  </p>
                  <button className="btn danger small" onClick={() => dispatch({ type: 'cancelConstruction', buildingId: existing.id })}>
                    取消施工（退還一半）
                  </button>
                </div>
              ) : next ? (
                <div>
                  <p className="small">
                    {action}至 {next.level} 級：{next.summary}
                    <br />
                    費用：<ResList value={next.cost} />・工期 {next.months} 個月・維護 <ResList value={next.maintenance} />
                  </p>
                  <button
                    className="btn small"
                    disabled={!!blocked}
                    title={blocked}
                    data-testid={`build-${def.id}`}
                    onClick={() => dispatch({ type: 'build', defId: def.id })}
                  >
                    {action}
                  </button>
                  {blocked && <span className="muted small"> {blocked}</span>}
                </div>
              ) : (
                <p className="muted small">本階段已達最高等級（P1 開放更高等級）。</p>
              )}
              {existing?.defId === 'building.field' && existing.level > 0 && (
                <div className="row small" style={{ marginTop: '.4rem' }}>
                  作物：
                  {(['food', 'herb'] as const).map((c) => (
                    <button
                      key={c}
                      className={`btn small ${existing.crop === c ? '' : 'secondary'}`}
                      onClick={() => dispatch({ type: 'setCrop', buildingId: existing.id, crop: c })}
                    >
                      {c === 'food' ? '糧食' : '藥草'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
