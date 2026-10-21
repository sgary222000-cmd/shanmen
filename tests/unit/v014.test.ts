import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { STATE_VERSION, type GameState } from '../../src/engine';
import { allyUnit } from '../../src/engine/systems/combat/party';
import { breakthroughOdds } from '../../src/engine/systems/cultivation/cultivation';
import { craftOdds } from '../../src/engine/systems/economy/flows';
import { composeBlocked, minorGain, minorLevel, minorStats } from '../../src/engine/systems/talent/minorTechniques';
import { insightGain } from '../../src/engine/systems/talent/techniques';
import { decode } from '../../src/save/codec';
import { advance, content, developed, edit, run, tryRun } from './helpers';

// 0.14.0：輔修功法（撰寫、學習、輔修領悟、效果）、v12 → v13 存檔升級。

const M = balance.minorTechnique;

/** 藏經閣 level 級，c50 是金丹，有古修殘卷。 */
function withLibrary(level = 2): GameState {
  return edit(developed(), (s) => {
    s.buildings.push({ id: 'b180', defId: 'building.library', region: 'region.main', level, status: 'active', construction: null });
    const d = s.disciples[0];
    if (d) d.realm = { major: 'core', stage: 1 };
    s.resources.mat_scroll = 5;
    s.resources.lingshi = 5000;
  });
}

describe('撰寫輔修功法', () => {
  it('條件：藏經閣等級、金丹以上作者、材料；一次只能寫一部', () => {
    const s = withLibrary(2);
    expect(composeBlocked(s, 'minor.spirit', 'c50')).toContain('藏經閣 3 級');
    expect(composeBlocked(s, 'minor.army', 'c0')).toContain('金丹');
    expect(composeBlocked(edit(s, (x) => (x.resources.mat_scroll = 1)), 'minor.army', 'c50')).toContain('材料不足');
    const started = run(s, { type: 'composeTechnique', techId: 'minor.army', authorId: 'c50' });
    expect(started.resources.mat_scroll).toBe(3);
    expect(started.resources.lingshi).toBe(4200);
    expect(started.disciples[0]?.schedule).toBe('research');
    expect(tryRun(started, { type: 'composeTechnique', techId: 'minor.vajra', authorId: 'c50' }).ok).toBe(false);
  });

  it('作者研究滿 6 個月寫成或失敗；撰寫期間主修領悟暫停', () => {
    let wins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let s = edit(withLibrary(2), (x) => {
        x.rng = developed(seed).rng;
      });
      s = run(s, { type: 'composeTechnique', techId: 'minor.army', authorId: 'c50' });
      const d = s.disciples[0];
      if (!d) return;
      expect(insightGain(s, content, d).total).toBe(0);
      const insight = d.insight;
      s = advance(s, M.months);
      expect(s.composing).toBeNull();
      expect(s.disciples[0]?.insight).toBe(insight);
      if (s.minorTechs.includes('minor.army')) wins++;
      else expect(s.resources.mat_scroll).toBe(4); // 失敗退還一半
    }
    expect(wins).toBeGreaterThan(3);
    expect(wins).toBeLessThan(12);
  });
});

describe('學習與效果', () => {
  const learned = (id: string, insight = M.maxInsight) =>
    edit(withLibrary(3), (x) => {
      x.minorTechs = [id];
      x.protagonist.minor = { id, insight };
    });

  it('只能學宗門已寫成的功法；換修時輔修領悟歸零', () => {
    let s = withLibrary(2);
    expect(tryRun(s, { type: 'learnMinor', characterId: 'c0', techId: 'minor.army' }).ok).toBe(false);
    s = edit(s, (x) => {
      x.minorTechs = ['minor.army', 'minor.vajra'];
    });
    s = run(s, { type: 'learnMinor', characterId: 'c0', techId: 'minor.army' });
    expect(minorLevel(s.protagonist).level).toBe(1);
    s = edit(s, (x) => {
      if (x.protagonist.minor) x.protagonist.minor.insight = 100;
    });
    s = run(s, { type: 'learnMinor', characterId: 'c0', techId: 'minor.vajra' });
    expect(s.protagonist.minor).toEqual({ id: 'minor.vajra', insight: 0 });
    s = run(s, { type: 'learnMinor', characterId: 'c0', techId: null });
    expect(s.protagonist.minor).toBeUndefined();
  });

  it('輔修領悟是主修領悟的一半（進位），10 層封頂', () => {
    let s = learned('minor.army', 0);
    s = run(s, { type: 'setSchedule', characterId: 'c0', schedule: 'research' });
    const main = insightGain(s, content, s.protagonist).total;
    expect(minorGain(s, content, s.protagonist)).toBe(Math.ceil(main / 2));
    s = advance(s);
    expect(s.protagonist.minor?.insight).toBe(Math.ceil(main / 2));
    expect(minorLevel(learned('minor.army').protagonist)).toEqual({ level: 10, next: null });
  });

  it('破軍訣提高攻擊，金剛不壞體提高防禦', () => {
    const base = withLibrary(3);
    const army = learned('minor.army');
    expect(minorStats(army.protagonist)).toMatchObject({ atkPct: 20, critPct: 3 });
    expect(allyUnit(army, content, army.protagonist, 'front').atk).toBeGreaterThan(allyUnit(base, content, base.protagonist, 'front').atk);
    const vajra = learned('minor.vajra');
    expect(allyUnit(vajra, content, vajra.protagonist, 'front').def).toBeGreaterThan(allyUnit(base, content, base.protagonist, 'front').def);
  });

  it('養神篇加大突破成功率，百藝心經加煉丹成功率', () => {
    const prep = (id: string) =>
      edit(learned(id), (x) => {
        x.protagonist.realm = { major: 'foundation', stage: 4 };
      });
    const base = prep('minor.army');
    const spirit = prep('minor.spirit');
    expect(breakthroughOdds(spirit, content, spirit.protagonist).bp).toBe(breakthroughOdds(base, content, base.protagonist).bp + 300);
    const crafts = learned('minor.crafts');
    const recipe = 'recipe.qi_pill';
    expect(craftOdds(crafts, content, 'alchemy', recipe, 'c0').parts.join()).toContain('百藝心經');
  });
});

describe('存檔', () => {
  it('0.13.x 的存檔升級：補上輔修功法欄位，推進一年不出錯', () => {
    const v12 = JSON.parse(readFileSync('tests/fixtures/save-v12-tech20.json', 'utf8'));
    const r = decode(v12);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(12);
    const s = r.state;
    expect(s.version).toBe(STATE_VERSION);
    expect(s.minorTechs).toEqual([]);
    expect(s.composing).toBeNull();
    const later = advance(s, 12);
    expect(Object.values(later.resources).every((v) => v >= 0)).toBe(true);
  });
});
