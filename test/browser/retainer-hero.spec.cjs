// @ts-check
const { test, expect } = require('@playwright/test');

async function expectVizHeightToMatchHeading(page) {
  const titleViz = page.locator('.retainer-title-viz');
  const heading = titleViz.locator('h1');
  const canvas = titleViz.locator('canvas');

  await expect(titleViz).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(canvas).toBeVisible();

  await page.waitForFunction(() => {
    const titleViz = document.querySelector('.retainer-title-viz');
    const canvas = titleViz?.querySelector('canvas');

    return canvas && canvas.width === canvas.offsetWidth && canvas.height === canvas.offsetHeight;
  });

  const sizes = await titleViz.evaluate((element) => {
    const heading = element.querySelector('h1');
    const canvas = element.querySelector('canvas');

    return {
      canvasHeight: canvas.getBoundingClientRect().height,
      headingHeight: heading.getBoundingClientRect().height,
      titleVizHeight: element.getBoundingClientRect().height,
    };
  });

  expect(Math.abs(sizes.titleVizHeight - (sizes.headingHeight + 40))).toBeLessThanOrEqual(1);
  expect(Math.abs(sizes.canvasHeight - sizes.titleVizHeight)).toBeLessThanOrEqual(1);
}

test.describe('Retainer hero', () => {
  test('sizes the visualization to the heading plus vertical padding', async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/retainer.html');
      await expectVizHeightToMatchHeading(page);
    }
  });
});
