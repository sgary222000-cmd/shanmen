// 關鍵物品（不是資源，不能買賣數量）：傳承典籍、馴獸法。

export const ANY_SCRIPTURE = 'item.scripture.any';
export const BEAST_TAMING = 'item.beast_taming';

/** 某傳承的典籍物品 ID，例如 lineage.sword → item.scripture.sword */
export function scriptureItem(lineageId: string): string {
  return `item.scripture.${lineageId.replace(/^lineage\./, '')}`;
}

export const ITEM_NAMES: Record<string, string> = {
  [BEAST_TAMING]: '馴獸法',
  [ANY_SCRIPTURE]: '古修典籍殘本（可代替任一傳承典籍，用後消失）',
  'item.scripture.sword': '劍修典籍',
  'item.scripture.alchemy': '丹道典籍',
  'item.scripture.beast': '御獸典籍',
  'item.scripture.talisman': '符陣典籍',
};
