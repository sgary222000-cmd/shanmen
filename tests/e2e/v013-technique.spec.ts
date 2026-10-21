import { expect, test, type Page } from '@playwright/test';

// 0.13.0 驗收流程：主修功法 20 層，掌門頁與傳承頁顯示層數與屬性。截圖存到 test-results/v013/。

const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('主修功法層數與屬性', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 45 });
  s.protagonist.insight = 1500;
  s.protagonist.realm = { major: 'deity', stage: 1 };
  s.nextRecruitMonth = 99999;
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'v013-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-21T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();

  await nav(page, 'protagonist');
  const line = page.getByTestId('insight-c0');
  await expect(line).toContainText('化境四層');
  await expect(line).toContainText('第 20 層');
  await expect(line).toContainText('暴擊 +10%');
  await expect(line).toContainText('修煉 +25%');
  await line.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/v013/01-掌門功法.png' });

  await nav(page, 'lineage');
  await expect(page.getByTestId('technique-stages').locator('li')).toHaveCount(5);
  await expect(page.getByTestId('technique-per-level')).toContainText('攻擊 +2%');
  await page.screenshot({ path: 'test-results/v013/02-傳承功法.png' });

  expect(errors).toEqual([]);
});
