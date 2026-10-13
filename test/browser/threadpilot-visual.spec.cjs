// @ts-check
const { test, expect } = require("@playwright/test");

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Threadpilot visualization plays at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const stillRequests = [];
    page.on("request", request => {
      if (/\/still-(desktop|portrait)\.png$/.test(request.url())) stillRequests.push(request);
    });
    await page.goto("/threadpilot.html");
    const frame = page.frameLocator(".threadpilot-hero-visual");
    const canvas = frame.locator("canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
    await expect.poll(async () => Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(2);
    await expect(frame.getByRole("button")).toHaveCount(0);
    await expect(frame.getByRole("status")).toHaveCount(0);
    await expect(frame.locator("audio")).toHaveJSProperty("paused", true);
    expect(stillRequests).toHaveLength(0);
    const toggle = page.getByRole("button", { name: "Unmute music", exact: true });
    const before = await toggle.boundingBox();
    expect(before.x + before.width).toBeCloseTo(viewport.width - 12, 0);
    expect(before.y).toBeCloseTo(12, 0);
    await toggle.click();
    await expect(frame.locator("audio")).toHaveJSProperty("paused", false);
    await expect(page.locator("#threadpilot-audio-toggle")).toHaveAttribute("data-muted", "false");
    await page.getByRole("button", { name: "Mute music", exact: true }).click();
    await expect(frame.locator("audio")).toHaveJSProperty("paused", true);
    await expect(toggle).toHaveAttribute("data-muted", "true");
    await page.evaluate(() => window.scrollBy(0, 900));
    const after = await toggle.boundingBox();
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`reduced motion displays selected artwork at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const requests = [];
    page.on("request", request => requests.push(request.url()));
    await page.goto("/threadpilot.html");
    const frame = page.frameLocator(".threadpilot-hero-visual");
    const image = frame.getByRole("img", { name: "Static ASCII artwork" });
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(image).toHaveJSProperty("currentSrc", new URL(`/assets/threadpilot-visual/still-${viewport.width === 390 ? "portrait" : "desktop"}.png`, page.url()).href);
    await expect(frame.locator("canvas")).toHaveCount(0);
    await expect(frame.locator("video")).toHaveJSProperty("paused", true);
    expect(requests.filter(url => url.endsWith("/dist/video.mp4"))).toHaveLength(0);
    expect(requests.filter(url => /\/still-(desktop|portrait)\.png$/.test(url))).toHaveLength(1);
    await expect(frame.getByRole("button")).toHaveCount(0);
  });
}
