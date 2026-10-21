import { expect, test, type Page } from '@playwright/test';

// 0.10.0 驗收流程：宗門試煉與護衛委託的自動出征名單，跨年後月報寫出自動出征結果。
// 全程只透過玩家介面操作。截圖存到 test-results/v010/。

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/v010/${name}.png` });
};
const nav = async (page: Page, id: string) => page.getByTestId(`nav-${id}`).click();

test('自動出征：試煉與護衛委託', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：第 81 年 1 月、大殿 4 級、有坊市；兩名築基弟子
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 43 });
  s.date = { year: 81, month: 1 };
  s.resources = { ...s.resources, lingshi: 6000, food: 800, stone: 300, wood: 300, pill_heal: 10 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 4, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
    { id: 'b91', defId: 'building.market', region: 'region.gate', level: 1, status: 'active', construction: null },
  );
  s.nextRecruitMonth = 99999;
  const p = s.protagonist;
  p.realm = { major: 'deity', stage: 4 };
  p.ageMonths = 300 * 12;
  for (const [id, name] of [
    ['c7', '南宮婉'],
    ['c8', '韓立'],
  ] as const) {
    s.disciples.push({ ...structuredClone(p), id, name, role: 'inner', seclusion: undefined, loyalty: 80, realm: { major: 'foundation', stage: 2 }, ageMonths: 60 * 12, insight: 100 } as never);
  }
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'v010-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-21T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 81 年 1 月');

  // 宗門試煉：勾兩名弟子、入門難度，開啟自動出征
  await nav(page, 'explore');
  await page.getByTestId('trial-panel').locator('summary').click();
  await page.getByTestId('trial-member-c7').check();
  await page.getByTestId('trial-member-c8').check();
  await page.getByTestId('trial-tier-easy').check();
  await page.getByTestId('auto-trial-set').click();
  await expect(page.getByTestId('auto-trial')).toContainText('已開啟（南宮婉、韓立）');
  await page.getByTestId('auto-trial').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/v010/01-試煉自動出征.png' });

  // 護衛委託：名單一人，勝率 70% 以上才接
  await nav(page, 'market');
  await page.getByTestId('auto-escort-member-c8').check();
  await page.getByTestId('auto-escort-set').click();
  await expect(page.getByTestId('auto-escort')).toContainText('已開啟（韓立）');
  await page.getByTestId('auto-escort-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/v010/02-護衛自動出征.png' });

  // 推進一個月：一月自動舉辦試煉、接護衛委託，寫進月報
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('date')).toHaveText('第 81 年 2 月');
  await expect(page.locator('li', { hasText: '自動出征：宗門試煉' }).first()).toBeVisible();
  await shot(page, '03-月報');
  await page.getByTestId('report-close').click();

  // 關閉試煉自動出征
  await nav(page, 'explore');
  await page.getByTestId('trial-panel').locator('summary').click();
  await page.getByTestId('auto-trial-off').click();
  await expect(page.getByTestId('auto-trial')).toContainText('未開啟');

  expect(errors).toEqual([]);
});
