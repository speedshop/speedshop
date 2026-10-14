const benchmark = document.querySelector(".threadpilot-benchmark");
const canvas = benchmark?.querySelector(".threadpilot-benchmark-canvas");

if (benchmark && canvas instanceof HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error("Threadpilot benchmark requires canvas support");

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const duration = 2400;
  let progress = reduceMotion ? 1 : 0;
  let animationStart;
  let animationFrame;

  function drawLabel(ctx, text, x, y) {
    const raster = document.createElement("canvas");
    const ink = raster.getContext("2d");
    ink.font = ctx.font;
    ink.textAlign = ctx.textAlign;
    ink.textBaseline = ctx.textBaseline;
    const metrics = ink.measureText(String(text));
    const left = Math.floor(-metrics.actualBoundingBoxLeft) - 1;
    const top = Math.floor(-metrics.actualBoundingBoxAscent) - 1;
    raster.width = Math.max(
      1, Math.ceil(metrics.actualBoundingBoxRight) - left + 1,
    );
    raster.height = Math.max(
      1, Math.ceil(metrics.actualBoundingBoxDescent) - top + 1,
    );
    ink.font = ctx.font;
    ink.textAlign = ctx.textAlign;
    ink.textBaseline = ctx.textBaseline;
    ink.fillText(String(text), -left, -top);
    const pixels = ink.getImageData(0, 0, raster.width, raster.height).data;
    for (let row = 0; row < raster.height; row += 1) {
      for (let column = 0; column < raster.width; column += 1) {
        if (pixels[(row * raster.width + column) * 4 + 3] >= 128) {
          ctx.fillRect(
            Math.round(x) + left + column, Math.round(y) + top + row, 1, 1,
          );
        }
      }
    }
  }

  function sizeCanvas(entry) {
    const dpr = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    const box = entry?.devicePixelContentBoxSize?.[0];
    const content = entry?.contentRect || bounds;
    const width = Math.max(1, Math.round(content.width * dpr));
    const height = Math.max(1, Math.round(content.height * dpr));
    const validBox = box &&
      Math.abs(box.inlineSize - width) <= 1 &&
      Math.abs(box.blockSize - height) <= 1;
    canvas.width = validBox ? box.inlineSize : width;
    canvas.height = validBox ? box.blockSize : height;
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    alignCanvas();
  }

  function alignCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.transform = "none";
    const snapped = canvas.getBoundingClientRect();
    const x = snapped.left + window.scrollX;
    const y = snapped.top + window.scrollY;
    const offsetX = Math.round(x * dpr) / dpr - x;
    const offsetY = Math.round(y * dpr) / dpr - y;
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${canvas.width / dpr / snapped.width}, ${canvas.height / dpr / snapped.height})`;
  }

  function drawPixel(x, y, color) {
    context.fillStyle = color;
    context.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  function draw(progressValue) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);

    context.imageSmoothingEnabled = false;
    const styles = getComputedStyle(document.body);
    const cyan = styles.getPropertyValue("--tp-cyan").trim();
    const magenta = styles.getPropertyValue("--tp-magenta").trim();
    const left = Math.round(48 * devicePixelRatio);
    const right = width - Math.round(10 * devicePixelRatio);
    const top = Math.round(24 * devicePixelRatio);
    const bottom = height - Math.round(30 * devicePixelRatio);
    const plotWidth = right - left;
    const plotHeight = bottom - top;

    for (const ratio of [0.25, 0.5, 0.75]) {
      const y = Math.round(top + plotHeight * ratio);
      for (let x = left; x <= right; x += 6) {
        drawPixel(x, y, "#fff");
      }
    }

    context.fillStyle = "#fff";
    context.fillRect(left, top, 1, plotHeight + 1);
    context.fillRect(left, bottom, plotWidth + 1, 1);

    context.fillStyle = "#fff";
    context.font = `${Math.round(10 * devicePixelRatio)}px ui-monospace, monospace`;
    context.textBaseline = "top";
    drawLabel(context, "Throughput", left, 0);
    context.textAlign = "right";
    drawLabel(context, "Time", right, bottom + Math.round(10 * devicePixelRatio));
    context.textAlign = "left";

    const visibleWidth = Math.max(0, Math.floor(plotWidth * progressValue));
    for (let offset = 0; offset <= visibleWidth; offset += 1) {
      const position = offset / plotWidth;
      const staticValue =
        0.08 + position * 0.43 + Math.sin(position * 46) * 0.004;
      const adaptiveValue =
        0.08 + position * 0.79 + Math.sin(position * 52) * 0.005;
      drawPixel(left + offset, bottom - staticValue * plotHeight, magenta);
      drawPixel(left + offset, bottom - adaptiveValue * plotHeight, cyan);
    }

    benchmark.dataset.renderProgress = progressValue.toFixed(3);
  }

  function animate(timestamp) {
    animationStart ??= timestamp;
    progress = Math.min(1, (timestamp - animationStart) / duration);
    draw(progress);

    if (progress < 1) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      benchmark.dataset.renderState = "complete";
    }
  }

  function beginAnimation() {
    benchmark.dataset.renderState = "drawing";
    animationFrame = requestAnimationFrame(animate);
  }

  function resize() {
    cancelAnimationFrame(animationFrame);
    if (benchmark.dataset.renderState === "drawing") {
      animationFrame = requestAnimationFrame(animate);
    } else {
      draw(progress);
    }
  }

  sizeCanvas();

  if (reduceMotion) {
    benchmark.dataset.renderState = "complete";
    draw(1);
  } else {
    benchmark.dataset.renderState = "waiting";
    draw(0);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          beginAnimation();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(benchmark);
  }

  const canvasObserver = new ResizeObserver((entries) => {
    sizeCanvas(entries[0]);
    resize();
  });
  canvasObserver.observe(canvas);
  new ResizeObserver(() => requestAnimationFrame(alignCanvas)).observe(document.body);
  document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      sizeCanvas();
      resize();
    });
  });
  let containerWidth;
  new ResizeObserver((entries) => {
    const width = entries[0].contentRect.width;
    if (width === containerWidth) return;
    containerWidth = width;
    canvas.style.width = "";
    canvas.style.height = "";
  }).observe(benchmark);
}
