import { expect, test, type Page } from '@playwright/test';

// P2 批次 C 驗收流程：六個勢力（遠方勢力要大殿 4 級才往來）、議事堂締約、盟友求援、資源據點。
// 全程只透過玩家介面操作。截圖存到 test-results/p2c/。

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/p2c/${name}.png`, fullPage: true });
};
const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('締結條約、回覆盟友求援、查看資源據點', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame } = await import('../../src/engine');
  const { requestAid } = await import('../../src/engine/systems/world/diplomacy');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：大殿 3 級、主峰有議事堂；青木宗已是盟友並來求援，落雲谷好感與信任夠締約
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 43 });
  s.resources = { ...s.resources, lingshi: 3000, food: 3000, stone: 900, wood: 900 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 3, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
    { id: 'b91', defId: 'building.council', region: 'region.main', level: 1, status: 'active', construction: null },
  );
  s.nextRecruitMonth = 999;
  const qingmu = s.sects.find((x) => x.id === 'sect.qingmu')!;
  Object.assign(qingmu, { favor: 70, trust: 60, treaty: { kind: 'alliance', since: 0, until: 120, refusals: 0 } });
  Object.assign(s.sects.find((x) => x.id === 'sect.luoyun')!, { favor: 50, trust: 30 });
  requestAid(s, content, qingmu, '赤霞門來犯：', [], []);
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p2c-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-19T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 1 年 1 月');

  // 各方勢力：六個勢力，遠方勢力在大殿 4 級前不能往來
  await nav(page, 'world', 'sects');
  for (const id of ['qingmu', 'chixia', 'luoyun', 'tianyan', 'tiejian', 'wanbao']) await expect(page.getByTestId(`sect-sect.${id}`)).toBeVisible();
  await expect(page.getByTestId('sect-sect.tiejian')).toContainText('大殿 4 級');
  await expect(page.getByTestId('aid-requests')).toContainText('青木宗');
  await shot(page, '01-各方勢力與盟友求援');

  // 回覆求援：出資
  await page.getByTestId('aid-money-sect.qingmu').click();
  await expect(page.getByTestId('aid-requests')).toHaveCount(0);

  // 與落雲谷締結互不侵犯
  await page.getByTestId('sign-peace-sect.luoyun').click();
  await expect(page.getByTestId('treaty-sect.luoyun')).toContainText('互不侵犯');
  await expect(page.getByTestId('break-sect.luoyun')).toBeVisible();
  await shot(page, '02-締結互不侵犯');

  // 資源據點
  await nav(page, 'world', 'sites');
  await expect(page.getByTestId('sites')).toContainText('青石礦脈');
  await expect(page.getByTestId('sites')).toContainText('雲霧藥谷');
  await shot(page, '03-資源據點');

  expect(errors).toEqual([]);
});
