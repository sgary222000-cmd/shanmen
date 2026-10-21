import { useState } from 'react';
import { balance } from '../../content/balance';
import { allCharacters } from '../../engine/systems/characters/characters';
import { SCHEDULE_NAMES } from '../../engine/systems/characters/schedule';
import { branchBlocked, scriptureBlocked } from '../../engine/systems/talent/branches';
import { ITEM_NAMES, scriptureItem } from '../../engine/systems/talent/items';
import { insightGain, libraryResearch, techniqueOf, techniqueStats, techniqueStatsText, techniqueTier } from '../../engine/systems/talent/techniques';
import { SKILL_NAMES } from '../components/CharacterPanel';
import { useTabs } from '../components/Layout';
import { MinorTechniques } from './MinorTechniques';
import { content, useGame, useUi } from '../store';
import type { ResourceId } from '../../engine';
import { RESOURCE_NAMES } from '../../engine/resources';
import { demandLeft, gearSellPrice, marketOpen } from '../../engine/systems/economy/market';
import { gearDesc, gearName } from '../../engine/systems/talent/gear';

// 傳承與功法：主修功法領悟、藏經閣研究、傳承分支、典籍與庫房法器。

function Branches() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const [hosts, setHosts] = useState<Record<string, string>>({});
  const others = [...content.lineages.values()].filter((l) => l.id !== game.lineage);
  return (
    <div className="panel" data-testid="branches">
      <h3>傳承分支</h3>
      <p className="muted small">
        條件：藏經閣 2 級、該傳承典籍（坊市在聲望 {balance.branch.scriptureReputation} 以上時以靈石 {balance.branch.scripturePrice}{' '}
        出售，或古修遺跡取得殘本）、一名相應技藝達 {balance.branch.skillRequired} 的內門主持。開設後取得該傳承的專屬建築與開局配方，但沒有主傳承的特色加成。
      </p>
      <table>
        <tbody>
          {others.map((l) => {
            const opened = game.branches.find((b) => b.lineageId === l.id);
            const host = hosts[l.id] ?? '';
            const blocked = branchBlocked(game, content, l.id, host || null);
            const sBlocked = scriptureBlocked(game, content, l.id);
            const hasBook = game.items.includes(scriptureItem(l.id));
            return (
              <tr key={l.id}>
                <td>
                  <b>{l.name}</b>
                  <div className="muted small">主持需{SKILL_NAMES[l.branchSkill]}技藝</div>
                </td>
                {opened ? (
                  <td colSpan={2} className="pos small">
                    已開設，主持人：{allCharacters(game).find((c) => c.id === opened.hostId)?.name ?? '已故前輩'}
                  </td>
                ) : (
                  <>
                    <td className="small">
                      {hasBook ? (
                        <span className="tag gold">已有典籍</span>
                      ) : (
                        <button
                          className="btn small secondary"
                          data-testid={`buy-scripture-${l.id}`}
                          disabled={!!sBlocked}
                          title={sBlocked}
                          onClick={() => dispatch({ type: 'buyScripture', lineageId: l.id })}
                        >
                          購買典籍（{balance.branch.scripturePrice}）
                        </button>
                      )}
                    </td>
                    <td className="small">
                      <select value={host} onChange={(e) => setHosts({ ...hosts, [l.id]: e.target.value })} data-testid={`branch-host-${l.id}`}>
                        <option value="">選擇主持人</option>
                        {game.disciples.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}（{SKILL_NAMES[l.branchSkill]} {d.skills[l.branchSkill]}）
                          </option>
                        ))}
                      </select>{' '}
                      <button
                        className="btn small"
                        disabled={!!blocked}
                        data-testid={`open-branch-${l.id}`}
                        onClick={() => host && dispatch({ type: 'openBranch', lineageId: l.id, hostId: host })}
                      >
                        開設分支
                      </button>
                      {blocked && <div className="muted small">{blocked}</div>}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const RARE_MATS: ResourceId[] = ['mat_jade', 'mat_beastcore', 'mat_earthfire', 'mat_scroll', 'mat_thunder', 'mat_taixu'];

export function LineagePage() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const lineage = content.lineages.get(game.lineage);
  const tech = techniqueOf(game, content);
  const lib = libraryResearch(game, content);
  const T = balance.technique;
  const sp = tech ? T.specialty[tech.id] : undefined;
  const me = techniqueTier(game.protagonist);
  const { tab, bar } = useTabs([
    { id: 'tech', label: '主修功法' },
    { id: 'minor', label: '輔修功法' },
    { id: 'branches', label: '傳承分支' },
    { id: 'treasure', label: '珍藏' },
  ]);
  return (
    <div>
      <h2>傳承與功法</h2>
      {bar}
      {tab === 'tech' && (
      <div className="panel">
        <h3>
          {lineage?.name}傳承・主修功法《{tech?.name}》
        </h3>
        <p className="small">{tech?.description}</p>
        <ol className="tier-track" data-testid="technique-stages">
          {T.stages.map((stage, i) => (
            <li key={stage} className={me.index >= i ? 'got' : ''}>
              <b>{stage}</b>
              <span className="need">
                第 {i * 4 + 1}–{i * 4 + 4} 層・領悟 {T.levels[i * 4]}–{T.levels[i * 4 + 3]}
              </span>
              <span className="small">
                {tech?.tierText[i]}・修煉 +{(i + 1) * T.xpPctPerStage}%
              </span>
            </li>
          ))}
        </ol>
        <p className="small" data-testid="technique-per-level">
          每升一層：攻擊 +{T.perLevel.atkPct}%、生命 +{T.perLevel.hpPct}%、防禦 +{T.perLevel.defPct}%
          {sp && `；傳承專長 ${techniqueStatsText({ atkPct: sp.atkPct ?? 0, hpPct: sp.hpPct ?? 0, defPct: sp.defPct ?? 0, critPct: sp.critPct ?? 0, dodgePct: sp.dodgePct ?? 0, agi: sp.agi ?? 0, beastAtkPct: sp.beastAtkPct ?? 0 })}（小數取整）`}
          。掌門目前{me.name}（第 {me.level} 層）：{techniqueStatsText(techniqueStats(game, content, game.protagonist)) || '尚無加成'}。
        </p>
        <p className="small">
          領悟來源：平時修煉每月 +{balance.technique.passive.qi}（築基 +{balance.technique.passive.foundation}、金丹 +
          {balance.technique.passive.core}），閉關再 +{balance.technique.seclusionPassive}；在藏經閣「研究功法」每月 +
          {lib === null
            ? `${balance.technique.researchBase} 再加藏經閣加成（目前沒有運作中的藏經閣，不能研究）`
            : `${balance.technique.researchBase + lib}（基礎 ${balance.technique.researchBase} + 藏經閣 ${lib}）`}
          。結丹要第 5 層（小成），凝嬰要第 9 層（大成），化神要第 13 層（圓滿）。
        </p>
        <table>
          <thead>
            <tr>
              <th>人物</th>
              <th>領悟</th>
              <th>境界</th>
              <th>本月</th>
            </tr>
          </thead>
          <tbody>
            {allCharacters(game).map((c) => {
              const t = techniqueTier(c);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    {c.insight}
                    {t.next !== null ? ` / ${t.next}` : ''}
                  </td>
                  <td>{t.name}</td>
                  <td className="small">
                    {SCHEDULE_NAMES[c.schedule]}・+{insightGain(game, content, c).total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">在「主角」或「弟子」頁把行程改成「研究功法」（需藏經閣）。</p>
      </div>
      )}
      {tab === 'minor' && <MinorTechniques />}
      {tab === 'branches' && <Branches />}
      {tab === 'treasure' && (
      <div className="panel">
        <h3>珍藏</h3>
        <p className="small">
          關鍵物品：{game.items.length ? game.items.map((i) => ITEM_NAMES[i] ?? i).join('、') : <span className="muted">無</span>}
        </p>
        <div className="small" data-testid="armory">
          庫房法器（在「弟子」或「主角」頁裝備）：
          {game.armory.length ? (
            <ul>
              {game.armory.map((it) => (
                <li key={it.id} data-testid={`armory-${it.id}`}>
                  <span className={`tag q-${it.quality}`}>{gearName(content, it)}</span> {gearDesc(content, it)}
                  {marketOpen(game, content) && (
                    <button
                      className="btn small secondary"
                      data-testid={`sell-gear-${it.id}`}
                      disabled={demandLeft(game, content, 'artifact') < 1}
                      onClick={() => dispatch({ type: 'sellGear', itemId: it.id })}
                    >
                      賣給坊市（{gearSellPrice(game, content, it)} 靈石）
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <span className="muted">無</span>
          )}
          <div>未鑑定的制式法器 {game.resources.artifact} 件（裝備時算凡品兵器）</div>
        </div>
        <p className="small" data-testid="rare-mats">
          副本稀有素材：
          {RARE_MATS.some((id) => game.resources[id] > 0) ? (
            RARE_MATS.filter((id) => game.resources[id] > 0).map((id) => (
              <span key={id} className="tag">
                {RESOURCE_NAMES[id]} {game.resources[id]}
              </span>
            ))
          ) : (
            <span className="muted">還沒有（秘境首領與宗門試煉會掉落）</span>
          )}
        </p>
      </div>
      )}
    </div>
  );
}
