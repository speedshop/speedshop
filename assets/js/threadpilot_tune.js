(() => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const count = 120;
  const series = { thr: [], mem: [], rps: [], p99: [] };
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const spike = random() < 0.12 + t * 0.25 ? random() * (0.25 + t * 0.55) : 0;
    series.thr.push(78);
    series.mem.push(70 - t * 38 - (i % 24) * 0.5 + random() * 2);
    series.p99.push(Math.max(2, 72 - t * 30 - spike * 100 + random() * 6));
    series.rps.push(46 + t * 14 + spike * 45 + random() * 5);
  }
  document.querySelectorAll(".threadpilot-fold-sim-plot polyline").forEach((line) => {
    const values = series[line.dataset.series];
    line.setAttribute("points", values.map((y, i) => `${(i / (count - 1)) * 100},${y}`).join(" "));
  });

  const bones = new Set();
  const joints = new Set();
  const fill = (x, y, w, h, set = bones) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) set.add(`${x + i},${y + j}`);
  };
  const bone = (x0, y0, x1, y1, w = 2) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      fill(Math.round(x0 + ((x1 - x0) * s) / steps), Math.round(y0 + ((y1 - y0) * s) / steps), w, 1);
    }
  };
  const fingers = [
    [8, 4, [3, 4, 5], 11],
    [12, 1, [3, 5, 6], 13],
    [16, 3, [3, 4, 5], 15],
    [20, 7, [2, 3, 4], 17],
  ];
  for (const [x, tip, segments, wrist] of fingers) {
    let y = tip;
    for (const length of segments) {
      fill(x, y, 2, length);
      fill(x - 1, y + length - 1, 1, 1, joints);
      fill(x + 2, y + length - 1, 1, 1, joints);
      y += length + 1;
    }
    bone(x, y, wrist, 31);
  }
  bone(9, 32, 4, 25);
  bone(3, 23, 1, 19);
  bone(1, 17, 1, 15);
  fill(11, 33, 2, 2);
  fill(14, 33, 2, 2);
  fill(17, 33, 2, 2);
  fill(12, 36, 3, 2);
  fill(16, 36, 2, 2);
  fill(12, 39, 3, 14);
  fill(17, 39, 2, 14);
  fill(11, 52, 5, 2);
  fill(16, 52, 4, 2);
  const hand = document.querySelector(".threadpilot-fold-hand");
  const path = (set, color) => `<path fill="${color}" d="${[...set].map((p) => { const [x, y] = p.split(","); return `M${x} ${y}h1v1h-1z`; }).join("")}"/>`;
  hand.innerHTML = path(bones, "#fff") + path(joints, "#aaaaaa");

  const pilot = document.querySelector(".threadpilot-fold-pilot");
  const tune = document.querySelector(".threadpilot-fold-tune");
  const nominal = document.querySelector(".threadpilot-fold-lamp-nominal");
  const [master, ...warnings] = document.querySelectorAll(".threadpilot-fold-lamp:not(.threadpilot-fold-lamp-nominal)");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const offset = { x: 0, y: 0 };
  let pointer = null;
  let pressUntil = 0;
  let bounceStart = -Infinity;
  let lastFrame = performance.now();

  function goal(now) {
    const bounds = hand.getBoundingClientRect();
    const tip = { x: bounds.left - offset.x + (bounds.width * 13) / 24, y: bounds.top - offset.y + bounds.width / 24 };
    const button = tune.getBoundingClientRect();
    const center = { x: button.left + button.width / 2, y: button.top + button.height / 2 };
    if (now < pressUntil) return { x: center.x - tip.x, y: center.y - tip.y };
    if (pointer) {
      const overButton = pointer.x >= button.left && pointer.x <= button.right && pointer.y >= button.top && pointer.y <= button.bottom;
      return { x: (overButton ? center.x : pointer.x) - tip.x, y: pointer.y - tip.y };
    }
    const t = (now - bounceStart) / 700;
    return { x: 0, y: t < 1 ? -24 * Math.abs(Math.sin(t * 2 * Math.PI)) * (1 - t) : 0 };
  }

  const bounce = setInterval(() => {
    if (!pointer && !reduceMotion && tune.getAttribute("aria-pressed") === "false") bounceStart = performance.now();
  }, 5000);

  function frame(now) {
    if (!hand.isConnected) return clearInterval(bounce);
    const target = goal(now);
    const ease = 1 - Math.exp(-(now - lastFrame) / 40);
    lastFrame = now;
    offset.x += (target.x - offset.x) * ease;
    offset.y += (target.y - offset.y) * ease;
    hand.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  pilot.addEventListener("pointermove", (event) => {
    pointer = { x: event.clientX, y: event.clientY };
  });
  pilot.addEventListener("pointerleave", () => {
    pointer = null;
  });

  tune.addEventListener("click", () => {
    pressUntil = performance.now() + 450;
    if (tune.getAttribute("aria-pressed") === "true") return;
    tune.setAttribute("aria-pressed", "true");
    [...warnings, master].forEach((lamp, i) => setTimeout(() => lamp.setAttribute("data-off", ""), 700 * (i + 1)));
    setTimeout(() => nominal.removeAttribute("data-off"), 700 * (warnings.length + 2));
  });
})();
