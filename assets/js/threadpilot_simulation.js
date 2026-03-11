let cleanupThreadpilotSimulation = null;

const SETUPS = [
  { threadCount: 1, rssMb: 154 },
  { threadCount: 5, rssMb: 172 },
  { threadCount: 125, rssMb: 712 },
];

const ARRIVAL_INTERVAL_MS = 100;
const BASE_SERVICE_MS = 100;
const LATENCY_WINDOW = 400;
const THROUGHPUT_WINDOW_MS = 4000;
const DEAD_QUEUE_LATENCY_MS = 30000;
const DEATH_FLASH_MS = 1200;
const RESPAWN_FADE_MS = 650;
const RSS_BAD_MB = 300;
const LATENCY_BAD_MS = 200;
const DB_BAD_CONNECTIONS = 6;
const SIMULATION_SPEED = 8;
const STEP_MS = 8;
const AUTOPLAY_POINTS_PER_SECOND = 5;

export function initThreadpilotSimulation() {
  if (cleanupThreadpilotSimulation) {
    cleanupThreadpilotSimulation();
    cleanupThreadpilotSimulation = null;
  }

  const root = document.querySelector('[data-threadpilot-simulator]');
  if (!root) return;

  const slider = root.querySelector('[data-threadpilot-io-slider]');
  const ioLabel = root.querySelector('[data-threadpilot-io-label]');
  const cpuLabel = root.querySelector('[data-threadpilot-cpu-label]');
  const autoplayStatus = root.querySelector('[data-threadpilot-autoplay-status]');

  const cards = new Map(
    Array.from(root.querySelectorAll('[data-threadpilot-card]')).map((card) => {
      const threadCount = Number(card.getAttribute('data-threadpilot-card'));
      return [threadCount, collectCardElements(card)];
    })
  );

  const setups = SETUPS.map((config) => createSetup(config));
  const state = {
    simTime: 0,
    nextArrivalAt: 0,
    lastFrameAt: null,
    rafId: null,
    autoplayTimerId: null,
    autoplayEnabled: true,
    autoplayDirection: -1,
    autoplayValue: Number(slider.value),
    ioPercent: Number(slider.value),
  };

  function stopAutoplay() {
    if (!state.autoplayEnabled) return;
    state.autoplayEnabled = false;
    autoplayStatus.textContent = 'Autoplay paused. Drag the slider to explore.';
  }

  function updateMixLabels() {
    state.ioPercent = Number(slider.value);
    ioLabel.textContent = `${Math.round(state.ioPercent)}%`;
    cpuLabel.textContent = `${Math.round(100 - state.ioPercent)}%`;
  }

  function tickAutoplay() {
    if (!state.autoplayEnabled) return;

    const step = AUTOPLAY_POINTS_PER_SECOND * 0.12;
    state.autoplayValue += state.autoplayDirection * step;

    if (state.autoplayValue >= 100) {
      state.autoplayValue = 100;
      state.autoplayDirection = -1;
    } else if (state.autoplayValue <= 0) {
      state.autoplayValue = 0;
      state.autoplayDirection = 1;
    }

    slider.value = String(Math.round(state.autoplayValue));
    updateMixLabels();
  }

  function pushArrival(arrivalAt) {
    const serviceScale = clamp(1 + gaussian() * 0.08, 0.78, 1.22);
    const totalServiceMs = BASE_SERVICE_MS * serviceScale;
    const ioMs = totalServiceMs * (state.ioPercent / 100);
    const cpuMs = totalServiceMs - ioMs;
    const jobTemplate = {
      arrivalAt,
      cpu1Ms: cpuMs * 0.35,
      ioMs,
      cpu2Ms: cpuMs * 0.65,
    };

    setups.forEach((setup) => {
      setup.queue.push({ ...jobTemplate });
      setup.arrivalEvents.push(arrivalAt);
      pruneOldEvents(setup.arrivalEvents, arrivalAt);
    });
  }

  function advanceSimulation(elapsedMs) {
    let remaining = elapsedMs;

    while (remaining > 0) {
      const step = Math.min(remaining, STEP_MS);
      remaining -= step;
      state.simTime += step;

      while (state.nextArrivalAt <= state.simTime) {
        pushArrival(state.nextArrivalAt);
        state.nextArrivalAt += ARRIVAL_INTERVAL_MS;
      }

      setups.forEach((setup) => {
        stepSetup(setup, step, state.simTime);
        maybeKillSetup(setup, state.simTime);
      });
    }
  }

  function render() {
    setups.forEach((setup) => renderSetup(setup, cards.get(setup.threadCount), state.simTime));
  }

  function frame(frameAt) {
    if (state.lastFrameAt == null) state.lastFrameAt = frameAt;

    const realElapsedMs = Math.min(frameAt - state.lastFrameAt, 64);
    state.lastFrameAt = frameAt;

    advanceSimulation(realElapsedMs * SIMULATION_SPEED);
    render();
    state.rafId = window.requestAnimationFrame(frame);
  }

  slider.addEventListener('input', () => {
    stopAutoplay();
    updateMixLabels();
  });
  slider.addEventListener('pointerdown', stopAutoplay, { once: true });
  slider.addEventListener('touchstart', stopAutoplay, { once: true, passive: true });
  slider.addEventListener('keydown', stopAutoplay, { once: true });

  updateMixLabels();
  advanceSimulation(8000);
  render();
  state.autoplayTimerId = window.setInterval(tickAutoplay, 120);
  state.rafId = window.requestAnimationFrame(frame);

  cleanupThreadpilotSimulation = () => {
    setups.forEach((setup) => {
      if (setup.deathTimerId) window.clearTimeout(setup.deathTimerId);
      if (setup.respawnTimerId) window.clearTimeout(setup.respawnTimerId);
    });
    if (state.autoplayTimerId) window.clearInterval(state.autoplayTimerId);
    if (state.rafId) window.cancelAnimationFrame(state.rafId);
  };
}

