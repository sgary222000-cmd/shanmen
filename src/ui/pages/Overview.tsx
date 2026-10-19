import { useMemo } from 'react';
import { computeAlerts, formatDate } from '../../engine';
import { hallLevel, innerLimit, outerCapacity, qiCapacity } from '../../engine/systems/buildings/buildings';
import { qiDemandOf, realmName, xpToNext } from '../../engine/systems/characters/characters';
import { qiEfficiencyPct } from '../../engine/systems/cultivation/cultivation';
import { currentStep, TUTORIAL_STEPS } from '../../engine/systems/tutorial';
import { regionState } from '../../engine/systems/regions/regions';
import { AlertList } from '../components/Alerts';
import { artUrl, portraitOf } from '../art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

// 宗門主畫面的可點擊區域位置（百分比），對應 assets/final/panorama.webp 的建築位置。
const SPOTS: Record<string, [number, number]> = {
  'building.hall': [53, 41],
  'building.dorm': [28, 77],
  'building.field': [80, 88],
  'building.quarry': [12, 70],
  'building.lumber': [84, 40],
  'building.alchemy': [74, 60],
  'building.array': [33, 47],
};

/** 視窗裡的引導提示條：在各頁操作時也看得到目前步驟。 */
export function TutorialStrip() {
  const game = useGame();
  const step = currentStep(game);
  if (!step) return null;
  return (
    <div className="tutorial-strip" data-testid="tutorial-strip">
      <span className="k">
        引導 {game.tutorial.done.length + 1}/{TUTORIAL_STEPS.length}・{step.title}
      </span>
      <span>{step.hint}</span>
    </div>
  );
}

function TutorialCard() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const step = currentStep(game);
  if (!step) return null;
  const done = game.tutorial.done.length;
  return (
    <div className="hud-card quest" data-testid="tutorial">
      <div className="hud-title">
        <span>
          引導 {done + 1}/{TUTORIAL_STEPS.length}
        </span>
        <button className="link" onClick={() => dispatch({ type: 'skipTutorial' })}>
          略過引導
        </button>
      </div>
      <b>{step.title}</b>
      <p>{step.hint}</p>
    </div>
  );
}

/** 宗門全景：鋪滿視窗（保持比例、裁切多餘部分），建築名牌可點，進入建設。 */
export function SceneBackdrop() {
  const game = useGame();
  const setPage = useUi((s) => s.setPage);
  return (
    <div className="scene">
      <img className="blur" src={artUrl('final/panorama.webp')} alt="" />
      <div className="scene-inner">
        <img src={artUrl('final/panorama.webp')} alt="宗門全景" />
        {[...content.buildings.values()].map((def) => {
          const pos = SPOTS[def.id];
          if (!pos) return null;
          // 全景圖畫的是主峰一帶；同種建築有多座時顯示座數
          const all = game.buildings.filter((x) => x.defId === def.id);
          const b = all.find((x) => x.region === 'region.main') ?? all[0];
          const level = b ? (all.length > 1 ? `×${all.length}` : b.level ? `${b.level} 級` : b.construction ? '' : '殘破') : '未建';
          const state = b?.construction ? '施工中' : b?.status === 'disabled' ? '停用' : '';
          return (
            <button
              key={def.id}
              className={`spot ${b && b.level > 0 ? '' : 'empty'}`}
              style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }}
              onClick={() => setPage('build')}
            >
              <span className="nm">{def.name}</span>
              <span className="lv">{[level, state].filter(Boolean).join('・')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 主畫面上的浮動資訊：左上掌門與宗門，右側任務、警報與月報。 */
export function OverviewPage() {
  const game = useGame();
  const setPage = useUi((s) => s.setPage);
  const alerts = useMemo(() => computeAlerts(game, content), [game]);
  const report = game.reports[0];
  const p = game.protagonist;
  const need = xpToNext(p.realm);
  return (
    <>
      <aside className="hud-left">
        <button className="leader" onClick={() => setPage('protagonist')}>
          <span className="face">
            <img src={artUrl(portraitOf(p))} alt="" />
          </span>
          <span className="info">
            <span className="nm">{p.name}</span>
            <span className="rl">掌門・{realmName(p.realm)}</span>
            <span className="xp">
              <i style={{ width: `${Math.min(100, (p.xp * 100) / need)}%` }} />
            </span>
            <span className="xpn">
              修為 {p.xp} / {need}
            </span>
          </span>
        </button>
        <div className="hud-card sect-card">
          <div className="row2">
            <span>宗門大殿</span>
            <b>{hallLevel(game) ? `${hallLevel(game)} 級` : '殘破'}</b>
          </div>
          <div className="row2">
            <span>內門</span>
            <b>
              {game.disciples.length} / {innerLimit(game, content)}
            </b>
          </div>
          <div className="row2">
            <span>外門</span>
            <b>
              {game.outer.count} / {outerCapacity(game, content)}
            </b>
          </div>
          <div className="row2">
            <span>傳承</span>
            <b>{content.lineages.get(game.lineage)?.name}</b>
          </div>
          {[...content.regions.values()]
            .filter((r) => qiCapacity(game, content, r.id) > 0 && regionState(game, r.id).status === 'open')
            .map((r) => (
              <div className="row2" key={r.id}>
                <span title="修煉的人需要的靈氣／這一區能提供的靈氣；需要超過能提供時，修煉效率下降">{r.name}靈氣（需要／可供）</span>
                <b className={qiEfficiencyPct(game, content, r.id) < 100 ? 'neg' : ''}>
                  {qiDemandOf(game, r.id)} / {qiCapacity(game, content, r.id)}
                  {qiEfficiencyPct(game, content, r.id) < 100 && `・效率 ${qiEfficiencyPct(game, content, r.id)}%`}
                </b>
              </div>
            ))}
          <div className="regions">
            {[...content.regions.values()]
              .map((r) => `${r.name}${regionState(game, r.id).status === 'open' ? '' : regionState(game, r.id).status === 'opening' ? '（施工中）' : '（未開放）'}`)
              .join('、')}
          </div>
        </div>
      </aside>
      <aside className="hud-right">
        <TutorialCard />
        <div className="hud-card">
          <div className="hud-title">
            <span>警報</span>
          </div>
          <AlertList alerts={alerts} />
        </div>
        {report && (
          <div className="hud-card">
            <div className="hud-title">
              <span>上月月報・{formatDate(report.date)}</span>
              <button className="link" onClick={() => setPage('reports')}>
                全部
              </button>
            </div>
            <p className="small">
              <ResList value={report.delta} signed />
            </p>
            <ul className="small">
              {report.lines.slice(0, 4).map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </>
  );
}
