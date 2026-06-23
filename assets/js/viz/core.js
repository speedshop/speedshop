const N = 512;

const PRE = `precision highp float;
uniform float T;uniform vec2 R;uniform sampler2D D;
mat2 rt(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
float sd2(vec2 q){
vec2 uv=clamp(q*vec2(.3846,-.3846)+.5,0.,1.);
float d=(texture2D(D,uv).r-.5)*.406;
vec2 b=abs(q)-1.3;
return d+length(max(b,0.));}
float lg(vec3 p){
vec2 w=vec2(sd2(p.xy),abs(p.z)-.18);
return(min(max(w.x,w.y),0.)+length(max(w,0.)))*.7;}`;

const MARCH = `
vec3 nm(vec3 p){
vec2 e=vec2(.006,0.);
return normalize(vec3(mp(p+e.xyy)-mp(p-e.xyy),mp(p+e.yxy)-mp(p-e.yxy),mp(p+e.yyx)-mp(p-e.yyx)));}
float mh(vec3 ro,vec3 rd,float mx){
float t=.01;
for(int i=0;i<90;i++){
float d=mp(ro+rd*t);
if(d<.0015*t+.001)return t;
t+=d;
if(t>mx)return-1.;}
return-1.;}`;

const SH = `
float sh(vec3 p,vec3 l){
float r=1.,t=.06;
for(int i=0;i<20;i++){
float d=mp(p+l*t);
r=min(r,12.*d/t);
t+=clamp(d,.04,.4);
if(r<.02||t>5.)break;}
return clamp(r,0.,1.);}`;

const buildSDF = () => {
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  const s = (N * 0.66) / 982;
  x.setTransform(s, 0, 0, s, N / 2 - s * 505.4, N / 2 - s * 540.5);
  x.fill(new Path2D('M432.82 936.54c8.66-6.23 26.27-20.04 37.37-32.5 32.73-37.1 32.5-76.64-200.85-394.57-77.72-106.03-106.97-168.72-106.97-231 17.2-155.47 144.9-146 218.96-146 65-.8 149.36 0 215.3 0l-20.04 14.2c-38.32 26.4-65 54.18-50.9 97.78C536 275.2 611 388.67 707.12 518.67c107.4 144.9 139.5 205.55 143.56 272.7 2.15 120.8-114.16 156.14-181.2 156.28H417.66z'));
  for (const [cx, cy] of [[185.56, 777.98], [825.23, 302.02]]) {
    x.beginPath();
    x.arc(cx, cy, 171.02, 0, 7);
    x.fill();
  }
  const a = x.getImageData(0, 0, N, N).data;
  const dt = (d) => {
    for (const s of [1, -1]) {
      const lo = s > 0 ? 0 : N - 1, hi = s > 0 ? N : -1;
      for (let y = lo; y !== hi; y += s) {
        for (let x2 = lo; x2 !== hi; x2 += s) {
          const i = y * N + x2;
          if (x2 !== lo) d[i] = Math.min(d[i], d[i - s] + 1);
          if (y !== lo) {
            d[i] = Math.min(d[i], d[i - s * N] + 1);
            if (x2 !== lo) d[i] = Math.min(d[i], d[i - s * N - s] + 1.4142);
            if (x2 !== hi - s) d[i] = Math.min(d[i], d[i - s * N + s] + 1.4142);
          }
        }
      }
    }
  };
  const din = new Float32Array(N * N), dout = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const inside = a[i * 4 + 3] > 127;
    din[i] = inside ? 1e9 : 0;
    dout[i] = inside ? 0 : 1e9;
  }
  dt(din);
  dt(dout);
  const sdf = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    sdf[i] = 255 * (0.5 + Math.max(-1, Math.min(1, (dout[i] - din[i]) / 40)) / 2);
  }
  return sdf;
};

const runGL = (canvas, make, onFirstFrame) => {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const mkProg = (fs) => {
    const pr = gl.createProgram();
    gl.attachShader(pr, vs);
    gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr);
    const at = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    pr.u = {};
    for (let i = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS) - 1; i >= 0; i--) {
      const nm = gl.getActiveUniform(pr, i).name;
      pr.u[nm] = gl.getUniformLocation(pr, nm);
    }
    return pr;
  };
  const mkTex = (unit, filt, wrap) => {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return tex;
  };
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  mkTex(0, gl.LINEAR, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, N, N, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, buildSDF());

  const viz = make({ canvas, gl, mkProg, mkTex, PRE, MARCH, SH });

  let W = 0, H = 0, frameId = null, shown = false, still = false;
  const t0 = performance.now();
  const resize = () => {
    const w = (canvas.clientWidth / 2) | 0, h = (canvas.clientHeight / 2) | 0;
    if (w < 1 || (w === W && h === H)) return;
    W = w;
    H = h;
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
    viz.resize(W, H);
  };
  const frame = (now) => {
    frameId = null;
    if (W < 1) return;
    viz.draw(still ? viz.staticT : (now - t0) / 1000, still);
    if (!shown) {
      shown = true;
      if (onFirstFrame) onFirstFrame();
    }
    if (!still) frameId = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  };
  const start = (asStill) => {
    still = !!asStill;
    if (frameId === null) frameId = requestAnimationFrame(frame);
  };
  return { resize, start, stop };
};

const run2D = (canvas, make, onFirstFrame) => {
  const viz = make({ canvas });
  if (!viz) return null;

  let W = 0, H = 0, frameId = null, shown = false, still = false, t0 = 0;
  const resize = () => {
    const scale = Math.min(devicePixelRatio || 1, 1.25);
    const w = Math.max(1, (canvas.clientWidth * scale) | 0);
    const h = Math.max(1, (canvas.clientHeight * scale) | 0);
    if (w === W && h === H) return;
    W = canvas.width = w;
    H = canvas.height = h;
    if (viz.resize) viz.resize(W, H);
  };
  const frame = (now) => {
    frameId = null;
    resize();
    viz.draw(still ? (viz.staticT || 0) : (now - t0) / 1000, still);
    if (!shown) {
      shown = true;
      if (onFirstFrame) onFirstFrame();
    }
    if (!still) frameId = requestAnimationFrame(frame);
  };
  const stop = () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
  };
  const start = (asStill) => {
    still = !!asStill;
    if (!t0) t0 = performance.now();
    if (frameId === null) frameId = requestAnimationFrame(frame);
  };
  return { resize, start, stop };
};

export const boot = (canvas, moduleP, onFirstFrame, shouldBoot) =>
  moduleP.then((m) => {
    if (shouldBoot && !shouldBoot()) return null;
    return (m.canvas2d ? run2D : runGL)(canvas, m.make, onFirstFrame);
  });
