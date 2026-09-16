// @ts-check
const { test, expect } = require('@playwright/test');

const mobileViewports = [
  { width: 320, height: 568 },
  { width: 390, height: 664 },
  { width: 667, height: 300 },
  { width: 740, height: 330 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];

test.describe('Shared contact CTA', () => {
  test('homepage CTA follows the content on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/?viz=ttt');
    await expect(page.locator('.contact-cta')).toHaveCount(1);
    await expect(page.locator('.home-desktop-intro')).toBeVisible();
    const positions = await page.evaluate(() => ({
      contentBottom: document.querySelector('.home-content').getBoundingClientRect().bottom,
      ctaTop: document.querySelector('.contact-cta').getBoundingClientRect().top,
    }));
    expect(positions.ctaTop).toBeGreaterThanOrEqual(positions.contentBottom);
  });

  test('homepage keyboard order follows the responsive layout', async ({ page }) => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 664 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/?viz=ttt');
      await page.waitForFunction(() => document.querySelector('#sslogocanvas')?.dataset.viz === '1');
      await page.keyboard.press('Tab');
      const firstLink = viewport.width > 940
        ? page.locator('a[href="https://www.speedshop.co.jp"]')
        : page.locator('.contact-cta .button');
      await expect(firstLink).toBeFocused();
    }
  });

  for (const viewport of mobileViewports) {
    test(`homepage box fits above the fold at ${viewport.width} x ${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/?viz=ttt');
      const cta = page.locator('.contact-cta');
      await expect(cta).toHaveCount(1);
      await expect(cta.getByRole('link', { name: 'Book a call' })).toBeVisible();

      const bounds = await cta.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      });
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(viewport.width);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });
  }

  for (const route of ['/retainer.html', '/blog/', '/blog/the-ruby-gvl-and-scaling/']) {
    test(`box and links fit the content column on ${route}`, async ({ page }) => {
      for (const viewport of [{ width: 390, height: 664 }, { width: 1024, height: 768 }]) {
        await page.setViewportSize(viewport);
        await page.goto(route);
        const cta = page.locator('.contact-cta');
        await expect(cta).toHaveCount(1);
        await cta.scrollIntoViewIfNeeded();
        const heading = route === '/retainer.html' ? 'Start the retainer now.' : 'Speed is a feature.';
        await expect(cta.getByRole('heading', { name: heading })).toBeVisible();
        await expect(cta.getByRole('link', { name: 'Book a call' })).toHaveAttribute(
          'href', 'https://savvycal.com/nateberkopec/join-the-retainer'
        );
        await expect(cta.getByRole('link', { name: 'Email us instead' })).toHaveAttribute(
          'href', 'mailto:nate.berkopec+sales@speedshop.co'
        );

        const geometry = await cta.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const parent = element.parentElement.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            parentLeft: parent.left,
            parentRight: parent.right,
            contentWidth: element.scrollWidth,
            boxWidth: element.clientWidth,
          };
        });
        expect(geometry.left).toBeGreaterThanOrEqual(geometry.parentLeft);
        expect(geometry.right).toBeLessThanOrEqual(geometry.parentRight);
        expect(geometry.contentWidth).toBeLessThanOrEqual(geometry.boxWidth);
      }
    });
  }
});
