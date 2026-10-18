import { expect, test, type Page } from '@playwright/test';

// P1 批次 B 驗收流程：委託榜（勞務、交付、護衛）、坊市買賣與配方、符陣閣製符與庫存保留、v3 存檔升級。
// 全程只透過玩家介面操作。截圖存到 test-results/p1b/。

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/p1b/${name}.png`, fullPage: true });
const nav = (page: Page, id: string) => page.getByTestId(`nav-${id}`).click();

async function closeModals(page: Page) {
  for (let i = 0; i < 3; i++) {
    if (await page.getByTestId('event-skip').isVisible()) await page.getByTestId('event-skip').click();
    else if (await page.getByTestId('report-close').isVisible()) await page.getByTestId('report-close').click();
    else break;
  }
}

test('委託、坊市、製符都能在介面操作', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：大殿 2 級、山門已修好並有坊市、主峰有符陣閣，一名內門弟子，委託榜上三種委託各一件
  const s = newGame(content, { sectName: '玄符宗', protagonistName: '沈硯', gender: 'female', lineage: 'lineage.sword', seed: 21 });
  s.resources = { ...s.resources, lingshi: 600, food: 300, stone: 300, wood: 200, herb: 40 };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 2, status: 'active' });
  s.regions['region.gate'] = { status: 'open', construction: null };
  s.buildings.push(
    { id: 'b90', defId: 'building.market', region: 'region.gate', level: 1, status: 'active', construction: null },
    { id: 'b91', defId: 'building.talisman', region: 'region.main', level: 1, status: 'active', construction: null },
  );
  s.protagonist.realm = { major: 'foundation', stage: 1 };
  s.disciples.push({ ...structuredClone(s.protagonist), id: 'c7', name: '南宮婉', gender: 'female', role: 'inner', realm: { major: 'qi', stage: 3 }, xp: 0, seclusion: undefined } as never);
  s.commissions = [
    { id: 'j1', templateId: 'commission.canal', title: '幫山下村落修渠', text: '村裡的水渠被山洪沖垮。', kind: 'labor', workers: 6, reward: { lingshi: 2, food: 4 }, reputation: 1, guard: false, expires: 0 },
    { id: 'j2', templateId: 'commission.stone', title: '交付石材', text: '山下鎮上要修橋。', kind: 'deliver', deliver: { stone: 40 }, reward: { lingshi: 14 }, reputation: 1, guard: false, expires: 1 },
    { id: 'j3', templateId: 'commission.wolves', title: '除去傷人妖狼', text: '兩頭妖狼在山道上傷人。', kind: 'escort', enemies: ['enemy.wild_wolf'], maxTeam: 3, reward: { lingshi: 16, beast_mat: 3 }, reputation: 3, guard: true, expires: 1 },
  ];
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p1b-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-18T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  // 委託榜：勞務派外門、交付石材、護衛由主角出戰
  await nav(page, 'market');
  await expect(page.getByTestId('commission-commission.canal')).toBeVisible();
  await shot(page, '01-委託榜');
  await page.getByTestId('workers-commission.canal').fill('6');
  await page.getByTestId('accept-commission.canal').click();
  await expect(page.getByTestId('reputation')).toHaveText('1');
  await expect(page.getByTestId('res-lingshi')).toHaveText('612');
  await page.getByTestId('accept-commission.stone').click();
  await expect(page.getByTestId('reputation')).toHaveText('2');
  await page.getByTestId('team-commission.wolves-c0').check();
  await page.getByTestId('accept-commission.wolves').click();
  await expect(page.getByTestId('reputation')).toHaveText('5');
  await expect(page.getByText('本月委託都接完了')).toBeVisible();
  await shot(page, '02-委託完成');

  // 坊市：賣出一批石材、買入配方
  const lingshiBefore = Number(await page.getByTestId('res-lingshi').textContent());
  const sellPrice = Number(await page.getByTestId('good-stone').locator('td').nth(4).textContent());
  await page.getByTestId('sell-stone').click();
  await expect(page.getByTestId('res-lingshi')).toHaveText(String(lingshiBefore + sellPrice));
  await page.getByTestId('recipe-recipe.guard_talisman').click();
  await expect(page.getByTestId('recipe-recipe.guard_talisman')).toHaveCount(0);
  await shot(page, '03-坊市');

  // 建設頁：山門區的坊市
  await nav(page, 'build');
  await page.getByTestId('region-tab-region.gate').click();
  await expect(page.getByTestId('bld-b90')).toContainText('坊市');
  await shot(page, '07-山門坊市');

  // 戰報：委託的護衛戰鬥記錄
  await nav(page, 'reports');
  await expect(page.getByText('委託・除去傷人妖狼').first()).toBeVisible();

  // 符陣閣：南宮婉執筆製符紙，保留 20 份靈木
  await nav(page, 'industry');
  await page.getByTestId('talisman-0-alchemist').selectOption('c7');
  await page.getByTestId('talisman-0-recipe').selectOption('recipe.paper');
  await page.getByTestId('talisman-0-keep').fill('20');
  await expect(page.getByTestId('station-talisman')).toContainText('成符率');
  await expect(page.getByTestId('ledger')).toContainText('符紙');
  await shot(page, '04-符陣閣');
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 2 月');
  // 大殿 2 級同月觸發山門招生，先略過，之後才顯示月報
  await page.getByTestId('event-skip').click();
  await expect(page.getByText(/南宮婉(畫成符紙|製作符紙失敗)/).first()).toBeVisible();
  await shot(page, '05-製符月報');
  await closeModals(page);
  expect(errors).toEqual([]);
});

test('批次 A 存檔匯入後自動升級，委託榜可用、坊市提示要先建造', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/save-v3-p1a.json');
  await expect(page.getByText('已從舊版 v3 升級')).toBeVisible();
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 9 年 1 月');
  await nav(page, 'market');
  await expect(page.getByText('尚未建成坊市')).toBeVisible();
  await expect(page.locator('[data-testid^="commission-"]').first()).toBeVisible();
  await shot(page, '06-批次A存檔升級');
  await nav(page, 'industry');
  await expect(page.getByTestId('station-alchemy')).toBeVisible();
});
