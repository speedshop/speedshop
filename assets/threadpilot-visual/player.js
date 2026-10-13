import { createRenderer } from './renderer.js';

const canvas = document.querySelector('canvas');
const video = document.querySelector('video');
const music = document.querySelector('audio');
const errorMessage = document.querySelector('[role=alert]');
const audioToggle = window.frameElement?.ownerDocument.querySelector('#threadpilot-audio-toggle');
let renderer, frameRequest, mediaURL;
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
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.media = '(max-aspect-ratio: 1/1)';
    source.srcset = 'still-portrait.png';
    const image = document.createElement('img');
    image.alt = 'Static ASCII artwork';
    image.src = 'still-desktop.png';
    picture.append(source, image);
    canvas.replaceWith(picture);
    return;
  }
  [renderer] = await Promise.all([createRenderer(canvas), loadSource(5.607)]);resize();
  new ResizeObserver(resize).observe(document.querySelector('#stage'));
  canvas.dataset.ready = 'true';
  renderer.draw(video, 0);
  try { await video.play();startLoop(); }
  catch (error) {
    if (error.name !== 'NotAllowedError') throw error;
  }
}

if (audioToggle) {
  const controls = new AbortController();
  audioToggle.addEventListener('click', async () => {
    try { if (music.paused) await music.play();else music.pause(); }
    catch (error) { report(error); }
  }, { signal: controls.signal });
  function updateAudioControl() {
    const label = music.paused ? 'Unmute music' : 'Mute music';
    audioToggle.setAttribute('aria-label', label);
    audioToggle.title = label;
    audioToggle.dataset.muted = String(music.paused);
  }
  music.addEventListener('play', updateAudioControl);
  music.addEventListener('pause', updateAudioControl);
  window.addEventListener('pagehide', () => controls.abort(), { once: true });
}
video.addEventListener('error', () => report(new Error('Could not load video.')));
music.addEventListener('error', () => report(new Error('Could not load music.')));
canvas.addEventListener('webglcontextlost', event => { event.preventDefault();report(new Error('Renderer lost - reload to continue.')); });
window.addEventListener('error', event => report(event.error || event.message));
window.addEventListener('unhandledrejection', event => report(event.reason));
window.addEventListener('pagehide', () => { stopped = true;renderer?.destroy();if (mediaURL) URL.revokeObjectURL(mediaURL); }, { once: true });
start().catch(report);
