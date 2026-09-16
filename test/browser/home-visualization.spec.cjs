// @ts-check
const { test, expect } = require('@playwright/test');

const VISUALIZATIONS = ['dazzle', 'xerox', 'ttt'];

// Exercise WebGL rendering even when headless Chromium has no hardware GPU.
test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

test.describe('Homepage visualization', () => {
  test('keeps the wordmark inside the content column with larger default fonts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1394, height: 1110 });
    await page.goto('/?viz=ttt');
    await page.addStyleTag({ content: 'html { font-size: 125% !important; }' });

    const bounds = await page.evaluate(() => {
      const svg = document.querySelector('.home-wordmark svg');
      const column = document.querySelector('.home-page .column');
      const bar = document.querySelector('#big-black-bar');

      return {
        svgRight: svg.getBoundingClientRect().right,
        columnRight: column.getBoundingClientRect().right,
        barLeft: bar.getBoundingClientRect().left,
      };
    });

    expect(bounds.svgRight).toBeLessThanOrEqual(bounds.columnRight);
    expect(bounds.svgRight).toBeLessThanOrEqual(bounds.barLeft);
  });

  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 664 },
    { width: 740, height: 330 },
  ]) {
    for (const name of VISUALIZATIONS) {
      test(`loads ${name} at ${viewport.width} x ${viewport.height} without boot errors`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const errors = [];
        const vizRequests = [];

        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        page.on('request', (request) => {
          if (request.url().includes('/assets/js/viz/')) vizRequests.push(request.url());
        });

        await page.goto(`/?viz=${name}`);
        await page.waitForFunction(() => {
          const canvas = document.querySelector('#sslogocanvas');
          return canvas && canvas.dataset.viz === '1';
        });
        await page.waitForTimeout(1000);

        expect(vizRequests.some((url) => url.endsWith(`/assets/js/viz/${name}.js`))).toBe(true);
        await expect(page.locator('#sslogocanvas')).toBeVisible();
        await expect(page.locator('#sslogocanvas')).toHaveCSS('opacity', '1');
        expect(errors).toEqual([]);

        if (name === 'ttt') {
          await expect(page.locator('#sslogocanvas')).toHaveCSS('opacity', '1');
          const before = await page
            .locator('#sslogocanvas')
            .evaluate((canvas) => canvas.toDataURL());
          await page.waitForTimeout(500);
          const after = await page
            .locator('#sslogocanvas')
            .evaluate((canvas) => canvas.toDataURL());
          expect(after).not.toEqual(before);
        }
      });
    }
  }

  test('reflows the mobile visualization on rotation and preserves reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/?viz=ttt');
    const canvas = page.locator('#sslogocanvas');
    await expect(canvas).toHaveCSS('opacity', '1');

    for (const viewport of [
      { width: 390, height: 664 },
      { width: 740, height: 330 },
    ]) {
      await page.setViewportSize(viewport);
      const dimensions = await page.evaluate(() => {
        const bar = document.querySelector('#big-black-bar').getBoundingClientRect();
        const logo = document.querySelector('.home-wordmark svg').getBoundingClientRect();
        const column = document.querySelector('.home-page .column').getBoundingClientRect();
        const cta = document.querySelector('.contact-cta').getBoundingClientRect();
        return {
          bar: {
            top: bar.top,
            left: bar.left,
            bottom: bar.bottom,
            width: bar.width,
            height: bar.height,
          },
          logoHeight: logo.height,
          logoCenter: logo.left + logo.width / 2,
          columnCenter: column.left + column.width / 2,
          ctaTop: cta.top,
          ctaRight: cta.right,
        };
      });
      expect(dimensions.logoHeight).toBeCloseTo(20, 0);
      expect(dimensions.logoCenter).toBeCloseTo(dimensions.columnCenter, 0);
      if (viewport.width < viewport.height) {
        expect(dimensions.bar.left).toBe(0);
        expect(dimensions.bar.width).toBe(viewport.width);
        expect(dimensions.bar.height).toBeCloseTo(viewport.height * 0.33, 0);
        expect(dimensions.ctaTop).toBeGreaterThanOrEqual(dimensions.bar.bottom);
      } else {
        expect(dimensions.bar.left).toBe(viewport.width / 2);
        expect(dimensions.bar.width).toBe(viewport.width / 2);
        expect(dimensions.bar.top).toBe(0);
        expect(dimensions.bar.height).toBe(viewport.height);
        expect(dimensions.ctaRight).toBeLessThanOrEqual(dimensions.bar.left);
      }
    }

    // Let the single resize frame finish before checking that motion has stopped.
    await page.waitForTimeout(100);
    const stillFrame = await canvas.evaluate((element) => element.toDataURL());
    await page.waitForTimeout(300);
    expect(await canvas.evaluate((element) => element.toDataURL())).toBe(stillFrame);
  });
});
