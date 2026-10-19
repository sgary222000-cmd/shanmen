import { balance } from '../../content/balance';
import type { BeastTask } from '../../engine';
import { allCharacters } from '../../engine/systems/characters/characters';
import {
  ascendBlocked,
  BEAST_TASK_NAMES,
  beastCapacity,
  beastFood,
  beastGather,
  guardianBeast,
  guardianBonusAt,
  guardianNextCost,
  hatchBlocked,
  keptBeasts,
  raiseBlocked,
  type GuardianBonus,
} from '../../engine/systems/beasts/beasts';
import { planMonth } from '../../engine';
import { Art } from '../components/Art';
import { ResList } from '../components/Res';
import { content, useGame, useUi } from '../store';

/** 護宗加成的白話說明 */
function bonusText(g: GuardianBonus) {
  const parts: string[] = [];
  if (g.productionPct) parts.push(`外門產量 +${g.productionPct}%`);
  if (g.craftBp) parts.push(`煉丹、煉器、製符成功率 +${g.craftBp / 100}%`);
  if (g.xpPct) parts.push(`修煉 +${g.xpPct}%`);
  if (g.atkPct) parts.push(`弟子戰鬥攻擊 +${g.atkPct}%`);
  if (g.hpPct) parts.push(`弟子戰鬥生命 +${g.hpPct}%`);
  return parts.join('、');
}

function GuardianPanel() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const g = guardianBeast(game);
  const cfg = balance.beasts.guardian;
  const species = g ? content.beasts.get(g.speciesId) : undefined;
  if (!g?.guardian || !species) {
    return (
      <div className="panel" data-testid="guardian">
        <h3>護宗神獸</h3>
        <p className="muted small">
          靈獸苑 {cfg.gardenLevel} 級以上時，可以把一隻成年靈獸晉升為護宗神獸（全宗一隻，不佔靈獸名額）。神獸不再出戰或採集，食量變為 {cfg.foodMultiplier}{' '}
          倍，依品種給全宗門加成；之後可以再供奉升級，最高 {cfg.maxLevel} 級。晉升費用：
          <ResList value={cfg.ascendCost} />。
        </p>
      </div>
    );
  }
  const now = guardianBonusAt(species, g.guardian.level);
  const cost = guardianNextCost(game);
  const blocked = raiseBlocked(game);
  const next = cost ? guardianBonusAt(species, g.guardian.level + 1) : undefined;
  return (
    <div className="panel" data-testid="guardian">
      {(species.artAdult ?? species.art) && (
        <div style={{ maxWidth: 160, float: 'right', marginLeft: 12 }}>
          <Art path={species.artAdult ?? species.art ?? ''} alt={species.guardian.title} />
        </div>
      )}
      <h3>
        護宗神獸：{species.guardian.title}（{g.name}） <span className="tag">{g.guardian.level} 級</span>
      </h3>
      <p className="small">
        加成：{bonusText(now)}
        {Object.keys(now.monthly).length > 0 && (
          <>
            {bonusText(now) ? '・' : ''}每月帶來 <ResList value={now.monthly} />
          </>
        )}
        {g.guardian.hungry && <span className="neg">・上個月沒吃飽，本月加成暫停</span>}
      </p>
      <p className="small">食量每月糧食 {beastFood(content, g)}</p>
      {cost && next ? (
        <p className="small">
          <button className="btn" data-testid="raise-guardian" disabled={!!blocked} onClick={() => dispatch({ type: 'raiseGuardian' })}>
            供奉升級
          </button>{' '}
          花費 <ResList value={cost} />，升為 {g.guardian.level + 1} 級：{bonusText(next)}
          {Object.keys(next.monthly).length > 0 && (
            <>
              {bonusText(next) ? '・' : ''}每月 <ResList value={next.monthly} />
            </>
          )}
          {blocked && <span className="muted">（{blocked}）</span>}
        </p>
      ) : (
        <p className="muted small">已達最高等級。</p>
      )}
      <div style={{ clear: 'both' }} />
    </div>
  );
}

export function BeastsPage() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const blocked = hatchBlocked(game, content);
  const plan = planMonth(game, content);
  const people = allCharacters(game);
  return (
    <div>
      <h2>靈獸苑</h2>
      <div className="stats">
        <div className="stat hl">
          <div className="k">靈獸</div>
          <div className="v">
            {keptBeasts(game)}
            <small> / {beastCapacity(game, content)}</small>
          </div>
        </div>
        <div className="stat">
          <div className="k">靈獸蛋</div>
          <div className="v">{game.resources.beast_egg}</div>
        </div>
        <div className="stat">
          <div className="k">護宗神獸</div>
          <div className="v">{guardianBeast(game)?.name ?? '尚無'}</div>
        </div>
      </div>
      <div className="panel">
        <p className="muted small">
          靈獸苑孵化靈獸蛋，隨機得到 {content.beasts.size} 種靈獸之一（越稀有越難孵到）。幼年每月吃飽成長 {balance.beasts.growthPerMonth} 點，滿 {balance.beasts.adultGrowth}{' '}
          長為成年（靈獸苑 2 級更快）。靈獸可以隨主人出戰（不佔隊伍名額，每人最多一隻）、外出採集或休養；人先吃糧，剩下的才餵靈獸，沒吃飽的不成長也不採集。
        </p>
        <button className="btn" data-testid="hatch" disabled={!!blocked} onClick={() => dispatch({ type: 'hatchBeast' })}>
          孵化靈獸蛋
        </button>
        {blocked && <span className="small muted"> {blocked}</span>}
      </div>
      <GuardianPanel />
      {!keptBeasts(game) && <p className="muted">還沒有靈獸。</p>}
      <div className="grid beast-grid">
        {game.beasts.filter((b) => !b.guardian).map((b) => {
          const species = content.beasts.get(b.speciesId);
          const art = b.stage === 'adult' ? species?.artAdult ?? species?.art : species?.art;
          const fed = plan.fedBeasts.includes(b.id);
          const per = species ? guardianBonusAt(species, 1) : undefined;
          return (
            <div key={b.id} className="panel beast-card" data-testid={`beast-${b.id}`}>
              <div className="portrait beast-art">
                {art && <Art path={art} alt={b.name} />}
                <span className="name">{b.stage === 'adult' ? '成年' : `幼年・${b.growth}/${balance.beasts.adultGrowth}`}</span>
              </div>
              <div className="beast-info">
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
              <p className="muted small">
                主人的御獸技藝每點讓靈獸戰力與採集 +{balance.beasts.ownerSkillPct}%。晉升護宗神獸後：
                {per && bonusText(per)}
                {per && Object.keys(per.monthly).length > 0 && (
                  <>
                    {bonusText(per) ? '・' : ''}每月 <ResList value={per.monthly} />
                  </>
                )}
                （每級）。
              </p>
              {b.stage === 'adult' && !guardianBeast(game) && (
                <p className="small">
                  <button
                    className="btn small"
                    data-testid={`ascend-${b.id}`}
                    disabled={!!ascendBlocked(game, content, b.id)}
                    onClick={() => dispatch({ type: 'ascendGuardian', beastId: b.id })}
                  >
                    晉升護宗神獸
                  </button>{' '}
                  <span className="muted">{ascendBlocked(game, content, b.id)}</span>
                </p>
              )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
