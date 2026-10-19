import { useState } from 'react';
import type { Building } from '../../engine';
import {
  CANCEL_REFUND_PCT,
  DEMOLISH_REFUND_PCT,
  demolishBlocked,
  demolishRefund,
  hallLevel,
  newBuildOptions,
  upgradeOption,
  usedSlots,
} from '../../engine/systems/buildings/buildings';
import { workersByBuilding } from '../../engine/systems/economy/flows';
import { openRegionBlocked, productionBonusPct, regionState } from '../../engine/systems/regions/regions';
import { Art } from '../components/Art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';
import { repairBlocked, repairCost } from '../../engine/systems/world/war';

function BuildingCard({ b }: { b: Building }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [confirm, setConfirm] = useState(false);
  const { def, next, cost, blocked } = upgradeOption(game, content, b);
  const current = b.level > 0 ? def.levels[b.level - 1] : undefined;
  const action = b.level === 0 ? (def.id === 'building.hall' ? '修復' : '建造') : '升級';
  const noDemolish = demolishBlocked(b);
  return (
    <div className="panel bcard" data-testid={`bld-${b.id}`}>
      <Art path={b.level === 0 && def.artRuined ? def.artRuined : def.art} alt={def.name} />
      <h3>
        {def.name} <span className="tag">{b.level ? `${b.level} 級` : b.construction ? '施工中' : '殘破'}</span>
        {b.status === 'disabled' && <span className="tag neg">停用：{b.disabledReason}</span>}
        {b.damaged && <span className="tag neg">損毀</span>}
      </h3>
      {b.damaged && (
        <p className="small">
          山門戰中損毀，修好前停用。
          <button
            className="btn small"
            data-testid={`repair-${b.id}`}
            disabled={!!repairBlocked(game, content, b.id)}
            title={repairBlocked(game, content, b.id)}
            onClick={() => dispatch({ type: 'repairBuilding', buildingId: b.id })}
          >
            修復（<ResList value={repairCost(content, b)} />）
          </button>
        </p>
      )}
      <p className="small">{def.description}</p>
      {current && (
        <p className="small">
          目前：{current.summary}　維護：<ResList value={current.maintenance} />
        </p>
      )}
      {current?.effects.workerSlots !== undefined && (
        <p className="small">
          本月工人 {workersByBuilding(game, content)[b.id] ?? 0} / {current.effects.workerSlots}
          {productionBonusPct(game, content, b.region, b.defId) !== 0 && `・產量 +${productionBonusPct(game, content, b.region, b.defId)}%（區域與傳承）`}
          {b.defId === 'building.field' && '・種糧食的靈田優先分到工人'}
        </p>
      )}
      {b.construction ? (
        <div>
          <p>
            施工中 → {b.construction.targetLevel} 級，剩 {b.construction.remainingMonths} 個月
          </p>
          <button className="btn danger small" onClick={() => dispatch({ type: 'cancelConstruction', buildingId: b.id })}>
            取消施工（退還 {CANCEL_REFUND_PCT}%）
          </button>
        </div>
      ) : next ? (
        <div>
          <p className="small">
            {action}至 {next.level} 級：{next.summary}
            <br />
            費用：<ResList value={cost} />・工期 {next.months} 個月・維護 <ResList value={next.maintenance} />
          </p>
          <button
            className="btn small"
            disabled={!!blocked}
            title={blocked}
            data-testid={`upgrade-${b.id}`}
            onClick={() => dispatch({ type: 'upgrade', buildingId: b.id })}
          >
            {action}
          </button>
          {blocked && <span className="muted small"> {blocked}</span>}
        </div>
      ) : (
        <p className="muted small">已達最高等級。</p>
      )}
      {b.defId === 'building.field' && b.level > 0 && (
        <div className="row small" style={{ marginTop: '.4rem' }}>
          作物：
          {(['food', 'herb'] as const).map((c) => (
            <button
              key={c}
              className={`btn small ${b.crop === c ? '' : 'secondary'}`}
              onClick={() => dispatch({ type: 'setCrop', buildingId: b.id, crop: c })}
            >
              {c === 'food' ? '糧食' : '藥草'}
            </button>
          ))}
        </div>
      )}
      {!noDemolish && b.level > 0 && (
        <div className="row small" style={{ marginTop: '.4rem' }}>
          {confirm ? (
            <>
              <span>
                確定拆除？退還 <ResList value={demolishRefund(content, b)} />，空出一個槽位。
              </span>
              <button className="btn danger small" data-testid={`demolish-confirm-${b.id}`} onClick={() => dispatch({ type: 'demolish', buildingId: b.id })}>
                確定拆除
              </button>
              <button className="btn secondary small" onClick={() => setConfirm(false)}>
                不拆
              </button>
            </>
          ) : (
            <button className="btn secondary small" data-testid={`demolish-${b.id}`} onClick={() => setConfirm(true)}>
              拆除（退還 {DEMOLISH_REFUND_PCT}% 造價）
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RegionView({ regionId }: { regionId: string }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const region = content.regions.get(regionId);
  if (!region) return null;
  const rs = regionState(game, regionId);
  const here = game.buildings.filter((b) => b.region === regionId);
  const options = newBuildOptions(game, content, regionId);
  const allowNames =
    region.allows === 'any'
      ? `限定區域以外的建築（${[...content.buildings.values()].filter((d) => d.onlyRegions && !d.onlyRegions.includes(regionId)).map((d) => d.name).join('、')}要蓋在別區）`
      : region.allows.map((id) => content.buildings.get(id)?.name ?? id).join('、') || '下一批開放';
  return (
    <div>
      <div className="panel region-panel">
        <div className="room-head region-head">
          <Art path={region.art} alt={region.name} />
          <h3>{region.name}</h3>
        </div>
        <h3 className="region-meta">
          {region.name}{' '}
          {rs.status === 'open' ? (
            <span className="tag">
              槽位 {usedSlots(game, regionId)} / {region.slots}
            </span>
          ) : rs.status === 'opening' ? (
            <span className="tag gold">{region.unlock?.action}中，剩 {rs.construction?.remainingMonths} 個月</span>
          ) : (
            <span className="tag locked">未開放</span>
          )}
          <span className="tag provisional">數值暫定</span>
        </h3>
        <p className="small">{region.description}</p>
        <p className="small">
          區域加成：{region.bonusText}　可建造：{allowNames}
        </p>
        {rs.status === 'locked' && region.unlock && (
          <div>
            <p className="small">
              {region.unlock.action}：<ResList value={region.unlock.cost} />・工期 {region.unlock.months} 個月
              {region.unlock.requiresHall > 0 && `・需要大殿 ${region.unlock.requiresHall} 級`}
            </p>
            {(() => {
              const blocked = openRegionBlocked(game, content, regionId, hallLevel(game));
              return (
                <>
                  <button
                    className="btn small gold"
                    disabled={!!blocked}
                    title={blocked}
                    data-testid={`open-region-${regionId}`}
                    onClick={() => dispatch({ type: 'openRegion', regionId })}
                  >
                    {region.unlock.action}
                  </button>
                  {blocked && <span className="muted small"> {blocked}</span>}
                </>
              );
            })()}
          </div>
        )}
      </div>
      {here.length > 0 && (
        <>
          <h3 className="sec">已有建築</h3>
          <div className="grid three fill">
            {here.map((b) => (
              <BuildingCard key={b.id} b={b} />
            ))}
          </div>
        </>
      )}
      {rs.status === 'open' && options.length > 0 && (
        <>
          <h3 className="sec">新建</h3>
          <div className="grid three fill">
            {options.map(({ def, next, cost, blocked }) => (
              <div key={def.id} className={`panel bcard${blocked ? ' locked' : ''}`} data-testid={`new-${def.id}`}>
                <Art path={def.art} alt={def.name} />
                <h3>
                  {def.name} <span className="tag locked">未建</span>
                </h3>
                <p className="small">{def.description}</p>
                <p className="small">
                  建造至 1 級：{next.summary}
                  <br />
                  費用：<ResList value={cost} />・工期 {next.months} 個月・維護 <ResList value={next.maintenance} />
                </p>
                <button
                  className="btn small"
                  disabled={!!blocked}
                  title={blocked}
                  data-testid={`build-${def.id}`}
                  onClick={() => dispatch({ type: 'build', defId: def.id, regionId })}
                >
                  建造
                </button>
                {blocked && <span className="muted small"> {blocked}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function BuildPage() {
  const game = useGame();
  const [regionId, setRegion] = useState('region.main');
  return (
    <div>
      <h2>建設</h2>
      <p className="muted">
        材料於開工時付清；完工後下個月才開始運作；取消施工退還 {CANCEL_REFUND_PCT}% 材料；拆除退還 {DEMOLISH_REFUND_PCT}% 已投入的基本造價。
        <span className="tag provisional">數值暫定</span>
      </p>
      <div className="tabs">
        {[...content.regions.values()].map((r) => {
          const rs = regionState(game, r.id);
          const label = rs.status === 'open' ? `${usedSlots(game, r.id)}/${r.slots}` : rs.status === 'opening' ? '施工中' : '未開放';
          return (
            <button key={r.id} className={regionId === r.id ? 'on' : ''} data-testid={`region-tab-${r.id}`} onClick={() => setRegion(r.id)}>
              {r.name}（{label}）
            </button>
          );
        })}
      </div>
      <RegionView regionId={regionId} />
    </div>
  );
}
