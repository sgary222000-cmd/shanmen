import { expect, test, type Page } from '@playwright/test';

// 手機橫拿：在常見手機橫向尺寸開啟每一頁，確認不會左右溢出、功能列按得到。截圖存到 test-results/mobile/。

const PAGES = ['build', 'protagonist', 'disciples', 'lineage', 'beasts', 'industry', 'market', 'explore', 'world', 'reports', 'saves', 'settings'];
const SIZES = [
  { name: 'iphone', width: 844, height: 390 },
  { name: 'android', width: 780, height: 360 },
];

async function loadSave(page: Page) {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 5 });
  s.resources = { ...s.resources, lingshi: 1500, food: 600, stone: 400, wood: 300, herb: 60, pill_qi: 12 };
  for (const [i, name] of ['南宮婉', '陸行舟', '白素', '韓青'].entries()) {
    s.disciples.push({ ...structuredClone(s.protagonist), id: `c${i + 7}`, name, gender: i % 2 ? 'male' : 'female', role: 'inner', realm: { major: 'qi', stage: 3 + i }, xp: 0 } as never);
  }
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'mobile-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-19T00:00:00.000Z')));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');
  await page.addStyleTag({ content: '.toasts{display:none !important}' });
}

for (const size of SIZES) {
  test(`手機橫拿 ${size.width}×${size.height}：每頁都能打開且不會左右溢出`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const dir = `test-results/mobile/${size.name}`;
    await page.goto('/');
    await page.screenshot({ path: `${dir}/00-title.png` });
    await page.getByTestId('new-game').click();
    await expect(page.getByTestId('start')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${dir}/00-newgame.png` });
    await loadSave(page);
    await page.screenshot({ path: `${dir}/01-overview.png` });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    for (const id of PAGES) {
      const btn = page.getByTestId(`nav-${id}`);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await expect(page.locator('.window')).toBeVisible();
      await page.screenshot({ path: `${dir}/${id}.png` });
      expect(await overflow(), `${id} 頁左右溢出`).toBeLessThanOrEqual(0);
      const body = await page.locator('.window-body').evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(body, `${id} 頁內容比視窗寬`).toBeLessThanOrEqual(1);
    }
    await page.getByTestId('nav-overview').click();
    await expect(page.getByTestId('advance')).toBeVisible();
    expect(errors).toEqual([]);
    await ctx.close();
  });
}
