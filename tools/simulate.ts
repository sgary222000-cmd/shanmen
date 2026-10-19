import { content } from '../src/content/registry';
import { applyCommand, formatDate, monthIndex, newGame } from '../src/engine';
import { RESOURCE_IDS } from '../src/engine/resources';
import { hallLevel } from '../src/engine/systems/buildings/buildings';
import { realmName } from '../src/engine/systems/characters/characters';
import { botTurn, type BotLog, type BotRoute } from './bot';

// 無畫面模擬器：自動玩 N 年，檢查不變條件並輸出平衡指標。
// 用法：npm run simulate -- [年數] [種子] [傳承，例如 lineage.alchemy] [路線 alchemy|craft|commission]

const years = Number(process.argv[2] ?? 100);
const seed = Number(process.argv[3] ?? 12345);
const lineage = process.argv[4]?.startsWith('lineage.') ? process.argv[4] : 'lineage.sword';
const route = (['alchemy', 'craft', 'commission'].includes(process.argv[5] ?? '') ? process.argv[5] : 'alchemy') as BotRoute;
const income = { 坊市賣出: 0, 坊市買入: 0 };

let state = newGame(content, { sectName: '青雲宗', protagonistName: '測試', gender: 'male', lineage, seed });
const log: BotLog[] = [];
const milestones: Record<string, string> = {};
const mark = (key: string) => {
  if (!milestones[key]) milestones[key] = formatDate(state.date);
};
const minRes: Record<string, number> = {};
let violations = 0;
let deaths = 0;

for (let i = 0; i < years * 12; i++) {
  const before = state;
  state = botTurn(state, content, log, route);
  const done = before.commissions.filter((c) => !state.commissions.some((x) => x.id === c.id));
  if (done.length) mark('第一件委託');
  for (const id of Object.keys(state.market.goods) as (keyof typeof state.market.goods)[]) {
    const a = before.market.goods[id];
    const b = state.market.goods[id];
    if (a && b) {
      income.坊市賣出 += b.sold - a.sold;
      income.坊市買入 += b.bought - a.bought;
    }
  }
  const r = applyCommand(state, content, { type: 'advanceMonth', expectMonth: monthIndex(state.date) });
  if (!r.ok) {
    console.error(`推進失敗（${formatDate(state.date)}）：${r.error}`);
    break;
  }
  state = r.state;
  for (const l of r.report?.lines ?? []) {
    if (l.startsWith('✝ 掌門')) mark(`掌門繼承（第 ${(state.ancestors ?? []).length} 代）`);
    else if (l.startsWith('✝ ')) {
      deaths++;
      mark('首位弟子坐化');
    }
  }
  for (const id of RESOURCE_IDS) {
    const v = state.resources[id];
    if (v < 0 || !Number.isInteger(v)) violations++;
    minRes[id] = Math.min(minRes[id] ?? Infinity, v);
  }
  if (hallLevel(state) >= 1) mark('大殿修復');
  if (hallLevel(state) >= 2) mark('大殿 2 級');
  if (hallLevel(state) >= 3) mark('大殿 3 級');
  if (state.outer.count >= 40) mark('外門 40 人');
  if (state.outer.count >= 60) mark('外門 60 人');
  if (i % 120 === 119) console.log(`第 ${(i + 1) / 12} 年：靈石 ${state.resources.lingshi}、外門 ${state.outer.count}、內門 ${state.disciples.length}、打零工 ${state.outer.jobs.errand}`);
  if (state.disciples.length) mark('第一位內門');
  if (state.buildings.some((b) => b.defId === 'building.alchemy' && b.level >= 1)) mark('煉丹房完工');
  if (state.stats.explorations) mark('首次探索');
  if (state.realmClears['secret.abandoned_cave']) mark('荒廢洞府通關');
  if (state.buildings.some((b) => b.defId === 'building.market' && b.level >= 1)) mark('坊市完工');
  if (state.buildings.some((b) => b.defId === 'building.talisman' && b.level >= 1)) mark('符陣閣完工');
  if (state.buildings.some((b) => b.defId === 'building.forge' && b.level >= 1)) mark('煉器坊完工');
  if (state.buildings.some((b) => b.defId === 'building.ancestral' && b.level >= 1)) mark('祖師殿完工');
  if (state.beasts.some((b) => b.guardian)) mark('護宗神獸晉升');
  if (state.beasts.some((b) => (b.guardian?.level ?? 0) >= 3)) mark('護宗神獸 3 級');
  if (state.reputation >= 20) mark('聲望 20');
  if (state.reputation >= 60) mark('聲望 60');
  const p = state.protagonist;
  if (p.realm.major === 'qi' && p.realm.stage >= 5) mark('主角煉氣五層');
  if (p.realm.major === 'qi' && p.realm.stage >= 9) mark('主角煉氣九層');
  if (p.realm.major !== 'qi') mark('主角築基');
  if (p.realm.major === 'foundation' && p.realm.stage === 4) mark('主角築基圓滿');
  if (p.insight >= 100) mark('主角功法小成');
  if (p.realm.major === 'core') mark('主角結丹');
  for (const realm of content.secretRealms.values()) if (state.realmClears[realm.id]) mark(`${realm.name}通關`);
  if (state.dispatches.length) mark('首次派遣');
  if (Object.values(state.positions).some(Boolean)) mark('首位執事');
  if (state.beasts.length > (lineage === 'lineage.beast' ? 1 : 0)) mark('孵化靈獸');
  if (state.branches.length) mark('開設分支');
  if (state.tournament?.status === 'done') mark(`首次大比（第 ${state.tournament.rank} 名）`);
  if (state.veins.length) mark('標得靈脈');
  for (const [id, r] of Object.entries(state.regions)) if (r.status === 'open' && content.regions.get(id)?.unlock) mark(`開放${content.regions.get(id)?.name}`);
}

