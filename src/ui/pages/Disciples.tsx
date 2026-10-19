import { useState } from 'react';
import { balance } from '../../content/balance';
import { hallLevel, innerLimit, outerCapacity } from '../../engine/systems/buildings/buildings';
import { powerLevel, realmName } from '../../engine/systems/characters/characters';
import { SCHEDULE_NAMES } from '../../engine/systems/characters/schedule';
import { disciplePortrait } from '../art';
import { CharacterSheet } from '../components/Layout';
import { artUrl } from '../art';
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
  const [tab, setTab] = useState<'inner' | 'outer' | 'positions'>('inner');
  const [sort, setSort] = useState<SortKey>('realm');
  const [filter, setFilter] = useState<'all' | 'idle' | 'injured'>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const limit = innerLimit(game, content);
  const list = game.disciples
    .filter((d) => (filter === 'idle' ? d.schedule === 'cultivate' : filter === 'injured' ? d.injuryMonths > 0 : true))
    .sort((a, b) => {
      if (sort === 'realm') return powerLevel(b.realm) - powerLevel(a.realm) || b.xp - a.xp;
      if (sort === 'age') return a.ageMonths - b.ageMonths;
      return b.skills[sort] - a.skills[sort];
    });
  const cur = list.find((d) => d.id === picked) ?? list[0];
  return (
    <div className="disciples">
      <div className="tabs">
        <button className={tab === 'inner' ? 'on' : ''} onClick={() => setTab('inner')} data-testid="tab-inner">
          內門名冊 <small>{game.disciples.length} / {limit}</small>
        </button>
        <button className={tab === 'outer' ? 'on' : ''} onClick={() => setTab('outer')} data-testid="tab-outer">
          外門 <small>{game.outer.count} / {outerCapacity(game, content)}</small>
        </button>
        <button className={tab === 'positions' ? 'on' : ''} onClick={() => setTab('positions')} data-testid="tab-positions">
          職位
        </button>
      </div>

      {tab === 'outer' && (
        <div className="panel">
          <h3>外門（群體管理）</h3>
          <div className="stats">
            <div className="stat">
              <div className="k">人數</div>
              <div className="v">
                {game.outer.count}
                <small> / {outerCapacity(game, content)}</small>
              </div>
            </div>
            <div className="stat">
              <div className="k">滿意度</div>
              <div className="v">{game.outer.satisfaction}</div>
            </div>
            <div className="stat">
              <div className="k">培養度</div>
              <div className="v">{game.outer.training}</div>
            </div>
            <div className="stat">
              <div className="k">連續缺糧</div>
              <div className="v">
                {game.outer.hungerMonths}
                <small> 個月</small>
              </div>
            </div>
          </div>
          <p className="muted small">外門分工在「產業」頁安排；未分工者自動修煉，提高培養度，選拔出的內門資質更好。大殿修復後每 {balance.recruit.intervalMonths} 個月舉行一次山門招生。</p>
          <div className="row">
            <button
              className="btn"
              data-testid="promote"
              disabled={hallLevel(game) < 1 || game.disciples.length >= limit || game.outer.count < 1}
              onClick={() => dispatch({ type: 'promoteOuter' })}
            >
              從外門選拔內門（靈石 {balance.recruit.promoteCost}）
            </button>
            <span className="muted small">{hallLevel(game) < 1 ? '需要先修復宗門大殿。' : `內門上限 ${limit} 人（大殿等級決定）。`}</span>
          </div>
        </div>
      )}

      {tab === 'positions' && <Positions />}

      {tab === 'inner' && (
        <div className="roster-layout">
          <div className="roster">
            <div className="roster-tools">
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序">
                <option value="realm">依境界</option>
                {(Object.keys(SKILL_NAMES) as (keyof Skills)[]).map((k) => (
                  <option key={k} value={k}>
                    依{SKILL_NAMES[k]}
                  </option>
                ))}
                <option value="age">依年齡</option>
              </select>
              <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="篩選">
                <option value="all">全部</option>
                <option value="idle">日常修煉中</option>
                <option value="injured">受傷</option>
              </select>
            </div>
            {!game.disciples.length && <p className="muted">尚無內門弟子。到「外門」分頁選拔。</p>}
            {list.map((d) => (
              <button key={d.id} className={`roster-item ${cur?.id === d.id ? 'on' : ''}`} onClick={() => setPicked(d.id)} data-testid={`roster-${d.id}`}>
                <img src={artUrl(disciplePortrait(d))} alt="" />
                <span className="t">
                  <b>{d.name}</b>
                  <span>{realmName(d.realm)}</span>
                  <span className="sch">
                    {SCHEDULE_NAMES[d.schedule]}
                    {positionOf(game, d.id) ? `・${POSITION_NAMES[positionOf(game, d.id) ?? 'mentor']}` : ''}
                  </span>
                </span>
                {d.injuryMonths > 0 && <span className="hurt">傷</span>}
              </button>
            ))}
            {Array.from({ length: Math.max(0, limit - game.disciples.length) }, (_, i) => (
              <div key={i} className="roster-item empty">
                <span className="slot">空</span>
                <span className="t">
                  <span>尚可收 1 名內門</span>
                </span>
              </div>
            ))}
          </div>
          {cur && <CharacterSheet c={cur} portrait={disciplePortrait(cur)} />}
        </div>
      )}
    </div>
  );
}
