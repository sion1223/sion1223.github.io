// End-to-end measurement of g from a real video, driven only by touch taps.
// BallDrop.mp4 is the official Tracker sample (30 fps, 634x480, interlaced).
// Reference positions were found independently with OpenCV background
// subtraction (midpoint of the two interlaced ball images, frames 11-17 after
// release); a quadratic fit of those positions gives a_y = -9.88 m/s² with the
// stick's ten bright bands (48..444 px) taken as 1 m.
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');

const STICK = [[281, 48], [281, 444]];
const ORIGIN = [199, 46];
const BALL = [[11, 196.8, 171.6], [12, 196.4, 206.5], [13, 196.3, 246.1], [14, 195.7, 290.2], [15, 195.5, 337.8], [16, 194.9, 390.4], [17, 194.6, 447.4]];
const REFERENCE_AY = -9.88;

test.use({ video: 'on' });

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/TrackerMobile.html');
  await expect(page.locator('#loading')).toBeHidden();
  const engine = page.frames().find(frame => frame.url().includes('tracker-ios-engine.html'));
  await expect(engine.getByText('파일', { exact: true }).first()).toBeVisible();
  return { engine, errors };
}

// Map Tracker image coordinates to a page position for a real touch tap.
async function tapImage(page, engine, [x, y]) {
  const frameBox = await page.locator('#tracker-engine').boundingBox();
  const inner = await engine.evaluate(([x, y]) => {
    Tracker._setThread();
    const panel = Tracker.app.getMainFrame().getSelectedPanel$();
    const TPoint = Clazz.load('org.opensourcephysics.media.core.TPoint');
    const screen = Clazz.new_(TPoint.c$$D$D, [x, y]).getScreenPosition$org_opensourcephysics_media_core_VideoPanel(panel);
    const rect = panel.getUI$().domNode.getBoundingClientRect();
    return { x: rect.left + screen.x, y: rect.top + screen.y };
  }, [x, y]);
  await page.touchscreen.tap(frameBox.x + inner.x, frameBox.y + inner.y);
}

const state = engine => engine.evaluate(() => TrackerIOS.state());
const hasStep = (engine, n) => engine.evaluate(n => {
  const track = Tracker.app.getMainFrame().getSelectedPanel$().getSelectedTrack$();
  return !!track?.getStep$I(n);
}, n);

