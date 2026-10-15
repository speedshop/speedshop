const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const format = value => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);

function readMeasurements() {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/threadpilot_scenarios.json'), 'utf8'));
  expect(index.schemaVersion).toBe(2);
  expect(index.complete).toBe(true);
  expect(index.validation).toBe(false);
  expect(index.samplingHz).toBe(20);
  expect(index.failures).toEqual([]);
  const summaries = new Map();
  for (const [kind, workloads] of Object.entries(index.scenarios)) {
    for (const [io, workload] of Object.entries(workloads)) {
      expect(workload.latencyWindow).toBe('individual');
      for (const [configuration, metadata] of Object.entries(workload.runs)) {
        const body = fs.readFileSync(path.join(root, metadata.dataUrl));
        expect(crypto.createHash('sha256').update(body).digest('hex')).toBe(metadata.dataSha256);
        const run = JSON.parse(body);
        expect(run.status).toBe('success');
        expect(run.summary).toEqual(metadata.summary);
        expect(run.provenance).toEqual(metadata.provenance);
        expect(run.observations.invalidEvents).toBe(0);
        expect(run.observations.invalidLatencyObservations).toBe(0);
        expect(run.observations.effectiveHz).toBeGreaterThanOrEqual(19.5);
        expect(run.latency).toHaveLength(run.summary.completed);
        expect(run.ioRatio).toHaveLength(run.summary.completed);
        expect(run.summary.throughput).toBe(run.summary.completed / run.duration);
        const sorted = run.latency.map(point => point[1]).sort((a, b) => a - b);
        for (const [metric, fraction] of [['median', 0.5], ['p99', 0.99]]) {
          const position = (sorted.length - 1) * fraction;
          const value = sorted[Math.floor(position)] + (sorted[Math.ceil(position)] - sorted[Math.floor(position)]) * (position - Math.floor(position));
          expect(run.summary[metric]).toBe(value);
        }
        summaries.set(`${kind}/${io}/${configuration}`, run.summary);
      }
    }
  }
  expect(summaries.size).toBe(54);
  return summaries;
}

test('every real workload and fixed selector uses the published full-run measurements', async ({ page }) => {
  test.setTimeout(180000);
  const summaries = readMeasurements();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/threadpilot.html');
  for (const count of [1, 3, 5, 10, 25]) {
    await page.locator('[data-scenario="high"] .threadpilot-baseline-control').getByText(String(count), { exact: true }).click();
    for (const kind of ['high', 'low', 'changing']) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      for (const io of kind === 'low' ? [10, 20, 30] : [70, 80, 90]) {
        await section.locator('.threadpilot-workload-control').getByText(`${io}%`, { exact: true }).click();
        await expect(section).toHaveAttribute('data-source', 'measured');
        await expect(section).toHaveAttribute('data-baseline', String(count));
        await expect(section).toHaveAttribute('data-workload', String(io));
        const adaptive = summaries.get(`${kind}/${io}/adaptive`);
        const fixed = summaries.get(`${kind}/${io}/${count}`);
        await expect(section.locator('[data-throughput-detail]')).toHaveText(`${format(adaptive.throughput)} vs ${format(fixed.throughput)} ${kind === 'high' ? 'requests/s' : 'jobs/s'}`);
        await expect(section.locator('[data-throughput-claim]')).toHaveText(`${(adaptive.throughput / fixed.throughput).toFixed(1)}x`);
        await expect(section.locator('[data-latency-detail]')).toHaveText(`${format(adaptive.latency)} vs ${format(fixed.latency)} ms`);
        await expect(section.locator('[data-latency-heading]')).toContainText(kind === 'high' ? 'whole-run median' : 'whole-run p99');
        await expect(section.locator('[data-capacity-detail]')).toHaveText(`Estimated ${kind === 'high' ? 'Puma' : 'Sidekiq'} process count for same load`);
      }
    }
  }
  expect(errors).toEqual([]);
});

test('real individual latency scatter retains all observations on mobile', async ({ page }) => {
  const summaries = readMeasurements();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const fillStyle = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'fillStyle');
    Object.defineProperty(CanvasRenderingContext2D.prototype, 'fillStyle', {
      ...fillStyle,
      set(value) {
        fillStyle.set.call(this, value);
        if (this.canvas.dataset.chart !== 'latency') return;
        this.canvas.plotted ||= { cyan: 0, magenta: 0 };
        if (this.fillStyle === '#55ffff') this.canvas.plotted.cyan = 0;
        if (this.fillStyle === '#ff55ff') this.canvas.plotted.magenta = 0;
      },
    });
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
  await page.goto('/threadpilot.html');
  for (const kind of ['high', 'low', 'changing']) {
    const io = kind === 'low' ? 10 : 90;
    const section = page.locator(`[data-scenario="${kind}"]`);
    await expect(section).toHaveAttribute('data-source', 'measured');
    const canvas = section.locator('[data-chart="latency"]');
    await expect(canvas).toHaveAttribute('aria-label', /Individual request\/job observations shown as scatter points/);
    await expect.poll(() => canvas.evaluate(canvas => canvas.plotted)).toEqual({ cyan: summaries.get(`${kind}/${io}/adaptive`).completed, magenta: summaries.get(`${kind}/${io}/5`).completed });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