function collectCardElements(card) {
  return {
    card,
    deadOverlay: card.querySelector('[data-threadpilot-dead-overlay]'),
    queue: card.querySelector('[data-threadpilot-queue]'),
    arrivalsTrack: card.querySelector('[data-threadpilot-arrivals-track]'),
    completionsTrack: card.querySelector('[data-threadpilot-completions-track]'),
    queueLabel: card.querySelector('[data-threadpilot-queue-label]'),
    queueFill: card.querySelector('[data-threadpilot-queue-fill]'),
    poolLabel: card.querySelector('[data-threadpilot-pool-label]'),
    poolCpu: card.querySelector('[data-threadpilot-pool-cpu]'),
    poolWait: card.querySelector('[data-threadpilot-pool-wait]'),
    poolIo: card.querySelector('[data-threadpilot-pool-io]'),
    poolIdle: card.querySelector('[data-threadpilot-pool-idle]'),
    cpuActive: card.querySelector('[data-threadpilot-cpu-active]'),
    gvlWait: card.querySelector('[data-threadpilot-gvl-wait]'),
    ioActive: card.querySelector('[data-threadpilot-io-active]'),
    idle: card.querySelector('[data-threadpilot-idle]'),
    rss: card.querySelector('[data-threadpilot-rss]'),
    db: card.querySelector('[data-threadpilot-db]'),
    throughput: card.querySelector('[data-threadpilot-throughput]'),
    p95: card.querySelector('[data-threadpilot-p95]'),
    p99: card.querySelector('[data-threadpilot-p99]'),
    max: card.querySelector('[data-threadpilot-max]'),
  };
}

function createSetup(config) {
  return {
    threadCount: config.threadCount,
    rssMb: config.rssMb,
    queue: [],
    workers: createWorkers(config.threadCount),
    cpuQueue: [],
    cpuActiveWorker: null,
    latencies: [],
    arrivalEvents: [],
    completions: [],
    dead: false,
    respawning: false,
    deathTimerId: null,
    respawnTimerId: null,
  };
}

function createWorkers(threadCount) {
  return Array.from({ length: threadCount }, () => ({ job: null, stage: 'idle', remaining: 0 }));
}

function resetSetup(setup) {
  setup.queue = [];
  setup.workers = createWorkers(setup.threadCount);
  setup.cpuQueue = [];
  setup.cpuActiveWorker = null;
  setup.latencies = [];
  setup.arrivalEvents = [];
  setup.completions = [];
}

function stepSetup(setup, stepMs, simTime) {
  if (setup.dead) return;

  assignWaitingJobs(setup);
  maybeStartCpu(setup);

  const penalty = cpuPenaltyMultiplier(setup);
  const completedWorkers = [];

  if (setup.cpuActiveWorker) {
    setup.cpuActiveWorker.remaining -= stepMs / penalty;
    if (setup.cpuActiveWorker.remaining <= 0) {
      completedWorkers.push(setup.cpuActiveWorker);
      setup.cpuActiveWorker = null;
    }
  }

  setup.workers.forEach((worker) => {
    if (worker.stage !== 'io') return;

    worker.remaining -= stepMs;
    if (worker.remaining <= 0) completedWorkers.push(worker);
  });

  completedWorkers.forEach((worker) => advanceWorker(setup, worker, simTime));
  assignWaitingJobs(setup);
  maybeStartCpu(setup);
}

