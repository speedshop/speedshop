(async () => {
  const sections = [...document.querySelectorAll("[data-scenario]")];
  if (!sections.length) return;

  let measurements = {};
  let samplingInterval;
  try {
    const response = await fetch("/assets/data/threadpilot_scenarios.json");
    if (!response.ok) throw new Error(`Benchmark data: HTTP ${response.status}`);
    const dataset = await response.json();
    if (dataset.validation) throw new Error("Short validation runs are not performance comparisons");
    if (dataset.schemaVersion === 2 && !dataset.complete) throw new Error("Incomplete benchmark dataset");
    measurements = dataset.scenarios;
    if (dataset.schemaVersion === 2 && dataset.samplingHz > 0) samplingInterval = 1 / dataset.samplingHz;
  } catch (error) {
    console.warn("Measured benchmark data unavailable; showing labeled estimates.", error);
  }
  if (!sections.every((section) => section.isConnected)) return;

  let baseline = 5;
  let frame;
  const workloads = { low: 10, high: 90, changing: 90 };
  const results = new Map();
  const updates = new WeakMap();
  const runRequests = new Map();
  const requests = new AbortController();
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

  function selectedWorkload(kind) {
    const workload = measurements[kind];
    return workload?.io === workloads[kind] ? workload : workload?.[workloads[kind]];
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
    const changing = kind === "changing";
    const selected = selectedWorkload(kind);
    const recording = selected?.runs?.adaptive?.status !== "failed" && selected?.runs?.adaptive?.summary ? selected : null;
    const duration = recording ? Math.ceil(recording.runs.adaptive.duration) : changing ? 720 : 120;
    const ioBands = changing ? recording?.runs.adaptive.ioBands || recording?.ioBands || [[180, 360], [540, 720]] : [];
    const service = kind === "high" ? 250 : 100;
    const adaptive = { threads: [], throughput: [], latency: [] };
    const fixed = { threads: [], throughput: [], latency: [] };
    const adaptiveSamples = [];
    const fixedSamples = [];
    let threads = 5;

    for (let second = 0; second <= duration; second += 1) {
      const io = (changing && !ioBands.some(([start, end]) => second >= start && second < end) ? 10 : workloads[kind]) / 100;
      threads += (poolFor(io) - threads) * 0.075;
      const tuned = point(threads, io, service);
      const staticPoint = point(baseline, io, service);
      const variation = 1 + Math.sin(second * 0.37) * 0.012;
      tuned.throughput *= variation;
      staticPoint.throughput *= variation;
      adaptive.threads.push([second, threads]);
      fixed.threads.push([second, baseline]);
      for (const [series, sample] of [[adaptive, tuned], [fixed, staticPoint]]) {
        series.throughput.push([second, sample.throughput]);
        series.latency.push([second, kind === "high" ? sample.queueing : sample.processing * 2.4]);
      }
      adaptiveSamples.push(tuned);
      fixedSamples.push(staticPoint);
    }

    const tunedSummary = changing ? adaptiveSamples : adaptiveSamples.slice(-60);
    const fixedSummary = changing ? fixedSamples : fixedSamples.slice(-60);
    const data = {
      adaptive,
      fixed,
      duration,
      ioBands,
      measured: { adaptive: false, fixed: false },
      scatterLatency: recording?.latencyWindow === "individual",
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
    if (recording) {
      for (const [name, run] of [["adaptive", recording.runs.adaptive], ["fixed", recording.runs[baseline]]]) {
        if (!run?.summary || run.status === "failed") continue;
        data[name] = run;
        data.measured[name] = true;
        data.throughput[name] = run.summary.throughput;
        data.latency[name] = run.summary.latency;
      }
      data.duration = Math.max(data.adaptive.duration, data.measured.fixed ? data.fixed.duration : duration);
    }
    return data;
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
    try {
      await Promise.all(runs.map(loadRun));
    } catch (error) {
      if (updates.get(section) !== version || !section.isConnected) return;
      section.dataset.source = "unavailable";
      write("[data-adaptive-label]", "Threadpilot · unavailable");
      write("[data-baseline-label]", `Fixed · ${baseline} ${baseline === 1 ? "thread" : "threads"} · unavailable`);
      write("[data-insight]", "Measurements could not be loaded. Choose another setting to retry.");
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
    const data = scenario(kind);
    results.set(section, data);
    section.dataset.source = data.measured.fixed ? "measured" : data.measured.adaptive ? "mixed" : "estimated";
    const throughputGain = data.throughput.adaptive / data.throughput.fixed - 1;
    const capacity = (1 - data.throughput.fixed / data.throughput.adaptive) * 100;
    const units = kind === "high" ? "requests/s" : "jobs/s";
    const measured = data.measured.adaptive && data.measured.fixed;
    write("[data-adaptive-label]", `Threadpilot · ${data.measured.adaptive ? "measured" : "estimated"}`);
    write("[data-baseline-label]", `Fixed · ${baseline} ${baseline === 1 ? "thread" : "threads"} · ${data.measured.fixed ? "measured" : "estimated"}`);
    write("[data-throughput-heading]", `${measured ? "Measured" : "Estimated"} throughput`);
    write("[data-latency-heading]", measured ? `Measured ${kind === "high" ? "request queueing (whole-run median)" : "processing (whole-run p99)"}` : `Estimated ${kind === "high" ? "request queueing" : "processing p99"}`);
    write("[data-latency-label]", data.scatterLatency ? kind === "high" ? "Request queueing" : "Processing latency" : kind === "high" ? `Request queueing${measured ? " (median)" : ""}` : "Processing p99");
    write("[data-latency-axis]", `Milliseconds${data.scatterLatency ? " · individual observations" : measured ? " · 10-second windows" : ""} · lower is better`);
    write("[data-thread-axis]", kind === "changing" ? data.measured.adaptive ? "Threadpilot's workload phases" : "Following the workload" : "Finding a smaller or larger pool");
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
        const bands = run.ioBands || data.ioBands;
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
    for (const [name, series, color, dashed] of [["adaptive", tuned, "#55ffff", false], ["fixed", fixed, "#ff55ff", true]]) {
      if (key === "latency" && data.scatterLatency) {
        ctx.fillStyle = color;
        for (const [second, value] of series) ctx.fillRect(Math.round(x(second)), Math.round(y(value)), 1, 1);
      } else {
        ctx.fillStyle = color;
        for (let index = 0; index < series.length; index += 1) {
          if (!index || (data.measured[name] && samplingInterval && series[index][0] - series[index - 1][0] > samplingInterval * 2)) {
            ctx.fillRect(Math.round(x(series[index][0])), Math.round(y(series[index][1])), 1, 1);
          } else {
            line(ctx, x(series[index - 1][0]), y(series[index - 1][1]), x(series[index][0]), y(series[index][1]), color, dashed);
          }
        }
      }
    }
    const name = key === "threads" ? "thread count" : key === "throughput" ? "throughput" : kind === "high" ? "request queueing" : data.scatterLatency ? "processing latency" : "processing p99";
    const source = data.measured.fixed ? "Measured comparison" : data.measured.adaptive ? "Measured Threadpilot; estimated fixed baseline" : "Estimates, not measured results";
    canvas.setAttribute("aria-label", `${name}: Threadpilot versus ${baseline} fixed threads at ${workloads[kind]}% I/O${kind === "changing" ? ", alternating with 10% I/O" : ""}. ${source}.${kind === "changing" ? " Cyan TP and magenta Fixed phase labels show each run's own timing; Mixed means CPU-heavy and I/O-heavy jobs overlap." : ""}${key === "latency" && data.scatterLatency ? " Individual request/job observations shown as scatter points." : data.measured.fixed && key === "latency" ? ` Ten-second ${kind === "high" ? "median queueing" : "processing p99"} windows.` : ""}`);
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
