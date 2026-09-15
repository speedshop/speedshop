import { createNoiseRenderer } from './noise-renderer.js';

export function createRenderer(canvas, settings = {}) {
  const {noise = {strength: 85, rate: 12}, ...rendererSettings} = settings;
  return createNoiseRenderer(canvas, rendererSettings, noise, true);
}
