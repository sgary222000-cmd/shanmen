import { expect, test, type Page } from '@playwright/test';

// 0.11.0 驗收流程：三格裝備與品質、戰力與屬性、永久屬性丹、戰前用符與丹、煉器加入稀有素材、賣出法器、戰爭戰力。
// 全程只透過玩家介面操作。截圖存到 test-results/v011/。

const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};
const snap = async (page: Page, testId: string, name: string) => {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/v011/${name}.png` });
};

test('法器品質、屬性與戰前準備', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 43 });
  s.date = { year: 30, month: 3 };
  s.resources = {
    ...s.resources,
    lingshi: 6000,
    food: 800,
    stone: 300,
    wood: 300,
    ore: 60,
    pill_heal: 10,
    pill_ape: 2,
    pill_swift: 2,
    talisman_bind: 1,
    talisman_break: 1,
    mat_earthfire: 3,
    mat_jade: 1,
  };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 4, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
    { id: 'b91', defId: 'building.market', region: 'region.gate', level: 1, status: 'active', construction: null },
    { id: 'b92', defId: 'building.forge', region: 'region.fire', level: 2, status: 'active', construction: null },
  );
  s.recipes.push('recipe.fire_blade');
  s.nextRecruitMonth = 99999;
  s.protagonist.realm = { major: 'core', stage: 2 };
  s.protagonist.skills.forging = 10;
  s.armory.push(
    { id: 'g901', defId: 'equip.fire_blade', quality: 'rare', subs: [{ stat: 'crit', value: 5 }, { stat: 'agi', value: 3 }] },
    { id: 'g902', defId: 'equip.thunder_ring', quality: 'superior', subs: [{ stat: 'dodge', value: 3 }] },
    { id: 'g903', defId: 'equip.common_armor', quality: 'common', subs: [] },
  );
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'v011-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-21T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 30 年 3 月');

  // 三格裝備：戰力隨裝備上升
  await nav(page, 'protagonist');
  const before = Number(await page.getByTestId('power-c0').innerText());
  await page.getByTestId('equip-c0-weapon').selectOption('g901');
  await page.getByTestId('equip-c0-accessory').selectOption('g902');
  await expect(page.getByTestId('gear-c0')).toContainText('極品地火劍');
  await expect(page.getByTestId('gear-c0')).toContainText('上品雷紋玉環');
  await expect.poll(async () => Number(await page.getByTestId('power-c0').innerText())).toBeGreaterThan(before);
  await expect(page.getByTestId('stats-c0')).toContainText('暴擊');

  // 永久屬性丹：服兩顆後按鈕停用
  await page.getByTestId('perm-c0-pill_ape').click();
  await page.getByTestId('perm-c0-pill_ape').click();
  await expect(page.getByTestId('perm-c0-pill_ape')).toContainText('2/3');
  await expect(page.getByTestId('perm-c0-pill_ape')).toBeDisabled();
  await snap(page, 'gear-c0', '01-三格裝備與戰力');

  // 戰前準備：短效丹與控制符（最多兩種）
  await nav(page, 'explore');
  await page.getByTestId('use-buff-pills').check();
  await page.getByTestId('control-talisman_bind').check();
  await page.getByTestId('control-talisman_break').check();
  await expect(page.getByTestId('control-talisman_slow')).toBeDisabled();
  await snap(page, 'battle-prep', '02-戰前準備');

  // 煉器：加入稀有素材，顯示品質機率
  await nav(page, 'industry', 'forge');
  await page.getByTestId('forge-0-alchemist').selectOption('c0');
  await page.getByTestId('forge-0-recipe').selectOption('recipe.fire_blade');
  const plain = await page.getByTestId('forge-0-quality').innerText();
  await page.getByTestId('forge-0-boost').check();
  await expect(page.getByTestId('forge-0-quality')).not.toHaveText(plain);
  await snap(page, 'station-forge', '03-煉器品質');

  // 庫房：賣出一件法器
  await nav(page, 'lineage', 'treasure');
  await expect(page.getByTestId('armory')).toContainText('凡品制式護甲');
  await expect(page.getByTestId('rare-mats')).toContainText('地火精');
  await page.getByTestId('sell-gear-g903').click();
  await expect(page.getByTestId('armory-g903')).toHaveCount(0);
  await snap(page, 'armory', '04-庫房');

  // 推進一個月：煉器坊煉出有品質的地火劍
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('date')).toHaveText('第 30 年 4 月');
  await expect(page.locator('li', { hasText: '地火劍' }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/v011/05-月報.png' });

  expect(errors).toEqual([]);
});
