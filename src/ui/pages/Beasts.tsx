import { balance } from '../../content/balance';
import type { BeastTask } from '../../engine';
import { allCharacters } from '../../engine/systems/characters/characters';
import { BEAST_TASK_NAMES, beastCapacity, beastFood, beastGather, hatchBlocked } from '../../engine/systems/beasts/beasts';
import { planMonth } from '../../engine';
import { Art } from '../components/Art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

export function BeastsPage() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const blocked = hatchBlocked(game, content);
  const plan = planMonth(game, content);
  const people = allCharacters(game);
  return (
    <div>
      <h2>靈獸苑</h2>
      <div className="panel">
        <p className="small">
          靈獸 {game.beasts.length} / {beastCapacity(game, content)} 隻・靈獸蛋 {game.resources.beast_egg} 顆
        </p>
        <p className="muted small">
          靈獸苑孵化靈獸蛋（隨機得到靈猿、靈狐或靈龜）。幼年每月吃飽成長 {balance.beasts.growthPerMonth} 點，滿 {balance.beasts.adultGrowth}{' '}
          長為成年（靈獸苑 2 級更快）。靈獸可以隨主人出戰（不佔隊伍名額，每人最多一隻）、外出採集或休養；人先吃糧，剩下的才餵靈獸，沒吃飽的不成長也不採集。
        </p>
        <button className="btn" data-testid="hatch" disabled={!!blocked} onClick={() => dispatch({ type: 'hatchBeast' })}>
          孵化靈獸蛋
        </button>
        {blocked && <span className="small muted"> {blocked}</span>}
      </div>
      {!game.beasts.length && <p className="muted">還沒有靈獸。</p>}
      <div className="grid two">
        {game.beasts.map((b) => {
          const species = content.beasts.get(b.speciesId);
          const art = b.stage === 'adult' ? species?.artAdult ?? species?.art : species?.art;
          const fed = plan.fedBeasts.includes(b.id);
          return (
            <div key={b.id} className="panel" data-testid={`beast-${b.id}`}>
              {art && (
                <div style={{ maxWidth: 280 }}>
                  <Art path={art} alt={b.name} />
                </div>
              )}
              <h3>
                {b.name} <span className="tag">{b.stage === 'adult' ? '成年' : '幼年'}</span>
              </h3>
              <p className="small">{species?.description}</p>
              <p className="small">
                {b.stage === 'young' ? `成長 ${b.growth} / ${balance.beasts.adultGrowth}・` : ''}食量每月糧食 {beastFood(content, b)}
                {!fed && <span className="neg">・本月糧食不足</span>}
              </p>
              <p className="small">
                採集所得（每月）：<ResList value={{ ...species?.gather }} />
                {b.task === 'gather' && (
                  <>
                    ・本月預計 <ResList value={beastGather(game, content, b)} />
                  </>
                )}
              </p>
              <div className="row small">
                主人：
                <select
                  value={b.ownerId ?? ''}
                  data-testid={`beast-owner-${b.id}`}
                  onChange={(e) =>
                    dispatch({
                      type: 'setBeast',
                      beastId: b.id,
                      ownerId: e.target.value || null,
                      task: !e.target.value && b.task === 'follow' ? 'rest' : b.task,
                    })
                  }
                >
                  <option value="">（無，養在靈獸苑）</option>
                  {people.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}（御獸 {c.skills.beast}）
                    </option>
                  ))}
                </select>
                安排：
                {(['follow', 'gather', 'rest'] as BeastTask[]).map((t) => (
                  <button
                    key={t}
                    className={`btn small ${b.task === t ? '' : 'secondary'}`}
                    data-testid={`beast-task-${b.id}-${t}`}
                    disabled={t === 'follow' && !b.ownerId}
                    onClick={() => dispatch({ type: 'setBeast', beastId: b.id, ownerId: b.ownerId, task: t })}
                  >
                    {BEAST_TASK_NAMES[t]}
                  </button>
                ))}
              </div>
              <p className="muted small">主人的御獸技藝每點讓靈獸戰力與採集 +{balance.beasts.ownerSkillPct}%。</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
