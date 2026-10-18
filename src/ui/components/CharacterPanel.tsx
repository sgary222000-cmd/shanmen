import { useState } from 'react';
import { formatAge, planMonth, type Character, type ScheduleKind } from '../../engine';
import { realmName, rootName, xpToNext } from '../../engine/systems/characters/characters';
import { LOCKED_SCHEDULES, SCHEDULE_NAMES, seclusionInterruptCost, selectableSchedules } from '../../engine/systems/characters/schedule';
import { breakthroughOdds, monthlyXp } from '../../engine/systems/cultivation/cultivation';
import { content, useGame, useUi } from '../store';

export function XpBar({ c }: { c: Character }) {
  const need = xpToNext(c.realm);
  return (
    <div>
      <div className="small">
        {realmName(c.realm)}・修為 {c.xp} / {need}
      </div>
      <div className="bar">
        <div style={{ width: `${Math.min(100, (c.xp * 100) / need)}%` }} />
      </div>
    </div>
  );
}

export function CharacterPanel({ c }: { c: Character }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [months, setMonths] = useState(6);
  const isPro = c.role === 'protagonist';
  const seclusion = isPro ? game.protagonist.seclusion : null;
  const plan = planMonth(game, content);
  const xp = monthlyXp(game, content, c, c.takePill && game.resources.pill_qi > 0);
  const odds = breakthroughOdds(game, content, c);
  const locked = c.schedule === 'explore' || c.schedule === 'alchemy' || !!seclusion;

  return (
    <div className="panel" data-testid={`char-${c.id}`}>
      <h3>
        {c.name} <span className="tag">{isPro ? '掌門' : '內門'}</span>{' '}
        {c.injuryMonths > 0 && <span className="tag neg">受傷 {c.injuryMonths} 個月</span>}
      </h3>
      <p className="small muted">
        {formatAge(c.ageMonths)}・{rootName(c.root)}・健康 {c.health}・忠誠 {c.loyalty}・煉丹 {c.skills.alchemy}／耕作 {c.skills.farming}／戰鬥{' '}
        {c.skills.combat}
      </p>
      <XpBar c={c} />
      <p className="small">
        本月行程：<b>{SCHEDULE_NAMES[c.schedule]}</b>
        {seclusion && `（剩 ${seclusion.remainingMonths}/${seclusion.plannedMonths} 個月，已連續 ${seclusion.streak} 個月）`}
        ・預計修為 +{xp.total}
        <span className="muted">（{xp.parts.join('・')}）</span>
      </p>
      {c.schedule === 'explore' && <p className="muted small">本月已出外探索，下月恢復。</p>}
      {c.schedule === 'alchemy' && <p className="muted small">本月掌爐煉丹，可在「產業」頁更換掌爐者。</p>}
      {seclusion ? (
        <div className="row">
          <button className="btn small danger" onClick={() => dispatch({ type: 'interruptSeclusion' })}>
            中斷閉關
          </button>
          <span className="muted small">{seclusionInterruptCost(game)}</span>
        </div>
      ) : (
        <div className="row">
          {selectableSchedules(c).map((s: ScheduleKind) =>
            s === 'seclusion' ? (
              <span key={s} className="row">
                <button
                  className="btn small"
                  disabled={locked}
                  data-testid={`seclusion-${c.id}`}
                  onClick={() => dispatch({ type: 'setSchedule', characterId: c.id, schedule: 'seclusion', months })}
                >
                  閉關
                </button>
                <input type="number" min={1} max={12} value={months} onChange={(e) => setMonths(Number(e.target.value))} /> 個月
              </span>
            ) : (
              <button
                key={s}
                className={`btn small ${c.schedule === s ? '' : 'secondary'}`}
                disabled={locked || (s === 'breakthrough' && !!odds.blocked)}
                title={s === 'breakthrough' ? odds.blocked : undefined}
                onClick={() => dispatch({ type: 'setSchedule', characterId: c.id, schedule: s })}
              >
                {SCHEDULE_NAMES[s]}
              </button>
            ),
          )}
          {isPro &&
            LOCKED_SCHEDULES.map((s) => (
              <span key={s} className="tag locked">
                {s}（未開放）
              </span>
            ))}
        </div>
      )}
      {isPro && !seclusion && (
        <p className="muted small">閉關修煉最快，每連續一個月再 +10%（最多 +30%）；中途中斷會失去累積的加成。</p>
      )}
      <label className="small row" style={{ marginTop: '.4rem' }}>
        <input type="checkbox" checked={c.takePill} onChange={(e) => dispatch({ type: 'setTakePill', characterId: c.id, value: e.target.checked })} />
        每月服用聚氣丹（修為 +30，庫存 {game.resources.pill_qi}）
        {c.takePill && !plan.pillTakers.includes(c.id) && <span className="neg">本月丹藥不足</span>}
      </label>
      {c.realm.major === 'qi' && c.realm.stage === 9 && (
        <div className="panel" style={{ background: 'var(--paper-2)', marginTop: '.5rem' }}>
          <b>築基突破</b>：成功率 {odds.bp / 100}%（{odds.factors.join('，')}）
          <br />
          <span className="small">失敗代價：{odds.failure}</span>
          {odds.blocked && <div className="small neg">尚不能突破：{odds.blocked}</div>}
        </div>
      )}
    </div>
  );
}
