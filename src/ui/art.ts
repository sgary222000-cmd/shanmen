// 圖片載入：依內容資料中的路徑取得網址。臨時圖一律顯示「臨時素材」標記。
const files = import.meta.glob('/assets/**/*.{svg,png,webp,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function artUrl(path: string): string | undefined {
  return files[`/assets/${path}`];
}

export function isPlaceholder(path: string): boolean {
  return path.startsWith('placeholder/');
}

// 內門弟子肖像：依性別各 3 張，以弟子 id 固定分配，讀檔後不會變。
const DISCIPLE_PORTRAITS = { male: 3, female: 3 };

export function disciplePortrait(c: { id: string; gender: 'male' | 'female' }): string {
  let h = 0;
  for (const ch of c.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `final/disciple-${c.gender}-0${(h % DISCIPLE_PORTRAITS[c.gender]) + 1}.webp`;
}

/** 任何人物的肖像：掌門用主角立繪，內門弟子用肖像庫。 */
export function portraitOf(c: { id: string; gender: 'male' | 'female'; role: string }): string {
  if (c.role === 'protagonist' && c.id === 'c0') return c.gender === 'female' ? 'final/portrait-female.webp' : 'final/portrait-male.webp';
  return disciplePortrait(c);
}

/**
 * 宗門全景依大殿等級分四個階段（P2 批次 E）：殘破（0–1 級）、重建（2 級）、興盛（3 級）、鼎盛（4 級以上）。
 * 各階段的正式圖放在 final/panorama-stage{1-4}.webp，構圖與現有全景相同（建築名牌位置共用）；圖還沒到時沿用現有全景。
 */
export function panoramaFor(hall: number): string {
  const stage = hall <= 1 ? 1 : Math.min(4, hall);
  const path = `final/panorama-stage${stage}.webp`;
  return artUrl(path) ? path : 'final/panorama.webp';
}
