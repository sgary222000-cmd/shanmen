import { useState } from 'react';
import { balance } from '../../content/balance';
import { allCharacters } from '../../engine/systems/characters/characters';
import { formatResources } from '../../engine/resources';
import {
  composeAuthors,
  composeBlocked,
  composeBp,
  libraryLevel,
  minorDef,
  minorGain,
  minorLevel,
  minorStatsText,
} from '../../engine/systems/talent/minorTechniques';
import { content, useGame, useUi } from '../store';

// 0.14.0 輔修功法：藏經閣撰寫、每人另學一部。

const M = balance.minorTechnique;

export function MinorTechniques() {
  const game = useGame();
  const dispatch = useUi((s) => s.dispatch);
  const authors = composeAuthors(game);
  const [author, setAuthor] = useState('');
  const pick = authors.find((c) => c.id === author) ?? authors[0];
  const written = game.minorTechs ?? [];
  const job = game.composing;
  return (
    <div className="panel" data-testid="minor-techniques">
      <h3>輔修功法</h3>
      <p className="small muted">
        在藏經閣撰寫新功法：作者要{M.authorMajor === 'core' ? '金丹' : ''}以上，花費 {formatResources(M.cost)}，行程改成「研究功法」，研究滿 {M.months}{' '}
        個月寫成（成功率 {M.baseBp / 100}%，作者主修每高於第 {M.bpFromLevel} 層一層 +{M.bpPerLevel / 100}%，失敗退還一半材料）。撰寫期間作者的主修領悟暫停。
        寫成後，每位內門弟子（含掌門）可另學一部，共 10 層；輔修領悟是主修的一半，不影響主修。
      </p>
      {job && (
        <p data-testid="composing">
          撰寫中：《{minorDef(job.techId)?.name}》，作者 {allCharacters(game).find((c) => c.id === job.authorId)?.name ?? ''}，進度 {job.months} / {M.months}{' '}
          個月
          {allCharacters(game).find((c) => c.id === job.authorId)?.schedule !== 'research' && <b>（作者目前不在研究，進度暫停）</b>}
        </p>
      )}
      {authors.length > 0 && !job && (
        <p className="small">
          作者：
          <select data-testid="compose-author" value={pick?.id ?? ''} onChange={(e) => setAuthor(e.target.value)}>
            {authors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（成功率 {composeBp(c) / 100}%）
              </option>
            ))}
          </select>
        </p>
      )}
      <table className="small">
        <tbody>
          {M.list.map((d) => {
            const blocked = pick ? composeBlocked(game, d.id, pick.id) : '要有金丹以上的作者';
            return (
              <tr key={d.id} data-testid={`minor-${d.id}`}>
                <td>
                  <b>《{d.name}》</b>
                </td>
                <td>{d.desc}</td>
                <td className="muted">藏經閣 {d.library} 級</td>
                <td>
                  {written.includes(d.id) ? (
                    <span className="tag gold">已寫成</span>
                  ) : job?.techId === d.id ? (
                    <span className="tag">撰寫中</span>
                  ) : (
                    <>
                      <button
                        className="btn small"
                        data-testid={`compose-${d.id}`}
                        disabled={!!blocked}
                        title={blocked}
                        onClick={() => pick && dispatch({ type: 'composeTechnique', techId: d.id, authorId: pick.id })}
                      >
                        撰寫
                      </button>
                      {blocked && <span className="muted"> {blocked}</span>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {libraryLevel(game) === 0 && <p className="muted small">要先蓋好藏經閣。</p>}
      <h4>誰修哪一部</h4>
      <table className="small">
        <tbody>
          {allCharacters(game).map((c) => {
            const lv = minorLevel(c);
            return (
              <tr key={c.id} data-testid={`minor-row-${c.id}`}>
                <td>{c.name}</td>
                <td>
                  <select
                    data-testid={`learn-minor-${c.id}`}
                    value={c.minor?.id ?? ''}
                    disabled={!written.length}
                    onChange={(e) => dispatch({ type: 'learnMinor', characterId: c.id, techId: e.target.value || null })}
                  >
                    <option value="">（不修）</option>
                    {written.map((id) => (
                      <option key={id} value={id}>
                        {minorDef(id)?.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {c.minor
                    ? `第 ${lv.level} 層（${c.minor.insight}${lv.next !== null ? ` / ${lv.next}` : ''}）・本月 +${minorGain(game, content, c)}`
                    : '—'}
                </td>
                <td className="muted">{minorStatsText(c)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">換修另一部功法時，原本的輔修領悟會歸零。</p>
    </div>
  );
}