function assignWaitingJobs(setup) {
  setup.workers.forEach((worker) => {
    if (worker.stage !== 'idle' || setup.queue.length === 0) return;

    const job = setup.queue.shift();
    worker.job = job;
    beginNextStage(setup, worker, true);
  });
}

function beginNextStage(setup, worker, firstStage = false) {
  if (!worker.job) {
    worker.stage = 'idle';
    worker.remaining = 0;
    return;
  }

  if (firstStage) worker.job.startedAt = worker.job.startedAt || worker.job.arrivalAt;

  if (worker.job.cpu1Ms > 0) {
    worker.stage = 'cpu1_wait';
    queueForCpu(setup, worker);
    return;
  }

  if (worker.job.ioMs > 0) {
    worker.stage = 'io';
    worker.remaining = worker.job.ioMs;
    worker.job.ioMs = 0;
    return;
  }

  if (worker.job.cpu2Ms > 0) {
    worker.stage = 'cpu2_wait';
    queueForCpu(setup, worker);
    return;
  }

  finishJob(setup, worker, worker.job.arrivalAt);
}

function queueForCpu(setup, worker) {
  if (!setup.cpuQueue.includes(worker)) setup.cpuQueue.push(worker);
}

function maybeStartCpu(setup) {
  if (setup.cpuActiveWorker) return;

  while (setup.cpuQueue.length > 0) {
    const worker = setup.cpuQueue.shift();
    if (!worker.job) continue;
    if (worker.stage !== 'cpu1_wait' && worker.stage !== 'cpu2_wait') continue;

    setup.cpuActiveWorker = worker;
    worker.stage = worker.stage === 'cpu1_wait' ? 'cpu1_run' : 'cpu2_run';
    worker.remaining = worker.stage === 'cpu1_run' ? worker.job.cpu1Ms : worker.job.cpu2Ms;
    return;
  }
}

function advanceWorker(setup, worker, simTime) {
  if (!worker.job) return;

  if (worker.stage === 'cpu1_run') {
    worker.job.cpu1Ms = 0;
    if (worker.job.ioMs > 0) {
      worker.stage = 'io';
      worker.remaining = worker.job.ioMs;
      worker.job.ioMs = 0;
      return;
    }
    if (worker.job.cpu2Ms > 0) {
      worker.stage = 'cpu2_wait';
      worker.remaining = 0;
      queueForCpu(setup, worker);
      return;
    }
  }

  if (worker.stage === 'io') {
    worker.remaining = 0;
    if (worker.job.cpu2Ms > 0) {
      worker.stage = 'cpu2_wait';
      queueForCpu(setup, worker);
      return;
    }
  }

  if (worker.stage === 'cpu2_run') worker.job.cpu2Ms = 0;

  finishJob(setup, worker, simTime);
}

function finishJob(setup, worker, simTime) {
  setup.latencies.push(simTime - worker.job.arrivalAt);
  if (setup.latencies.length > LATENCY_WINDOW) setup.latencies.shift();

  setup.completions.push(simTime);
  pruneOldEvents(setup.completions, simTime);

  worker.job = null;
  worker.stage = 'idle';
  worker.remaining = 0;
}

function cpuPenaltyMultiplier(setup) {
  const cpuDemand = setup.cpuQueue.length + (setup.cpuActiveWorker ? 1 : 0);
  const contentionPenalty = Math.max(0, cpuDemand - 1) * 0.12;
  const poolPenalty = Math.max(0, Math.log2(setup.threadCount) - 2) * 0.05;
  return 1 + contentionPenalty + poolPenalty;
}

function maybeKillSetup(setup, simTime) {
  if (setup.dead) return;
  if (currentQueueLatency(setup, simTime) <= DEAD_QUEUE_LATENCY_MS) return;

  setup.dead = true;
  setup.respawning = false;

  if (setup.respawnTimerId) {
    window.clearTimeout(setup.respawnTimerId);
    setup.respawnTimerId = null;
  }

  setup.deathTimerId = window.setTimeout(() => {
    resetSetup(setup);
    setup.dead = false;
    setup.respawning = true;
    setup.deathTimerId = null;
    setup.respawnTimerId = window.setTimeout(() => {
      setup.respawning = false;
      setup.respawnTimerId = null;
    }, RESPAWN_FADE_MS);
  }, DEATH_FLASH_MS);
}

