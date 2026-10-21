import { expect, test, type Page } from '@playwright/test';

// 0.12.0 驗收流程：時事、聲望兌換、收購單交貨、珍寶閣、拍賣會出價。
// 全程只透過玩家介面操作。截圖存到 test-results/v012/。

const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};
const snap = async (page: Page, testId: string, name: string) => {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/v012/${name}.png` });
};

test('時事、聲望兌換、收購單、珍寶閣與拍賣會', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { monthIndex, newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 44 });
  s.date = { year: 4, month: 8 };
  s.reputation = 3500;
  s.resources = { ...s.resources, lingshi: 9000, food: 800, stone: 300, wood: 300, pill_heal: 15 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 4, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
    { id: 'b91', defId: 'building.market', region: 'region.gate', level: 2, status: 'active', construction: null },
    { id: 'b92', defId: 'building.warehouse', region: 'region.main', level: 3, status: 'active', construction: null },
  );
  s.nextRecruitMonth = 99999;
  const now = monthIndex(s.date);
  const sectId = s.sects[0]?.id ?? '';
  s.bazaar.affairs = [{ id: 'plague', until: now + 6 }];
  s.bazaar.buyOrder = { id: 'ord1', sectId, resource: 'pill_heal', amount: 10, lingshi: 480, expires: now + 1 };
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'v012-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-21T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 4 年 8 月');

  // 委託榜上方顯示今年時事
  await nav(page, 'market');
  await expect(page.getByTestId('affair-plague')).toContainText('疫病');
  await snap(page, 'affairs', '01-時事');

  // 聲望兌換：扣可用聲望
  await page.getByTestId('tab-exchange').click();
  await expect(page.getByTestId('rep-available')).toHaveText('3500');
  await page.getByTestId('ex-ex.heal').click();
  await expect(page.getByTestId('rep-available')).toHaveText('3460');
  await expect(page.getByTestId('tier-late')).toContainText('已開放');
  await snap(page, 'exchange', '02-聲望兌換');

  // 收購單：交出回春丹
  await page.getByTestId('tab-orders').click();
  await expect(page.getByTestId('buy-order')).toContainText('回春丹 10');
  await snap(page, 'buy-order', '03-收購單');
  await page.getByTestId('fulfill-order').click();
  await expect(page.getByTestId('buy-order')).toContainText('目前沒有收購單');

  // 推進到 9 月：拍賣會開拍、珍寶閣進貨
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('date')).toHaveText('第 4 年 9 月');
  await expect(page.getByTestId('report-close')).toBeVisible();
  await expect(page.locator('.modal-back')).toContainText('拍賣會開拍');
  await page.screenshot({ path: 'test-results/v012/04-月報.png' });
  await page.getByTestId('report-close').click();
  await nav(page, 'market', 'treasury');
  await expect(page.getByTestId('treasury').locator('[data-testid^="treasure-"]')).toHaveCount(4);
  await snap(page, 'treasury', '05-珍寶閣');

  await page.getByTestId('tab-auction').click();
  const lots = page.getByTestId('grand-auction').locator('[data-testid^="lot-"]');
  await expect(lots).toHaveCount(3);
  const lotId = ((await lots.last().getAttribute('data-testid')) ?? '').slice(4);
  await page.getByTestId(`bid-amount-${lotId}`).fill('1500');
  await page.getByTestId(`bid-${lotId}`).click();
  await expect(page.getByTestId(`lot-${lotId}`)).toContainText('我宗出價 1500');
  await snap(page, 'grand-auction', '06-拍賣會');

  expect(errors).toEqual([]);
});
