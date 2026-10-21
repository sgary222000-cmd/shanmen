import type { EnemyDef, PoolEventDef, SecretRealmDef } from '../schema';

// P2 批次 E：大型上古秘境「太虛古境」，五層，每層通關就能停下、下次從下一層開始。
// 給元嬰、化神的主角挑戰；每層首次通關有凝嬰丹、化神丹、延壽丹與獨特法器；重複挑戰產出凝嬰、化神丹的材料。
// 每層的岔路事件從事件池隨機抽，一次性機緣領過就不再出現。數值為暫定值（見 docs/暫定數值與決策.md）。

/** 敵人數值依建議實力的境界等級 L 換算：首領約為同境界主角的 2.5 倍生命、九成攻擊。 */
function foe(id: string, name: string, L: number, kind: 'front' | 'back' | 'boss', skill?: EnemyDef['skill']): EnemyDef {
  const k = { front: { hp: 150, atk: 36, def: 10, spd: 6 }, back: { hp: 100, atk: 40, def: 5, spd: 10 }, boss: { hp: 450, atk: 45, def: 11, spd: 8 } }[kind];
  return {
    id,
    name,
    hp: Math.round((k.hp * L) / 10),
    atk: Math.round((k.atk * L) / 10),
    def: Math.round((k.def * L) / 10),
    spd: k.spd + Math.floor(L / 2),
    hit: 10 + Math.floor(L / 2),
    res: 6 + Math.floor(L / 3),
    row: kind === 'back' ? 'back' : 'front',
    ...(skill ? { skill } : {}),
  };
}

/** 各層建議實力的境界等級：元嬰前期、元嬰中期、元嬰圓滿、化神前期、化神後期。 */
export const TAIXU_LEVELS = [42, 47, 57, 63, 75];
/** 敵人實際用的等級（依試算微調，讓各層勝率接近）。 */
const EL = [42, 47, 60, 61, 75];

export const taixuEnemies: EnemyDef[] = [
  foe('enemy.taixu_guard', '太虛石衛', EL[0]!, 'front'),
  foe('enemy.taixu_wraith', '古境遊魂', EL[0]!, 'back'),
  foe('enemy.taixu_gatekeeper', '鎮門石將', EL[0]!, 'boss', { name: '鎮山拳', multiplierPct: 170, cooldown: 3 }),
  foe('enemy.taixu_bird', '青冥火鴉', EL[1]!, 'back'),
  foe('enemy.taixu_ape', '金甲古猿', EL[1]!, 'boss', { name: '撼地', multiplierPct: 175, cooldown: 3 }),
  foe('enemy.taixu_sword', '劍冢殘劍', EL[2]!, 'front'),
  foe('enemy.taixu_sword_lord', '劍冢之主', EL[2]!, 'boss', { name: '萬劍歸宗', multiplierPct: 180, cooldown: 3 }),
  foe('enemy.taixu_thunder', '雷池雷靈', EL[3]!, 'back'),
  foe('enemy.taixu_dragon', '雷池蛟龍', EL[3]!, 'boss', { name: '九霄雷息', multiplierPct: 180, cooldown: 3 }),
  foe('enemy.taixu_shadow', '虛空魅影', EL[4]!, 'front'),
  foe('enemy.taixu_master', '太虛道主殘念', EL[4]!, 'boss', { name: '太虛歸一', multiplierPct: 190, cooldown: 3 }),
];

