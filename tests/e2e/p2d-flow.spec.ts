import { expect, test, type Page } from '@playwright/test';

// P2 批次 D 驗收流程：被宣戰時撤離資產、我宗宣戰、佔下據點、修復損毀建築、攻破山門後收為附屬。
// 全程只透過玩家介面操作。截圖存到 test-results/p2d/。

const shot = async (page: Page, name: string) => {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `test-results/p2d/${name}.png` });
};
const nav = async (page: Page, id: string, tab?: string) => {
  await page.getByTestId(`nav-${id}`).click();
  if (tab) await page.getByTestId(`tab-${tab}`).click();
};

test('戰事：撤離、宣戰、佔據點、修復、戰後處置', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { content } = await import('../../src/content/registry');
  const { newGame, monthIndex } = await import('../../src/engine');
  const { toEnvelope } = await import('../../src/save/codec');
  // 佈置：第 40 年、大殿 3 級；掌門化神、兩名內門元嬰；赤霞門已宣戰（4 個月後來攻），青木宗對我宗冷淡；煉丹房損毀
  const s = newGame(content, { sectName: '長生宗', protagonistName: '顧長青', gender: 'male', lineage: 'lineage.sword', seed: 43 });
  s.date = { year: 40, month: 1 };
  s.resources = { ...s.resources, lingshi: 4000, food: 3000, stone: 900, wood: 900, pill_heal: 10 };
  for (const id of Object.keys(s.regions)) s.regions[id] = { status: 'open', construction: null };
  const hall = s.buildings.find((b) => b.defId === 'building.hall');
  if (hall) Object.assign(hall, { level: 3, status: 'active' });
  s.buildings.push(
    { id: 'b90', defId: 'building.field', region: 'region.main', level: 1, status: 'active', construction: null, crop: 'food' },
    { id: 'b91', defId: 'building.alchemy', region: 'region.main', level: 1, status: 'active', construction: null, damaged: true },
  );
  s.nextRecruitMonth = 99999;
  const p = s.protagonist;
  p.realm = { major: 'deity', stage: 2 };
  p.ageMonths = 300 * 12;
  for (const [id, name] of [
    ['c7', '南宮婉'],
    ['c8', '韓立'],
  ] as const) {
    s.disciples.push({ ...structuredClone(p), id, name, role: 'inner', seclusion: undefined, loyalty: 80, realm: { major: 'nascent', stage: 2 }, ageMonths: 150 * 12 } as never);
  }
  for (const x of s.sects) x.power = Math.min(x.power, 120);
  s.sects.find((x) => x.id === 'sect.qingmu')!.favor = 10;
  s.wars.push({ id: 'war1', sectId: 'sect.chixia', side: 'defend', reason: '赤霞門對我宗積怨已深', declared: monthIndex(s.date), resolveAt: monthIndex(s.date) + 4, teamIds: [], hidden: 0, allies: [] });
  const file = join(mkdtempSync(join(tmpdir(), 'shanmen-')), 'p2d-save.json');
  writeFileSync(file, JSON.stringify(toEnvelope(s, '2026-10-19T00:00:00.000Z')));

  await page.goto('/');
  await expect(page.getByRole('button', { name: '匯入存檔檔案' })).toBeEnabled();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('button', { name: '讀取存檔' }).click();
  await page.getByRole('button', { name: '讀取', exact: true }).first().click();
  await expect(page.getByTestId('date')).toHaveText('第 40 年 1 月');

  // 戰事分頁：赤霞門來犯，顯示勝算與戰死機率；撤離資產
  await nav(page, 'world', 'war');
  await expect(page.getByTestId('war-sect.chixia')).toContainText('赤霞門來犯');
  await expect(page.getByTestId('war-sect.chixia')).toContainText('會戰死');
  await page.getByTestId('war-evacuate-sect.chixia').click();
  await expect(page.getByTestId('war-evacuate-sect.chixia')).toContainText('已撤離');
  await shot(page, '01-被宣戰與撤離');

  // 對青木宗宣戰
  await page.getByTestId('declare-sect.qingmu').click();
  await expect(page.getByTestId('war-sect.qingmu')).toContainText('攻打青木宗');
  await shot(page, '02-宣戰');

  // 資源據點：佔下無主的寒潭藥圃
  await page.getByTestId('tab-sites').click();
  await page.getByTestId('contest-site.hantan').click();
  await expect(page.getByTestId('site-site.hantan')).toContainText('我宗');
  await shot(page, '03-佔下據點');

  // 建設頁：修復損毀的煉丹房
  await nav(page, 'build');
  await expect(page.getByTestId('bld-b91')).toContainText('損毀');
  await page.getByTestId('repair-b91').click();
  await expect(page.getByTestId('bld-b91')).not.toContainText('損毀');

  // 推進三個月：攻破青木宗山門，選擇收為附屬
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('advance').click();
    const close = page.getByTestId('report-close');
    if (await close.isVisible().catch(() => false)) await close.click();
  }
  await expect(page.getByTestId('victory')).toBeVisible();
  await shot(page, '04-戰後處置');
  await page.getByTestId('victory-vassal').click();
  await expect(page.getByTestId('victory')).toHaveCount(0);
  await page.getByTestId('report-close').click();
  await nav(page, 'world', 'war');
  await expect(page.getByTestId('war-declare')).toContainText('附屬');
  await shot(page, '05-附屬');

  expect(errors).toEqual([]);
});