test('real free-fall video: touch calibration, origin, zoomed tracking, undo, analysis and CSV', async ({ page }, testInfo) => {
  test.skip(!['android-tablet', 'webkit-ipad'].includes(testInfo.project.name), 'Tablet workflow');
  test.skip(testInfo.project.use.browserName === 'webkit' && process.platform === 'win32',
    'Playwright WebKit on Windows cannot play blob: video URLs');
  test.setTimeout(120000);
  const { engine, errors } = await boot(page);
  await page.locator('#file-input').setInputFiles(path.join(__dirname, '../docs/examples/BallDrop.mp4'));
  await expect.poll(() => state(engine).then(s => s.hasVideo)).toBe(true);
  await expect(page.locator('#scale-readout')).toHaveText('미보정');

  // ① Calibration: tap both ends of the 1 m stick, then type the length.
  await page.locator('#calibrate-button').tap();
  await expect(page.locator('#tap-banner')).toContainText('(1/2)');
  await tapImage(page, engine, STICK[0]);
  await expect(page.locator('#tap-banner')).toContainText('(2/2)');
  await tapImage(page, engine, STICK[1]);
  await expect(page.locator('#calibration-dialog')).toBeVisible();
  await page.locator('#calibration-length').fill('100');
  await page.locator('#calibration-unit').selectOption('cm');
  await page.locator('#calibration-apply').tap();
  await expect(page.locator('#calibration-dialog')).toBeHidden();
  const scale = (await state(engine)).pixelsPerUnit;
  expect(Math.abs(scale - 396)).toBeLessThan(4);
  await expect(page.locator('#scale-readout')).toContainText('1 m =');

  // ② Origin at the ball's release point; the tap must not reach Swing.
  await page.locator('#origin-button').tap();
  await expect(page.locator('#tap-banner')).toContainText('원점');
  await tapImage(page, engine, ORIGIN);
  await expect(page.locator('#tap-banner')).toBeHidden();
  const origin = await engine.evaluate(() => {
    const coords = Tracker.app.getMainFrame().getSelectedPanel$().getCoords$();
    return [coords.getOriginX$I(0), coords.getOriginY$I(0)];
  });
  expect(Math.abs(origin[0] - ORIGIN[0])).toBeLessThan(2);
  expect(Math.abs(origin[1] - ORIGIN[1])).toBeLessThan(2);
  expect((await state(engine)).axesVisible).toBe(true);

  // ③ Point mass, zoomed in; Tracker auto-advances and the view follows.
  await page.locator('[data-action="pointMass"]').tap();
  await expect(page.locator('#mark-button')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#zoom-in-button').tap();
  await expect.poll(() => state(engine).then(s => s.zoom)).toBeGreaterThan(1.2);
  for (let i = 0; i < BALL[0][0]; i++) await page.locator('#next-button').tap();
  await expect.poll(() => state(engine).then(s => s.frame)).toBe(BALL[0][0]);
  for (const [n, x, y] of BALL) {
    await expect.poll(() => state(engine).then(s => s.frame)).toBe(n);
    await tapImage(page, engine, [x, y]);
    await expect.poll(() => hasStep(engine, n)).toBe(true);
  }
  // A mistaken tap is removed without touching the calibration.
  await expect.poll(() => state(engine).then(s => s.frame)).toBe(18);
  await tapImage(page, engine, [120, 300]);
  await expect.poll(() => hasStep(engine, 18)).toBe(true);
  await page.locator('#undo-button').tap();
  await expect.poll(() => hasStep(engine, 18)).toBe(false);
  await expect(page.locator('#status')).toContainText('프레임 18');
  expect(Math.abs((await state(engine)).pixelsPerUnit - scale)).toBeLessThan(1e-9);
  await page.locator('#zoom-fit-button').tap();
  await page.screenshot({ path: testInfo.outputPath('tracked.png') });

  // ④ Analysis uses Tracker's data and a quadratic fit.
  await page.locator('#analysis-button').tap();
  await expect(page.locator('#analysis')).toBeVisible();
  await expect(page.locator('#analysis-table tbody tr')).toHaveCount(BALL.length);
  await expect(page.locator('#analysis-warning')).toHaveText('');
  const ayText = await page.locator('.summary-card', { hasText: '연직 가속도' }).locator('strong').textContent();
  const ay = parseFloat(ayText);
  testInfo.annotations.push({ type: 'measured a_y', description: `${ayText} (reference ${REFERENCE_AY} m/s²)` });
  expect(Math.abs(ay - REFERENCE_AY)).toBeLessThan(0.15);
  const firstY = parseFloat(await page.locator('#analysis-table tbody tr').first().locator('td').nth(3).textContent());
  expect(firstY).toBeCloseTo(-(BALL[0][2] - ORIGIN[1]) / 396, 1);
  await page.locator('#analysis-variable').selectOption('vy');
  await expect(page.locator('#analysis-chart circle')).toHaveCount(BALL.length - 2);
  await page.locator('#analysis-variable').selectOption('y');
  await expect(page.locator('#analysis-chart circle')).toHaveCount(BALL.length);
  await page.screenshot({ path: testInfo.outputPath('analysis.png') });

  // CSV export through the shared result tray.
  await page.locator('#csv-button').tap();
  await expect(page.locator('#results')).toBeVisible();
  const card = page.locator('#result-files .file-card').first();
  await expect(card.getByRole('heading')).toHaveText(/^tracker-.+\.csv$/);
  const downloadPromise = page.waitForEvent('download');
  await card.getByRole('link', { name: '다운로드', exact: true }).click();
  const saved = testInfo.outputPath('freefall.csv');
  await (await downloadPromise).saveAs(saved);
  const lines = (await fs.readFile(saved, 'utf8')).replace(/^﻿/, '').trim().split(/\r?\n/);
  expect(lines[0]).toBe('frame,t (s),x (m),y (m),vx (m/s),vy (m/s),ax (m/s^2),ay (m/s^2)');
  expect(lines).toHaveLength(BALL.length + 1);
  expect(lines[1].split(',')[0]).toBe(String(BALL[0][0]));
  expect(errors).toEqual([]);
});

test('calibration can be cancelled and rejects an invalid length', async ({ page }, testInfo) => {
  test.skip(testInfo.project.use.browserName === 'webkit' && process.platform === 'win32',
    'Playwright WebKit on Windows cannot play blob: video URLs');
  const { engine, errors } = await boot(page);
  await page.locator('#file-input').setInputFiles(path.join(__dirname, '../docs/examples/BallDrop.mp4'));
  await expect.poll(() => state(engine).then(s => s.hasVideo)).toBe(true);
  await page.locator('#calibrate-button').tap();
  await page.locator('#tap-cancel').tap();
  await expect(page.locator('#tap-banner')).toBeHidden();
  expect((await state(engine)).calibrated).toBe(false);
  await page.locator('#calibrate-button').tap();
  await tapImage(page, engine, STICK[0]);
  await tapImage(page, engine, STICK[1]);
  await page.locator('#calibration-length').fill('0');
  await page.locator('#calibration-apply').tap();
  await expect(page.locator('#calibration-error')).toContainText('0보다 큰');
  expect((await state(engine)).pixelsPerUnit).toBe(1);
  await page.locator('#calibration-length').fill('1');
  await page.locator('#calibration-apply').tap();
  await expect.poll(() => state(engine).then(s => Math.round(s.pixelsPerUnit))).toBeGreaterThan(390);
  expect(errors).toEqual([]);
});

test('the Windows WebKit blob limitation is reported instead of hanging silently', async ({ page }, testInfo) => {
  test.skip(!(testInfo.project.use.browserName === 'webkit' && process.platform === 'win32'), 'Only reproducible on Windows WebKit');
  await boot(page);
  await page.locator('#file-input').setInputFiles(path.join(__dirname, '../docs/examples/BallDrop.mp4'));
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'true');
  await expect(page.locator('#status')).toContainText('영상을 열지 못했습니다');
});
