import { useState } from 'react';
import { balance } from '../../content/balance';
import { hallLevel, innerLimit, outerCapacity } from '../../engine/systems/buildings/buildings';
import { powerLevel } from '../../engine/systems/characters/characters';
import { SCHEDULE_NAMES } from '../../engine/systems/characters/schedule';
import { CharacterPanel } from '../components/CharacterPanel';
import { content, useGame, useUi } from '../store';

type SortKey = 'realm' | 'alchemy' | 'combat' | 'age';

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
              <option value="alchemy">煉丹</option>
              <option value="combat">戰鬥</option>
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
      <div className="grid two">
        {list.map((d) => (
          <CharacterPanel key={d.id} c={d} />
        ))}
      </div>
      <p className="muted small">親傳、長老與職位（傳功、煉丹、庶務等）於 P1 開放。</p>
    </div>
  );
}
