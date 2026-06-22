export const canvas2d = true;

const S = new Path2D('m38.510297 66.40392c.62707-.464633 1.934659-1.483716 2.753165-2.409938 2.416093-2.734053 2.386219-5.657104-14.83493-29.132836-5.741708-7.827052-7.885316-12.457815-7.899879-17.065848 1.276651-11.4727056 10.687993-10.7766363 16.165439-10.7766363 4.798222-.062173 11.03439 0 15.920776 0l-1.495321 1.0477789c-2.825849 1.9502864-4.794401 4.0158354-3.758396 7.2214414.761149 2.291602 6.301731 10.668591 13.406715 20.270056 7.920425 10.703427 10.278794 15.182457 10.605391 20.141856.146647 8.934725-8.439256 11.536683-13.395721 11.548255h-18.606479z');
const R = (n) => {
  const x = Math.sin(n * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const C = ['#ffd166', '#ff6b6b', '#06d6a0', '#ff9f43'];
const pts = (seed, n, lo = 0.15, hi = 0.85) => Array.from({ length: n }, (_, i) => lo + (hi - lo) * (0.5 + 0.45 * Math.sin(seed + i * 0.8) + 0.22 * (R(seed * 7 + i) - 0.5)));
const chart = (kind, seed, n = 16) => {
  const w = 128;
  const h = 86;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(10,12,18,.96)';
  x.fillRect(0, 0, w, h);
  x.fillStyle = `rgba(${30 + kind * 13 % 100},${20 + kind * 7 % 80},${10 + kind * 17 % 60},.16)`;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < 170; i++) {
    x.fillStyle = `rgba(255,255,255,${R(seed + i) * 0.06})`;
    x.fillRect(R(i + seed) * w, R(i + seed + 2) * h, 1, 1);
  }
  x.strokeStyle = 'rgba(240,210,170,.2)';
  x.strokeRect(0.5, 0.5, w - 1, h - 1);
  x.fillStyle = 'rgba(240,210,170,.05)';
  for (let y = 20; y < h; y += 13) x.fillRect(0, y, w, 1);
  x.strokeStyle = 'rgba(255,160,80,.85)';
  x.setLineDash([4, 3]);
  x.beginPath();
  x.moveTo(16, 34 + R(seed) * 22);
  x.lineTo(122, 34 + R(seed) * 22);
  x.stroke();
  x.setLineDash([]);

  const line = (a, col, fill = false) => {
    x.beginPath();
    a.forEach((v, i) => {
      const px = 18 + i * 100 / (a.length - 1);
      const py = 75 - v * 52;
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    if (fill) {
      x.lineTo(118, 75);
      x.lineTo(18, 75);
      x.fillStyle = col.replace(')', ',.16)').replace('rgb', 'rgba');
      x.fill();
    }
    x.strokeStyle = col;
    x.lineWidth = 2;
    x.stroke();
  };

  const values = pts(seed, n);
  const k = kind % 24;
  switch (k) {
    case 0:
      line(values, C[0]);
      line(pts(seed + 2, 16, 0.2, 0.7), C[1]);
      line(pts(seed + 4, 16, 0.1, 0.6), C[2]);
      break;
    case 1:
    case 7:
      for (let i = 0; i < 14; i++) {
        const px = 18 + i * 7;
        let base = 75;
        [0, 1, 2].forEach((j) => {
          const bh = 5 + R(seed + i * 3 + j) * (k === 7 ? 22 : 14);
          x.fillStyle = C[j];
          x.globalAlpha = 0.35 + j * 0.2;
          x.fillRect(px, base - bh, 5, bh);
          base -= bh;
        });
      }
      x.globalAlpha = 1;
      break;
    case 2:
    case 5:
      values.slice(0, 12).forEach((v, i) => {
        x.fillStyle = C[i % C.length];
        x.fillRect(19 + i * 8, 75 - v * 48, 5, v * 48);
      });
      break;
    case 3:
    case 6:
      line(values, C[0], true);
      values.forEach((v, i) => {
        x.fillStyle = v > 0.72 ? C[1] : C[0];
        x.fillRect(17 + i * 7, 75 - v * 52, 3, 3);
      });
      break;
    case 4:
      x.lineWidth = 8;
      x.strokeStyle = 'rgba(255,255,255,.12)';
      x.beginPath();
      x.arc(64, 47, 23, 0, 7);
      x.stroke();
      x.strokeStyle = C[0];
      x.beginPath();
      x.arc(64, 47, 23, -1.57, 4.2 + R(seed));
      x.stroke();
      break;
    case 8:
      for (let i = 0; i < 3; i++) {
        x.fillStyle = C[i];
        x.fillRect(25, 31 + i * 14, 28 + R(seed + i) * 70, 8);
      }
      break;
    case 9:
    case 14:
      for (let yy = 0; yy < 5; yy++) for (let xx = 0; xx < 12; xx++) {
        x.fillStyle = R(seed + yy * 9 + xx) > 0.8 ? C[1] : `rgba(255,200,150,${0.1 + R(seed + xx * yy) * 0.3})`;
        x.fillRect(18 + xx * 8, 25 + yy * 10, 6, 7);
      }
      break;
    case 10:
      for (let i = 0; i < 4; i++) {
        x.strokeStyle = C[i % C.length];
        x.strokeRect(19 + i * 25, 28, 18, 42);
        x.fillStyle = C[i % C.length];
        x.fillRect(21 + i * 25, 68 - R(seed + i) * 34, 14, R(seed + i) * 34);
      }
      break;
    case 11:
      line(values.map((v, i) => (R(seed + i) > 0.86 ? v : 0.12)), C[1]);
      break;
    case 12:
      x.strokeStyle = C[3];
      x.beginPath();
      for (let i = 0; i < 38; i++) {
        const y = i % 9 === 0 ? 32 : i % 13 === 0 ? 64 : 49;
        i ? x.lineTo(18 + i * 2.6, y) : x.moveTo(18, y);
      }
      x.stroke();
      break;
    case 13:
      line(pts(seed, 12, 0.62, 0.9), C[3]);
      break;
    case 15:
      for (let i = 0; i < 24; i++) {
        x.fillStyle = C[i % 4];
        x.beginPath();
        x.arc(18 + R(seed + i) * 96, 24 + R(seed + i + 3) * 50, 1 + R(seed + i + 6) * 4, 0, 7);
        x.fill();
      }
      break;
    case 16:
      for (let i = 0; i < 11; i++) {
        const px = 20 + i * 9, a = 25 + R(seed + i) * 42, b = 25 + R(seed + i + 1) * 42;
        x.strokeStyle = C[i % 4];
        x.beginPath();
        x.moveTo(px + 3, Math.min(a, b) - 5);
        x.lineTo(px + 3, Math.max(a, b) + 5);
        x.stroke();
        x.fillStyle = C[(i + 1) % 4];
        x.fillRect(px, Math.min(a, b), 6, Math.abs(a - b) + 2);
      }
      break;
    case 17:
      for (let i = 0; i < 3; i++) line(pts(seed + i, 14, 0.12 + i * 0.16, 0.42 + i * 0.16), C[i], true);
      break;
    case 18:
      x.save();
      x.translate(64, 48);
      for (let i = 0; i < 18; i++) {
        const a = i * 6.283 / 18, rr = 12 + R(seed + i) * 27;
        x.strokeStyle = C[i % 4];
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        x.stroke();
      }
      x.restore();
      break;
    case 19:
      for (let i = 0; i < 5; i++) {
        const px = 24 + i * 19, a = 26 + R(seed + i) * 34;
        x.strokeStyle = C[i % 4];
        x.beginPath();
        x.moveTo(px, a - 14);
        x.lineTo(px, a + 18);
        x.stroke();
        x.strokeRect(px - 6, a - 7, 12, 16);
        x.fillRect(px - 7, a, 14, 2);
      }
      break;
    case 20:
      x.strokeStyle = C[2];
      x.beginPath();
      values.slice(0, 12).forEach((v, i) => {
        const px = 18 + i * 9, py = 75 - v * 48;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
        x.lineTo(px + 9, py);
      });
      x.stroke();
      break;
    case 21:
      let b = 50;
      for (let i = 0; i < 10; i++) {
        const d = (R(seed + i) - 0.45) * 28;
        x.fillStyle = d > 0 ? C[0] : C[1];
        x.fillRect(18 + i * 9, b, 6, d);
        b += d;
      }
      break;
    case 22:
      for (let j = 0; j < 4; j++) {
        x.save();
        x.translate(18 + (j % 2) * 50, 28 + (j > 1) * 25);
        x.scale(0.45, 0.4);
        line(pts(seed + j, 12), C[j]);
        x.restore();
      }
      break;
    case 23:
      for (let i = 0; i < 6; i++) {
        x.fillStyle = 'rgba(255,255,255,.08)';
        x.fillRect(22, 26 + i * 8, 82, 3);
        x.fillStyle = C[i % 4];
        x.fillRect(22, 26 + i * 8, R(seed + i) * 82, 3);
        x.beginPath();
        x.arc(22 + R(seed + i) * 82, 27.5 + i * 8, 3, 0, 7);
        x.fill();
      }
      break;
  }
  return c;
};
const charts = Array.from({ length: 72 }, (_, i) => chart(i, i * 1.7 + 4, 10 + i % 14));

export const make = ({ canvas }) => {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;
  let W = 1;
  let H = 1;

  const tiles = (t) => {
    const tw = Math.max(78, Math.min(128, W / 5));
    const th = tw * 0.67;
    ctx.save();
    ctx.translate(W * 0.52, H * 0.48);
    ctx.transform(1, 0.14, -0.24, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    for (let c = -7; c < W / tw + 7; c++) for (let r = -9; r < H / th + 11; r++) {
      const n = (c + 30) * 41 + (r + 30) * 19;
      const x = c * tw * 1.06 + R(n) * tw * 0.45 + Math.sin(t * (0.06 + R(n) * 0.1) + n * 2) * tw * (0.12 + R(n + 2) * 0.2) - W * 0.9;
      const y = r * th * 0.9 + (c & 1) * th * 0.4 + R(n + 1) * th * 0.35 + Math.cos(t * (0.05 + R(n + 1) * 0.08) + n * 3) * th * (0.1 + R(n + 3) * 0.18) - H * 0.85;
      ctx.globalAlpha = 0.18 + 0.34 * R(n + 2);
      ctx.drawImage(charts[Math.abs(n) % charts.length], x, y, tw, th);
    }
    ctx.restore();
  };

  const logo = (t) => {
    const s = Math.min(W, H) * 0.84;
    ctx.save();
    ctx.translate(W * 0.5, H * 0.48);
    ctx.scale(s / 72.5, s / 72.5);
    ctx.translate(-36, -30);
    ctx.translate(-7.611342, -6.911814);
    for (const [dx, dy, col] of [[1.6, 0, '#2f3138'], [-1.6, 0, '#aeb2ba']]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = col;
      ctx.fill(S);
      ctx.beginPath();
      ctx.arc(20.236507, 54.694138, 12.625166, 0, 7);
      ctx.arc(67.475166, 19.53698, 12.625166, 0, 7);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = '#e8e8e8';
    ctx.shadowColor = 'rgba(255,255,255,.45)';
    ctx.shadowBlur = 18;
    ctx.fill(S);
    ctx.beginPath();
    ctx.arc(20.236507, 54.694138, 12.625166, 0, 7);
    ctx.arc(67.475166, 19.53698, 12.625166, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  const finish = () => {
    const g = ctx.createRadialGradient(W * 0.38, H * 0.36, 0, W * 0.38, H * 0.36, Math.max(W, H));
    g.addColorStop(0, 'rgba(255,180,120,.16)');
    g.addColorStop(0.55, 'rgba(255,80,90,.08)');
    g.addColorStop(1, 'rgba(0,0,0,.9)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  };

  return {
    staticT: 9,
    resize(w, h) {
      W = w;
      H = h;
      ctx.imageSmoothingEnabled = false;
    },
    draw(t) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);
      tiles(t);
      logo(t);
      finish();
    },
  };
};
