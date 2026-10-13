// @ts-check
const { test, expect } = require("@playwright/test");

const CHART_IDS = ["chart-threads", "chart-latency", "chart-throughput"];

test.describe("Threadpilot typography", () => {
  test("loads only the heading font and subset italic wordmark", async ({
    page,
  }) => {
    await page.goto("/threadpilot.html");
    await page.evaluate(() => document.fonts.ready);

    const wordmark = page.locator(".threadpilot-hero h1");
    const heading = page.locator(".threadpilot-lead h2");

    await expect(wordmark).toHaveCSS("font-family", /Redaction 70/);
    await expect(wordmark).toHaveCSS("font-style", "italic");
    await expect(wordmark).toHaveCSS("font-weight", "400");
    await expect(heading).toHaveText("Stop guessing your thread count");
    await expect(heading).toHaveCSS("font-family", /Redaction 35/);
    await expect(heading).toHaveCSS("font-style", "normal");
    await expect(heading).toHaveCSS("font-weight", "400");
    await expect(heading.locator("em")).toHaveCount(0);

    const loadedFontUrls = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((url) => url.includes("/assets/fonts/redaction/")),
    );
    expect(loadedFontUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Redaction35-ASCII-Subset.woff2"),
        expect.stringContaining("Redaction70-Wordmark-Subset.woff2"),
      ]),
    );
    expect(loadedFontUrls).toHaveLength(2);
  });
});

test.describe("Threadpilot benchmark preview", () => {
  test("reveals dense single-pixel series from left to right", async ({
    page,
  }) => {
    await page.goto("/threadpilot.html");

    const benchmark = page.locator(".threadpilot-benchmark");
    const canvas = benchmark.locator("canvas");
    await benchmark.scrollIntoViewIfNeeded();
    await expect(benchmark).toHaveAttribute("data-render-state", "drawing");
    await expect
      .poll(async () =>
        Number(await benchmark.getAttribute("data-render-progress")),
      )
      .toBeGreaterThan(0);
    await expect(benchmark).toHaveAttribute("data-render-state", "complete", {
      timeout: 4000,
    });

    const pixelCounts = await canvas.evaluate((element) => {
      if (!(element instanceof HTMLCanvasElement)) return null;
      const context = element.getContext("2d");
      if (!context) return null;
      const pixels = context.getImageData(
        0,
        0,
        element.width,
        element.height,
      ).data;
      let cyan = 0;
      let magenta = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (
          pixels[index] === 85 &&
          pixels[index + 1] === 255 &&
          pixels[index + 2] === 255 &&
          pixels[index + 3] === 255
        )
          cyan += 1;
        if (
          pixels[index] === 255 &&
          pixels[index + 1] === 85 &&
          pixels[index + 2] === 255 &&
          pixels[index + 3] === 255
        )
          magenta += 1;
      }
      return { cyan, magenta, width: element.width };
    });

    expect(pixelCounts).not.toBeNull();
    expect(pixelCounts.cyan).toBeGreaterThan(pixelCounts.width * 0.7);
    expect(pixelCounts.magenta).toBeGreaterThan(pixelCounts.width * 0.7);
  });

  test("renders both series immediately when reduced motion is preferred", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/threadpilot.html");

    const benchmark = page.locator(".threadpilot-benchmark");
    await expect(benchmark).toHaveAttribute("data-render-state", "complete");
    await expect(benchmark).toHaveAttribute("data-render-progress", "1.000");
  });

  test("resizes the canvas at the browser device-pixel ratio", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      deviceScaleFactor: 2,
      viewport: { width: 1200, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/threadpilot.html");
    const canvas = page.locator(".threadpilot-benchmark-canvas");

    for (const viewport of [
      { width: 1200, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(async () =>
          canvas.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return (
              devicePixelRatio === 2 &&
              element.width === Math.round(bounds.width * devicePixelRatio) &&
              element.height === Math.round(bounds.height * devicePixelRatio)
            );
          }),
        )
        .toBe(true);
    }

    await context.close();
  });

  test("keeps the Used by label and client logos in one centered row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/threadpilot.html");

    const row = page.locator(".threadpilot-used-by-row");
    const logos = row.locator("img");
    await expect(logos).toHaveCount(3);
    await expect
      .poll(async () =>
        logos.evaluateAll((images) =>
          images.every((image) => image.complete && image.naturalWidth > 0),
        ),
      )
      .toBe(true);

    const layout = await row.evaluate((element) => {
      const rowBounds = element.getBoundingClientRect();
      const children = [...element.children].map((child) =>
        child.getBoundingClientRect(),
      );
      const centerLines = children.map((child) => child.top + child.height / 2);
      return {
        fits: children.every(
          (child) =>
            child.left >= rowBounds.left && child.right <= rowBounds.right,
        ),
        singleRow:
          getComputedStyle(element).flexDirection === "row" &&
          Math.max(...centerLines) - Math.min(...centerLines) < 2,
      };
    });
    expect(layout).toEqual({ fits: true, singleRow: true });
  });
});

test.describe("Threadpilot charts", () => {
  test("renders benchmark charts", async ({ page }) => {
    await page.goto("/threadpilot.html");

    for (const id of CHART_IDS) {
      const chart = page.locator(`#${id}`);
      await expect(chart).toBeVisible();

      const size = await chart.evaluate((canvas) => ({
        height: canvas instanceof HTMLCanvasElement ? canvas.height : 0,
        width: canvas instanceof HTMLCanvasElement ? canvas.width : 0,
      }));

      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);
    }
  });

  test("draws chart data onto each canvas", async ({ page }) => {
    await page.goto("/threadpilot.html");

    for (const id of CHART_IDS) {
      await expect(page.locator(`#${id}`)).toBeVisible();

      const hasPaintedPixels = await page
        .locator(`#${id}`)
        .evaluate((canvas) => {
          if (!(canvas instanceof HTMLCanvasElement)) return false;

          const context = canvas.getContext("2d");
          if (!context || canvas.width === 0 || canvas.height === 0)
            return false;

          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          return pixels.some((channel) => channel !== 0);
        });

      expect(hasPaintedPixels).toBe(true);
    }
  });
});
