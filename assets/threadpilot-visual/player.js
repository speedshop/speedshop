import { createRenderer } from './renderer.js';

const canvas = document.querySelector('canvas');
const video = document.querySelector('video');
const errorMessage = document.querySelector('[role=alert]');
const settings = { size: 4 };
let renderer, frameRequest, mediaURL, stillImage;
let stopped = true, failed = false, lastTime = 0;

function report(error) {
  failed = stopped = true;
  if (frameRequest) cancelAnimationFrame(frameRequest);
  frameRequest = 0;
  errorMessage.hidden = false;
  errorMessage.textContent = `Error: ${error?.message || error || 'Unknown error'}`;
  console.error(error);
}
function draw(now) {
  frameRequest = 0;
  if (stopped || failed) return;
  try {
    if (video.readyState >= 2) {
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.1) : 1 / 30;
      renderer.draw(video, dt);
      canvas.dataset.frames = String(Number(canvas.dataset.frames || 0) + 1);
    }
    lastTime = now;
    frameRequest = requestAnimationFrame(draw);
  } catch (error) { report(error); }
}
function startLoop() {
  if (frameRequest || failed) return;
  stopped = false;lastTime = 0;frameRequest = requestAnimationFrame(draw);
}
function resize(entries) {
  if (!renderer || failed) return;
  const entry = entries?.[0];
  const bounds = entry?.contentRect || canvas.getBoundingClientRect();
  const deviceSize = entry?.devicePixelContentBoxSize?.[0];
  const expectedWidth = Math.round(bounds.width * window.devicePixelRatio);
  const expectedHeight = Math.round(bounds.height * window.devicePixelRatio);
  const width = Math.abs(deviceSize?.inlineSize - expectedWidth) <= 1 ? deviceSize.inlineSize : expectedWidth;
  const height = Math.abs(deviceSize?.blockSize - expectedHeight) <= 1 ? deviceSize.blockSize : expectedHeight;
  renderer.resize(width, height, bounds.width, bounds.height);
  if (stopped && (stillImage || video.readyState >= 2)) renderer.draw(stillImage || video, 0);
}
function observeSize() {
  const observer = new ResizeObserver(resize);
  try { observer.observe(canvas, { box: 'device-pixel-content-box' }); }
  catch { observer.observe(canvas); }
}
async function loadSource(startTime) {
  const response = await fetch(video.currentSrc || video.src);
  if (!response.ok) throw new Error(`Could not load video: ${response.status}`);
  mediaURL = URL.createObjectURL(await response.blob());
  await new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('Could not decode video.')), { once: true });
    video.src = mediaURL;
  });
  await new Promise((resolve, reject) => {
    video.addEventListener('seeked', resolve, { once: true });
    video.addEventListener('error', () => reject(new Error('Could not seek video.')), { once: true });
    video.currentTime = Math.min(startTime, Math.max(0, video.duration - 1));
  });
}
const scene = new URLSearchParams(location.search).get('scene') || '01';
const stillTimes = { '01': 1, '02': 10, '03': 10.5, '04': 4, all: 22.492708333333333 };
async function start() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    stillImage = new Image();
    stillImage.src = `still-${scene}.jpg`;
    stillImage.currentTime = stillTimes[scene];
    [renderer] = await Promise.all([createRenderer(canvas, settings), stillImage.decode()]);
    resize();
    observeSize();
    canvas.setAttribute('aria-label', 'Static ASCII artwork');
    canvas.dataset.ready = 'true';
    return;
  }
  [renderer] = await Promise.all([createRenderer(canvas, settings), loadSource(5.607)]);resize();
  observeSize();
  canvas.dataset.ready = 'true';
  renderer.draw(video, 0);
  try { await video.play();startLoop(); }
  catch (error) {
    if (error.name !== 'NotAllowedError') throw error;
  }
}

video.addEventListener('error', () => report(new Error('Could not load video.')));
canvas.addEventListener('webglcontextlost', event => { event.preventDefault();report(new Error('Renderer lost - reload to continue.')); });
window.addEventListener('error', event => report(event.error || event.message));
window.addEventListener('unhandledrejection', event => report(event.reason));
window.addEventListener('pagehide', () => { stopped = true;renderer?.destroy();if (mediaURL) URL.revokeObjectURL(mediaURL); }, { once: true });
start().catch(report);
