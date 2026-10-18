import { writeFileSync, mkdirSync } from 'node:fs';

// 產生臨時佔位圖。每張圖都印有「臨時素材」，不得當作正式美術。
// 正式素材放在 assets/final/，來源與授權記錄在 docs/素材清單.md。

const items: [string, string, number, number, string][] = [
  ['panorama', '宗門全景（殘破山門）', 1200, 520, 'mountains'],
  ['hall', '宗門大殿', 480, 300, 'building'],
  ['dorm', '弟子居所', 480, 300, 'building'],
  ['field', '靈田', 480, 300, 'field'],
  ['quarry', '採石場', 480, 300, 'rock'],
  ['lumber', '靈木場', 480, 300, 'tree'],
  ['alchemy', '煉丹房', 480, 300, 'building'],
  ['array', '聚靈陣', 480, 300, 'circle'],
  ['cave', '荒廢洞府', 800, 360, 'cave'],
  ['portrait-male', '男修肖像', 240, 300, 'person'],
  ['portrait-female', '女修肖像', 240, 300, 'person'],
  // P1 批次 A：區域場景與靈獸
  ['region-outer', '外山', 960, 300, 'mountains'],
  ['region-valley', '靈泉谷', 960, 300, 'field'],
  ['region-fire', '地火峰', 960, 300, 'rock'],
  ['region-back', '後山', 960, 300, 'tree'],
  ['region-gate', '山門', 960, 300, 'building'],
  ['beast-cloud-ape', '雲紋靈猿', 240, 300, 'person'],
  // P1 批次 B：新建築
  ['garden', '藥園', 480, 300, 'field'],
  ['mine', '靈礦場', 480, 300, 'rock'],
  ['forge', '煉器坊', 480, 300, 'building'],
  ['talisman', '符陣閣', 480, 300, 'building'],
  ['market', '坊市', 480, 300, 'building'],
  // P1 批次 C：建築與靈獸
  ['library', '藏經閣', 480, 300, 'building'],
  ['training', '演武場', 480, 300, 'circle'],
  ['cave-abode', '洞府', 480, 300, 'cave'],
  ['beast-garden', '靈獸苑', 480, 300, 'tree'],
  ['beast-cloud-ape-adult', '雲紋靈猿（成年）', 240, 300, 'person'],
  ['beast-fire-fox', '赤焰狐（幼年）', 240, 300, 'person'],
  ['beast-fire-fox-adult', '赤焰狐（成年）', 240, 300, 'person'],
  ['beast-black-turtle', '玄甲龜（幼年）', 240, 300, 'person'],
  ['beast-black-turtle-adult', '玄甲龜（成年）', 240, 300, 'person'],
  // P1 批次 D：秘境
  ['realm-mine', '地下靈礦', 800, 360, 'cave'],
  ['realm-valley', '靈獸山谷', 800, 360, 'tree'],
  ['realm-ruins', '古修遺跡', 800, 360, 'building'],
  // P1 批次 E：電腦宗門
  ['sect-qingmu', '青木宗', 480, 300, 'mountains'],
  ['sect-chixia', '赤霞門', 480, 300, 'mountains'],
  ['sect-luoyun', '落雲谷', 480, 300, 'mountains'],
];

function motif(kind: string, w: number, h: number): string {
  const cx = w / 2;
  const base = h * 0.72;
  switch (kind) {
    case 'mountains':
      return `<path d="M0 ${base} L${w * 0.15} ${h * 0.3} L${w * 0.3} ${base} L${w * 0.45} ${h * 0.18} L${w * 0.62} ${base} L${w * 0.78} ${h * 0.35} L${w} ${base} L${w} ${h} L0 ${h}Z" fill="#3f6b62" opacity=".75"/>
<path d="M0 ${h * 0.85} L${w * 0.25} ${h * 0.55} L${w * 0.5} ${h * 0.85} L${w * 0.72} ${h * 0.5} L${w} ${h * 0.85} L${w} ${h} L0 ${h}Z" fill="#2c4f4a" opacity=".9"/>`;
    case 'building':
      return `<path d="M${cx - 110} ${base - 70} L${cx} ${base - 130} L${cx + 110} ${base - 70}Z" fill="#7a4b2a"/><rect x="${cx - 90}" y="${base - 70}" width="180" height="70" fill="#c9b48a"/><rect x="${cx - 20}" y="${base - 45}" width="40" height="45" fill="#5a3a22"/>`;
    case 'field':
      return Array.from({ length: 5 }, (_, i) => `<rect x="${40 + i * 82}" y="${base - 60}" width="70" height="60" fill="#6f9a52" opacity="${0.6 + i * 0.07}"/>`).join('');
    case 'rock':
      return `<path d="M${cx - 140} ${base} L${cx - 60} ${base - 110} L${cx + 20} ${base - 60} L${cx + 90} ${base - 130} L${cx + 150} ${base}Z" fill="#8a8a80"/>`;
    case 'tree':
      return [80, 200, 320].map((x) => `<rect x="${x + 25}" y="${base - 60}" width="12" height="60" fill="#5a3a22"/><circle cx="${x + 31}" cy="${base - 80}" r="40" fill="#3f7a52"/>`).join('');
    case 'circle':
      return `<circle cx="${cx}" cy="${base - 60}" r="80" fill="none" stroke="#c9a54a" stroke-width="4"/><circle cx="${cx}" cy="${base - 60}" r="50" fill="none" stroke="#c9a54a" stroke-width="2"/><path d="M${cx} ${base - 140} L${cx} ${base + 20} M${cx - 80} ${base - 60} L${cx + 80} ${base - 60}" stroke="#c9a54a" stroke-width="2"/>`;
    case 'cave':
      return `<path d="M0 ${h} L0 ${h * 0.2} Q${cx} ${-h * 0.1} ${w} ${h * 0.2} L${w} ${h}Z" fill="#3a3a36"/><ellipse cx="${cx}" cy="${h * 0.75}" rx="${w * 0.18}" ry="${h * 0.32}" fill="#141414"/>`;
    case 'person':
      return `<circle cx="${cx}" cy="${h * 0.36}" r="${w * 0.17}" fill="#d8c3a0"/><path d="M${cx - w * 0.32} ${h} Q${cx} ${h * 0.45} ${cx + w * 0.32} ${h}Z" fill="#3f6b62"/>`;
    default:
      return '';
  }
}

mkdirSync('assets/placeholder', { recursive: true });
for (const [file, label, w, h, kind] of items) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e3d3"/><stop offset="1" stop-color="#b9c9bd"/></linearGradient></defs>
<rect width="${w}" height="${h}" fill="url(#g)"/>
${motif(kind, w, h)}
<rect x="8" y="8" width="${Math.min(w - 16, 150)}" height="28" rx="4" fill="#8b1e1e" opacity=".85"/>
<text x="16" y="28" font-size="15" fill="#fff" font-family="sans-serif">臨時素材</text>
<text x="${w / 2}" y="${h - 14}" font-size="${Math.max(14, Math.min(26, w / 18))}" fill="#1f2e2b" text-anchor="middle" font-family="serif">${label}</text>
</svg>
`;
  writeFileSync(`assets/placeholder/${file}.svg`, svg);
}
console.log(`產生 ${items.length} 張臨時圖`);
