// @ts-check
const { test, expect } = require("@playwright/test");

const CHART_IDS = ["chart-threads", "chart-latency", "chart-throughput"];

test.describe("Threadpilot typography", () => {
  test("rasterizes every heading at device resolution without changing layout or selection", async ({ browser }) => {
    for (const density of [1, 2, 1.5]) {
      const context = await browser.newContext({ deviceScaleFactor: density, reducedMotion: "reduce" });
      const page = await context.newPage();
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.route("**/threadpilot_headings.js", route => route.abort());
        await page.goto("/threadpilot.html");
        await page.evaluate(() => document.fonts.ready);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const selector = ".threadpilot-page h2, .threadpilot-page h3, .threadpilot-page h4";
        const boxes = () => page.locator(selector).evaluateAll(headings => headings.map(heading => heading.getBoundingClientRect().toJSON()));
        const before = await boxes();
        await page.unroute("**/threadpilot_headings.js");
        await page.addScriptTag({ url: "/assets/js/threadpilot_headings.js" });
        await expect(page.locator(".threadpilot-raster-heading")).toHaveCount(before.length);
        expect(await boxes()).toEqual(before);
        const checkPixels = () => page.locator(selector).evaluateAll(headings => headings.every(heading => {
          const canvas = heading.querySelector("canvas");
          if (!canvas || canvas.getAttribute("aria-hidden") !== "true") return false;
          const bounds = canvas.getBoundingClientRect();
          if (Math.abs(canvas.width - bounds.width * devicePixelRatio) > 0.02 ||
              Math.abs(canvas.height - bounds.height * devicePixelRatio) > 0.02 ||
              Math.abs((bounds.left + scrollX) * devicePixelRatio - Math.round((bounds.left + scrollX) * devicePixelRatio)) > 0.02 ||
              Math.abs((bounds.top + scrollY) * devicePixelRatio - Math.round((bounds.top + scrollY) * devicePixelRatio)) > 0.02) return false;
          const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let ink = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] === 0) continue;
            if (pixels[index] !== 255 || pixels[index + 1] !== 255 || pixels[index + 2] !== 255 || pixels[index + 3] !== 255) return false;
            ink += 1;
          }
          return ink > 0;
        }));
        await expect.poll(checkPixels).toBe(true);
        const selected = await page.locator(".threadpilot-lead h2").evaluate(heading => {
          const range = document.createRange();
          range.selectNodeContents(heading);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          const result = { text: selection.toString(), color: getComputedStyle(heading, "::selection").backgroundColor };
          selection.removeAllRanges();
          return result;
        });
        expect(selected).toEqual({ text: "Stop guessing your thread count", color: "rgb(255, 85, 255)" });
        await page.setViewportSize({ width: viewport.width + 20, height: viewport.height });
        await expect.poll(checkPixels).toBe(true);
      }
      await context.close();
    }
  });

  test("loads only the heading font and a hard-edged SVG wordmark", async ({
    page,
  }) => {
    await page.goto("/threadpilot.html");
    await page.evaluate(() => document.fonts.ready);

    const wordmark = page.locator(".threadpilot-hero h1");
    const heading = page.locator(".threadpilot-lead h2");

    await expect(wordmark).toHaveAttribute("aria-label", "Threadpilot");
    await expect(wordmark.locator("svg")).toHaveAttribute("shape-rendering", "crispEdges");
    await expect(wordmark.locator("svg path")).toHaveCount(11);
    await expect(page.locator(".threadpilot-topbar svg")).toHaveCSS("shape-rendering", "crispedges");
    const audioToggle = page.locator("#threadpilot-audio-toggle");
    await expect(audioToggle).toHaveCSS("border-radius", "0px");
    await expect(audioToggle.locator("svg")).toHaveAttribute("shape-rendering", "crispEdges");
    await expect(audioToggle.locator("path")).toHaveCount(0);
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
      ]),
    );
    expect(loadedFontUrls).toHaveLength(1);
  });
});

test("snaps the hero and frame to device pixels without changing cell scale", async ({ browser }) => {
  for (const density of [1, 2, 1.5]) {
    const context = await browser.newContext({
      deviceScaleFactor: density,
      reducedMotion: "reduce",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await page.goto("/threadpilot.html");
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect.poll(() => page.evaluate(() => {
        const topbar = document.querySelector(".threadpilot-topbar").getBoundingClientRect();
        const hero = document.querySelector(".threadpilot-hero").getBoundingClientRect();
        const frame = document.querySelector(".threadpilot-hero-visual").getBoundingClientRect();
        const density = devicePixelRatio;
        const cell = Math.round(8 * density);
        return [topbar.height, hero.top, hero.height, frame.top, frame.height].every(value =>
          Math.abs(value * density - Math.round(value * density)) < 0.02) &&
          Math.abs(hero.height * density / cell - Math.round(hero.height * density / cell)) < 0.002 &&
          Math.abs(frame.height - hero.height) < 0.02 && Math.abs(frame.top - hero.top) < 0.02;
      })).toBe(true);
    }
    await context.close();
  }
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

  test("resizes every canvas to exact device pixels using only the four-color palette", async ({
    browser,
  }) => {
    for (const density of [2, 1.5]) {
      const context = await browser.newContext({
        deviceScaleFactor: density,
        reducedMotion: "reduce",
        viewport: { width: 1200, height: 900 },
      });
      const page = await context.newPage();
      await page.goto("/threadpilot.html");

      for (const viewport of [
        { width: 1200, height: 900 },
        { width: 390, height: 844 },
      ]) {
        await page.setViewportSize(viewport);
        for (const selector of [".threadpilot-benchmark-canvas", ...CHART_IDS.map((id) => `#${id}`)]) {
          const canvas = page.locator(selector);
          await expect.poll(() => canvas.evaluate((element) => {
            if (!(element instanceof HTMLCanvasElement)) return false;
            const bounds = element.getBoundingClientRect();
            return element.width > 100 && element.height > 100 &&
              Math.abs(element.width - bounds.width * devicePixelRatio) < 0.001 &&
              Math.abs(element.height - bounds.height * devicePixelRatio) < 0.001 &&
              Math.abs((bounds.left + scrollX) * devicePixelRatio - Math.round((bounds.left + scrollX) * devicePixelRatio)) < 0.01 &&
              Math.abs((bounds.top + scrollY) * devicePixelRatio - Math.round((bounds.top + scrollY) * devicePixelRatio)) < 0.01;
          })).toBe(true);

          const readColors = () => canvas.evaluate((element) => {
            if (!(element instanceof HTMLCanvasElement)) return [];
            const pixels = element.getContext("2d").getImageData(0, 0, element.width, element.height).data;
            const colors = new Set();
            for (let index = 0; index < pixels.length; index += 4) {
              colors.add(Array.from(pixels.slice(index, index + 4)).join(","));
            }
            return [...colors];
          });
          await expect.poll(readColors).toEqual(expect.arrayContaining(["255,255,255,255", "85,255,255,255", "255,85,255,255"]));
          const colors = await readColors();
          expect(colors.every((color) => ["0,0,0,0", "0,0,0,255", "255,255,255,255", "85,255,255,255", "255,85,255,255"].includes(color))).toBe(true);
        }
      }
      await context.close();
    }
  });

  test("keeps the Used by label and client logos in one centered row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/threadpilot.html");

    const row = page.locator(".threadpilot-used-by-row");
    const logos = row.locator("img");
    await expect(logos).toHaveCount(3);
    for (const logo of await logos.all()) {
      await expect(logo).toHaveCSS("opacity", "1");
      await expect(logo).toHaveCSS("filter", "none");
    }
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
