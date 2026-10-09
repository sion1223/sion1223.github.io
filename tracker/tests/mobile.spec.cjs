const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/TrackerMobile.html');
  await expect(page.locator('#loading')).toBeHidden();
  const engine = page.frames().find(frame => frame.url().includes('tracker-ios-engine.html'));
  await engine.getByText('아니요', { exact: true }).tap();
  await expect(engine.getByText('파일', { exact: true }).first()).toBeVisible();
  return { engine, errors };
}

test('video import, touch tracking, frame controls and view selection use the real engine', async ({ page }) => {
  const { engine, errors } = await boot(page);
  await expect(page.locator('#next-button')).toBeDisabled();
  await page.locator('#file-input').setInputFiles(path.join(__dirname, '../docs/examples/projectile.mp4'));
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().hasVideo)).toBe(true);
  await expect(page.locator('#status')).not.toHaveAttribute('data-error', 'true');
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().view)).toBe(4);
  await page.locator('[data-action="pointMass"]').tap();
  await expect(page.locator('#mark-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#next-button').tap();
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().frame)).toBe(1);
  await page.locator('#previous-button').tap();
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().frame)).toBe(0);
  const target = await engine.evaluate(() => {
    const panel = Tracker.app.getMainFrame().getSelectedPanel$();
    const node = panel.getUI$().domNode;
    return { id: node.id, width: node.clientWidth, height: node.clientHeight };
  });
  await engine.locator(`[id="${target.id}"]`).tap({ position: { x: target.width / 2, y: target.height / 2 } });
  await expect.poll(() => engine.evaluate(() => !!Tracker.app.getMainFrame().getSelectedPanel$().getSelectedTrack$().getStep$I(0))).toBe(true);
  await page.locator('#view-select').selectOption('0');
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().view)).toBe(0);
  await page.locator('#view-select').selectOption('1');
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().view)).toBe(1);
  // A NaN origin used to make the original engine delete points on data refresh.
  expect(await engine.evaluate(() => {
    const p = Tracker.app.getMainFrame().getSelectedPanel$();
    const point = p.getSelectedTrack$().getStep$I(0)?.getPoints$()[0];
    const world = point?.getWorldPosition$org_opensourcephysics_media_core_VideoPanel(p);
    return !!world && Number.isFinite(world.getX$()) && Number.isFinite(world.getY$());
  })).toBe(true);
  await page.locator('#view-select').selectOption('4');
  await page.locator('#mark-button').tap();
  await expect(page.locator('#mark-button')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('TRZ projects load and layout follows rotation without losing the analysis', async ({ page }) => {
  const { engine, errors } = await boot(page);
  await page.locator('#file-input').setInputFiles(path.join(__dirname, '../docs/examples/CarInLoop.trz'));
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().hasVideo)).toBe(true);
  const before = await engine.evaluate(() => Tracker.app.getMainFrame().getSelectedPanel$().getTitle$());
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => engine.evaluate(() => {
    const frame = Tracker.app.getMainFrame();
    return Math.abs(frame.getWidth$() - innerWidth) <= 5 && Math.abs(frame.getHeight$() - innerHeight) <= 5;
  })).toBe(true);
  expect(await engine.evaluate(() => Tracker.app.getMainFrame().getSelectedPanel$().getTitle$())).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('empty files recover, help is accessible, and installation uses relative paths', async ({ page, request }) => {
  await boot(page);
  await page.locator('#file-input').setInputFiles({ name: 'empty.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(0) });
  await expect(page.locator('#status')).toContainText('비어 있는 파일');
  await expect(page.locator('#open-button')).toBeEnabled();
  await page.getByRole('button', { name: '사용 안내', exact: true }).tap();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('홈 화면에 추가');
  await page.getByRole('button', { name: '안내 닫기' }).tap();
  await expect(page.getByRole('dialog')).toBeHidden();
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('./TrackerMobile.html');
  expect(manifest.display).toBe('standalone');
});

test('file import offers the device Drive provider without account integration', async ({ page }) => {
  await boot(page);
  await page.locator('#open-button').tap();
  await expect(page.getByRole('dialog', { name: '영상·파일 가져오기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '기기·사진에서 선택' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Google Drive에서 선택' }).tap();
  const input = await chooser;
  await input.setFiles(path.join(__dirname, '../docs/examples/projectile.mp4'));
  await expect(page.locator('#status')).toContainText('파일을 전달했습니다');
  await page.locator('#results-button').tap();
  await expect(page.locator('#result-files')).toContainText('projectile.mp4');
  expect(await page.locator('script[src*="accounts.google"], script[src*="apis.google"]').count()).toBe(0);
});

test('a downloaded project includes the video and preserves a measured point on reopen', async ({ page }, testInfo) => {
  test.skip(!['webkit-ipad', 'android-tablet'].includes(testInfo.project.name), 'Tablet round-trip coverage');
  const { engine, errors } = await boot(page);
  page.on('dialog', dialog => dialog.accept('tablet-roundtrip'));
  await page.locator('#file-input').setInputFiles(path.join(__dirname, '../docs/examples/projectile.mp4'));
  await expect.poll(() => engine.evaluate(() => TrackerIOS.state().hasVideo)).toBe(true);
  await page.locator('[data-action="pointMass"]').tap();
  await expect(page.locator('#mark-button')).toHaveAttribute('aria-pressed', 'true');
  const id = await engine.evaluate(() => Tracker.app.getMainFrame().getSelectedPanel$().getUI$().domNode.id);
  const canvas = engine.locator(`[id="${id}"]`);
  const size = await canvas.evaluate(node => ({ width: node.clientWidth, height: node.clientHeight }));
  await canvas.tap({ position: { x: size.width / 2, y: size.height / 2 } });
  await expect.poll(() => engine.evaluate(() => !!Tracker.app.getMainFrame().getSelectedPanel$().getSelectedTrack$().getStep$I(0))).toBe(true);
  const original = await engine.evaluate(() => {
    const point = Tracker.app.getMainFrame().getSelectedPanel$().getSelectedTrack$().getStep$I(0).getPoints$()[0];
    return [point.getX$(), point.getY$()];
  });
  await page.locator('[data-action="saveZip"]').tap();
  await engine.getByText('다른 이름으로 저장...', { exact: true }).tap();
  await expect(page.locator('#results')).toBeVisible();
  await expect(page.locator('#result-files').getByRole('heading').first()).toHaveText('tablet-roundtrip.trz');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#result-files').getByRole('link', { name: '다운로드', exact: true }).first().click();
  const download = await downloadPromise;
  const saved = testInfo.outputPath('tablet-roundtrip.trz');
  await download.saveAs(saved);
  const bytes = await fs.readFile(saved);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  // Reload the app so the restored data cannot come from the original panel.
  const reopened = await boot(page);
  await page.locator('#file-input').setInputFiles(saved);
  await expect.poll(() => reopened.engine.evaluate(() => TrackerIOS.state().hasVideo)).toBe(true);
  const restored = await reopened.engine.evaluate(() => {
    const p = Tracker.app.getMainFrame().getSelectedPanel$();
    const tracks = p.getTracksTemp$();
    for (let i = 0; i < tracks.size$(); i++) {
      const track = tracks.get$I(i);
      if (track.ttype === 5) {
        const point = track.getStep$I(0).getPoints$()[0];
        p.clearTemp$();
        return [point.getX$(), point.getY$()];
      }
    }
    p.clearTemp$();
    return null;
  });
  expect(restored).not.toBeNull();
  expect(restored[0]).toBeCloseTo(original[0], 5);
  expect(restored[1]).toBeCloseTo(original[1], 5);
  expect(errors).toEqual([]);
  expect(reopened.errors).toEqual([]);
});
