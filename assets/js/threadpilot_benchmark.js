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

  function drawPixel(x, y, color) {
    context.fillStyle = color;
    context.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  function draw(progressValue) {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const bounds = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * devicePixelRatio));
    const height = Math.max(1, Math.round(bounds.height * devicePixelRatio));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    } else {
      context.clearRect(0, 0, width, height);
    }

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
      for (
        let x = left;
        x <= right;
        x += Math.max(3, Math.round(4 * devicePixelRatio))
      ) {
        drawPixel(x, y, "#242424");
      }
    }

    context.fillStyle = "#777";
    context.fillRect(left, top, 1, plotHeight + 1);
    context.fillRect(left, bottom, plotWidth + 1, 1);

    context.fillStyle = "#bbbbbb";
    context.font = `${Math.round(10 * devicePixelRatio)}px ui-monospace, monospace`;
    context.textBaseline = "top";
    context.fillText("Throughput", left, 0);
    context.textAlign = "right";
    context.fillText("Time", right, bottom + Math.round(10 * devicePixelRatio));
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

  new ResizeObserver(resize).observe(canvas);
}