console.log(`=== 模擬 ${years} 年（種子 ${seed}、${content.lineages.get(lineage)?.name}、路線 ${route}）===`);
console.log(`結束時間：${formatDate(state.date)}；主角 ${realmName(state.protagonist.realm)}`);
console.log(`內門：${state.disciples.map((d) => `${d.name} ${realmName(d.realm)}`).join('、') || '無'}`);
console.log(`外門：${state.outer.count} 人，滿意度 ${state.outer.satisfaction}`);
console.log('里程碑：');
for (const [k, v] of Object.entries(milestones)) console.log(`  ${k}：${v}`);
console.log('最終資源：', JSON.stringify(state.resources));
console.log(`聲望 ${state.reputation}；坊市成交批數：賣 ${income.坊市賣出}、買 ${income.坊市買入}；已學配方：${state.recipes.length}`);
console.log('期間最低資源：', JSON.stringify(minRes));
console.log(
  `電腦宗門：${state.sects.map((x) => `${content.sects.get(x.id)?.name} 實力 ${x.power}、${x.population} 人、好感 ${x.favor}、靈石 ${x.resources.lingshi}`).join('；')}`,
);
console.log(`戰鬥 ${state.battles.length} 場（保留最近 30 場）：${state.battles.slice(0, 5).map((b) => `${b.title} ${b.result}`).join('；')}`);
console.log(`弟子坐化 ${deaths} 人；歷代掌門：${(state.ancestors ?? []).map((a) => `${a.name}（${realmName(a.realm)}、${Math.floor(a.ageMonths / 12)} 歲）`).join('、') || '無'}；現任掌門 ${state.protagonist.name}（${Math.floor(state.protagonist.ageMonths / 12)} 歲）`);
console.log(`不變條件違反次數（資源為負或非整數）：${violations}`);
console.log(`指令數：${state.stats.commands}；推進月數：${state.stats.monthsAdvanced}`);
if (process.argv.includes('--log')) for (const l of log) console.log(`  [${l.month}] ${l.text}`);
if (violations) process.exitCode = 1;
