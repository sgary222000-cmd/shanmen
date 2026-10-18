import { emptyResources } from '../../src/engine/resources';
import { content } from '../../src/content/registry';
import { applyCommand, monthIndex, newGame, type Command, type GameState } from '../../src/engine';

export { content };

export function fresh(seed = 1, lineage = 'lineage.sword'): GameState {
  return newGame(content, { sectName: '青雲宗', protagonistName: '林長風', gender: 'male', lineage, seed });
}

/** 執行指令，失敗時讓測試失敗。 */
export function run(state: GameState, cmd: Command): GameState {
  const r = applyCommand(state, content, cmd);
  if (!r.ok) throw new Error(`指令失敗 ${cmd.type}：${r.error}`);
  return r.state;
}

export function tryRun(state: GameState, cmd: Command) {
  return applyCommand(state, content, cmd);
}

export function advance(state: GameState, months = 1): GameState {
  let s = state;
  for (let i = 0; i < months; i++) {
    // 自動略過招生事件，方便測試
    for (const ev of s.events) {
      s = run(s, ev.kind === 'recruitment' ? { type: 'resolveRecruitment', eventId: ev.id, candidateId: null } : { type: 'dismissEvent', eventId: ev.id });
    }
    s = run(s, { type: 'advanceMonth', expectMonth: monthIndex(s.date) });
  }
  return s;
}

/** 直接修改測試狀態（只用於測試佈置）。 */
export function edit(state: GameState, fn: (s: GameState) => void): GameState {
  const s = structuredClone(state);
  fn(s);
  return s;
}

/** 佈置一個已建好大殿 2 級、煉丹房、聚靈陣的宗門。 */
export function developed(seed = 1): GameState {
  return edit(fresh(seed), (s) => {
    s.resources = { ...emptyResources(), lingshi: 2000, food: 1000, stone: 1000, wood: 1000, herb: 300, pill_qi: 20, pill_heal: 10 };
    const hall = s.buildings.find((b) => b.defId === 'building.hall');
    if (hall) {
      hall.level = 2;
      hall.status = 'active';
    }
    let n = 100;
    for (const defId of ['building.field', 'building.quarry', 'building.lumber', 'building.alchemy', 'building.array']) {
      s.buildings.push({ id: `b${n++}`, defId, region: 'region.main', level: 1, status: 'active', construction: null, ...(defId === 'building.field' ? { crop: 'food' as const } : {}) });
    }
    s.disciples.push({
      id: 'c50',
      name: '葉若雪',
      gender: 'female',
      role: 'inner',
      ageMonths: 200,
      realm: { major: 'qi', stage: 3 },
      xp: 0,
      root: { grade: 'mid', elements: ['wood'] },
      health: 100,
      injuryMonths: 0,
      loyalty: 70,
      skills: { alchemy: 3, farming: 1, combat: 3, forging: 0, talisman: 0, beast: 0, affairs: 0 },
      schedule: 'cultivate',
      takePill: false,
      seat: 'region.main',
      specialty: null,
      insight: 0,
      equipment: null,
    });
  });
}
