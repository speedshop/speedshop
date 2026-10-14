const { test, expect } = require('@playwright/test');

function dataset() {
  const scenarios = {};
  for (const kind of ['high', 'low', 'changing']) {
    scenarios[kind] = {};
    for (const io of kind === 'low' ? [10, 20, 30] : [70, 80, 90]) {
      const runs = {};
      for (const configuration of ['1', '3', '5', '10', '25', 'adaptive']) {
        const adaptive = configuration === 'adaptive';
        const duration = adaptive ? 60 : 100;
        const threads = adaptive ? 7 : Number(configuration);
        const phases = kind === 'changing' ? [
          { id: 0, io: 10, start: 0, end: duration * 0.25 },
          { id: 1, io, start: duration * 0.24, end: duration * 0.5 },
          { id: 2, io: 10, start: duration * 0.5, end: duration * 0.75 },
          { id: 3, io, start: duration * 0.75, end: duration },
        ] : [];
        runs[configuration] = {
          status: 'success', duration, phases,
          ioBands: phases.filter(phase => phase.io >= 50).map(phase => [phase.start, phase.end]),
          threads: [[0, threads], [0.050017, threads], [duration, threads]],
          throughput: [[0, 0], [0.050017, io + threads], [duration, io + threads]],
          latency: [[0.123456, 3000], [duration * 0.4, 25], [duration * 0.8, 100]],
          summary: { throughput: io + threads, latency: 100 },
        };
      }
      scenarios[kind][io] = { io, latencyWindow: 'individual', runs };
    }
  }
  return { schemaVersion: 2, samplingHz: 20, validation: false, complete: true, scenarios };
}

async function serve(page, data) {
  await page.route('**/assets/data/threadpilot_scenarios.json', route => route.fulfill({ json: data }));
  await page.goto('/threadpilot.html');
}

test('uses schema2 measured data for every workload and synchronized fixed selector', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await serve(page, dataset());
  for (const count of [1, 3, 5, 10, 25]) {
    await page.locator('[data-scenario="high"] .threadpilot-baseline-control').getByText(String(count), { exact: true }).click();
    for (const kind of ['high', 'low', 'changing']) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      for (const io of kind === 'low' ? [10, 20, 30] : [70, 80, 90]) {
        await section.locator('.threadpilot-workload-control').getByText(`${io}%`, { exact: true }).click();
        await expect(section).toHaveAttribute('data-source', 'measured');
        await expect(section).toHaveAttribute('data-baseline', String(count));
        await expect(section.locator('[data-throughput-detail]')).toHaveText(`${io + 7} vs ${io + count} ${kind === 'high' ? 'requests/s' : 'jobs/s'}`);
        await expect(section.locator('[data-throughput-claim]')).toHaveText(`${((io + 7) / (io + count)).toFixed(1)}x`);
        await expect(section.locator('[data-latency-axis]')).toContainText('individual observations');
        await expect(section.locator('[data-chart="latency"]')).toHaveAttribute('aria-label', /Individual request\/job observations shown as scatter points/);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('plots every dense individual latency observation without a point cap', async ({ page }) => {
  const data = dataset();
  for (const run of Object.values(data.scenarios.high[90].runs)) {
    run.duration = 120;
    run.threads = Array.from({ length: 2401 }, (_, index) => [index / 20, 5]);
    run.throughput = Array.from({ length: 2401 }, (_, index) => [index / 20, 40]);
    run.latency = Array.from({ length: 10001 }, (_, index) => [index / 100, 25 + index % 100]);
  }
  await page.addInitScript(() => {
    const fillRect = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (...args) {
      if (this.canvas.dataset.chart === 'latency') {
        if (this.fillStyle === '#ffffff') this.canvas.plotted = { cyan: 0, magenta: 0 };
        if (this.fillStyle === '#55ffff') this.canvas.plotted.cyan += 1;
        if (this.fillStyle === '#ff55ff') this.canvas.plotted.magenta += 1;
      }
      return fillRect.apply(this, args);
    };
  });
  await serve(page, data);
  const canvas = page.locator('[data-scenario="high"] [data-chart="latency"]');
  await expect(canvas).toHaveAttribute('aria-label', /Measured comparison/);
  await expect.poll(() => canvas.evaluate(canvas => canvas.plotted)).toEqual({ cyan: 10001, magenta: 10001 });
});

test('labels the two independently timed changing runs in their own colors', async ({ page }) => {
  await page.addInitScript(() => {
    window.phaseLabels = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
      if (/^(TP|Fixed) (CPU|I\/O|Mixed|Idle)$/.test(text)) window.phaseLabels.push(text);
      return fillText.call(this, text, ...args);
    };
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await serve(page, dataset());
  const section = page.locator('[data-scenario="changing"]');
  await expect(section.locator('[data-chart="threads"]')).toHaveAttribute('aria-label', /each run's own timing/);
  expect(await page.evaluate(() => [...new Set(window.phaseLabels)])).toEqual(expect.arrayContaining(['TP CPU', 'TP I/O', 'Fixed CPU', 'Fixed I/O']));
  const ends = await section.locator('[data-chart="threads"]').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const rightmost = [0, 0];
    for (let pixel = 0; pixel < pixels.length; pixel += 4) {
      const color = pixels.slice(pixel, pixel + 3).join(',');
      const index = color === '85,255,255' ? 0 : color === '255,85,255' ? 1 : -1;
      if (index >= 0) rightmost[index] = Math.max(rightmost[index], (pixel / 4) % canvas.width);
    }
    return rightmost.map(x => x / canvas.width);
  });
  expect(ends[0]).toBeLessThan(0.7);
  expect(ends[1]).toBeGreaterThan(0.9);
});

test('leaves missing timed observations unconnected and labels whole-run summaries separately', async ({ page }) => {
  await serve(page, dataset());
  const section = page.locator('[data-scenario="high"]');
  await expect(section.locator('[data-latency-heading]')).toHaveText('Measured request queueing (whole-run median)');
  const pixels = await section.locator('[data-chart="throughput"]').evaluate(canvas => {
    const dpr = devicePixelRatio;
    const ctx = canvas.getContext('2d');
    const max = 97 * 1.15;
    const left = Math.max(Math.round(48 * dpr), Math.ceil(ctx.measureText(new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(max)).width + 12 * dpr));
    const right = canvas.width - Math.round(16 * dpr);
    const top = Math.round(28 * dpr);
    const bottom = canvas.height - Math.round(28 * dpr);
    const y = Math.round(bottom - 97 / max * (bottom - top));
    return [30, 60].map(time => Array.from(ctx.getImageData(Math.round(left + time / 100 * (right - left)), y, 1, 1).data).slice(0, 3));
  });
  expect(pixels[0]).not.toEqual([85, 255, 255]);
  expect(pixels[1]).toEqual([85, 255, 255]);
});

test('never presents validation exports as measured comparisons', async ({ page }) => {
  const data = dataset();
  data.validation = true;
  await serve(page, data);
  for (const kind of ['high', 'low', 'changing']) {
    await expect(page.locator(`[data-scenario="${kind}"]`)).toHaveAttribute('data-source', 'estimated');
  }
});
