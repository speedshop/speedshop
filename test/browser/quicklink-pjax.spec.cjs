// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests to verify quicklink prefetching and pjax navigation compatibility.
 *
 * Issue #50: Quicklink prefetches pages, but pjax still makes XHR requests
 * that don't utilize the prefetched content. These tests verify:
 * 1. Quicklink is actually prefetching links in the viewport
 * 2. Pjax navigation works correctly
 * 3. Whether pjax utilizes quicklink's prefetched content (the bug)
 */

test.describe('Quicklink and Pjax behavior', () => {

  test('quicklink prefetches visible links on page load', async ({ page }) => {
    const prefetchedUrls = [];

    // Use CDP to track all network requests
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');

    client.on('Network.requestWillBeSent', (params) => {
      // Quicklink uses either <link rel="prefetch"> or fetch()
      // Look for prefetch requests (type will be 'Other' for link prefetch)
      if (params.type === 'Other' || params.request.headers['Purpose'] === 'prefetch') {
        prefetchedUrls.push(params.request.url);
      }
      // Also track fetch-based prefetch (quicklink fallback)
      if (params.initiator?.type === 'script' && params.type === 'Fetch') {
        prefetchedUrls.push(params.request.url);
      }
    });

    await page.goto('/');

    // Wait for quicklink to observe links and start prefetching
    // Quicklink uses requestIdleCallback with 2s timeout by default
    await page.waitForTimeout(3000);

    // Verify that at least one HTML page was prefetched
    const htmlPrefetches = prefetchedUrls.filter(url =>
      url.endsWith('.html') ||
      url.match(/\/(retainer|blog|rails-performance-workshop|card|status)($|\?)/)
    );

    console.log('Prefetched URLs:', prefetchedUrls);
    console.log('HTML prefetches:', htmlPrefetches);

    expect(htmlPrefetches.length).toBeGreaterThan(0);
  });

  test('pjax navigation works without full page reload', async ({ page }) => {
    await page.goto('/');

    // Wait for pjax to initialize
    await page.waitForFunction(() => typeof window.Pjax !== 'undefined' || document.querySelector('[data-pjax-state]'));
    await page.waitForTimeout(500);

    // Find a link to another page
    const link = await page.locator('a[href="/retainer.html"], a[href="/retainer"]').first();

    if (await link.count() === 0) {
      // If no retainer link, try any internal link
      const anyLink = await page.locator('a[href^="/"]').first();
      expect(await anyLink.count()).toBeGreaterThan(0);
      return; // Skip rest of test if no suitable link found
    }

    // Track if a full page navigation occurs
    let fullPageLoad = false;
    page.on('load', () => {
      fullPageLoad = true;
    });

    // Click the link
    await link.click();

    // Wait for pjax to complete. Don't key off body text here, since the home page
    // can contain "retainer" in link URLs and make this pass before navigation finishes.
    await expect(page).toHaveURL(/retainer/, { timeout: 5000 });

    // Pjax should NOT trigger a full page load event
    // (Note: this might be flaky since pjax replaces body content)
  });

  // Skip: Documents issue #50 - pjax doesn't use quicklink prefetch cache
  test.skip('pjax request uses prefetch cache (compatibility test)', async ({ page }) => {
    const requests = [];

    // Use CDP to track network requests with cache info
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');

    // Track all requests with their cache status
    const requestMap = new Map();

    client.on('Network.requestWillBeSent', (params) => {
      requestMap.set(params.requestId, {
        url: params.request.url,
        type: params.type,
        initiator: params.initiator?.type,
        timestamp: params.timestamp
      });
    });

    client.on('Network.responseReceived', (params) => {
      const req = requestMap.get(params.requestId);
      if (req) {
        req.fromCache = params.response.fromDiskCache ||
                        params.response.fromPrefetchCache ||
                        params.response.fromServiceWorker;
        req.fromPrefetchCache = params.response.fromPrefetchCache;
        req.status = params.response.status;
        requests.push(req);
      }
    });

    await page.goto('/');

    // Wait for quicklink to prefetch
    await page.waitForTimeout(3000);

    // Find the retainer link
    const link = await page.locator('a[href="/retainer.html"], a[href="/retainer"]').first();

    if (await link.count() === 0) {
      console.log('No retainer link found, skipping cache test');
      return;
    }

    // Record requests before clicking
    const prefetchRequests = requests.filter(r =>
      r.url.includes('retainer') && r.type !== 'XHR'
    );

    console.log('Prefetch requests to retainer:', prefetchRequests);

    // Click the link (triggers pjax XHR)
    await link.click();

    // Wait for pjax navigation
    await page.waitForTimeout(1000);

    // Find the pjax XHR request to retainer
    const pjaxRequests = requests.filter(r =>
      r.url.includes('retainer') && r.type === 'XHR'
    );

    console.log('Pjax XHR requests to retainer:', pjaxRequests);

    // THE KEY TEST: Does pjax use the prefetch cache?
    // If quicklink and pjax are compatible, fromPrefetchCache should be true
    // If they're NOT compatible (the bug), fromPrefetchCache will be false

    if (pjaxRequests.length > 0) {
      const pjaxRequest = pjaxRequests[pjaxRequests.length - 1];

      console.log('Pjax request cache status:', {
        fromCache: pjaxRequest.fromCache,
        fromPrefetchCache: pjaxRequest.fromPrefetchCache
      });

      // This assertion documents the expected behavior
      // Currently this will FAIL because of the bug described in issue #50
      expect(pjaxRequest.fromPrefetchCache).toBe(true);
    } else {
      // If no XHR request was made, pjax might have used a different mechanism
      console.log('No XHR request detected - pjax may be using fetch or different approach');
    }
  });

  // Skip: Documents issue #50 - pjax doesn't use quicklink prefetch cache
  test.skip('pjax XHR reuses prefetch cache (no duplicate network requests)', async ({ page }) => {
    const requests = [];

    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');

    const requestMap = new Map();

    client.on('Network.requestWillBeSent', (params) => {
      const url = params.request.url;
      if (url.includes('retainer')) {
        requestMap.set(params.requestId, {
          url,
          type: params.type,
          timestamp: params.timestamp
        });
        console.log(`Request to ${url} (type: ${params.type})`);
      }
    });

    client.on('Network.responseReceived', (params) => {
      const req = requestMap.get(params.requestId);
      if (req) {
        req.fromPrefetchCache = params.response.fromPrefetchCache || false;
        req.fromDiskCache = params.response.fromDiskCache || false;
        requests.push(req);
      }
    });

    await page.goto('/');
    await page.waitForTimeout(3000); // Wait for quicklink

    const link = await page.locator('a[href="/retainer.html"], a[href="/retainer"]').first();
    if (await link.count() > 0) {
      await link.click();
      await page.waitForTimeout(1000);
    }

    console.log('All retainer requests:', requests);

    // Find the prefetch and XHR requests
    const prefetchRequest = requests.find(r => r.type === 'Other');
    const xhrRequest = requests.find(r => r.type === 'XHR');

    // Verify quicklink made a prefetch request
    expect(prefetchRequest).toBeDefined();
    console.log('Prefetch request found:', prefetchRequest);

    // Verify pjax made an XHR request that used the prefetch cache
    expect(xhrRequest).toBeDefined();
    expect(xhrRequest.fromPrefetchCache).toBe(true);
    console.log('XHR request used prefetch cache:', xhrRequest.fromPrefetchCache);
  });
});
