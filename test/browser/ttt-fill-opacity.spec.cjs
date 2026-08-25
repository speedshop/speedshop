// @ts-check
const { test, expect } = require('@playwright/test');

test('renders hex palette area fills at 16% opacity', async ({ page }) => {
  await page.goto('/?viz=dazzle');

  const areaFillStyles = await page.evaluate(async () => {
    const contextPrototype = CanvasRenderingContext2D.prototype;
    const fillStyle = Object.getOwnPropertyDescriptor(contextPrototype, 'fillStyle');
    const fill = contextPrototype.fill;
    const palette = new Set(['255, 209, 102', '255, 107, 107', '6, 214, 160', '255, 159, 67']);
    const styles = [];

    Object.defineProperty(contextPrototype, 'fillStyle', {
      ...fillStyle,
      set(value) {
        fillStyle.set.call(this, value);
      },
    });
    contextPrototype.fill = function (...args) {
      const match = this.fillStyle.match(/^rgba\((\d+, \d+, \d+), (.+)\)$/);
      if (match && palette.has(match[1])) styles.push(this.fillStyle);
      return fill.apply(this, args);
    };

    await import('/assets/js/viz/ttt.js?fill-opacity-test');
    return styles;
  });

  expect(areaFillStyles).toHaveLength(15);
  for (const style of areaFillStyles) expect(style).toMatch(/, 0\.16\)$/);
});
