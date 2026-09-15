import { createNoiseRenderer } from './noise-renderer.js';

const approvedNoise = {strength: 85, rate: 12};

export function createRenderer(canvas, settings = {}) {
  return createNoiseRenderer(canvas, settings, approvedNoise);
}