/** 五層共用的事件池。 */
const pool: PoolEventDef[] = [
  {
    id: 'furnace',
    title: '殘破丹爐',
    text: '石台上擱著一座裂了縫的丹爐，爐底還有幾顆蒙塵的丹藥。',
    choices: [
      { id: 'pills', label: '取出殘丹', result: '殘丹藥力猶存，可以帶回宗門。', loot: { pill_peiyuan: 3 } },
      { id: 'melt', label: '敲下爐壁的靈礦', result: '爐壁是上好的靈礦，眾人敲了一大塊。', loot: { ore: 12 } },
    ],
  },
  {
    id: 'mist',
    title: '迷霧幻陣',
    text: '前方被濃霧籠罩，隱約可見霧中有靈光閃動。',
    choices: [
      { id: 'force', label: '強行破陣', result: '幻陣反噬，眾人受了些傷，霧散後拾得一袋靈石。', hpLossPct: 20, loot: { lingshi: 300 } },
      { id: 'around', label: '繞道而行', result: '多走了一段路，平安無事。' },
    ],
  },
  {
    id: 'garden',
    title: '上古藥田',
    text: '斷牆後是一片荒廢的藥田，幾株靈藥在石縫間長得茂盛。',
    choices: [
      { id: 'pick', label: '小心採摘', result: '採下成熟的靈藥。', loot: { spirit_herb: 15 } },
      { id: 'dig', label: '連根挖走', result: '藥田守護禁制發動，眾人負傷，但多帶走了一倍靈藥。', hpLossPct: 15, loot: { spirit_herb: 30 } },
    ],
  },
  {
    id: 'nest',
    title: '妖獸巢穴',
    text: '岩洞裡傳出低沉的鼻息，洞口散落著獸骨與蛻下的鱗皮。',
    choices: [
      { id: 'scare', label: '撿拾洞口的獸材', result: '趁妖獸沉睡，撿走洞口的鱗皮。', loot: { beast_mat: 6 } },
      { id: 'raid', label: '掏巢', result: '妖獸驚醒，一番纏鬥後眾人帶傷而出，收穫豐厚。', hpLossPct: 25, loot: { beast_mat: 16 } },
    ],
  },
  {
    id: 'spring',
    title: '養生靈泉',
    text: '一眼泉水冒著淡淡白霧，泉邊石碑寫著「飲者延壽」。',
    choices: [
      { id: 'bottle', label: '以玉瓶收取泉水', result: '泉水靈氣精純，回去可以煉成延壽丹。', unique: true },
      { id: 'rest', label: '在泉邊調息', result: '眾人在泉邊調息片刻，傷勢略有好轉。' },
    ],
    unique: { rewardId: 'taixu.spring', text: '收得一瓶養生靈泉，等於一顆延壽丹。', resources: { pill_life: 1 }, equipment: [], insight: 0 },
  },
  {
    id: 'scroll',
    title: '石壁劍痕',
    text: '石壁上留著前人以劍刻下的心得，字字透著劍意。',
    choices: [
      { id: 'study', label: '靜坐參悟', result: '眾人各有所得。', unique: true },
      { id: 'leave', label: '記下位置，日後再來', result: '眾人記下石壁位置後繼續前進。' },
    ],
    unique: { rewardId: 'taixu.scroll', text: '參透石壁劍痕。', resources: {}, equipment: [], insight: 30 },
  },
  {
    id: 'mirror',
    title: '無名劍匣',
    text: '白骨旁擱著一只劍匣，匣中隱隱有鏡光透出。',
    choices: [
      { id: 'open', label: '收斂遺骨，取走劍匣', result: '安葬遺骨後打開劍匣，裡面是一面古鏡。', unique: true },
      { id: 'pass', label: '不驚擾逝者', result: '眾人向遺骨行禮後離去。' },
    ],
    unique: { rewardId: 'taixu.mirror', text: '得到法器「照虛古鏡」。', resources: {}, equipment: ['equip.taixu_mirror'], insight: 0 },
  },
  {
    id: 'thunder',
    title: '雷劫餘痕',
    text: '地面焦黑一片，殘留的雷意仍在劈啪作響。',
    choices: [
      { id: 'temper', label: '引雷淬體', result: '雷意入體痛不欲生，但在焦土下挖到雷擊過的靈木與靈石。', hpLossPct: 30, loot: { lingshi: 400, wood: 40 } },
      { id: 'avoid', label: '避開雷區', result: '眾人小心繞過。' },
    ],
  },
];

interface FloorSpec {
  floor: number;
  name: string;
  recommend: string;
  intro: string;
  grunts: string[];
  boss: string[];
  bossText: string;
  loot: number;
  firstClear: SecretRealmDef['firstClear'];
}

function floorRealm(f: FloorSpec): SecretRealmDef {
  const k = f.floor;
  const id = `secret.taixu_${k}`;
  return {
    id,
    name: `太虛古境・${f.name}`,
    description: `${f.intro} 太虛古境共五層，每層通關就能停下，下次從下一層開始。岔路上的事件每次都不同，有些機緣只會出現一次。`,
    risk: `極高。建議主角${f.recommend}以上、帶足回春丹；戰敗會重傷，但不會死。`,
    recommend: f.recommend,
    recommendLevel: TAIXU_LEVELS[k - 1],
    supplies: { food: 20 + 10 * k, lingshi: 100 * k },
    maxTeam: 5,
    startNode: 'entrance',
    eventPool: pool,
    ...(k > 1 ? { requires: `secret.taixu_${k - 1}` } : {}),
    group: { name: '太虛古境', floor: k },
    repeatLootPct: 60,
    retreatLootPct: 50,
    // 五層共用三張圖：入口（1）、迴廊（2–3）、核心（4–5）
    art: `final/realm-taixu-${k === 1 ? 1 : k <= 3 ? 2 : 3}.webp`,
    dispatch: { months: 3, power: [2600, 3200, 4200, 5200, 6800][k - 1]!, lootPct: [30, 50] },
    firstClear: f.firstClear,
    nodes: [
      { id: 'entrance', kind: 'entrance', title: `第 ${k} 層入口`, text: f.intro, next: ['guards'] },
      {
        id: 'guards',
        kind: 'enemy',
        title: '守關',
        text: '守在入口的敵人察覺有人闖入。',
        next: ['fork'],
        enemies: f.grunts,
        loot: { lingshi: 60 * k, ore: 4 * k },
      },
      { id: 'fork', kind: 'fork', title: '岔路', text: '前方分成兩條路，各有動靜。', next: ['left', 'right'] },
      { id: 'left', kind: 'event', title: '左側小徑', text: '小徑盡頭似乎有什麼東西。', next: ['deep'], pool: true },
      { id: 'right', kind: 'event', title: '右側石廊', text: '石廊深處傳來一點動靜。', next: ['deep'], pool: true },
      {
        id: 'deep',
        kind: 'resource',
        title: '秘藏',
        text: '一間未被搜刮的石室，架上堆著材料。',
        next: ['boss'],
        loot: { spirit_herb: f.loot, ore: Math.round(f.loot * 0.6), beast_mat: Math.round(f.loot * 0.4) },
      },
      { id: 'boss', kind: 'boss', title: '守層之主', text: f.bossText, next: ['exit'], enemies: f.boss, loot: { lingshi: 150 * k } },
      { id: 'exit', kind: 'exit', title: '傳送陣', text: '石室中央亮起傳送陣，可以回到古境外。', next: [] },
    ],
  };
}

