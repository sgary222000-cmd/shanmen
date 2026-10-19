import { CharacterSheet } from '../components/Layout';
import { portraitOf } from '../art';
import { realmName } from '../../engine/systems/characters/characters';
import { formatDate } from '../../engine';
import { ancestorPct, heirOf } from '../../engine/systems/characters/lifespan';
import { content, useGame } from '../store';

export function ProtagonistPage() {
  const game = useGame();
  const p = game.protagonist;
  const heir = heirOf(game);
  const ancestors = game.ancestors ?? [];
  const bonus = ancestorPct(game, content);
  return (
    <div>
      <h2>主角</h2>
      <CharacterSheet c={p} portrait={portraitOf(p)} title={`${game.sectName}${ancestors.length ? `第 ${ancestors.length + 1} 代` : ''}掌門`} />
      <div className="panel" data-testid="succession">
        <h3>傳承與繼任</h3>
        <p className="small">
          親傳弟子：{heir ? <b>{heir.name}</b> : <span className="neg">尚未指定</span>}
          <span className="muted">（在「弟子」頁指定。親傳弟子修煉 +10%，掌門坐化時直接接任；沒有指定時會跳出繼承選擇。）</span>
        </p>
        {ancestors.length > 0 ? (
          <>
            <p className="small">
              歷代掌門{bonus ? `（祖師殿供奉中，全宗修煉 +${bonus}%）` : '（蓋好祖師殿後，每位可讓全宗修煉 +3%）'}：
            </p>
            <ul className="small">
              {ancestors.map((a, i) => (
                <li key={i}>
                  第 {i + 1} 代 {a.name}：{realmName(a.realm)}，享壽 {Math.floor(a.ageMonths / 12)} 歲，{formatDate(a.date)}坐化
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted small">歷代掌門：目前是開派後第一代掌門。</p>
        )}
      </div>
      <p className="muted small" style={{ marginTop: '.8rem' }}>
        主角每月只有一項主要行程。查看與下達宗門命令不佔行程；探索、煉丹、授課等親自參與的事才佔用。目前境界開放到金丹；結丹需要功法小成、結丹靈液與足夠靈氣。元嬰在下一個版本開放。
      </p>
    </div>
  );
}
