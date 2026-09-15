import { createRenderer } from './renderer.js';

const canvas = document.querySelector('canvas');
const video = document.querySelector('video');
const music = document.querySelector('audio');
const status = document.querySelector('[role=status]');
const play = document.querySelector('#play');
const audioToggle = document.querySelector('#audio-toggle');
let renderer, frameRequest, mediaURL;
let stopped = true, failed = false, lastTime = 0;

function report(error) {
  failed = stopped = true;
  if (frameRequest) cancelAnimationFrame(frameRequest);
  frameRequest = 0;
  status.textContent = `Error: ${error?.message || error || 'Unknown error'}`;
  status.dataset.error = 'true';
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
      status.textContent = 'Live';
    }
    lastTime = now;
    frameRequest = requestAnimationFrame(draw);
  } catch (error) { report(error); }
}
function startLoop() {
  if (frameRequest || failed) return;
  stopped = false;lastTime = 0;frameRequest = requestAnimationFrame(draw);
}
function resize() {
  if (!renderer || failed) return;
  const bounds = canvas.getBoundingClientRect();
  renderer.resize(bounds.width, bounds.height);
  if (stopped && video.readyState >= 2) renderer.draw(video, 0);
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
async function start() {
  [renderer] = await Promise.all([createRenderer(canvas), loadSource(5.607)]);resize();
  new ResizeObserver(resize).observe(document.querySelector('#stage'));
  canvas.dataset.ready = 'true';status.textContent = 'Ready';play.disabled = false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderer.draw(video, 0);
    status.textContent = 'Ready - press Play';
    return;
  }
  try { await video.play();play.textContent = 'Pause';startLoop(); }
  catch (error) {
    if (error.name !== 'NotAllowedError') throw error;
    play.textContent = 'Play';status.textContent = 'Ready - press Play';
  }
}

play.addEventListener('click', async () => {
  if (failed || play.disabled) return;
  try {
    if (video.paused) { await video.play();play.textContent = 'Pause';startLoop(); }
    else { video.pause();play.textContent = 'Play';stopped = true;if (frameRequest) cancelAnimationFrame(frameRequest);frameRequest = 0;status.textContent = 'Paused'; }
  } catch (error) { report(error); }
});
audioToggle.addEventListener('click', async () => { try { if (music.paused) await music.play();else music.pause(); } catch (error) { report(error); } });
music.addEventListener('play', () => { audioToggle.textContent = 'Pause music'; });
music.addEventListener('pause', () => { audioToggle.textContent = 'Play music'; });
video.addEventListener('error', () => report(new Error('Could not load video.')));
music.addEventListener('error', () => report(new Error('Could not load music.')));
canvas.addEventListener('webglcontextlost', event => { event.preventDefault();report(new Error('Renderer lost - reload to continue.')); });
window.addEventListener('error', event => report(event.error || event.message));
window.addEventListener('unhandledrejection', event => report(event.reason));
window.addEventListener('pagehide', () => { stopped = true;renderer?.destroy();if (mediaURL) URL.revokeObjectURL(mediaURL); }, { once: true });
start().catch(report);
