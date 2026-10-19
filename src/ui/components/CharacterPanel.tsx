import { useState } from 'react';
import { formatAge, planMonth, type Character, type ScheduleKind } from '../../engine';
import { realmName, rootName, xpToNext } from '../../engine/systems/characters/characters';
import { isCraftSchedule } from '../../engine/systems/buildings/buildings';
import { LOCKED_SCHEDULES, SCHEDULE_NAMES, seatOptions, seclusionInterruptCost, selectableSchedules } from '../../engine/systems/characters/schedule';
import { breakthroughOdds, monthlyXp } from '../../engine/systems/cultivation/cultivation';
import { content, useGame, useUi } from '../store';
import { insightGain, libraryResearch, techniqueOf, techniqueTier } from '../../engine/systems/talent/techniques';
import { POSITION_NAMES, positionOf } from '../../engine/systems/talent/positions';
import { BEAST_TASK_NAMES } from '../../engine/systems/beasts/beasts';
import { COMMON_EQUIPMENT } from '../../content/equipment';
import { lifespanText, longevityBlocked, longevityGain, remainingLifePct } from '../../engine/systems/characters/lifespan';

function LifeLine({ c }: { c: Character }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const pct = remainingLifePct(c);
  const isHeir = game.heirId === c.id;
  const blocked = longevityBlocked(game, c);
  const knowsPill = game.recipes.includes('recipe.life_pill') || game.resources.pill_life > 0;
  return (
    <div className="small row" data-testid={`life-${c.id}`}>
      <span className={pct <= 10 ? 'neg' : pct <= 20 ? 'warn' : ''}>{lifespanText(c)}</span>
      {(c.longevityPills ?? 0) > 0 && <span className="muted">（已服延壽丹 {c.longevityPills} 顆）</span>}
      {knowsPill && (
        <button
          className="btn small secondary"
          disabled={!!blocked}
          title={blocked ?? `壽元 +${Math.floor(longevityGain(c) / 12)} 年`}
          onClick={() => dispatch({ type: 'takeLongevityPill', characterId: c.id })}
        >
          服延壽丹（+{Math.floor(longevityGain(c) / 12)} 年，庫存 {game.resources.pill_life}）
        </button>
      )}
      {c.role === 'inner' &&
        (isHeir ? (
          <button className="btn small secondary" data-testid={`heir-${c.id}`} onClick={() => dispatch({ type: 'setHeir', characterId: null })}>
            取消親傳弟子
          </button>
        ) : (
          <button className="btn small secondary" data-testid={`heir-${c.id}`} onClick={() => dispatch({ type: 'setHeir', characterId: c.id })}>
            立為親傳弟子（繼承人）
          </button>
        ))}
    </div>
  );
}

export const SKILL_NAMES = {
  alchemy: '煉丹',
  farming: '耕作',
  combat: '戰鬥',
  forging: '煉器',
  talisman: '符陣',
  beast: '御獸',
  affairs: '庶務',
} as const;

export function skillText(c: Character): string {
  return (Object.keys(SKILL_NAMES) as (keyof typeof SKILL_NAMES)[])
    .filter((k) => k === 'alchemy' || k === 'farming' || k === 'combat' || c.skills[k] > 0)
    .map((k) => `${SKILL_NAMES[k]} ${c.skills[k]}`)
    .join('／');
}

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

function TechniqueLine({ c }: { c: Character }) {
  const game = useGame();
  const tech = techniqueOf(game, content);
  const tier = techniqueTier(c);
  const gain = insightGain(game, content, c);
  return (
    <p className="small" data-testid={`insight-${c.id}`}>
      功法《{tech?.name}》：<b>{tier.name}</b>（領悟 {c.insight}
      {tier.next !== null ? ` / ${tier.next}` : ''}）{tier.pct ? `・修煉與戰鬥 +${tier.pct}%` : ''}・本月領悟 +{gain.total}
      {gain.parts.length > 0 && <span className="muted">（{gain.parts.join('・')}）</span>}
    </p>
  );
}

function EquipLine({ c }: { c: Character }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const options = new Set<string>();
  if (c.equipment) options.add(c.equipment);
  if (game.resources.artifact > 0) options.add(COMMON_EQUIPMENT);
  for (const id of game.armory) options.add(id);
  const cur = c.equipment ? content.equipment.get(c.equipment) : undefined;
  if (!options.size) return <p className="small muted">法器：無（煉器坊製作或秘境取得後可裝備）</p>;
  return (
    <label className="small row">
      法器：
      <select
        value={c.equipment ?? ''}
        data-testid={`equip-${c.id}`}
        onChange={(e) => dispatch({ type: 'equip', characterId: c.id, itemId: e.target.value || null })}
      >
        <option value="">（不裝備）</option>
        {[...options].map((id) => {
          const d = content.equipment.get(id);
          return (
            <option key={id} value={id}>
              {d?.name}（攻 +{d?.atk}、防 +{d?.def}、生命 +{d?.hp}）{id === COMMON_EQUIPMENT && id !== c.equipment ? `・庫存 ${game.resources.artifact}` : ''}
            </option>
          );
        })}
      </select>
      {cur && <span className="muted">{cur.description}</span>}
    </label>
  );
}

