(() => {
  const sections = [...document.querySelectorAll("[data-scenario]")];
  if (!sections.length) return;

  let baseline = 5;
  let frame;
  const workloads = { low: 10, high: 90, changing: 90 };
  const results = new Map();
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const format = (value) => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
  const poolFor = (io) => Math.min(25, Math.ceil(1 / (1 - io) - 0.0001));

  function point(threads, io, service) {
    const needed = poolFor(io);
    const ceiling = 1000 / (service * (1 - io));
    return {
      throughput: Math.min(ceiling, threads * 1000 / service),
      processing: service + Math.max(0, threads - needed) * 58 * (1 - io),
      queueing: service * 2.5 * Math.max(0, needed / threads - 1),
    };
  }

  function tailLatency(samples) {
    const distribution = [];
    for (const sample of samples) {
      for (let index = 0; index <= 20; index += 1) {
        distribution.push({
          value: sample.processing * (0.8 + 1.6 * (index / 20) ** 5),
          weight: sample.throughput / 21,
        });
      }
    }
    distribution.sort((a, b) => a.value - b.value);
    const target = distribution.reduce((sum, sample) => sum + sample.weight, 0) * 0.99;
    let cumulative = 0;
    return distribution.find((sample) => {
      cumulative += sample.weight;
      return cumulative >= target;
    }).value;
  }

  function scenario(kind) {
    const changing = kind === "changing";
    const duration = changing ? 720 : 120;
    const service = kind === "high" ? 250 : 100;
    const adaptive = { threads: [], throughput: [], latency: [] };
    const fixed = { threads: [], throughput: [], latency: [] };
    const adaptiveSamples = [];
    const fixedSamples = [];
    let threads = 5;

    for (let second = 0; second <= duration; second += 1) {
      const io = (changing && Math.floor(Math.min(second, duration - 1) / 180) % 2 === 0 ? 10 : workloads[kind]) / 100;
      threads += (poolFor(io) - threads) * 0.075;
      const tuned = point(threads, io, service);
      const staticPoint = point(baseline, io, service);
      const variation = 1 + Math.sin(second * 0.37) * 0.012;
      tuned.throughput *= variation;
      staticPoint.throughput *= variation;
      adaptive.threads.push(threads);
      fixed.threads.push(baseline);
      for (const [series, sample] of [[adaptive, tuned], [fixed, staticPoint]]) {
        series.throughput.push(sample.throughput);
        series.latency.push(kind === "high" ? sample.queueing : sample.processing * 2.4);
      }
      adaptiveSamples.push(tuned);
      fixedSamples.push(staticPoint);
    }

    const tunedSummary = changing ? adaptiveSamples : adaptiveSamples.slice(-60);
    const fixedSummary = changing ? fixedSamples : fixedSamples.slice(-60);
    return {
      adaptive,
      fixed,
      duration,
      throughput: {
        adaptive: mean(tunedSummary.map((sample) => sample.throughput)),
        fixed: mean(fixedSummary.map((sample) => sample.throughput)),
      },
      latency: kind === "high"
        ? {
          adaptive: mean(tunedSummary.map((sample) => sample.queueing)),
          fixed: mean(fixedSummary.map((sample) => sample.queueing)),
        }
        : { adaptive: tailLatency(tunedSummary), fixed: tailLatency(fixedSummary) },
    };
  }

  function comparison(adaptive, fixed, lower, noun) {
    if (lower && fixed < 1) return adaptive < 1 ? `Similar ${noun}` : `${format(adaptive - fixed)} ms higher`;
    const difference = (lower ? 1 - adaptive / fixed : adaptive / fixed - 1) * 100;
    if (Math.abs(difference) < 1) return `Similar ${noun}`;
    return `${format(Math.abs(difference))}% ${difference > 0 ? (lower ? "lower" : "more") : (lower ? "higher" : "less")}`;
  }

  function update(section) {
    const kind = section.dataset.scenario;
    const data = scenario(kind);
    results.set(section, data);
    section.dataset.baseline = baseline;
    section.dataset.workload = workloads[kind];
    section.querySelectorAll("[data-baseline]").forEach((input) => {
      input.checked = Number(input.value) === baseline;
    });
    const write = (selector, text) => { section.querySelector(selector).textContent = text; };
    const throughputGain = data.throughput.adaptive / data.throughput.fixed - 1;
    const capacity = (1 - data.throughput.fixed / data.throughput.adaptive) * 100;
    const units = kind === "high" ? "requests/s" : "jobs/s";
    write("[data-baseline-label]", `Fixed · ${baseline} ${baseline === 1 ? "thread" : "threads"}`);
    write("[data-throughput-claim]", comparison(data.throughput.adaptive, data.throughput.fixed, false, "throughput"));
    write("[data-throughput-detail]", `${format(data.throughput.adaptive)} vs ${format(data.throughput.fixed)} ${units}`);
    write("[data-latency-claim]", comparison(data.latency.adaptive, data.latency.fixed, true, kind === "high" ? "queueing" : "latency"));
    write("[data-latency-detail]", `${format(data.latency.adaptive)} vs ${format(data.latency.fixed)} ms`);
    write("[data-capacity-claim]", Math.abs(capacity) < 1 ? "Similar capacity" : `${format(Math.abs(capacity))}% ${capacity > 0 ? "less" : "more"}`);
    write("[data-capacity-detail]", "Estimated process capacity for the same volume");

    let insight;
    if (kind === "changing") {
      insight = throughputGain > 0.01
        ? `Your ${baseline}-thread setting stays put. Threadpilot follows the CPU and I/O phases instead.`
        : `At ${baseline} threads, throughput is already close. Compare processing latency when the workload turns CPU-heavy.`;
    } else if (baseline < poolFor(workloads[kind] / 100)) {
      insight = `At ${workloads[kind]}% I/O, ${baseline} ${baseline === 1 ? "thread leaves" : "threads leave"} waiting time unoverlapped. Threadpilot adds concurrency.`;
    } else if (baseline > poolFor(workloads[kind] / 100)) {
      insight = `At ${workloads[kind]}% I/O, more threads aren't more capacity. Threadpilot sheds the unnecessary concurrency.`;
    } else {
      insight = `You picked a good number for this workload. Now change the I/O percentage: would it still be right tomorrow?`;
    }
    write("[data-insight]", insight);
    for (const canvas of section.querySelectorAll("[data-chart]")) draw(canvas, data, kind);
  }

  function label(ctx, text, x, y) {
    const raster = document.createElement("canvas");
    const ink = raster.getContext("2d");
    ink.font = ctx.font;
    ink.textAlign = ctx.textAlign;
    ink.textBaseline = ctx.textBaseline;
    const metrics = ink.measureText(String(text));
    const left = Math.floor(-metrics.actualBoundingBoxLeft) - 1;
    const top = Math.floor(-metrics.actualBoundingBoxAscent) - 1;
    raster.width = Math.max(1, Math.ceil(metrics.actualBoundingBoxRight) - left + 1);
    raster.height = Math.max(1, Math.ceil(metrics.actualBoundingBoxDescent) - top + 1);
    ink.font = ctx.font;
    ink.textAlign = ctx.textAlign;
    ink.textBaseline = ctx.textBaseline;
    ink.fillText(String(text), -left, -top);
    const pixels = ink.getImageData(0, 0, raster.width, raster.height).data;
    for (let row = 0; row < raster.height; row += 1) {
      for (let column = 0; column < raster.width; column += 1) {
        if (pixels[(row * raster.width + column) * 4 + 3] >= 128) {
          ctx.fillRect(Math.round(x) + left + column, Math.round(y) + top + row, 1, 1);
        }
      }
    }
  }

  function line(ctx, x0, y0, x1, y1, color, dashed = false) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    ctx.fillStyle = color;
    while (true) {
      if (!dashed || x0 % 10 < 5) ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) { error += dy; x0 += sx; }
      if (twice <= dx) { error += dx; y0 += sy; }
    }
  }

  function align(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.style.transform = "none";
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + window.scrollX;
    const y = bounds.top + window.scrollY;
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `translate(${Math.round(x * dpr) / dpr - x}px, ${Math.round(y * dpr) / dpr - y}px) scale(${canvas.width / dpr / bounds.width}, ${canvas.height / dpr / bounds.height})`;
  }

  function draw(canvas, data, kind) {
    canvas.style.width = "";
    canvas.style.height = "";
    canvas.style.transform = "none";
    const bounds = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
    canvas.style.width = `${canvas.width / dpr}px`;
    canvas.style.height = `${canvas.height / dpr}px`;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const key = canvas.dataset.chart;
    const tuned = data.adaptive[key];
    const fixed = data.fixed[key];
    const peak = Math.max(1, ...tuned, ...fixed) * 1.15;
    const max = key === "threads" ? Math.ceil(peak / 15) * 15 : peak;
    const left = Math.round(48 * dpr);
    const right = canvas.width - Math.round(16 * dpr);
    const top = Math.round(28 * dpr);
    const bottom = canvas.height - Math.round(28 * dpr);
    const x = (index) => left + index / (tuned.length - 1) * (right - left);
    const y = (value) => bottom - value / max * (bottom - top);
    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let tick = 0; tick <= 3; tick += 1) {
      const value = max * tick / 3;
      const row = Math.round(y(value));
      for (let column = left; column < right; column += 8) ctx.fillRect(column, row, 1, 1);
      label(ctx, format(value), left - Math.round(8 * dpr), row);
    }
    line(ctx, left, top, left, bottom, "#fff");
    line(ctx, left, bottom, right, bottom, "#fff");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let tick = 0; tick <= 4; tick += 1) {
      label(ctx, `${data.duration * tick / 240}m`, left + (right - left) * tick / 4, bottom + Math.round(8 * dpr));
    }
    if (kind === "changing") {
      ctx.textBaseline = "top";
      for (let phase = 0; phase < 4; phase += 1) {
        const center = left + (right - left) * (phase + 0.5) / 4;
        label(ctx, phase % 2 === 0 ? "CPU" : "I/O", center, 0);
        if (phase) {
          const column = Math.round(left + (right - left) * phase / 4);
          for (let row = top; row < bottom; row += 8) ctx.fillRect(column, row, 1, 1);
        }
      }
    }
    for (const [series, color, dashed] of [[tuned, "#55ffff", false], [fixed, "#ff55ff", true]]) {
      for (let index = 1; index < series.length; index += 1) {
        line(ctx, x(index - 1), y(series[index - 1]), x(index), y(series[index]), color, dashed);
      }
    }
    const name = key === "threads" ? "thread count" : key === "throughput" ? "throughput" : kind === "high" ? "request queueing" : "processing p99";
    canvas.setAttribute("aria-label", `Illustrative ${name}: Threadpilot versus ${baseline} fixed threads at ${workloads[kind]}% I/O${kind === "changing" ? ", alternating with 10% I/O" : ""}. Estimates, not measured results.`);
    align(canvas);
  }

  function redraw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      for (const section of sections) {
        const data = results.get(section);
        for (const canvas of section.querySelectorAll("[data-chart]")) draw(canvas, data, section.dataset.scenario);
      }
    });
  }

  function change(event) {
    if (event.target.matches("[data-baseline]")) {
      baseline = Number(event.target.value);
      sections.forEach(update);
    } else if (event.target.matches("[data-workload]")) {
      const section = event.target.closest("[data-scenario]");
      workloads[section.dataset.scenario] = Number(event.target.value);
      update(section);
    }
  }

  sections.forEach(update);
  const observer = new ResizeObserver(redraw);
  sections.forEach((section) => observer.observe(section.querySelector(".threadpilot-scenario-charts")));
  const alignment = new ResizeObserver(() => {
    for (const section of sections) section.querySelectorAll("[data-chart]").forEach(align);
  });
  alignment.observe(document.body);
  sections.forEach((section) => section.addEventListener("change", change));
  document.fonts.ready.then(redraw);
  function cleanup() {
    observer.disconnect();
    alignment.disconnect();
    cancelAnimationFrame(frame);
    sections.forEach((section) => section.removeEventListener("change", change));
    document.removeEventListener("pjax:send", cleanup);
  }
  document.addEventListener("pjax:send", cleanup);
})();
