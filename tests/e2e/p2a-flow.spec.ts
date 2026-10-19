import { expect, test, type Page } from '@playwright/test';

// P2 批次 A 驗收流程：壽元顯示、延壽丹、自動停止設定、連續推進、掌門坐化與繼承、親傳弟子、祖師殿。
// 全程只透過玩家介面操作。截圖存到 test-results/p2a/。

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/p2a/${name}.png` });
};
const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('壽元、連續推進、掌門繼承與祖師殿都能在介面操作', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：大殿 2 級、糧食充足；掌門 99 歲 7 個月（約 5 個月後壽終），沒有指定親傳弟子；兩名內門弟子
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 41 });
  s.resources = { ...s.resources, lingshi: 2000, food: 2000, stone: 600, wood: 600, herb: 80, pill_life: 1 };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 2, status: 'active' });
  s.buildings.push({
    id: 'b90',
    defId: 'building.field',
    region: 'region.main',
    level: 1,
    status: 'active',
    construction: null,
    crop: 'food',
  });
  s.nextRecruitMonth = 999;
  s.recipes.push('recipe.life_pill');
  const p = s.protagonist;
  p.ageMonths = 100 * 12 - 5;
  p.realm = { major: 'qi', stage: 8 };
  const base = { ...structuredClone(p), role: 'inner', seclusion: undefined, loyalty: 80 };
  s.disciples.push({ ...base, id: 'c7', name: '南宮婉', gender: 'female', realm: { major: 'qi', stage: 6 }, ageMonths: 30 * 12 } as never);
  s.disciples.push({ ...base, id: 'c8', name: '陸行舟', gender: 'male', realm: { major: 'qi', stage: 4 }, ageMonths: 25 * 12 } as never);
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p2a-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-19T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  // 主角頁：壽元快到了，尚未指定親傳弟子
  await nav(page, 'protagonist');
  await expect(page.getByTestId('life-c0')).toContainText('壽元 100 歲');
  await expect(page.getByTestId('succession')).toContainText('尚未指定');
  await shot(page, '01-壽元與繼任');

  // 弟子頁：給陸行舟服延壽丹
  await nav(page, 'disciples', 'inner');
  await page.getByTestId('roster-c8').click();
  await page
    .getByTestId('life-c8')
    .getByRole('button', { name: /服延壽丹/ })
    .click();
  await expect(page.getByTestId('life-c8')).toContainText('壽元 115 歲');
  await shot(page, '02-延壽丹');

  // 設定頁：自動停止條件
  await nav(page, 'settings');
  await expect(page.getByTestId('auto-stop')).toContainText('壽元預警');
  await shot(page, '03-自動停止設定');
  await page.keyboard.press('Escape');

  // 連續推進一年：掌門坐化時一定會停下，跳出繼承選擇
  for (let i = 0; i < 10 && !(await page.getByTestId('successors').isVisible()); i++) {
    if (await page.getByTestId('event-skip').isVisible()) await page.getByTestId('event-skip').click();
    else if (await page.getByTestId('report-close').isVisible()) await page.getByTestId('report-close').click();
    else {
      await page.getByTestId('advance-many').click();
      await expect(page.getByTestId('advance-menu')).toBeVisible();
      if (i === 0) await shot(page, '04-連續推進選單');
      await page.getByTestId('advance-12').click();
      await expect(page.getByTestId('advance-many'))
        .toBeEnabled({ timeout: 20000 })
        .catch(() => undefined);
    }
  }
  await expect(page.getByTestId('successors')).toBeVisible();
  await shot(page, '05-掌門繼承');
  // 暫代的是境界較高的南宮婉；改立陸行舟
  await page.getByTestId('successor-c8').click();
  await expect(page.getByTestId('run-summary')).toContainText('連續推進了');
  await shot(page, '06-連續推進月報');
  await page.getByTestId('report-close').click();

  await nav(page, 'protagonist');
  await expect(page.getByTestId('char-c8')).toContainText('陸行舟');
  await expect(page.getByTestId('succession')).toContainText('第 1 代 顧長青');

  // 立南宮婉為親傳弟子
  await nav(page, 'disciples', 'inner');
  await page.getByTestId('roster-c7').click();
  await page.getByTestId('heir-c7').click();
  await expect(page.getByTestId('char-c7')).toContainText('親傳弟子');
  await shot(page, '07-親傳弟子');

  // 建設頁：祖師殿可以在主峰建造
  await nav(page, 'build');
  await expect(page.locator('body')).toContainText('祖師殿');
  await shot(page, '08-祖師殿');

  expect(errors).toEqual([]);
});
