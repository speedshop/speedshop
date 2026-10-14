const { test, expect } = require('@playwright/test');

const scenarios = ['high', 'low', 'changing'];

async function select(section, control, value) {
  await section.locator(`.threadpilot-${control}-control`).getByText(String(value), { exact: true }).click();
}

test.describe('Threadpilot interactive illustrations', () => {
  test('synchronizes every baseline selector and redraws every comparison', async ({ page }) => {
    await page.goto('/threadpilot.html');
    await expect(page.locator('[data-scenario]')).toHaveCount(3);
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

  test('shows throughput ties without hiding latency benefits or modeling failures', async ({ page }) => {
    await page.goto('/threadpilot.html');
    const low = page.locator('[data-scenario="low"]');
    await select(low, 'baseline', 25);
    await expect(low.locator('[data-throughput-claim]')).toHaveText('Similar throughput');
    await expect(low.locator('[data-latency-claim]')).toContainText('lower');
    await expect(low.locator('[data-capacity-claim]')).toHaveText('Similar capacity');
    for (const kind of scenarios) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      for (const count of [1, 3, 5, 10, 25]) {
        await select(section, 'baseline', count);
        for (const ratio of kind === 'low' ? [10, 20, 30] : [70, 80, 90]) {
          await select(section, 'workload', `${ratio}%`);
          await expect(section.locator('.threadpilot-scenario-result')).not.toContainText(/NaN|Infinity|undefined/);
          await expect(section.locator('[data-throughput-claim]')).not.toBeEmpty();
          await expect(section.locator('[data-latency-claim]')).not.toBeEmpty();
        }
      }
    }
  });

  test('labels estimates and keeps measured references separate', async ({ page }) => {
    await page.goto('/threadpilot.html');
    for (const kind of scenarios) {
      const section = page.locator(`[data-scenario="${kind}"]`);
      await expect(section.locator('.threadpilot-scenario-disclosure')).toContainText('not a measured benchmark');
      await expect(section.locator('.threadpilot-scenario-method')).toContainText('not a cloud-bill prediction');
      await section.getByText('What have we measured so far?', { exact: true }).click();
      await expect(section.locator('.threadpilot-scenario-reference')).toContainText('Every plotted curve and changing claim above is illustrative');
      await expect(section.getByRole('link', { name: 'Read the measured run' })).toBeVisible();
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
