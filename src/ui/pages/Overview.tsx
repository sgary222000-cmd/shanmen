import { useMemo } from 'react';
import { computeAlerts, formatDate } from '../../engine';
import { hallLevel, innerLimit, outerCapacity, qiCapacity } from '../../engine/systems/buildings/buildings';
import { qiDemandOf, realmName } from '../../engine/systems/characters/characters';
import { qiEfficiencyPct } from '../../engine/systems/cultivation/cultivation';
import { currentStep, TUTORIAL_STEPS } from '../../engine/systems/tutorial';
import { AlertList } from '../components/Alerts';
import { Art } from '../components/Art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

// 宗門主畫面的可點擊區域位置（百分比），對應 assets/final/panorama.webp 的建築位置。
const SPOTS: Record<string, [number, number]> = {
  'building.hall': [53, 41],
  'building.dorm': [28, 77],
  'building.field': [80, 88],
  'building.quarry': [12, 54],
  'building.lumber': [90, 57],
  'building.alchemy': [74, 60],
  'building.array': [33, 47],
};

function TutorialCard() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const step = currentStep(game);
  if (!step) return null;
  const done = game.tutorial.done.length;
  return (
    <div className="panel" data-testid="tutorial">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3>
          引導 {done + 1}/{TUTORIAL_STEPS.length}：{step.title}
        </h3>
        <button className="btn small secondary" onClick={() => dispatch({ type: 'skipTutorial' })}>
          略過引導
        </button>
      </div>
      <p>{step.hint}</p>
    </div>
  );
}

export function OverviewPage() {
  const game = useGame();
  const setPage = useUi((s) => s.setPage);
  const alerts = useMemo(() => computeAlerts(game, content), [game]);
  const report = game.reports[0];
  const p = game.protagonist;
  return (
    <div>
      <h2>宗門總覽</h2>
      <TutorialCard />
      <div className="panel panorama">
        <Art path="final/panorama.webp" alt="宗門全景" />
        {[...content.buildings.values()].map((def) => {
          const pos = SPOTS[def.id];
          if (!pos) return null;
          const b = game.buildings.find((x) => x.defId === def.id);
          const label = b
            ? `${def.name}${b.level ? ` ${b.level}級` : '（殘破）'}${b.construction ? '・施工中' : ''}${b.status === 'disabled' ? '・停用' : ''}`
            : `${def.name}（未建）`;
          return (
            <button
              key={def.id}
              className={`spot ${b && b.level > 0 ? '' : 'empty'}`}
              style={{ left: `${pos[0]}%`, top: `${pos[1]}%` }}
              onClick={() => setPage('build')}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="grid two">
        <div className="panel">
          <h3>警報</h3>
          <AlertList alerts={alerts} />
        </div>
        <div className="panel">
          <h3>宗門概況</h3>
          <table>
            <tbody>
              <tr>
                <th>掌門</th>
                <td>
                  {p.name}・{realmName(p.realm)}・修為 {p.xp}
                </td>
              </tr>
              <tr>
                <th>大殿</th>
                <td>{hallLevel(game) ? `${hallLevel(game)} 級` : '殘破待修'}</td>
              </tr>
              <tr>
                <th>內門</th>
                <td>
                  {game.disciples.length} / {innerLimit(game, content)} 人
                </td>
              </tr>
              <tr>
                <th>外門</th>
                <td>
                  {game.outer.count} / {outerCapacity(game, content)} 人・滿意度 {game.outer.satisfaction}・培養度 {game.outer.training}
                </td>
              </tr>
              <tr>
                <th>主峰靈氣</th>
                <td>
                  容量 {qiCapacity(game, content)}・需求 {qiDemandOf(game)}・修煉效率 {qiEfficiencyPct(game, content)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      {report && (
        <div className="panel">
          <h3>上月月報（{formatDate(report.date)}）</h3>
          <p>
            資源變化：<ResList value={report.delta} signed />
          </p>
          <ul className="small">
            {report.lines.slice(0, 8).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
