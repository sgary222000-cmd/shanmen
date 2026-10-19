import { expect, test, type Page } from '@playwright/test';

// P2 批次 E 驗收流程：宗門試煉、太虛古境第一層（岔路隨機事件）、倉庫快滿的警報。
// 全程只透過玩家介面操作。截圖存到 test-results/p2e/。

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/p2e/${name}.png` });
};
const nav = async (page: Page, id: string) => page.getByTestId(`nav-${id}`).click();

test('進階探索：宗門試煉、太虛古境、倉庫', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：第 80 年、大殿 4 級；掌門化神圓滿、兩名築基弟子；石材快放滿倉庫
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 43 });
  s.date = { year: 80, month: 2 };
  s.resources = { ...s.resources, lingshi: 6000, food: 800, stone: 480, wood: 300, pill_heal: 10 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 4, status: 'active' });
  s.buildings.push({ id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' });
  s.nextRecruitMonth = 99999;
  const p = s.protagonist;
  p.realm = { major: 'deity', stage: 4 };
  p.ageMonths = 300 * 12;
  p.insight = 400;
  for (const [id, name] of [
    ['c7', '南宮婉'],
    ['c8', '韓立'],
  ] as const) {
    s.disciples.push({ ...structuredClone(p), id, name, role: 'inner', seclusion: undefined, loyalty: 80, realm: { major: 'foundation', stage: 2 }, ageMonths: 60 * 12, insight: 100 } as never);
  }
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p2e-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-19T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 80 年 2 月');

  // 主畫面警報：石材快放滿倉庫
  await expect(page.locator('.hud-right')).toContainText('快放滿倉庫');
  await shot(page, '01-倉庫警報');

  // 宗門試煉：兩名弟子挑戰「入門」
  await nav(page, 'explore');
  await page.getByTestId('trial-panel').locator('summary').click();
  await page.getByTestId('trial-member-c7').check();
  await page.getByTestId('trial-member-c8').check();
  await page.getByTestId('trial-tier-easy').check();
  await expect(page.getByTestId('trial-panel')).toContainText('勝算約');
  await page.getByTestId('trial-start').click();
  await expect(page.getByTestId('trial-panel').getByTestId('battle')).toContainText('宗門試煉');
  await expect(page.getByTestId('trial-member-c7')).toBeDisabled();
  await page.getByTestId('trial-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/p2e/02-宗門試煉.png' });

  // 太虛古境第一層：掌門獨闖，岔路抽到隨機事件
  await page.getByTestId('realm-tab-secret.taixu_2').click();
  await expect(page.getByTestId('realm-locked')).toContainText('石林');
  await page.getByTestId('realm-tab-secret.taixu_1').click();
  await page.getByTestId('team-c0').check();
  await page.getByTestId('explore-start').click();
  await page.getByTestId('go-guards').click();
  await page.getByTestId('go-fork').click();
  await page.getByTestId('go-left').click();
  await expect(page.locator('[data-testid^="choice-"]').first()).toBeVisible();
  await shot(page, '03-隨機事件');
  await page.locator('[data-testid^="choice-"]').last().click();
  await page.getByTestId('go-deep').click();
  await page.getByTestId('go-boss').click();
  await page.getByTestId('go-exit').click();
  await expect(page.getByTestId('explore-close')).toBeVisible();
  await expect(page.locator('.log')).toContainText('首次通關');
  await shot(page, '04-第一層通關');
  await page.getByTestId('explore-close').click();
  await expect(page.getByTestId('realm-tab-secret.taixu_1')).toContainText('已通關');

  // 建設頁：可以蓋倉庫
  await nav(page, 'build');
  await expect(page.locator('.window-body')).toContainText('倉庫');

  expect(errors).toEqual([]);
});
