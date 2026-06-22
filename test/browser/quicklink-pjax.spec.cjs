// @ts-check
const { test, expect } = require('@playwright/test');

const RETAINER_URL_PATTERN = /\/retainer(?:\.html)?(?:\?|$)/;
const BLOG_URL_PATTERN = /\/blog\/?(?:\?|$)/;
const FIRST_BLOG_POST_URL_PATTERN = /\/blog\/performance-lessons-from-ao3\/(?:\?|$)/;

async function installPjaxEventRecorder(page) {
  const events = [];

  await page.exposeFunction('__recordPjaxEvent', (event) => {
    events.push(event);
  });

  await page.addInitScript(() => {
    for (const name of ['pjax:send', 'pjax:complete', 'pjax:success', 'pjax:error']) {
      document.addEventListener(name, (event) => {
        window.__recordPjaxEvent({
          name,
          href: event.triggerElement && event.triggerElement.href,
        });
      });
    }
  });

  return events;
}

async function startNetworkTracker(page, { cacheDisabled = false } = {}) {
  const requestById = new Map();

  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');

  if (cacheDisabled) {
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
  }

  client.on('Network.requestWillBeSent', (params) => {
    requestById.set(params.requestId, {
      url: params.request.url,
      type: params.type,
      purpose: prefetchPurpose(params.request.headers),
      initiator: params.initiator?.type || null,
      xPjax: params.request.headers?.['X-PJAX'] ||
        params.request.headers?.['x-pjax'] ||
        null,
    });
  });

  client.on('Network.responseReceived', (params) => {
    const request = requestById.get(params.requestId);
    if (!request) return;

    request.fromPrefetchCache = Boolean(params.response.fromPrefetchCache);
    request.fromDiskCache = Boolean(params.response.fromDiskCache);
    request.fromServiceWorker = Boolean(params.response.fromServiceWorker);
  });

  return () => Array.from(requestById.values());
}

async function waitForPjaxReady(page) {
  await page.waitForFunction(() => document.querySelector('[data-pjax-state]') !== null);
}

