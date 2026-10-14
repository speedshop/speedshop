// @ts-check
const { test, expect } = require("@playwright/test");

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Threadpilot visualization plays at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const musicRequests = [];
    const stillRequests = [];
    page.on("request", request => {
      if (request.url().endsWith("/dist/music.m4a")) musicRequests.push(request);
      if (request.url().endsWith("/still.jpg")) stillRequests.push(request);
    });
    await page.goto("/threadpilot.html");
    const frame = page.frameLocator(".threadpilot-fold-word iframe").first();
    const canvas = frame.locator("canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
    await expect.poll(async () => Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(2);
    await expect(frame.getByRole("button")).toHaveCount(0);
    await expect(frame.getByRole("status")).toHaveCount(0);
    const music = page.locator("#threadpilot-music");
    await expect(music).toHaveJSProperty("paused", true);
    await expect(music).not.toHaveAttribute("src");
    expect(musicRequests).toHaveLength(0);
    expect(stillRequests).toHaveLength(0);
    const toggle = page.getByRole("button", { name: "Unmute music", exact: true });
    const before = await toggle.boundingBox();
    expect(before.x + before.width).toBeCloseTo(viewport.width - 12, 0);
    expect(before.y).toBeCloseTo(12, 0);
    await toggle.click();
    await expect(music).toHaveJSProperty("paused", false);
    expect(musicRequests.length).toBeGreaterThan(0);
    expect(musicRequests[0].resourceType()).toBe("media");
    expect(musicRequests[0].headers().range).toMatch(/^bytes=/);
    await expect.poll(() => music.evaluate(audio => audio.currentTime)).toBeGreaterThan(0);
    await expect(page.locator("#threadpilot-audio-toggle")).toHaveAttribute("data-muted", "false");
    await page.getByRole("button", { name: "Mute music", exact: true }).click();
    await expect(music).toHaveJSProperty("paused", true);
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
    const frame = page.frameLocator(".threadpilot-fold-word iframe").first();
    const canvas = frame.locator("canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true");
    await expect(canvas).toHaveAttribute("aria-label", "Static ASCII artwork");
    await expect(canvas).not.toHaveAttribute("data-frames");
    const pixels = await canvas.evaluate(canvas => canvas.toDataURL());
    await page.waitForTimeout(300);
    expect(await canvas.evaluate(canvas => canvas.toDataURL())).toBe(pixels);
    const widthBefore = await canvas.evaluate(canvas => canvas.width);
    await page.setViewportSize({ width: viewport.width + 20, height: viewport.height });
    const frameWidth = async () => Math.round((await page.locator(".threadpilot-fold-word iframe").first().boundingBox()).width);
    await expect.poll(async () => (await canvas.evaluate(canvas => canvas.width)) === await frameWidth()).toBe(true);
    expect(await canvas.evaluate(canvas => canvas.width)).toBeGreaterThan(widthBefore);
    await expect(frame.locator("video")).toHaveJSProperty("paused", true);
    expect(requests.filter(url => url.endsWith(".mp4"))).toHaveLength(0);
    expect(requests.filter(url => url.endsWith("/still.jpg"))).toHaveLength(viewport.width < 640 ? 1 : 4);
    await expect(frame.getByRole("button")).toHaveCount(0);
  });
}
