import { useState } from 'react';
import { balance } from '../../content/balance';
import { allCharacters } from '../../engine/systems/characters/characters';
import { SCHEDULE_NAMES } from '../../engine/systems/characters/schedule';
import { branchBlocked, scriptureBlocked } from '../../engine/systems/talent/branches';
import { ITEM_NAMES, scriptureItem } from '../../engine/systems/talent/items';
import { insightGain, libraryResearch, techniqueOf, techniqueTier } from '../../engine/systems/talent/techniques';
import { SKILL_NAMES } from '../components/CharacterPanel';
import { content, useGame, useUi } from '../store';

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
                    已開設，主持人：{allCharacters(game).find((c) => c.id === opened.hostId)?.name}
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

export function LineagePage() {
  const game = useGame();
  const lineage = content.lineages.get(game.lineage);
  const tech = techniqueOf(game, content);
  const lib = libraryResearch(game, content);
  const tiers = balance.technique.tiers;
  return (
    <div>
      <h2>傳承與功法</h2>
      <div className="panel">
        <h3>
          {lineage?.name}傳承・主修功法《{tech?.name}》
        </h3>
        <p className="small">{tech?.description}</p>
        <ul className="small">
          {tiers.map((t, i) => (
            <li key={t.name}>
              <b>{t.name}</b>（領悟 {t.insight}）：{tech?.tierText[i]}
            </li>
          ))}
        </ul>
        <p className="small">
          領悟來源：平時修煉每月 +{balance.technique.passive.qi}（築基 +{balance.technique.passive.foundation}、金丹 +
          {balance.technique.passive.core}），閉關再 +{balance.technique.seclusionPassive}；在藏經閣「研究功法」每月 +
          {balance.technique.researchBase + (lib ?? 0)}
          {lib === null ? '（目前沒有運作中的藏經閣，不能研究）' : ''}。結丹需要小成。
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
      <Branches />
      <div className="panel">
        <h3>珍藏</h3>
        <p className="small">
          關鍵物品：{game.items.length ? game.items.map((i) => ITEM_NAMES[i] ?? i).join('、') : <span className="muted">無</span>}
        </p>
        <p className="small">
          庫房法器：
          {game.armory.length ? game.armory.map((e, i) => <span key={i} className="tag">{content.equipment.get(e)?.name}</span>) : <span className="muted">無</span>}
          ・制式法器 {game.resources.artifact} 件（在「弟子」或「主角」頁裝備）
        </p>
      </div>
    </div>
  );
}
