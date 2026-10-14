const { test, expect } = require('@playwright/test');

const scenarios = ['high', 'low', 'changing'];

async function select(section, control, value) {
  await section.locator(`.threadpilot-${control}-control`).getByText(String(value), { exact: true }).click();
}

test.describe('Threadpilot interactive comparisons', () => {
  test('synchronizes every baseline selector and redraws every comparison', async ({ page }) => {
    await page.goto('/threadpilot.html');
    await expect(page.locator('[data-scenario]')).toHaveCount(3);
    await expect(page.locator('[data-scenario="high"] [data-throughput-claim]')).toHaveText('1.6x');
    for (const [index, count] of [1, 3, 5, 10, 25].entries()) {
      const source = page.locator(`[data-scenario="${scenarios[index % 3]}"]`);
      await select(source, 'baseline', count);
      for (const kind of scenarios) {
        const section = page.locator(`[data-scenario="${kind}"]`);
        await expect(section).toHaveAttribute('data-baseline', String(count));
        await expect(section.locator(`[data-baseline][value="${count}"]`)).toBeChecked();
        await expect(section.locator('[data-baseline]:checked')).toHaveCount(1);
        await expect(section.locator('[data-baseline-label]')).toContainText(`Fixed · ${count}`);
        await expect(section.locator('[data-chart="throughput"]')).toHaveAttribute('aria-label', new RegExp(`${count} fixed threads`));
      }
    }
  });

  test('keeps workloads independent and updates numbers and plotted curves', async ({ page }) => {
    await page.goto('/threadpilot.html');
    const high = page.locator('[data-scenario="high"]');
    const before = await high.locator('[data-throughput-detail]').textContent();
    const curve = await high.locator('[data-chart="throughput"]').evaluate(canvas => canvas.toDataURL());
    await select(high, 'workload', '70%');
    await expect(high).toHaveAttribute('data-workload', '70');
    await expect(high.locator('[data-throughput-detail]')).not.toHaveText(before);
    expect(await high.locator('[data-chart="throughput"]').evaluate(canvas => canvas.toDataURL())).not.toBe(curve);
    await expect(page.locator('[data-scenario="low"]')).toHaveAttribute('data-workload', '10');
    await expect(page.locator('[data-scenario="changing"]')).toHaveAttribute('data-workload', '90');
  });

  test('shows throughput ties and latency regressions without modeling failures', async ({ page }) => {
    await page.goto('/threadpilot.html');
    const low = page.locator('[data-scenario="low"]');
    await select(low, 'baseline', 5);
    await expect(low.locator('[data-throughput-claim]')).toHaveText('1.0x');
    await expect(low.locator('[data-latency-claim]')).toContainText('higher');
    await expect(low.locator('[data-capacity-claim]')).toHaveText('Similar resources');
    for (const kind of scenarios) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      for (const count of [1, 3, 5, 10, 25]) {
        await select(section, 'baseline', count);
        for (const ratio of kind === 'low' ? [10, 20, 30] : [70, 80, 90]) {
          await select(section, 'workload', `${ratio}%`);
          await expect(section.locator('.threadpilot-scenario-result')).not.toContainText(/NaN|Infinity|undefined/);
          await expect(section.locator('[data-throughput-claim]')).toHaveText(/^\d+\.\dx$/);
          await expect(section.locator('[data-latency-claim]')).not.toBeEmpty();
          const hasWorkload = ratio === (kind === 'low' ? 10 : 90);
          const hasBaseline = (kind === 'high' ? [1, 3] : [1, 5]).includes(count);
          await expect(section).toHaveAttribute('data-source', hasWorkload ? hasBaseline ? 'measured' : 'mixed' : 'estimated');
        }
      }
    }
  });

  test('labels measured and estimated data and retains explainer placeholders', async ({ page }) => {
    await page.goto('/threadpilot.html');
    for (const kind of scenarios) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      await expect(section.locator('[data-throughput-heading]')).toHaveText(`${kind === 'high' ? 'Estimated' : 'Measured'} throughput`);
      await expect(section.locator('[data-adaptive-label]')).toHaveText('Threadpilot · measured');
      await expect(section.locator('.threadpilot-scenario-metrics')).toContainText('Server resources');
      await expect(section.locator('[data-capacity-detail]')).toHaveText(`Estimated ${kind === 'high' ? 'Puma' : 'Sidekiq'} process count for same load`);
      await expect(section.locator('.threadpilot-scenario-explainer')).toHaveText('ADD EXPLAINER HERE');
      await expect(section).not.toContainText('Changes all three illustrations.');
      await expect(section).not.toContainText('Changes only this illustration.');
      await expect(section).not.toContainText('What have we measured so far?');
    }
  });

  test('shows actual results for every measured baseline, including regressions', async ({ page }) => {
    await page.goto('/threadpilot.html');
    const high = page.locator('[data-scenario="high"]');
    const low = page.locator('[data-scenario="low"]');
    const changing = page.locator('[data-scenario="changing"]');
    await expect(changing).toHaveAttribute('data-source', 'measured');
    await expect(changing.locator('[data-workload][value="90"]')).toBeChecked();
    await expect(changing.locator('[data-throughput-claim]')).toHaveText('1.1x');
    await expect(changing.locator('[data-throughput-detail]')).toHaveText('18.3 vs 17.1 jobs/s');
    await expect(changing.locator('[data-latency-detail]')).toHaveText('303.8 vs 463.4 ms');
    await expect(low.locator('[data-throughput-claim]')).toHaveText('1.0x');
    await expect(low.locator('[data-latency-detail]')).toHaveText('2,081.6 vs 473.9 ms');
    await expect(low.locator('[data-latency-claim]')).toContainText('higher');
    await select(high, 'baseline', 3);
    await expect(high).toHaveAttribute('data-source', 'measured');
    await expect(high.locator('[data-throughput-claim]')).toHaveText('3.0x');
    await expect(high.locator('[data-throughput-detail]')).toHaveText('32.1 vs 10.9 requests/s');
    await expect(high.locator('[data-latency-detail]')).toHaveText('244.8 vs 1,555.9 ms');
    await expect(high.locator('[data-chart="latency"]')).toHaveAttribute('aria-label', /Measured comparison.*median queueing/);
    await select(high, 'baseline', 1);
    await expect(high.locator('[data-throughput-claim]')).toHaveText('8.2x');
    await expect(high.locator('[data-latency-detail]')).toHaveText('244.8 vs 4,845.4 ms');
    await expect(low).toHaveAttribute('data-source', 'measured');
    await expect(low.locator('[data-latency-claim]')).toContainText('higher');
    await expect(changing).toHaveAttribute('data-source', 'measured');
    await expect(changing.locator('[data-throughput-claim]')).toHaveText('1.9x');
    await expect(changing.locator('[data-latency-claim]')).toContainText('higher');
    const adaptiveEnd = await changing.locator('[data-chart="threads"]').evaluate(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let rightmost = 0;
      for (let pixel = 0; pixel < pixels.length; pixel += 4) {
        if (pixels[pixel] === 85 && pixels[pixel + 1] === 255 && pixels[pixel + 2] === 255) rightmost = Math.max(rightmost, (pixel / 4) % canvas.width);
      }
      return rightmost / canvas.width;
    });
    expect(adaptiveEnd).toBeGreaterThan(0.45);
    expect(adaptiveEnd).toBeLessThan(0.65);
    await select(high, 'baseline', 5);
    await expect(high).toHaveAttribute('data-source', 'mixed');
    await expect(high.locator('[data-baseline-label]')).toContainText('estimated');
    await expect(high.locator('[data-throughput-detail]')).toHaveText('32.1 vs 20 requests/s');
  });

  test('labels every comparison as estimated when the measured data cannot load', async ({ page }) => {
    await page.route('**/assets/data/threadpilot_scenarios.json', route => route.abort());
    await page.goto('/threadpilot.html');
    for (const kind of scenarios) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      await expect(section).toHaveAttribute('data-source', 'estimated');
      await expect(section.locator('[data-adaptive-label]')).toHaveText('Threadpilot · estimated');
      await expect(section.locator('[data-chart="latency"]')).toHaveAttribute('aria-label', /Estimates, not measured results/);
    }
  });

  test('supports keyboard changes and mobile layout without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/threadpilot.html');
    const high = page.locator('[data-scenario="high"]');
    const radio = high.locator('[data-baseline][value="5"]');
    await radio.focus();
    await radio.press('ArrowRight');
    await expect(page.locator('[data-scenario="changing"]')).toHaveAttribute('data-baseline', '10');
    for (const kind of scenarios) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      await section.scrollIntoViewIfNeeded();
      const bounds = await section.evaluate(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, viewport: innerWidth }));
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
      await expect(section.locator('[data-chart]')).toHaveCount(3);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