export const taixuFloors: SecretRealmDef[] = [
  floorRealm({
    floor: 1,
    name: '石林',
    recommend: '元嬰前期',
    intro: '古境入口是一片石林，石柱上的人像似乎會轉動目光。',
    grunts: ['enemy.taixu_guard', 'enemy.taixu_wraith'],
    boss: ['enemy.taixu_gatekeeper', 'enemy.taixu_wraith'],
    bossText: '石林中央，一尊巨大的石將緩緩站起。',
    loot: 10,
    firstClear: {
      rewardId: 'reward.taixu_1.first_clear',
      recipes: [],
      resources: { pill_nascent: 1, lingshi: 800 },
      text: '石將倒下後，底座裡封著一顆凝嬰丹與一袋靈石。',
      items: [],
      equipment: [],
      insight: 20,
    },
  }),
  floorRealm({
    floor: 2,
    name: '古木林',
    recommend: '元嬰中期',
    intro: '第二層是遮天蔽日的古木林，林間火鴉盤旋。',
    grunts: ['enemy.taixu_guard', 'enemy.taixu_bird'],
    boss: ['enemy.taixu_ape', 'enemy.taixu_bird'],
    bossText: '一頭披著金甲的古猿捶胸怒吼，震得落葉紛飛。',
    loot: 15,
    firstClear: {
      rewardId: 'reward.taixu_2.first_clear',
      recipes: [],
      resources: { pill_life: 1, lingshi: 1200 },
      text: '古猿守護的樹洞裡藏著一顆延壽丹。',
      items: [],
      equipment: [],
      insight: 20,
    },
  }),
  floorRealm({
    floor: 3,
    name: '劍冢',
    recommend: '元嬰圓滿',
    intro: '第三層插滿了殘劍，劍意縱橫，稍不留神就會被割傷。',
    grunts: ['enemy.taixu_sword', 'enemy.taixu_sword'],
    boss: ['enemy.taixu_sword_lord', 'enemy.taixu_sword'],
    bossText: '劍冢深處，萬劍齊鳴，一道人影自劍山中走出。',
    loot: 20,
    firstClear: {
      rewardId: 'reward.taixu_3.first_clear',
      recipes: [],
      resources: { pill_deity: 1, lingshi: 2000 },
      text: '劍冢之主消散，留下一顆化神丹。',
      items: [],
      equipment: ['equip.taixu_sword'],
      insight: 30,
    },
  }),
  floorRealm({
    floor: 4,
    name: '雷池',
    recommend: '化神前期',
    intro: '第四層是一座雷池，雷光不斷劈落池面。',
    grunts: ['enemy.taixu_sword', 'enemy.taixu_thunder'],
    boss: ['enemy.taixu_dragon', 'enemy.taixu_thunder'],
    bossText: '雷池翻湧，一條蛟龍破水而出，龍鬚上纏繞著雷光。',
    loot: 25,
    firstClear: {
      rewardId: 'reward.taixu_4.first_clear',
      recipes: [],
      resources: { pill_life: 1, lingshi: 3000 },
      text: '蛟龍的龍珠化為一顆延壽丹與大量靈石。',
      items: [],
      equipment: [],
      insight: 30,
    },
  }),
  floorRealm({
    floor: 5,
    name: '太虛殿',
    recommend: '化神後期',
    intro: '最深處是一座懸在虛空中的大殿，四周什麼都沒有。',
    grunts: ['enemy.taixu_shadow', 'enemy.taixu_thunder'],
    boss: ['enemy.taixu_master', 'enemy.taixu_shadow'],
    bossText: '殿上端坐一道虛影，是開闢古境的太虛道主留下的殘念。',
    loot: 30,
    firstClear: {
      rewardId: 'reward.taixu_5.first_clear',
      recipes: [],
      resources: { pill_deity: 1, pill_life: 1, lingshi: 5000 },
      text: '道主殘念含笑消散，留下畢生積蓄。太虛古境從此再無秘密。',
      items: [],
      equipment: [],
      insight: 50,
    },
  }),
];
