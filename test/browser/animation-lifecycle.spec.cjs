// @ts-check
const { test, expect } = require('@playwright/test');

async function installAnimationFrameTracker(page) {
  await page.addInitScript(() => {
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const activeFrames = new Map();
    let scheduledCount = 0;
    let firedCount = 0;
    let canceledCount = 0;

    window.requestAnimationFrame = (callback) => {
      scheduledCount += 1;
      let frameId;
      frameId = nativeRequestAnimationFrame((timestamp) => {
        activeFrames.delete(frameId);
        firedCount += 1;
        callback(timestamp);
      });
      activeFrames.set(frameId, true);
      return frameId;
    };

    window.cancelAnimationFrame = (frameId) => {
      if (activeFrames.delete(frameId)) {
        canceledCount += 1;
      }
      nativeCancelAnimationFrame(frameId);
    };

    window.__animationFrameSnapshot = () => ({
      activeCount: activeFrames.size,
      scheduledCount,
      firedCount,
      canceledCount,
    });
  });
}

async function waitForPjaxReady(page) {
  await page.waitForFunction(() => document.querySelector('[data-pjax-state]') !== null);
}

async function animationFrameSnapshot(page) {
  return page.evaluate(() => window.__animationFrameSnapshot());
}

test.describe('Animation lifecycle', () => {
  test('stops the homepage canvas animation after a PJAX navigation away', async ({ page }) => {
    await installAnimationFrameTracker(page);

    await page.goto('/?viz=ttt');
    await waitForPjaxReady(page);
    await page.waitForFunction(() => document.querySelector('#sslogocanvas')?.dataset.viz === '1');
    await page.waitForTimeout(250);

    const onHome = await animationFrameSnapshot(page);
    expect(onHome.firedCount).toBeGreaterThan(0);

    await page.locator('a[href="/blog/"]').first().click();
    await expect(page).toHaveURL(/\/blog\/$/, { timeout: 5000 });
    await page.waitForTimeout(250);

    const afterNavigation = await animationFrameSnapshot(page);
    expect(afterNavigation.activeCount).toBe(0);

    await page.waitForTimeout(250);
    const later = await animationFrameSnapshot(page);
    expect(later.firedCount).toBe(afterNavigation.firedCount);

    await page.goBack();
    await expect(page).toHaveURL(/\/(?:\?viz=ttt)?$/, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelector('#sslogocanvas')?.dataset.viz === '1');
    await page.waitForTimeout(250);

    const afterBack = await animationFrameSnapshot(page);
    expect(afterBack.firedCount).toBeGreaterThan(later.firedCount);
    expect(afterBack.activeCount).toBeGreaterThan(0);
  });

  test('cleans up the retainer canvas animation on PJAX send', async ({ page }) => {
    await installAnimationFrameTracker(page);

    await page.goto('/retainer.html');
    await waitForPjaxReady(page);
    await page.waitForTimeout(250);

    const onRetainer = await animationFrameSnapshot(page);
    expect(onRetainer.firedCount).toBeGreaterThan(0);
    expect(onRetainer.activeCount).toBeGreaterThan(0);

    await page.evaluate(() => document.dispatchEvent(new Event('pjax:send')));
    await page.waitForTimeout(100);

    const afterCleanup = await animationFrameSnapshot(page);
    expect(afterCleanup.activeCount).toBe(0);

    await page.waitForTimeout(250);
    const later = await animationFrameSnapshot(page);
    expect(later.firedCount).toBe(afterCleanup.firedCount);
  });
});
