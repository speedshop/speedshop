(async () => {
  const sections = [...document.querySelectorAll("[data-scenario]")];
  if (!sections.length) return;
  const controls = sections.flatMap((section) => [...section.querySelectorAll("[data-baseline], [data-workload]")]);
  controls.forEach((input) => { input.disabled = true; });

  let measurements = {};
  let samplingInterval;
  try {
    const response = await fetch("/assets/data/threadpilot_scenarios.json");
    if (!response.ok) throw new Error(`Benchmark data: HTTP ${response.status}`);
    const dataset = await response.json();
    if (dataset.validation) throw new Error("Short validation runs are not performance comparisons");
    if (dataset.schemaVersion !== 2 || !dataset.complete || dataset.samplingHz !== 20) throw new Error("Complete 20 Hz benchmark measurements are required");
    measurements = dataset.scenarios;
    samplingInterval = 1 / dataset.samplingHz;
  } catch (error) {
    console.warn("Measured benchmark data unavailable.", error);
  }
  if (!sections.every((section) => section.isConnected)) return;

  let baseline = 5;
  let frame;
  const workloads = { low: 10, high: 90, changing: 90 };
  const results = new Map();
  const updates = new WeakMap();
  const runRequests = new Map();
  const requests = new AbortController();
  const format = (value) => new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);

  function selectedWorkload(kind) {
    return measurements[kind]?.[workloads[kind]];
  }

  async function loadRun(run) {
    if (!run?.dataUrl || Array.isArray(run.threads)) return;
    if (!runRequests.has(run.dataUrl)) {
      runRequests.set(run.dataUrl, fetch(run.dataUrl, { signal: requests.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`Benchmark run: HTTP ${response.status}`);
        const payload = await response.json();
        if (payload.status !== "success" || ![payload.threads, payload.throughput, payload.latency].every(Array.isArray)) throw new Error("Incomplete benchmark run");
        if (payload.duration !== run.duration || payload.summary.throughput !== run.summary.throughput || payload.summary.latency !== run.summary.latency || payload.provenance?.workItemId !== run.provenance?.workItemId) throw new Error("Benchmark run identity mismatch");
        return payload;
      }).catch((error) => {
        runRequests.delete(run.dataUrl);
        throw error;
      }));
    }
    Object.assign(run, await runRequests.get(run.dataUrl));
  }

  function scenario(kind) {
    const recording = selectedWorkload(kind);
    const adaptive = recording?.runs?.adaptive;
    const fixed = recording?.runs?.[baseline];
    if (recording?.latencyWindow !== "individual" || ![adaptive, fixed].every((run) => run?.status === "success" && run.summary && [run.threads, run.throughput, run.latency].every(Array.isArray))) throw new Error("Matched individual-observation measurements unavailable");
    return {
      adaptive,
      fixed,
      duration: Math.max(adaptive.duration, fixed.duration),
      throughput: { adaptive: adaptive.summary.throughput, fixed: fixed.summary.throughput },
      latency: { adaptive: adaptive.summary.latency, fixed: fixed.summary.latency },
    };
  }

  function latencyComparison(adaptive, fixed, noun) {
    if (fixed < 1) return adaptive < 1 ? `Similar ${noun}` : `${format(adaptive - fixed)} ms higher`;
    const difference = (1 - adaptive / fixed) * 100;
    if (Math.abs(difference) < 1) return `Similar ${noun}`;
    return `${format(Math.abs(difference))}% ${difference > 0 ? "lower" : "higher"}`;
  }

  async function update(section) {
    const kind = section.dataset.scenario;
    const version = Symbol();
    updates.set(section, version);
    section.dataset.baseline = baseline;
    section.dataset.workload = workloads[kind];
    section.querySelectorAll("[data-baseline]").forEach((input) => {
      input.checked = Number(input.value) === baseline;
    });
    const write = (selector, text) => { section.querySelector(selector).textContent = text; };
    const selected = selectedWorkload(kind);
    const runs = [selected?.runs?.adaptive, selected?.runs?.[baseline]];
    if (runs.some((run) => run?.dataUrl && !Array.isArray(run.threads))) {
      section.dataset.source = "loading";
      section.setAttribute("aria-busy", "true");
      results.delete(section);
      write("[data-throughput-heading]", "Loading measurements…");
    }
    let data;
    try {
      await Promise.all(runs.map(loadRun));
      if (updates.get(section) !== version || !section.isConnected) return;
      data = scenario(kind);
    } catch (error) {
      if (updates.get(section) !== version || !section.isConnected) return;
      section.dataset.source = "unavailable";
      write("[data-adaptive-label]", "Threadpilot · unavailable");
      write("[data-baseline-label]", `Fixed · ${baseline} ${baseline === 1 ? "thread" : "threads"} · unavailable`);
      write("[data-insight]", "Measurements could not be loaded. Reload the page or choose another setting.");
      write("[data-throughput-heading]", "Measured data unavailable");
      write("[data-latency-heading]", "Measured data unavailable");
      for (const selector of ["[data-throughput-claim]", "[data-throughput-detail]", "[data-latency-claim]", "[data-latency-detail]", "[data-capacity-claim]"]) write(selector, "Unavailable");
      for (const canvas of section.querySelectorAll("[data-chart]")) {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        canvas.setAttribute("aria-label", "Measured benchmark data unavailable");
      }
      console.warn("Measured benchmark run unavailable.", error);
      return;
    } finally {
      if (updates.get(section) === version) section.removeAttribute("aria-busy");
    }
    if (updates.get(section) !== version || !section.isConnected) return;
    results.set(section, data);
    section.dataset.source = "measured";
    const throughputGain = data.throughput.adaptive / data.throughput.fixed - 1;
    const capacity = (1 - data.throughput.fixed / data.throughput.adaptive) * 100;
    const units = kind === "high" ? "requests/s" : "jobs/s";
    write("[data-adaptive-label]", "Threadpilot · measured");
    write("[data-baseline-label]", `Fixed · ${baseline} ${baseline === 1 ? "thread" : "threads"} · measured`);
    write("[data-throughput-heading]", "Measured throughput");
    write("[data-latency-heading]", `Measured ${kind === "high" ? "request queueing (whole-run median)" : "processing (whole-run p99)"}`);
    write("[data-latency-label]", kind === "high" ? "Request queueing" : "Processing latency");
    write("[data-latency-axis]", "Milliseconds · individual observations · lower is better");
    write("[data-thread-axis]", kind === "changing" ? "Threadpilot's workload phases" : "Finding a smaller or larger pool");
    write("[data-throughput-claim]", `${(data.throughput.adaptive / data.throughput.fixed).toFixed(1)}x`);
    write("[data-throughput-detail]", `${format(data.throughput.adaptive)} vs ${format(data.throughput.fixed)} ${units}`);
    write("[data-latency-claim]", latencyComparison(data.latency.adaptive, data.latency.fixed, kind === "high" ? "queueing" : "latency"));
    write("[data-latency-detail]", `${format(data.latency.adaptive)} vs ${format(data.latency.fixed)} ms`);
    write("[data-capacity-claim]", Math.abs(capacity) < 1 ? "Similar resources" : `${format(Math.abs(capacity))}% ${capacity > 0 ? "less" : "more"}`);
    write("[data-capacity-detail]", `Estimated ${kind === "high" ? "Puma" : "Sidekiq"} process count for same load`);

    let insight;
    if (kind === "changing") {
      insight = throughputGain > 0.01
        ? `Your ${baseline}-thread setting stays put. Threadpilot follows the CPU and I/O phases instead.`
        : `At ${baseline} threads, throughput is already close. Compare processing latency when the workload turns CPU-heavy.`;
    } else if (throughputGain > 0.01) {
      insight = `At ${workloads[kind]}% I/O, Threadpilot completes more work. Compare latency and actual thread counts as well.`;
    } else if (throughputGain < -0.01) {
      insight = `At ${workloads[kind]}% I/O, ${baseline} fixed threads complete more work. Compare latency and actual thread counts as well.`;
    } else {
      insight = `At ${workloads[kind]}% I/O, throughput is close. Compare latency and thread counts before adding concurrency.`;
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
    const peak = [tuned, fixed].reduce((max, series) => series.reduce((max, [, value]) => Math.max(max, value), max), 1) * 1.15;
    const max = key === "threads" ? Math.ceil(peak / 15) * 15 : peak;
    ctx.font = `${Math.round(10 * dpr)}px ui-monospace, monospace`;
    const left = Math.max(Math.round(48 * dpr), Math.ceil(ctx.measureText(format(max)).width + 12 * dpr));
    const right = canvas.width - Math.round(16 * dpr);
    const top = Math.round(28 * dpr);
    const bottom = canvas.height - Math.round(28 * dpr);
    const x = (second) => left + second / data.duration * (right - left);
    const y = (value) => bottom - value / max * (bottom - top);
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
      label(ctx, `${format(data.duration * tick / 240)}m`, left + (right - left) * tick / 4, bottom + Math.round(8 * dpr));
    }
    if (kind === "changing") {
      ctx.textBaseline = "top";
      for (const [index, name, prefix, color] of [[0, "adaptive", "TP", "#55ffff"], [1, "fixed", "Fixed", "#ff55ff"]]) {
        const run = data[name];
        const end = run.duration || data.duration;
        const bands = run.ioBands || [];
        const phases = run.phases;
        const edges = phases?.length ? phases.flatMap((phase) => [phase.start, phase.end]) : bands.flat();
        const boundaries = [...new Set([0, ...edges, end])].filter((second) => second >= 0 && second <= end).sort((a, b) => a - b);
        ctx.fillStyle = color;
        for (let phase = 1; phase < boundaries.length; phase += 1) {
          const start = boundaries[phase - 1];
          const stop = boundaries[phase];
          const center = (start + stop) / 2;
          const active = phases?.length ? phases.filter((phase) => center >= phase.start && center < phase.end) : null;
          const ioHeavy = active ? active.some((phase) => phase.io >= 50) : bands.some(([start, stop]) => center >= start && center < stop);
          const cpuHeavy = active ? active.some((phase) => phase.io < 50) : !ioHeavy;
          const text = ioHeavy && cpuHeavy ? "Mixed" : ioHeavy ? "I/O" : cpuHeavy ? "CPU" : "Idle";
          const y = Math.round(index * 12 * dpr);
          if (x(stop) - x(start) > ctx.measureText(`${prefix} ${text}`).width + 8 * dpr) label(ctx, `${prefix} ${text}`, x(center), y);
          const column = Math.round(x(stop));
          for (let row = top + index * 4; row < bottom; row += 8) ctx.fillRect(column, row, 1, 1);
        }
      }
    }
    for (const [series, color, dashed] of [[tuned, "#55ffff", false], [fixed, "#ff55ff", true]]) {
      if (key === "latency") {
        ctx.fillStyle = color;
        for (const [second, value] of series) ctx.fillRect(Math.round(x(second)), Math.round(y(value)), 1, 1);
      } else {
        ctx.fillStyle = color;
        for (let index = 0; index < series.length; index += 1) {
          if (!index || series[index][0] - series[index - 1][0] > samplingInterval * 2) {
            ctx.fillRect(Math.round(x(series[index][0])), Math.round(y(series[index][1])), 1, 1);
          } else {
            line(ctx, x(series[index - 1][0]), y(series[index - 1][1]), x(series[index][0]), y(series[index][1]), color, dashed);
          }
        }
      }
    }
    const name = key === "threads" ? "thread count" : key === "throughput" ? "throughput" : kind === "high" ? "request queueing" : "processing latency";
    canvas.setAttribute("aria-label", `${name}: Threadpilot versus ${baseline} fixed threads at ${workloads[kind]}% I/O${kind === "changing" ? ", alternating with 10% I/O" : ""}. Measured comparison.${kind === "changing" ? " Cyan TP and magenta Fixed phase labels show each run's own timing; Mixed means CPU-heavy and I/O-heavy jobs overlap." : ""}${key === "latency" ? " Individual request/job observations shown as scatter points." : ""}`);
    align(canvas);
  }

  function redraw() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      for (const section of sections) {
        const data = results.get(section);
        if (!data) continue;
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
  controls.forEach((input) => { input.disabled = false; });
  document.fonts.ready.then(redraw);
  function cleanup() {
    requests.abort();
    observer.disconnect();
    alignment.disconnect();
    cancelAnimationFrame(frame);
    sections.forEach((section) => section.removeEventListener("change", change));
    document.removeEventListener("pjax:send", cleanup);
  }
  document.addEventListener("pjax:send", cleanup);
})();
