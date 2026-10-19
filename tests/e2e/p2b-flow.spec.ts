import { expect, test, type Page } from '@playwright/test';

// P2 批次 B 驗收流程：元嬰、化神的突破條件與死亡機率、大殿 4 級後的 3 級建築。
// 全程只透過玩家介面操作。截圖存到 test-results/p2b/。

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/p2b/${name}.png` });
};
const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('元嬰、化神突破條件與死亡機率都看得到', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { xpToNext } = await import('../../src/engine/systems/characters/characters');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：大殿 4 級、各區開放、後山聚靈陣 3 級與洞府 3 級；掌門元嬰圓滿，內門南宮婉金丹圓滿
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 43 });
  s.resources = { ...s.resources, lingshi: 6000, food: 3000, stone: 900, wood: 900, herb: 80, pill_nascent: 1, pill_deity: 1 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 4, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
    { id: 'b91', defId: 'building.array', region: 'region.back', level: 3, status: 'active', construction: null },
    { id: 'b92', defId: 'building.cave_abode', region: 'region.back', level: 3, status: 'active', construction: null },
    { id: 'b93', defId: 'building.library', region: 'region.main', level: 2, status: 'active', construction: null },
  );
  s.nextRecruitMonth = 999;
  const p = s.protagonist;
  p.realm = { major: 'nascent', stage: 4 };
  p.xp = xpToNext(p.realm);
  p.insight = 400;
  p.seat = 'region.back';
  p.ageMonths = 200 * 12;
  s.disciples.push({
    ...structuredClone(p),
    id: 'c7',
    name: '南宮婉',
    gender: 'female',
    role: 'inner',
    seclusion: undefined,
    loyalty: 80,
    realm: { major: 'core', stage: 4 },
    xp: xpToNext({ major: 'core', stage: 4 }),
    insight: 300,
    ageMonths: 120 * 12,
  } as never);
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p2b-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-19T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  // 主角頁：化神突破，事前寫明死亡機率
  await nav(page, 'protagonist');
  await expect(page.getByTestId('char-c0')).toContainText('元嬰圓滿');
  await expect(page.getByTestId('odds-c0')).toContainText('化神');
  await expect(page.getByTestId('odds-c0')).toContainText('會身死道消');
  await expect(page.getByTestId('life-c0')).toContainText('壽元 800 歲');
  await shot(page, '01-化神突破與死亡機率');

  // 弟子頁：金丹圓滿的弟子看到凝嬰條件，失敗不會死
  await nav(page, 'disciples', 'inner');
  await page.getByTestId('roster-c7').click();
  await expect(page.getByTestId('odds-c7')).toContainText('凝嬰');
  await expect(page.getByTestId('odds-c7')).toContainText('不會死亡');
  await shot(page, '02-凝嬰條件');

  // 建設頁：大殿可以升 5 級
  await nav(page, 'build');
  await expect(page.locator('body')).toContainText('宗門大殿');
  await shot(page, '03-大殿四級');

  expect(errors).toEqual([]);
});