test.describe('Quicklink + Pjax', () => {
  test('prefetches on homepage, updates body via pjax, and avoids extra network fetch', async ({ page }) => {
    const events = await installPjaxEventRecorder(page);
    const requests = await startNetworkTracker(page);

    await page.goto('/');
    await waitForPjaxReady(page);

    const bodyBeforeClick = await page.locator('body').innerHTML();
    const inlineCssBeforeClick = await page.locator('style#inline-css').textContent();

    // quicklink prefetch runs in requestIdleCallback (2s timeout by default)
    await page.waitForTimeout(3000);

    const prefetchesForRetainer = requests().filter((request) =>
      RETAINER_URL_PATTERN.test(request.url) && isPrefetchRequest(request)
    );
    expect(prefetchesForRetainer.length).toBeGreaterThan(0);
    expect(prefetchesForRetainer.some((request) => /[?&]t=/.test(request.url))).toBe(false);

    const pageOrigin = new URL(page.url()).origin;
    const externalPrefetches = requests().filter((request) =>
      isPrefetchRequest(request) && new URL(request.url).origin !== pageOrigin
    );
    expect(externalPrefetches).toHaveLength(0);

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
    expect(events.map((event) => event.name)).toEqual(['pjax:send', 'pjax:complete', 'pjax:success']);

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

  test('restores prior body content with browser back and forward without full reloads', async ({ page }) => {
    await installPjaxEventRecorder(page);

    await page.goto('/');
    await waitForPjaxReady(page);

    let loadEventsAfterInitialPageLoad = 0;
    page.on('load', () => {
      loadEventsAfterInitialPageLoad += 1;
    });

    await expect(page.locator('body')).toContainText('Products and Services');

    await page.locator('a[href="/retainer.html"], a[href="/retainer"]').first().click();
    await expect(page).toHaveURL(/retainer/, { timeout: 5000 });
    await expect(page.locator('body')).toContainText('Performance monitoring');

    await page.goBack();
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
    await expect(page.locator('body')).toContainText('Products and Services');

    await page.goForward();
    await expect(page).toHaveURL(/retainer/, { timeout: 5000 });
    await expect(page.locator('body')).toContainText('Performance monitoring');

    expect(loadEventsAfterInitialPageLoad).toBe(0);
  });

  test('does not pjax same-page hash links', async ({ page }) => {
    const events = await installPjaxEventRecorder(page);

    await page.goto('/slack.html');
    await waitForPjaxReady(page);

    await page.locator('a[href="#get-an-invite"]').first().click();
    await expect(page).toHaveURL(/\/slack\.html#get-an-invite$/);
    expect(events).toHaveLength(0);
  });

  test('does not pjax external links', async ({ page, context }) => {
    const events = await installPjaxEventRecorder(page);
    await context.route('https://**/*', (route) => {
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>external</title>' });
    });

    await page.goto('/');
    await waitForPjaxReady(page);

    const externalLink = page.locator('a[href^="https://www.speedshop.co.jp"]').first();
    await externalLink.evaluate((link) => link.setAttribute('target', '_blank'));

    const popupPromise = context.waitForEvent('page');
    await externalLink.click();
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await popup.close();

    expect(events).toHaveLength(0);
  });

  test('does not pjax modifier-clicked internal links', async ({ page, context }) => {
    const events = await installPjaxEventRecorder(page);

    await page.goto('/');
    await waitForPjaxReady(page);

    const internalLink = page.locator('a[href="/retainer.html"], a[href="/retainer"]').first();
    await internalLink.evaluate((link) => link.setAttribute('target', '_blank'));

    const popupPromise = context.waitForEvent('page');
    await internalLink.click({ modifiers: ['ControlOrMeta'] });
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await popup.close();

    expect(events).toHaveLength(0);
  });

  test('does not pjax the external Mailchimp form', async ({ page }) => {
    const events = await installPjaxEventRecorder(page);

    await page.goto('/blog/100-ms-to-glass-with-rails-and-turbolinks/');
    await waitForPjaxReady(page);

    const mailchimpForm = page.locator('form.mailchimp').first();
    await mailchimpForm.evaluate((form) => {
      form.addEventListener('submit', (event) => event.preventDefault());
    });
    await mailchimpForm.locator('input[type="email"]').fill('test@example.com');
    await mailchimpForm.locator('input[type="submit"]').click();
    await page.waitForTimeout(100);

    expect(events).toHaveLength(0);
  });

  test('falls back to a full navigation when pjax receives an error response', async ({ page }) => {
    const events = await installPjaxEventRecorder(page);

    await page.route('**/retainer.html', (route) => {
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'Forced missing page' });
    });

    await page.goto('/');
    await waitForPjaxReady(page);

    await page.locator('a[href="/retainer.html"], a[href="/retainer"]').first().click({ noWaitAfter: true });
    await expect(page).toHaveURL(/\/retainer\.html$/);
    await expect(page.locator('body')).toContainText('Forced missing page');

    expect(events.map((event) => event.name)).toContain('pjax:error');
  });

  test('re-runs quicklink after a pjax navigation', async ({ page }) => {
    await installPjaxEventRecorder(page);
    const requests = await startNetworkTracker(page);

    await page.goto('/');
    await waitForPjaxReady(page);

    await page.locator('a[href="/blog/"]').first().click();
    await expect(page).toHaveURL(BLOG_URL_PATTERN, { timeout: 5000 });
    await expect(page.locator('body')).toContainText('The #1 Rails performance blog');

    // quicklink is re-initialized by the pjax:complete handler.
    await page.waitForTimeout(3000);

    const prefetchedFirstPost = requests().filter((request) =>
      FIRST_BLOG_POST_URL_PATTERN.test(request.url) && isPrefetchRequest(request)
    );
    expect(prefetchedFirstPost.length).toBeGreaterThan(0);
  });

  test('uses prefetched blog post HTML for pjax clicks from the blog index', async ({ page }) => {
    const events = await installPjaxEventRecorder(page);
    const requests = await startNetworkTracker(page);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/blog/');
    await waitForPjaxReady(page);

    // The first several blog posts are visible, so the first post should be prefetched.
    await page.waitForTimeout(3000);

    const prefetchedFirstPost = requests().filter((request) =>
      FIRST_BLOG_POST_URL_PATTERN.test(request.url) && isPrefetchRequest(request)
    );
    expect(prefetchedFirstPost.length).toBeGreaterThan(0);

    const firstPostRequestCountBeforeClick = requests().filter((request) =>
      FIRST_BLOG_POST_URL_PATTERN.test(request.url)
    ).length;

    await page.locator('a[href="/blog/performance-lessons-from-ao3/"]').first().click();
    await expect(page).toHaveURL(FIRST_BLOG_POST_URL_PATTERN, { timeout: 5000 });
    await expect(page.locator('body')).toContainText('Organization for Transformative Works Performance Audit');
    expect(events.map((event) => event.name)).toEqual(['pjax:send', 'pjax:complete', 'pjax:success']);

    const firstPostRequestsAfterClick = requests().filter((request) =>
      FIRST_BLOG_POST_URL_PATTERN.test(request.url)
    );
    const extraFirstPostRequests = firstPostRequestsAfterClick.slice(firstPostRequestCountBeforeClick);

    expect(extraFirstPostRequests).toHaveLength(0);
  });

  test('does not prefetch hash links for the current page while scrolling', async ({ page }) => {
    const requests = await startNetworkTracker(page, { cacheDisabled: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/blog/performance-lessons-from-ao3/');
    await waitForPjaxReady(page);

    // quicklink runs after the browser is idle, then discovers more links as we scroll.
    await page.waitForTimeout(3000);
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(1000);

    const currentPageUrl = new URL(page.url());
    currentPageUrl.hash = '';

    const currentPagePrefetches = requests().filter((request) => {
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
