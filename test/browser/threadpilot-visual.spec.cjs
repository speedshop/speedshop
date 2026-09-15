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
    await frame.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(frame.getByRole("status")).toHaveText("Paused");
    const frames = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(150);
    await expect(canvas).toHaveAttribute("data-frames", frames);
    await frame.getByRole("button", { name: "Play", exact: true }).click();
    await expect.poll(async () => Number(await canvas.getAttribute("data-frames"))).toBeGreaterThan(Number(frames));
    await expect(frame.locator("audio")).toHaveJSProperty("paused", true);
    await frame.getByRole("button", { name: "Play music", exact: true }).click();
    await expect(frame.locator("audio")).toHaveJSProperty("paused", false);
    await frame.getByRole("button", { name: "Pause music", exact: true }).click();
    await expect(frame.locator("audio")).toHaveJSProperty("paused", true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/threadpilot-visual-${viewport.width}.png` });
  });
}

test("reduced motion waits for explicit playback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/threadpilot.html");
  const frame = page.frameLocator(".threadpilot-hero-visual");
  await expect(frame.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(frame.locator("video")).toHaveJSProperty("paused", true);
  await frame.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => Number(await frame.locator("canvas").getAttribute("data-frames"))).toBeGreaterThan(0);
});