export function CharacterPanel({ c }: { c: Character }) {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [months, setMonths] = useState(6);
  const isPro = c.role === 'protagonist';
  const seclusion = isPro ? game.protagonist.seclusion : null;
  const plan = planMonth(game, content);
  const xp = monthlyXp(
    game,
    content,
    c,
    c.takePill && c.realm.major !== 'qi' && game.resources.pill_peiyuan > 0 ? 'peiyuan' : c.takePill && game.resources.pill_qi > 0,
  );
  const odds = breakthroughOdds(game, content, c);
  const locked = c.schedule === 'explore' || c.schedule === 'dispatch' || isCraftSchedule(c.schedule) || !!seclusion;
  // 目前不能選的行程與原因（按鈕反灰並顯示原因）
  const noLibrary = libraryResearch(game, content) === null;
  const scheduleBlocked = (s: ScheduleKind): string | undefined => {
    if (s === 'breakthrough') return odds.blocked || undefined;
    if (s === 'research' && noLibrary) return '需要先蓋好藏經閣才能研究功法';
    if (s === 'heal' && c.injuryMonths <= 0 && c.health >= 100) return '沒有受傷，不需要療傷';
    return undefined;
  };

  return (
    <div className="panel" data-testid={`char-${c.id}`}>
      <h3>
        {c.name} <span className="tag">{isPro ? '掌門' : '內門'}</span>{' '}
        {positionOf(game, c.id) && <span className="tag gold">{POSITION_NAMES[positionOf(game, c.id) ?? 'mentor']}</span>}{' '}
        {c.specialty && <span className="tag">專長：{SKILL_NAMES[c.specialty]}</span>}{' '}
        {game.heirId === c.id && <span className="tag gold">親傳弟子</span>}{' '}
        {c.injuryMonths > 0 && <span className="tag neg">受傷 {c.injuryMonths} 個月</span>}
      </h3>
      <p className="small muted">
        {formatAge(c.ageMonths)}・{rootName(c.root)}・健康 {c.health}・忠誠 {c.loyalty}・{skillText(c)}
      </p>
      {game.beasts
        .filter((b) => b.ownerId === c.id)
        .map((b) => (
          <p key={b.id} className="small">
            靈獸：<b>{b.name}</b>（{b.stage === 'adult' ? '成年' : '幼年'}，{BEAST_TASK_NAMES[b.task]}；在「靈獸苑」頁調整）
          </p>
        ))}
      <LifeLine c={c} />
      <TechniqueLine c={c} />
      <EquipLine c={c} />
      {seatOptions(game, content).length > 1 && (
        <label className="small row">
          修煉地點：
          <select
            value={c.seat}
            data-testid={`seat-${c.id}`}
            disabled={!!seclusion}
            onChange={(e) => dispatch({ type: 'setSeat', characterId: c.id, regionId: e.target.value })}
          >
            {seatOptions(game, content).map((id) => (
              <option key={id} value={id}>
                {content.regions.get(id)?.name}
              </option>
            ))}
          </select>
          {seclusion && <span className="muted">閉關中不能搬移</span>}
        </label>
      )}
      <XpBar c={c} />
      <p className="small">
        本月行程：<b>{SCHEDULE_NAMES[c.schedule]}</b>
        {seclusion && `（剩 ${seclusion.remainingMonths}/${seclusion.plannedMonths} 個月，已連續 ${seclusion.streak} 個月）`}
        ・預計修為 +{xp.total}
        <span className="muted">（{xp.parts.join('・')}）</span>
      </p>
      {c.schedule === 'explore' && <p className="muted small">本月已外出（探索、委託或大比），下月恢復。</p>}
      {c.schedule === 'dispatch' && <p className="muted small">正在秘境派遣中，回來後恢復日常修煉。</p>}
      {isCraftSchedule(c.schedule) && <p className="muted small">本月在工坊{SCHEDULE_NAMES[c.schedule]}，可在「產業」頁更換人選。</p>}
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
                  className={`btn small ${c.schedule === 'seclusion' ? '' : 'secondary'}`}
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
                disabled={locked || !!scheduleBlocked(s)}
                title={scheduleBlocked(s)}
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
      {!locked && noLibrary && <p className="muted small">「研究功法」需要先在建設頁蓋好藏經閣。</p>}
      {isPro && !seclusion && (
        <p className="muted small">閉關修煉最快，每連續一個月再 +10%（最多 +30%）；中途中斷會失去累積的加成。</p>
      )}
      <label className="small row" style={{ marginTop: '.4rem' }}>
        <input type="checkbox" checked={c.takePill} onChange={(e) => dispatch({ type: 'setTakePill', characterId: c.id, value: e.target.checked })} />
        {c.realm.major === 'qi'
          ? `每月服用聚氣丹（修為 +30，庫存 ${game.resources.pill_qi}）`
          : `每月服用培元丹（修為 +120，庫存 ${game.resources.pill_peiyuan}；沒有時改服聚氣丹 +30，庫存 ${game.resources.pill_qi}）`}
        {c.takePill && !plan.pillTakers.includes(c.id) && <span className="neg">本月丹藥不足</span>}
      </label>
      {((c.realm.major === 'qi' && c.realm.stage === 9) || (c.realm.major === 'foundation' && c.realm.stage === 4)) && (
        <div className="panel" style={{ background: 'var(--paper-2)', marginTop: '.5rem' }} data-testid={`odds-${c.id}`}>
          <b>{odds.target === 'core' ? '結丹（金丹）' : '築基突破'}</b>：成功率 {odds.bp / 100}%（{odds.factors.join('，')}）
          <br />
          <span className="small">失敗代價：{odds.failure}</span>
          {odds.blocked && <div className="small neg">尚不能突破：{odds.blocked}</div>}
        </div>
      )}
    </div>
  );
}
