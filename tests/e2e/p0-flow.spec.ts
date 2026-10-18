import { expect, test, type Page } from '@playwright/test';

// P0 驗收流程：建立宗門 → 安排工作與修煉 → 推進月份 → 生產 → 升級建築 → 培養弟子 → 探索與戰鬥 → 存檔 → 關閉並重新載入。
// 全程只透過玩家介面操作（不使用開發工具）。截圖存到 test-results/p0/。

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/p0/${name}.png`, fullPage: true });

async function closeModals(page: Page) {
  // 招生事件：這個流程固定略過；月報：按繼續
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

async function nav(page: Page, id: string) {
  await page.getByTestId(`nav-${id}`).click();
}

async function setJobs(page: Page, jobs: Record<string, number>) {
  await nav(page, 'industry');
  for (const [k, v] of Object.entries(jobs)) await page.getByTestId(`job-${k}`).fill(String(v));
  await page.getByTestId('apply-jobs').click();
}

test('P0 完整流程可玩完並在重新載入後恢復', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // 1. 建立宗門
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByTestId('sect-name').fill('青雲宗');
  await page.getByTestId('protagonist-name').fill('林長風');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');
  await shot(page, '01-開局');

  // 2. 安排工作與修煉
  await setJobs(page, { errand: 8 });
  await shot(page, '02-產業收支');
  await nav(page, 'protagonist');
  await page.getByTestId('seclusion-c0').click();
  await nav(page, 'build');
  await page.getByTestId('upgrade-b1').click();

  // 3. 推進月份：大殿兩個月完工
  await advance(page, 2);
  await nav(page, 'build');
  await expect(page.getByTestId('bld-b1')).toContainText('1 級');

  // 4. 建造生產建築並分工
  await page.getByTestId('build-building.field').click();
  await page.getByTestId('build-building.quarry').click();
  await page.getByTestId('build-building.lumber').click();
  await advance(page, 1);
  await setJobs(page, { field: 4, quarry: 3, lumber: 3, errand: 2 });

  // 5. 培養弟子：從外門選拔內門
  await nav(page, 'disciples');
  await page.getByTestId('promote').click();
  await expect(page.locator('[data-testid^="char-c"]')).toHaveCount(1);
  await shot(page, '03-弟子');

  // 6. 生產：推進數月，石材與靈木增加
  await nav(page, 'industry');
  const stoneBefore = Number(await page.getByTestId('ledger').locator('tr', { hasText: '石材' }).locator('td').nth(1).textContent());
  await advance(page, 3);
  await nav(page, 'industry');
  const stoneAfter = Number(await page.getByTestId('ledger').locator('tr', { hasText: '石材' }).locator('td').nth(1).textContent());
  expect(stoneAfter).toBeGreaterThan(stoneBefore);

  // 7. 升級建築：累積材料後把大殿升到 2 級
  await nav(page, 'build');
  for (let i = 0; i < 30; i++) {
    const btn = page.getByTestId('upgrade-b1');
    if (await btn.isEnabled()) break;
    await advance(page, 1);
    await nav(page, 'build');
  }
  await page.getByTestId('upgrade-b1').click();
  await expect(page.getByTestId('bld-b1')).toContainText('施工中');
  await advance(page, 3);
  await nav(page, 'build');
  await expect(page.getByTestId('bld-b1')).toContainText('2 級');
  await shot(page, '04-建設');

  // 8. 探索與戰鬥：先中斷閉關，帶內門弟子進入荒廢洞府
  await nav(page, 'protagonist');
  const interrupt = page.getByRole('button', { name: '中斷閉關' });
  if (await interrupt.isVisible()) await interrupt.click();
  await nav(page, 'explore');
  await page.getByTestId('team-c0').check();
  const disciple = page.locator('[data-testid^="team-c"]:not([data-testid="team-c0"])').first();
  if (await disciple.isEnabled()) await disciple.check();
  await page.getByTestId('explore-start').click();
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId('explore-close').isVisible()) break;
    const choice = page.getByRole('button', { name: '沿陣紋邊緣小心通過' });
    if (await choice.isVisible()) {
      await choice.click();
      continue;
    }
    await page.locator('[data-testid^="go-"]').first().click();
  }
  await expect(page.getByTestId('battle').first()).toBeVisible();
  await shot(page, '05-探索戰報');
  await page.getByTestId('explore-close').click();
  await advance(page, 1);

  // 9. 存檔
  await nav(page, 'saves');
  await page.getByTestId('save-manual-1').click();
  await expect(page.getByTestId('slot-manual-1')).toContainText('青雲宗');
  const dateBefore = await page.getByTestId('date').textContent();
  const lingshiBefore = await page.getByTestId('res-lingshi').textContent();
  await shot(page, '06-存檔');

  // 10. 關閉並重新載入
  await page.reload();
  await expect(page.getByTestId('continue')).toBeVisible();
  await shot(page, '07-重新載入標題');
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('date')).toHaveText(dateBefore ?? '');
  await expect(page.getByTestId('res-lingshi')).toHaveText(lingshiBefore ?? '');
  await nav(page, 'reports');
  await expect(page.getByTestId('battle').first()).toBeVisible();
  await shot(page, '08-讀檔後戰報');

  expect(errors).toEqual([]);
});

test('連點推進按鈕不會一次結算多個月', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-game').click();
  await page.getByTestId('protagonist-name').fill('測試');
  await page.getByTestId('start').click();
  await page.getByTestId('advance').dblclick();
  await closeModals(page);
  const text = await page.getByTestId('date').textContent();
  // 第一次結算與自動存檔完成前，按鈕停用，第二下不會再結算
  expect(text).toBe('第 1 年 2 月');
});

test('匯入存檔後煉丹與築基突破可在介面操作', async ({ page }) => {
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置一個已發展的宗門：大殿 2 級、煉丹房、聚靈陣，主角煉氣九層修為已滿並持有築基丹
  const s = newGame(content, { sectName: '測試宗', protagonistName: '韓立', gender: 'male', lineage: 'lineage.sword', seed: 9 });
  s.resources = { ...s.resources, lingshi: 800, food: 400, stone: 300, wood: 300, herb: 80, pill_qi: 4, pill_heal: 4, pill_foundation: 1 };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 2, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.alchemy', region: 'region.main', level: 1, status: 'active', construction: null },
    { id: 'b91', defId: 'building.array', region: 'region.main', level: 1, status: 'active', construction: null },
  );
  s.protagonist.realm = { major: 'qi', stage: 9 };
  s.protagonist.xp = 540;
  s.disciples.push({ ...structuredClone(s.protagonist), id: 'c7', name: '南宮婉', gender: 'female', role: 'inner', realm: { major: 'qi', stage: 2 }, xp: 0, skills: { ...s.protagonist.skills, alchemy: 4, farming: 1, combat: 2 } } as never);
  // 檔名用英文，避免部分環境上傳含中文路徑的檔案失敗
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'progress-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-18T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  // 煉丹：指派內門弟子掌爐、煉聚氣丹
  await nav(page, 'industry');
  await page.getByTestId('furnace-0-alchemist').selectOption('c7');
  await page.getByTestId('furnace-0-recipe').selectOption('recipe.qi_pill');
  await expect(page.getByText('成丹率')).toBeVisible();
  await shot(page, '09-煉丹房');

  // 築基：介面顯示成功率與失敗代價，安排突破後推進
  await nav(page, 'protagonist');
  await expect(page.getByText('築基突破')).toBeVisible();
  await expect(page.getByText('失敗代價')).toBeVisible();
  await page.getByRole('button', { name: '突破', exact: true }).click();
  await shot(page, '10-築基突破');
  await page.getByTestId('advance').click();
  // 大殿已 2 級，同月會觸發山門招生；先看招生畫面，處理完才顯示月報
  await expect(page.getByRole('dialog', { name: '山門招生' })).toBeVisible();
  await shot(page, '11-山門招生');
  await page.getByTestId('event-skip').click();
  await expect(page.getByRole('dialog', { name: '月報' }).getByText(/突破成功|突破失敗/)).toBeVisible();
  await shot(page, '12-突破月報');
  await page.getByTestId('report-close').click();
  await nav(page, 'industry');
  await expect(page.getByTestId('ledger').locator('tr', { hasText: '築基丹' }).locator('td').nth(1)).toHaveText('0');
});
