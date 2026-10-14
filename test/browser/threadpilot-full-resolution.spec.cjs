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
  return { schemaVersion: 2, validation: false, complete: true, scenarios };
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

test('never presents validation exports as measured comparisons', async ({ page }) => {
  const data = dataset();
  data.validation = true;
  await serve(page, data);
  for (const kind of ['high', 'low', 'changing']) {
    await expect(page.locator(`[data-scenario="${kind}"]`)).toHaveAttribute('data-source', 'estimated');
  }
});
