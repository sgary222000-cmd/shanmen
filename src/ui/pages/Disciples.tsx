import { useState } from 'react';
import { balance } from '../../content/balance';
import { hallLevel, innerLimit, outerCapacity } from '../../engine/systems/buildings/buildings';
import { powerLevel, realmName } from '../../engine/systems/characters/characters';
import { SCHEDULE_NAMES } from '../../engine/systems/characters/schedule';
import { disciplePortrait } from '../art';
import { Art } from '../components/Art';
import { CharacterPanel } from '../components/CharacterPanel';
import { content, useGame, useUi } from '../store';
import { POSITION_IDS, POSITION_NAMES, POSITION_TEXT, positionEffectText, positionOf } from '../../engine/systems/talent/positions';
import { SKILL_NAMES } from '../components/CharacterPanel';
import type { Skills } from '../../engine';

function Positions() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  return (
    <div className="panel" data-testid="positions">
      <h3>職位</h3>
      <p className="muted small">每職一人、一人只任一職，限內門弟子。任職不佔行程，但兼顧事務，當月修煉 −{balance.positions.xpPenaltyPct}%。效果隨任職者的技藝（傳功隨境界）提高。</p>
      <table>
        <tbody>
          {POSITION_IDS.map((pos) => (
            <tr key={pos}>
              <td>
                <b>{POSITION_NAMES[pos]}</b>
                <div className="muted small">{POSITION_TEXT[pos]}</div>
              </td>
              <td>
                <select
                  value={game.positions[pos] ?? ''}
                  data-testid={`position-${pos}`}
                  onChange={(e) => dispatch({ type: 'setPosition', position: pos, characterId: e.target.value || null })}
                >
                  <option value="">（出缺）</option>
                  {game.disciples.map((d) => {
                    const other = positionOf(game, d.id);
                    return (
                      <option key={d.id} value={d.id} disabled={!!other && other !== pos}>
                        {d.name}（{realmName(d.realm)}・煉丹 {d.skills.alchemy}・煉器 {d.skills.forging}・符陣 {d.skills.talisman}・庶務 {d.skills.affairs}）
                        {other && other !== pos ? `・已任${POSITION_NAMES[other]}` : ''}
                      </option>
                    );
                  })}
                </select>
              </td>
              <td className="small">{game.positions[pos] ? positionEffectText(game, pos) : <span className="muted">無</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type SortKey = 'realm' | 'age' | keyof Skills;

export function DisciplesPage() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [sort, setSort] = useState<SortKey>('realm');
  const [filter, setFilter] = useState<'all' | 'idle' | 'injured'>('all');
  const limit = innerLimit(game, content);
  const list = game.disciples
    .filter((d) => (filter === 'idle' ? d.schedule === 'cultivate' : filter === 'injured' ? d.injuryMonths > 0 : true))
    .sort((a, b) => {
      if (sort === 'realm') return powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp;
      if (sort === 'age') return a.ageMonths - b.ageMonths;
      return b.skills[sort] - a.skills[sort];
    });
  return (
    <div>
      <h2>弟子</h2>
      <div className="panel">
        <h3>外門（群體管理）</h3>
        <p>
          人數 {game.outer.count} / {outerCapacity(game, content)}・滿意度 {game.outer.satisfaction}・培養度 {game.outer.training}
          ・連續缺糧 {game.outer.hungerMonths} 個月
        </p>
        <p className="muted small">外門分工在「產業」頁安排；未分工者自動修煉，提高培養度，選拔出的內門資質更好。</p>
        <div className="row">
          <button
            className="btn"
            data-testid="promote"
            disabled={hallLevel(game) < 1 || game.disciples.length >= limit || game.outer.count < 1}
            onClick={() => dispatch({ type: 'promoteOuter' })}
          >
            從外門選拔內門（靈石 {balance.recruit.promoteCost}）
          </button>
          <span className="muted small">
            {hallLevel(game) < 1 ? '需要先修復宗門大殿。' : `內門上限 ${limit} 人（大殿等級決定）。`}
          </span>
        </div>
        <p className="muted small">大殿修復後每 {balance.recruit.intervalMonths} 個月舉行一次山門招生。</p>
      </div>
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>
            內門弟子 {game.disciples.length} / {limit}
          </h3>
          <div className="row small">
            排序：
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="realm">境界</option>
              {(Object.keys(SKILL_NAMES) as (keyof Skills)[]).map((k) => (
                <option key={k} value={k}>
                  {SKILL_NAMES[k]}
                </option>
              ))}
              <option value="age">年齡</option>
            </select>
            篩選：
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">全部</option>
              <option value="idle">日常修煉中</option>
              <option value="injured">受傷</option>
            </select>
          </div>
        </div>
        {!game.disciples.length && <p className="muted">尚無內門弟子。</p>}
        <p className="muted small">
          {game.disciples.map((d) => `${d.name}：${SCHEDULE_NAMES[d.schedule]}`).join('、')}
        </p>
      </div>
      <Positions />
      <div className="grid two">
        {list.map((d) => (
          <div key={d.id} className="disciple-card">
            <Art path={disciplePortrait(d)} alt={d.name} />
            <CharacterPanel c={d} />
          </div>
        ))}
      </div>
      <p className="muted small">親傳弟子與長老會在 P2 開放。</p>
    </div>
  );
}
