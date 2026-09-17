// @ts-check
const { test, expect } = require('@playwright/test');

const lines = Array.from({ length: 40 }, (_, index) => ({
  id: `2026-01-02-line-${index}`,
  issue_date: '2026-01-02',
  line_html: `Archive entry ${index} with a <a href="https://example.com/">resource</a>.`,
  line_text: `Archive entry ${index} with a resource.`,
}));
const targetId = lines[30].id;

test.beforeEach(async ({ page }) => {
  // Keep coverage independent of the private newsletter archive.
  await page.route('**/four-line-fridays.html', async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        /(<script id="four-line-archive-data" type="application\/json">)[\s\S]*?(<\/script>)/,
        (_, open, close) => open + JSON.stringify({ lines }) + close,
      ),
    });
  });
});

for (const width of [1280, 390]) {
  test(`opens and reloads a permalink at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/four-line-fridays.html#${targetId}`);
    const target = page.locator(`[id="${targetId}"]`);
    await expect(target).toBeInViewport();
    const link = target.getByRole('link', { name: 'Permalink to line from Jan 2, 2026' });
    await expect(link).toHaveText('#');
    await expect(link).toHaveAttribute('href', `#${targetId}`);
    await expect(target.locator('.four-line-text > :last-child')).toHaveClass('four-line-permalink');
    await page.reload();
    await expect(target).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('links survive filtering and hash navigation reveals a hidden entry', async ({ page }) => {
  await page.goto('/four-line-fridays.html');
  const input = page.locator('#four-line-search');
  await input.fill('Archive entry 30 ');
  await expect(page.locator('.four-line-result:visible')).toHaveCount(1);
  await page.locator('.four-line-result:visible .four-line-permalink').click();
  await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
  await input.fill('no matching entry');
  await expect(page.locator('.four-line-result:visible')).toHaveCount(0);
  await page.evaluate(id => { window.location.hash = id; }, lines[20].id);
  await expect(input).toHaveValue('');
  await expect(page.locator(`[id="${lines[20].id}"]`)).toBeInViewport();
});
