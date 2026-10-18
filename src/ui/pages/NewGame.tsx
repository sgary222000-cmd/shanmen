import { useState } from 'react';
import { content, useUi } from '../store';

export function NewGamePage() {
  const startNew = useUi((s) => s.startNew);
  const setScreen = useUi((s) => s.setScreen);
  const [sectName, setSect] = useState('青雲宗');
  const [protagonistName, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [lineage, setLineage] = useState('lineage.sword');

  return (
    <div className="title-screen">
      <h1>開創新局</h1>
      <div className="box panel">
        <p>
          你接手了一座沒落的宗門：大殿殘破、外門弟子十二人、物資所剩無幾，只留下一份主傳承。重振山門，從今日開始。
        </p>
        <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          <label>
            宗門名稱：
            <input type="text" data-testid="sect-name" value={sectName} maxLength={12} onChange={(e) => setSect(e.target.value)} />
          </label>
          <label>
            掌門姓名：
            <input
              type="text"
              data-testid="protagonist-name"
              value={protagonistName}
              maxLength={8}
              placeholder="例如：林長風"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="row">
            性別：
            <label>
              <input type="radio" checked={gender === 'male'} onChange={() => setGender('male')} /> 男
            </label>
            <label>
              <input type="radio" checked={gender === 'female'} onChange={() => setGender('female')} /> 女
            </label>
          </div>
          <div>
            主傳承：
            {[...content.lineages.values()].map((l) => (
              <label key={l.id} style={{ display: 'block', opacity: l.available ? 1 : 0.55 }}>
                <input type="radio" disabled={!l.available} checked={lineage === l.id} onChange={() => setLineage(l.id)} />{' '}
                <b>{l.name}</b> {!l.available && <span className="tag locked">尚未開放</span>}
                <span className="muted small"> {l.feature}</span>
              </label>
            ))}
          </div>
          <div className="row">
            <button
              className="btn gold"
              data-testid="start"
              disabled={!protagonistName.trim() || !sectName.trim()}
              onClick={() => startNew({ sectName, protagonistName, gender, lineage })}
            >
              接掌山門
            </button>
            <button className="btn secondary" onClick={() => setScreen('title')}>
              返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
