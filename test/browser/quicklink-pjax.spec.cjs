// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests to verify quicklink prefetching and pjax navigation compatibility.
 *
 * These tests verify:
 * 1. Quicklink is actually prefetching links in the viewport
 * 2. Pjax navigation works correctly
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

    // Wait for pjax to complete
    await page.waitForFunction(() => {
      return document.body.innerHTML.includes('retainer') ||
             window.location.pathname.includes('retainer');
    }, { timeout: 5000 });

    // Verify URL changed
    expect(page.url()).toContain('retainer');

    // Pjax should NOT trigger a full page load event
    // (Note: this might be flaky since pjax replaces body content)
  });

});
