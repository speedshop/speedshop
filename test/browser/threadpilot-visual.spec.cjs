// @ts-check
const { test, expect } = require("@playwright/test");

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Threadpilot visualization plays at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/threadpilot.html");
    const frame = page.frameLocator(".threadpilot-hero-visual");
    const canvas = frame.locator("canvas");
    await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
    await expect.poll(async () => Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(2);
    await expect(frame.getByRole("button")).toHaveCount(0);
    await expect(frame.getByRole("status")).toHaveCount(0);
    await expect(frame.locator("audio")).toHaveJSProperty("paused", true);
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

test("reduced motion displays a still frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/threadpilot.html");
  const frame = page.frameLocator(".threadpilot-hero-visual");
  await expect(frame.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(frame.locator("video")).toHaveJSProperty("paused", true);
  await expect(frame.getByRole("button")).toHaveCount(0);
});
