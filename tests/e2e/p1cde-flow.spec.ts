import { expect, test, type Page } from '@playwright/test';

// P1 批次 C、D、E 驗收流程：結丹預覽、職位與法器、傳承分支、靈獸孵化、大比、秘境派遣、靈脈競標、v4 存檔升級。
// 全程只透過玩家介面操作。截圖存到 test-results/p1cde/。

const shot = async (page: Page, name: string) => {
  // 頂欄固定在畫面上方，整頁截圖前先捲回頂端，免得頂欄蓋在頁面中間
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/p1cde/${name}.png`, fullPage: true });
};
const nav = (page: Page, id: string) => page.getByTestId(`nav-${id}`).click();

async function closeModals(page: Page) {
  for (let i = 0; i < 3; i++) {
    if (await page.getByTestId('event-skip').isVisible()) await page.getByTestId('event-skip').click();
    else if (await page.getByTestId('report-close').isVisible()) await page.getByTestId('report-close').click();
    else break;
  }
}

test('職位、法器、分支、靈獸、大比、派遣、競標都能在介面操作', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { xpToNext } = await import('../../src/engine/systems/characters/characters');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：主角築基圓滿（可結丹）、後山聚靈陣 2 級與洞府、藏經閣 2 級、靈獸苑、坊市、兩名內門弟子；大比與競標進行中
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 33 });
  s.resources = { ...s.resources, lingshi: 1500, food: 600, stone: 400, wood: 300, herb: 60, artifact: 1, beast_egg: 2, pill_core: 1 };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 2, status: 'active' });
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const put = (id: string, defId: string, region: string, level = 1) =>
    s.buildings.push({ id, defId, region, level, status: 'active', construction: null });
  put('b90', 'building.market', 'region.gate');
  put('b91', 'building.library', 'region.main', 2);
  put('b92', 'building.array', 'region.back', 2);
  put('b93', 'building.cave_abode', 'region.back');
  put('b94', 'building.beast_garden', 'region.valley');
  put('b95', 'building.field', 'region.main');
  const p = s.protagonist;
  p.realm = { major: 'foundation', stage: 4 };
  p.xp = xpToNext(p.realm);
  p.insight = 120;
  p.seat = 'region.back';
  p.skills.combat = 12;
  s.disciples.push({
    ...structuredClone(p),
    id: 'c7',
    name: '南宮婉',
    gender: 'female',
    role: 'inner',
    realm: { major: 'foundation', stage: 2 },
    xp: 0,
    seat: 'region.main',
    insight: 0,
    skills: { alchemy: 2, farming: 1, combat: 8, forging: 0, talisman: 9, beast: 3, affairs: 4 },
    seclusion: undefined,
  } as never);
  s.disciples.push({ ...structuredClone(s.disciples[0]), id: 'c8', name: '陸行舟', gender: 'male', skills: { ...s.disciples[0]!.skills, talisman: 0 } } as never);
  s.items.push('item.beast_taming', 'item.scripture.any');
  s.armory.push('equip.ore_blade');
  s.realmClears['secret.abandoned_cave'] = 1;
  s.claimedRewards.push('reward.abandoned_cave.first_clear');
  s.recipes.push('recipe.foundation_pill');
  s.reputation = 40;
  s.tournament = { year: 1, status: 'open', standings: [], log: [], rank: null };
  s.auction = { id: 'auc1', name: '青石嶺靈脈', orePerMonth: 6, years: 8, deadline: 0, playerBid: 0 };
  for (const x of s.sects) x.resources.lingshi = 200;
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p1cde-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-18T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  // 主角：功法小成、結丹預覽（洞府與聚靈陣加成）
  await nav(page, 'protagonist');
  await expect(page.getByTestId('odds-c0')).toContainText('結丹');
  await expect(page.getByTestId('odds-c0')).toContainText('洞府');
  await expect(page.getByTestId('odds-c0')).not.toContainText('尚不能突破');
  await expect(page.getByTestId('insight-c0')).toContainText('小成');
  await shot(page, '01-結丹預覽');

  // 弟子：南宮婉出任傳功長老，主角裝備礦魄刀
  await nav(page, 'disciples');
  await page.getByTestId('position-mentor').selectOption('c7');
  await expect(page.getByTestId('positions')).toContainText('南宮婉');
  await page.getByTestId('equip-c7').selectOption('equip.common');
  await expect(page.getByTestId('equip-c7')).toHaveValue('equip.common');
  await shot(page, '02-職位與法器');
  await nav(page, 'protagonist');
  await page.getByTestId('equip-c0').selectOption('equip.ore_blade');
  await expect(page.getByTestId('char-c0')).toContainText('礦魄刀');

  // 傳承與功法：以萬用典籍開設符籙分支，由南宮婉主持
  await nav(page, 'lineage');
  await page.getByTestId('branch-host-lineage.talisman').selectOption('c7');
  await page.getByTestId('open-branch-lineage.talisman').click();
  await expect(page.getByTestId('branches')).toContainText('已開設');
  await shot(page, '03-傳承分支');

  // 靈獸苑：孵化一顆靈獸蛋，交給南宮婉
  await nav(page, 'beasts');
  await page.getByTestId('hatch').click();
  await expect(page.locator('[data-testid^="beast-beast"]').first()).toContainText('幼年');
  const owner = page.locator('[data-testid^="beast-owner-"]').first();
  await owner.selectOption('c7');
  await shot(page, '04-靈獸苑');

  // 宗門往來：送禮、參加大比、出價競標
  await nav(page, 'world');
  const sect = s.sects[0]?.id ?? '';
  await expect(page.getByTestId(`sect-${sect}`)).toBeVisible();
  await page.getByTestId(`gift-${sect}`).click();
  await expect(page.getByTestId(`sect-${sect}`)).toContainText('今年已送 1 次');
  await page.getByTestId('t-team-c8').check();
  await page.getByTestId('enter-tournament').click();
  await expect(page.getByTestId('tournament')).toContainText('名');
  await page.getByTestId('bid').click();
  await expect(page.getByTestId('auction')).toContainText('我宗目前出價：50');
  await shot(page, '05-宗門往來');

  // 探索：荒廢洞府已通關，派南宮婉自動結算
  await nav(page, 'explore');
  await page.getByTestId('realm-tab-secret.abandoned_cave').click();
  await page.getByTestId('team-c7').check();
  await page.getByTestId('dispatch-start').click();
  await expect(page.getByTestId('dispatch-list')).toContainText('南宮婉');
  await shot(page, '06-秘境派遣');

  // 主角安排結丹，推進一個月
  await nav(page, 'protagonist');
  await page.getByTestId('char-c0').getByRole('button', { name: /突破|結丹/ }).first().click();
  await page.getByTestId('advance').click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 2 月');
  await closeModals(page);
  await nav(page, 'reports');
  await expect(page.getByText(/結丹成功|結丹失敗/).first()).toBeVisible();
  await expect(page.getByText(/派遣荒廢洞府的小隊/).first()).toBeVisible();
  await expect(page.getByText(/青石嶺靈脈/).first()).toBeVisible();
  await shot(page, '07-結丹月報');
  expect(errors).toEqual([]);
});

test('批次 B 存檔匯入後自動升級，新頁面可以打開', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles('tests/fixtures/save-v4-p1b.json');
  await expect(page.getByText('已從舊版 v4 升級')).toBeVisible();
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText(/第 15 年/);
  await nav(page, 'beasts');
  await expect(page.locator('[data-testid^="beast-beast"]').first()).toContainText('幼年');
  await nav(page, 'world');
  await expect(page.getByText('前期保護中')).toBeVisible();
  await nav(page, 'lineage');
  await expect(page.getByTestId('branches')).toBeVisible();
  await shot(page, '08-批次B存檔升級');
});

test('護宗神獸：成年靈獸晉升、供奉升級，加成顯示在靈獸苑', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置（御獸傳承開局已有一隻幼年靈獸）：靈獸苑 2 級、一隻成年赤焰狐與一隻幼年墨麟、材料充足
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.beast', seed: 33 });
  s.resources = { ...s.resources, lingshi: 1500, food: 800, beast_mat: 200, spirit_herb: 200, beast_egg: 1 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  s.buildings.push({ id: 'b94', defId: 'building.beast_garden', region: 'region.valley', level: 2, status: 'active', construction: null });
  s.beasts.push(
    { id: 'beast90', speciesId: 'beast.fire_fox', name: '赤焰狐', ownerId: null, stage: 'adult', growth: 120, task: 'rest' },
    { id: 'beast91', speciesId: 'beast.ink_qilin', name: '墨麟', ownerId: null, stage: 'young', growth: 30, task: 'rest' },
  );
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'guardian-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-18T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await nav(page, 'beasts');
  await expect(page.getByTestId('guardian')).toContainText('晉升為護宗神獸');
  await expect(page.getByTestId('beast-beast91')).toContainText('墨麟');
  await expect(page.getByTestId('ascend-beast91')).toHaveCount(0);
  await page.getByTestId('ascend-beast90').click();
  await expect(page.getByTestId('guardian')).toContainText('鎮爐火狐');
  await expect(page.getByTestId('guardian')).toContainText('成功率 +2%');
  await expect(page.getByTestId('beast-beast90')).toHaveCount(0);
  await page.getByTestId('raise-guardian').click();
  await expect(page.getByTestId('guardian')).toContainText('2 級');
  await expect(page.getByTestId('guardian')).toContainText('成功率 +4%');
  await shot(page, '09-護宗神獸');
  expect(errors).toEqual([]);
});
