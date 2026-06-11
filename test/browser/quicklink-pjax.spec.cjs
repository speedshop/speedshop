// @ts-check
const { test, expect } = require('@playwright/test');

const RETAINER_URL_PATTERN = /\/retainer(?:\.html)?(?:\?|$)/;

test.describe('Quicklink + Pjax', () => {
  test('prefetches on homepage, updates body via pjax, and avoids extra network fetch', async ({ page }) => {
    const requestById = new Map();

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');

    client.on('Network.requestWillBeSent', (params) => {
      requestById.set(params.requestId, {
        url: params.request.url,
        type: params.type,
        purpose: prefetchPurpose(params.request.headers),
        initiator: params.initiator?.type || null,
      });
    });

    client.on('Network.responseReceived', (params) => {
      const request = requestById.get(params.requestId);
      if (!request) return;

      request.fromPrefetchCache = Boolean(params.response.fromPrefetchCache);
      request.fromDiskCache = Boolean(params.response.fromDiskCache);
      request.fromServiceWorker = Boolean(params.response.fromServiceWorker);
    });

    await page.goto('/');
    await page.waitForFunction(() => document.querySelector('[data-pjax-state]') !== null);

    const bodyBeforeClick = await page.locator('body').innerHTML();
    const inlineCssBeforeClick = await page.locator('style#inline-css').textContent();

    // quicklink prefetch runs in requestIdleCallback (2s timeout by default)
    await page.waitForTimeout(3000);

    const requests = () => Array.from(requestById.values());
    const prefetchesForRetainer = requests().filter((request) =>
      RETAINER_URL_PATTERN.test(request.url) && isPrefetchRequest(request)
    );
    expect(prefetchesForRetainer.length).toBeGreaterThan(0);

    const retainerRequestCountBeforeClick = requests().filter((request) =>
      RETAINER_URL_PATTERN.test(request.url)
    ).length;

    let loadEventsAfterClick = 0;
    page.on('load', () => {
      loadEventsAfterClick += 1;
    });

    const link = page.locator('a[href="/retainer.html"], a[href="/retainer"]').first();
    expect(await link.count()).toBeGreaterThan(0);

    await link.click();
    await expect(page).toHaveURL(/retainer/, { timeout: 5000 });
    await page.waitForTimeout(750);

    const bodyAfterClick = await page.locator('body').innerHTML();
    expect(bodyAfterClick).not.toEqual(bodyBeforeClick);
    expect(loadEventsAfterClick).toBe(0);

    // CSS is purged per-page, so pjax must swap in the new page's inline style.
    await expect(page.locator('style#inline-css')).toHaveCount(1);
    const inlineCssAfterClick = await page.locator('style#inline-css').textContent();
    expect(inlineCssAfterClick).not.toEqual(inlineCssBeforeClick);

    const retainerRequestsAfterClick = requests().filter((request) =>
      RETAINER_URL_PATTERN.test(request.url)
    );
    const extraRetainerRequests = retainerRequestsAfterClick.slice(retainerRequestCountBeforeClick);

    const networkBackedRetainerRequests = extraRetainerRequests.filter(
      (request) =>
        !request.fromPrefetchCache &&
        !request.fromDiskCache &&
        !request.fromServiceWorker
    );

    expect(networkBackedRetainerRequests).toHaveLength(0);
  });

  test('does not prefetch hash links for the current page while scrolling', async ({ page }) => {
    const requestById = new Map();

    await page.setViewportSize({ width: 1280, height: 900 });

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });

    client.on('Network.requestWillBeSent', (params) => {
      requestById.set(params.requestId, {
        url: params.request.url,
        type: params.type,
        purpose: prefetchPurpose(params.request.headers),
        initiator: params.initiator?.type || null,
      });
    });

    await page.goto('/blog/performance-lessons-from-ao3/');
    await page.waitForFunction(() => document.querySelector('[data-pjax-state]') !== null);

    // quicklink runs after the browser is idle, then discovers more links as we scroll.
    await page.waitForTimeout(3000);
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1000);

    const currentPageUrl = new URL(page.url());
    currentPageUrl.hash = '';

    const currentPagePrefetches = Array.from(requestById.values()).filter((request) => {
      const requestUrl = new URL(request.url);
      requestUrl.hash = '';
      return requestUrl.href === currentPageUrl.href && isPrefetchRequest(request);
    });

    expect(currentPagePrefetches).toHaveLength(0);
  });
});

function prefetchPurpose(headers) {
  return headers?.Purpose || headers?.purpose || headers?.['Sec-Purpose'] || headers?.['sec-purpose'] || null;
}

function isPrefetchRequest(request) {
  return (
    request.type === 'Other' ||
    request.purpose === 'prefetch' ||
    (request.initiator === 'script' && request.type === 'Fetch')
  );
}
