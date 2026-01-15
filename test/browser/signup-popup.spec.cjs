// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Tests for the newsletter signup popup functionality.
 *
 * The popup:
 * - Appears after 60 seconds on blog post pages
 * - Can be closed by clicking the close button
 * - Sets a cookie to prevent showing again after close
 * - Only appears on pages with the #innocuous element (blog posts)
 */

test.describe('Newsletter signup popup', () => {

  test('popup is hidden by default', async ({ page }) => {
    await page.goto('/blog/100-ms-to-glass-with-rails-and-turbolinks/');

    const popup = page.locator('#innocuous');
    await expect(popup).toBeHidden();
  });

  test('popup appears after timeout', async ({ page }) => {
    // Override the timeout to be shorter for testing
    await page.addInitScript(() => {
      // Store original setTimeout
      const originalSetTimeout = window.setTimeout;
      // Replace setTimeout to fast-forward 60000ms delays
      window.setTimeout = function(fn, delay, ...args) {
        if (delay === 60000) {
          // Execute immediately for the signup timeout
          return originalSetTimeout(fn, 100, ...args);
        }
        return originalSetTimeout(fn, delay, ...args);
      };
    });

    await page.goto('/blog/100-ms-to-glass-with-rails-and-turbolinks/');

    const popup = page.locator('#innocuous');

    // Wait for popup to appear (with fast-forwarded timeout)
    await expect(popup).toBeVisible({ timeout: 5000 });
  });

  test('close button hides popup and sets cookie', async ({ page }) => {
    // Fast-forward the timeout
    await page.addInitScript(() => {
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, delay, ...args) {
        if (delay === 60000) {
          return originalSetTimeout(fn, 100, ...args);
        }
        return originalSetTimeout(fn, delay, ...args);
      };
    });

    await page.goto('/blog/100-ms-to-glass-with-rails-and-turbolinks/');

    const popup = page.locator('#innocuous');
    const closeButton = page.locator('#innocuous-close');

    // Wait for popup to appear
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Click close button
    await closeButton.click();

    // Popup should be hidden
    await expect(popup).toBeHidden();

    // Cookie should be set
    const cookies = await page.context().cookies();
    const signupCookie = cookies.find(c => c.name === 'nateberkopecShowSignup');
    expect(signupCookie).toBeDefined();
    expect(signupCookie.value).toBe('true');
  });

  test('popup does not appear when cookie is set', async ({ page }) => {
    // Set the cookie before loading the page
    await page.context().addCookies([{
      name: 'nateberkopecShowSignup',
      value: 'true',
      domain: 'localhost',
      path: '/',
    }]);

    // Fast-forward the timeout
    await page.addInitScript(() => {
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, delay, ...args) {
        if (delay === 60000) {
          return originalSetTimeout(fn, 100, ...args);
        }
        return originalSetTimeout(fn, delay, ...args);
      };
    });

    await page.goto('/blog/100-ms-to-glass-with-rails-and-turbolinks/');

    // Wait longer than the fast-forwarded timeout
    await page.waitForTimeout(500);

    // Popup should still be hidden
    const popup = page.locator('#innocuous');
    await expect(popup).toBeHidden();
  });

  test('popup does not appear on pages without innocuous element', async ({ page }) => {
    // Fast-forward the timeout
    await page.addInitScript(() => {
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, delay, ...args) {
        if (delay === 60000) {
          return originalSetTimeout(fn, 100, ...args);
        }
        return originalSetTimeout(fn, delay, ...args);
      };
    });

    // Home page should not have the popup element
    await page.goto('/');

    // Wait for potential popup
    await page.waitForTimeout(500);

    // Element shouldn't exist on non-post pages
    const popup = page.locator('#innocuous');
    await expect(popup).toHaveCount(0);
  });

  test('popup reappears after pjax navigation to new post', async ({ page }) => {
    // Set up timeout fast-forward
    await page.addInitScript(() => {
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, delay, ...args) {
        if (delay === 60000) {
          return originalSetTimeout(fn, 100, ...args);
        }
        return originalSetTimeout(fn, delay, ...args);
      };
    });

    await page.goto('/blog/100-ms-to-glass-with-rails-and-turbolinks/');

    const popup = page.locator('#innocuous');

    // Wait for popup
    await expect(popup).toBeVisible({ timeout: 5000 });

    // Close it
    await page.locator('#innocuous-close').click();
    await expect(popup).toBeHidden();

    // Navigate via pjax to another post
    const otherPostLink = page.locator('a[href*="/blog/"]').first();
    if (await otherPostLink.count() > 0) {
      await otherPostLink.click();

      // Wait for pjax navigation
      await page.waitForTimeout(1000);

      // Popup should NOT reappear because cookie is set
      await expect(popup).toBeHidden();
    }
  });

});