function renderSetup(setup, elements, simTime) {
  if (!elements) return;

  const counts = summarizeWorkers(setup);
  const latencies = setup.latencies.slice().sort((a, b) => a - b);
  const totalThreads = setup.threadCount;
  const throughput = averageThroughput(setup, simTime);
  const queueLatency = currentQueueLatency(setup, simTime);
  const p95 = percentile(latencies, 0.95);
  const p99 = percentile(latencies, 0.99);
  const maxLatency = latencies[latencies.length - 1] ?? null;

  setLifecycleState(elements.card, setup);
  elements.queue.textContent = formatLatency(queueLatency);
  renderEventTrack(elements.arrivalsTrack, setup.arrivalEvents, simTime, 'threadpilot-sim__flow-dot--arrival');
  renderEventTrack(elements.completionsTrack, setup.completions, simTime, 'threadpilot-sim__flow-dot--completion');
  elements.queueLabel.textContent = `${setup.queue.length} waiting`;
  elements.queueFill.style.width = `${queueWidth(setup.queue.length)}%`;
  elements.poolLabel.textContent = `${counts.busy} busy / ${totalThreads} total`;
  elements.poolCpu.style.width = `${(counts.cpu / totalThreads) * 100}%`;
  elements.poolWait.style.width = `${(counts.gvlWait / totalThreads) * 100}%`;
  elements.poolIo.style.width = `${(counts.io / totalThreads) * 100}%`;
  elements.poolIdle.style.width = `${(counts.idle / totalThreads) * 100}%`;

  elements.cpuActive.textContent = String(counts.cpu);
  elements.gvlWait.textContent = String(counts.gvlWait);
  elements.ioActive.textContent = String(counts.io);
  elements.idle.textContent = String(counts.idle);
  elements.rss.textContent = `${setup.rssMb} MB`;
  elements.db.textContent = String(counts.io);
  elements.throughput.textContent = formatThroughput(throughput);
  elements.p95.textContent = formatLatency(p95);
  elements.p99.textContent = formatLatency(p99);
  elements.max.textContent = formatLatency(maxLatency);

  setBadState(elements.rss, setup.rssMb > RSS_BAD_MB);
  setBadState(elements.db, counts.io > DB_BAD_CONNECTIONS);
  setBadState(elements.queue, queueLatency > LATENCY_BAD_MS);
  setBadState(elements.p95, p95 != null && p95 > LATENCY_BAD_MS);
  setBadState(elements.p99, p99 != null && p99 > LATENCY_BAD_MS);
  setBadState(elements.max, maxLatency != null && maxLatency > LATENCY_BAD_MS);
}

function summarizeWorkers(setup) {
  return setup.workers.reduce(
    (summary, worker) => {
      if (worker.stage === 'idle') summary.idle += 1;
      if (worker.stage === 'io') summary.io += 1;
      if (worker.stage === 'cpu1_wait' || worker.stage === 'cpu2_wait') summary.gvlWait += 1;
      if (worker.stage === 'cpu1_run' || worker.stage === 'cpu2_run') summary.cpu += 1;
      if (worker.stage !== 'idle') summary.busy += 1;
      return summary;
    },
    { busy: 0, idle: 0, io: 0, gvlWait: 0, cpu: 0 }
  );
}

function queueWidth(queueDepth) {
  return clamp((Math.log1p(queueDepth) / Math.log1p(40)) * 100, 0, 100);
}

function currentQueueLatency(setup, simTime) {
  if (setup.queue.length === 0) return 0;
  return Math.max(0, simTime - setup.queue[0].arrivalAt);
}

function pruneOldEvents(events, simTime) {
  while (events.length > 0 && events[0] < simTime - THROUGHPUT_WINDOW_MS) {
    events.shift();
  }
}

function renderEventTrack(track, events, simTime, dotClassName) {
  pruneOldEvents(events, simTime);
  track.innerHTML = events
    .map((eventTime) => {
      const age = simTime - eventTime;
      const left = clamp(100 - (age / THROUGHPUT_WINDOW_MS) * 100, 0, 100);
      return `<span class="threadpilot-sim__flow-dot ${dotClassName}" style="left:${left}%"></span>`;
    })
    .join('');
}

function averageThroughput(setup, simTime) {
  pruneOldEvents(setup.completions, simTime);
  if (setup.completions.length === 0) return null;

  return (setup.completions.length / THROUGHPUT_WINDOW_MS) * 1000;
}

function percentile(sortedValues, quantile) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * quantile));
  return sortedValues[index];
}

function setLifecycleState(card, setup) {
  card.classList.toggle('threadpilot-sim__card--dead', setup.dead);
  card.classList.toggle('threadpilot-sim__card--respawning', setup.respawning);
}

function setBadState(element, isBad) {
  element.classList.toggle('threadpilot-sim__value--bad', isBad);
}

function formatLatency(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value)} ms`;
}

function formatThroughput(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)} req/s`;
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
