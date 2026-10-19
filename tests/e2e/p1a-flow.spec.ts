import { expect, test, type Page } from '@playwright/test';

// P1 批次 A 驗收流程：四種傳承開局、區域開放與建造、P0 存檔匯入升級。
// 全程只透過玩家介面操作。截圖存到 test-results/p1a/。

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/p1a/${name}.png`, fullPage: true });

async function closeModals(page: Page) {
  for (let i = 0; i < 3; i++) {
    if (await page.getByTestId('event-skip').isVisible()) await page.getByTestId('event-skip').click();
    else if (await page.getByTestId('report-close').isVisible()) await page.getByTestId('report-close').click();
    else break;
  }
}

async function advance(page: Page, months: number) {
  for (let i = 0; i < months; i++) {
    const before = await page.getByTestId('date').textContent();
    await page.getByTestId('advance').click();
    await expect(page.getByTestId('date')).not.toHaveText(before ?? '');
    await closeModals(page);
  }
}

const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('御獸開局：靈獸隨行，修路開放靈泉谷並在谷中建靈田', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByTestId('new-game').click();
  for (const id of ['sword', 'alchemy', 'beast', 'talisman']) {
    await expect(page.getByTestId(`lineage-lineage.${id}`).locator('input')).toBeEnabled();
  }
  await shot(page, '01-四傳承開局');
  await page.getByTestId('sect-name').fill('萬獸宗');
  await page.getByTestId('protagonist-name').fill('柳青');
  await page.getByTestId('lineage-lineage.beast').locator('input').check();
  await page.getByTestId('start').click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  await nav(page, 'protagonist');
  await expect(page.getByText('雲紋靈猿').first()).toBeVisible();
  await shot(page, '02-御獸主角與靈獸');

  // 修大殿，在外山建採石場、靈木場（費用 −20%）累積石木
  await nav(page, 'build');
  await page.getByTestId('upgrade-b1').click();
  await advance(page, 2);
  await nav(page, 'build');
  await page.getByTestId('region-tab-region.outer').click();
  await expect(page.getByTestId('new-building.quarry')).toContainText('石材 8');
  await page.getByTestId('build-building.quarry').click();
  await page.getByTestId('build-building.lumber').click();
  await shot(page, '03-外山');
  await advance(page, 1);
  await nav(page, 'industry', 'jobs');
  await page.getByTestId('job-quarry').fill('5');
  await page.getByTestId('job-lumber').fill('5');
  await page.getByTestId('job-errand').fill('2');
  await page.getByTestId('apply-jobs').click();

  // 石木足夠後修山路，開放靈泉谷
  for (let i = 0; i < 12; i++) {
    await nav(page, 'build');
    await page.getByTestId('region-tab-region.valley').click();
    if (await page.getByTestId('open-region-region.valley').isEnabled()) break;
    await advance(page, 1);
  }
  await page.getByTestId('open-region-region.valley').click();
  await expect(page.getByText('修復山路中，剩 2 個月')).toBeVisible();
  await shot(page, '04-修路中');
  await advance(page, 2);
  await nav(page, 'build');
  await page.getByTestId('region-tab-region.valley').click();
  await expect(page.getByText('槽位 0 / 5')).toBeVisible();
  await page.getByTestId('build-building.field').click();
  await expect(page.getByText('槽位 1 / 5')).toBeVisible();
  await advance(page, 1);
  await nav(page, 'industry', 'jobs');
  await page.getByTestId('job-field').fill('6');
  await page.getByTestId('job-errand').fill('0');
  await page.getByTestId('apply-jobs').click();
  await nav(page, 'build');
  await page.getByTestId('region-tab-region.valley').click();
  await expect(page.getByText('本月工人 6 / 6・產量 +25%')).toBeVisible();
  await shot(page, '05-靈泉谷靈田');

  await nav(page, 'overview');
  await expect(page.getByText('靈泉谷、').first()).toBeVisible();
  await shot(page, '06-總覽');
  expect(errors).toEqual([]);
});

test('P0 存檔匯入後自動升級，建築都在主峰並可繼續推進', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/save-v2-p0.json');
  await expect(page.getByText('已從舊版 v2 升級')).toBeVisible();
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 17 年 1 月');
  await shot(page, '07-P0存檔升級');
  await nav(page, 'build');
  await expect(page.getByText('槽位 7 / 8')).toBeVisible();
  await shot(page, '08-P0存檔建設');
  await advance(page, 3);
  await expect(page.getByTestId('date')).toHaveText('第 17 年 4 月');
});
