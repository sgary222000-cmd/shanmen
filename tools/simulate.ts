import { content } from '../src/content/registry';
import { applyCommand, formatDate, monthIndex, newGame } from '../src/engine';
import { RESOURCE_IDS } from '../src/engine/resources';
import { hallLevel } from '../src/engine/systems/buildings/buildings';
import { realmName } from '../src/engine/systems/characters/characters';
import { botTurn, type BotLog } from './bot';

// 無畫面模擬器：自動玩 N 年，檢查不變條件並輸出平衡指標。
// 用法：npm run simulate -- [年數] [種子]

const years = Number(process.argv[2] ?? 100);
const seed = Number(process.argv[3] ?? 12345);

let state = newGame(content, { sectName: '青雲宗', protagonistName: '測試', gender: 'male', lineage: 'lineage.sword', seed });
const log: BotLog[] = [];
const milestones: Record<string, string> = {};
const mark = (key: string) => {
  if (!milestones[key]) milestones[key] = formatDate(state.date);
};
const minRes: Record<string, number> = {};
let violations = 0;

for (let i = 0; i < years * 12; i++) {
  state = botTurn(state, content, log);
  const r = applyCommand(state, content, { type: 'advanceMonth', expectMonth: monthIndex(state.date) });
  if (!r.ok) {
    console.error(`推進失敗（${formatDate(state.date)}）：${r.error}`);
    break;
  }
  state = r.state;
  for (const id of RESOURCE_IDS) {
    const v = state.resources[id];
    if (v < 0 || !Number.isInteger(v)) violations++;
    minRes[id] = Math.min(minRes[id] ?? Infinity, v);
  }
  if (hallLevel(state) >= 1) mark('大殿修復');
  if (hallLevel(state) >= 2) mark('大殿 2 級');
  if (state.disciples.length) mark('第一位內門');
  if (state.buildings.some((b) => b.defId === 'building.alchemy' && b.level >= 1)) mark('煉丹房完工');
  if (state.stats.explorations) mark('首次探索');
  if (state.realmClears['secret.abandoned_cave']) mark('荒廢洞府通關');
  const p = state.protagonist;
  if (p.realm.major === 'qi' && p.realm.stage >= 5) mark('主角煉氣五層');
  if (p.realm.major === 'qi' && p.realm.stage >= 9) mark('主角煉氣九層');
  if (p.realm.major === 'foundation') mark('主角築基');
}

console.log(`=== 模擬 ${years} 年（種子 ${seed}）===`);
console.log(`結束時間：${formatDate(state.date)}；主角 ${realmName(state.protagonist.realm)}`);
console.log(`內門：${state.disciples.map((d) => `${d.name} ${realmName(d.realm)}`).join('、') || '無'}`);
console.log(`外門：${state.outer.count} 人，滿意度 ${state.outer.satisfaction}`);
console.log('里程碑：');
for (const [k, v] of Object.entries(milestones)) console.log(`  ${k}：${v}`);
console.log('最終資源：', JSON.stringify(state.resources));
console.log('期間最低資源：', JSON.stringify(minRes));
console.log(`戰鬥 ${state.battles.length} 場（保留最近 30 場）：${state.battles.slice(0, 5).map((b) => `${b.title} ${b.result}`).join('；')}`);
console.log(`不變條件違反次數（資源為負或非整數）：${violations}`);
console.log(`指令數：${state.stats.commands}；推進月數：${state.stats.monthsAdvanced}`);
if (process.argv.includes('--log')) for (const l of log) console.log(`  [${l.month}] ${l.text}`);
if (violations) process.exitCode = 1;
