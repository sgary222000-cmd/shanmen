// 圖片載入：依內容資料中的路徑取得網址。臨時圖一律顯示「臨時素材」標記。
const files = import.meta.glob('/assets/**/*.{svg,png,webp,jpg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function artUrl(path: string): string | undefined {
  return files[`/assets/${path}`];
}

export function isPlaceholder(path: string): boolean {
  return path.startsWith('placeholder/');
}
