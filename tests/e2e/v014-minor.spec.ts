import { expect, test, type Page } from '@playwright/test';

// 0.14.0 驗收流程：藏經閣撰寫輔修功法、學習、掌門頁顯示。截圖存到 test-results/v014/。

const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('撰寫與學習輔修功法', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 46 });
  s.protagonist.realm = { major: 'core', stage: 2 };
  s.protagonist.insight = 400;
  s.resources = { ...s.resources, lingshi: 3000, mat_scroll: 3 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 3, status: 'active' });
  s.buildings.push({ id: 'b90', defId: 'building.library', region: 'region.main', level: 2, status: 'active', construction: null });
  s.minorTechs = ['minor.vajra'];
  s.nextRecruitMonth = 99999;
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'v014-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-21T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();

  await nav(page, 'lineage', 'minor');
  await expect(page.getByTestId('minor-minor.vajra')).toContainText('已寫成');
  await expect(page.getByTestId('compose-minor.spirit')).toBeDisabled();
  await page.getByTestId('compose-minor.army').click();
  await expect(page.getByTestId('composing')).toContainText('破軍訣');

  await page.getByTestId('learn-minor-c0').selectOption('minor.vajra');
  await expect(page.getByTestId('minor-row-c0')).toContainText('第 1 層');
  await expect(page.getByTestId('minor-row-c0')).toContainText('防禦 +2%');
  await page.screenshot({ path: 'test-results/v014/01-輔修功法.png' });

  await nav(page, 'protagonist');
  await expect(page.getByTestId('minor-line-c0')).toContainText('金剛不壞體');
  await page.getByTestId('minor-line-c0').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/v014/02-掌門輔修.png' });

  expect(errors).toEqual([]);
});
