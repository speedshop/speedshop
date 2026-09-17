// @ts-check
const { test, expect } = require('@playwright/test');

const lines = Array.from({ length: 40 }, (_, index) => ({
  id: `2026-01-02-line-${index}`,
  issue_date: '2026-01-02',
  line_html: `Archive entry ${index} with a <a href="https://example.com/">resource</a>.`,
  line_text: `Archive entry ${index} with a resource.`,
}));
const entries = lines.map(line => `
  <li class="four-line-result" id="${line.id}" data-search="${line.line_text.toLowerCase()} ${line.issue_date}">
    <p class="four-line-meta">Jan 2, 2026</p>
    <p class="four-line-text">${line.line_html} <a class="four-line-permalink" href="#${line.id}" aria-label="Permalink to line from Jan 2, 2026">#</a></p>
  </li>
`).join('');
const targetId = lines[30].id;

test.beforeEach(async ({ page }) => {
  // Keep coverage independent of the private newsletter archive.
  await page.route('**/four-line-fridays.html', async route => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        /(<ul class="four-line-results" id="four-line-results">)[\s\S]*?(<\/ul>)/,
        (_, open, close) => open + entries + close,
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

test('a permalink selected from search opens the full archive on reload', async ({ page }) => {
  await page.goto('/four-line-fridays.html');
  const input = page.locator('#four-line-search');
  await input.fill('Archive entry 30 ');
  await expect(page.locator('.four-line-result:visible')).toHaveCount(1);
  await page.locator('.four-line-result:visible .four-line-permalink').click();
  await expect(page).toHaveURL(new RegExp(`#${targetId}$`));
  await page.reload();
  await expect(input).toHaveValue('');
  await expect(page.locator('.four-line-result:visible')).toHaveCount(lines.length);
  await expect(page.locator(`[id="${targetId}"]`)).toBeInViewport();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('renders entries and follows native permalinks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(`/four-line-fridays.html#${targetId}`);
    await expect(page.locator('.four-line-result')).toHaveCount(lines.length);
    await expect(page.locator('#four-line-search-controls')).toBeHidden();
    const target = page.locator(`[id="${targetId}"]`);
    await expect(target).toBeInViewport();
    await page.locator('.four-line-permalink').first().click();
    await expect(page).toHaveURL(new RegExp(`#${lines[0].id}$`));
    await expect(page.locator('.four-line-result').first()).toBeInViewport();
  });
});
