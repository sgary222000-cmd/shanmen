import { useState, type ReactNode } from 'react';
import { formatAge, type Character, type Skills } from '../../engine';
import { realmName, rootName } from '../../engine/systems/characters/characters';
import { Art } from './Art';
import { CharacterPanel, SKILL_NAMES } from './CharacterPanel';

// 卷軸視窗內共用的版面元件：分頁籤、人物卷（大立繪＋數值＋行程）。

export interface TabDef {
  id: string;
  label: ReactNode;
  testId?: string;
}

/** 分頁籤。內容由呼叫端依目前分頁決定，切換只改畫面狀態。 */
export function useTabs(tabs: TabDef[], initial?: string) {
  const [tab, setTab] = useState(initial ?? tabs[0]?.id ?? '');
  const bar = (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} data-testid={t.testId ?? `tab-${t.id}`}>
          {t.label}
        </button>
      ))}
    </div>
  );
  return { tab, setTab, bar };
}

/** 境界朱印：大境界兩字＋期別，例如「築基／中期」 */
export function RealmSeal({ c }: { c: Character }) {
  const name = realmName(c.realm);
  return (
    <span className="realm-seal">
      <span>
        {name.slice(0, 2)}
        <br />
        {name.slice(2)}
      </span>
    </span>
  );
}

/** 人物卷：左側大立繪與境界朱印，右側數值牌、技藝條與行程面板。 */
export function CharacterSheet({ c, portrait, title }: { c: Character; portrait: string; title?: string }) {
  return (
    <div className="detail">
      <div className="hero">
        <RealmSeal c={c} />
        <Art path={portrait} alt={c.name} />
        <div className="hero-name">
          {title && <span className="ttl">{title}</span>}
          <b>{c.name}</b>
          <span>
            {formatAge(c.ageMonths)}・{rootName(c.root)}
          </span>
        </div>
      </div>
      <div className="sheet">
        <div className="attrs">
          <div>
            <span>健康</span>
            <b className={c.health < 70 ? 'neg' : ''}>{c.health}</b>
          </div>
          <div>
            <span>忠誠</span>
            <b>{c.loyalty}</b>
          </div>
          <div>
            <span>領悟</span>
            <b>{c.insight}</b>
          </div>
          <div>
            <span>修為</span>
            <b>{c.xp}</b>
          </div>
        </div>
        <div className="skills">
          {(Object.keys(SKILL_NAMES) as (keyof Skills)[]).map((k) => (
            <div key={k} className="sk">
              <span>{SKILL_NAMES[k]}</span>
              <span className="sb">
                <i style={{ width: `${Math.min(100, c.skills[k] * 5)}%` }} />
              </span>
              <b>{c.skills[k]}</b>
            </div>
          ))}
        </div>
        <CharacterPanel c={c} />
      </div>
    </div>
  );
}
