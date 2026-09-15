import { createRenderer as createCoreRenderer } from './core-renderer.js';

const vertex = `#version 300 es
layout(location=0) in vec2 position;
out vec2 uv;
void main(){uv=(position+1.)/2.;gl_Position=vec4(position,0.,1.);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D image;
uniform vec2 geometry;
uniform float phase;
uniform float amplitude;
out vec4 outputColor;
float hash(vec2 point,float seed){return fract(sin(dot(point,vec2(127.1,311.7))+seed*74.37)*43758.5453);}
float noise(vec2 cell,float seed){return hash(cell,seed)-hash(cell+vec2(19.1,7.7),seed+13.0);}
void main(){
  vec4 color=texture(image,uv);
  float light=dot(color.rgb,vec3(.299,.587,.114));
  vec2 cell=floor(uv*geometry);
  float frame=floor(phase),blend=smoothstep(0.,1.,fract(phase));
  float dither=mix(noise(cell,frame),noise(cell,frame+1.),blend);
  float darkMask=smoothstep(.035,.16,light);
  outputColor=vec4(clamp(color.rgb+dither*amplitude*darkMask,0.,1.),color.a);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);gl.shaderSource(shader, source);gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

export async function createNoiseRenderer(canvas, rendererSettings, initialNoise, adjustable = false) {
  const renderer = await createCoreRenderer(canvas, rendererSettings);
  const proxy = document.createElement('canvas');
  const gl = proxy.getContext('webgl2', {alpha: false, antialias: false, depth: false});
  if (!gl) { renderer.destroy();throw new Error('WebGL 2 is required for noise preprocessing.'); }
  const program = gl.createProgram();
  let shaders;
  try { shaders = [compile(gl, gl.VERTEX_SHADER, vertex), compile(gl, gl.FRAGMENT_SHADER, fragment)]; }
  catch (error) { renderer.destroy();gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();throw error; }
  shaders.forEach(shader => gl.attachShader(program, shader));gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);shaders.forEach(shader => gl.deleteShader(shader));gl.deleteProgram(program);
    renderer.destroy();gl.getExtension('WEBGL_lose_context')?.loseContext();throw new Error(message);
  }
  shaders.forEach(shader => gl.deleteShader(shader));
  const vertices = gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  const image = gl.createTexture();gl.bindTexture(gl.TEXTURE_2D, image);
  for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.LINEAR);
  for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
  gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  let strength, rate, size = rendererSettings.size ?? 8, destroyed = false;

  function configureNoise(changes) {
    const nextStrength = changes.strength ?? strength, nextRate = changes.rate ?? rate;
    if (!Number.isFinite(nextStrength) || nextStrength < 0 || nextStrength > 100) throw new Error('Invalid preview noise strength');
    if (!Number.isFinite(nextRate) || nextRate < 1 || nextRate > 24) throw new Error('Invalid preview noise rate');
    strength = nextStrength;rate = nextRate;
  }
  function configure(changes) {
    renderer.configure(changes);
    if (changes.size !== undefined) size = changes.size;
  }
  function draw(media, dt) {
    if (destroyed) throw new Error('Renderer is destroyed.');
    if (strength === 0) { renderer.draw(media, dt);return; }
    if (gl.isContextLost()) throw new Error('Noise renderer lost - reload to continue.');
    const width = media.videoWidth || media.naturalWidth || media.width;
    const height = media.videoHeight || media.naturalHeight || media.height;
    const proxyWidth = Math.max(1, Math.round(640 * Math.min(width / height, 1)));
    const proxyHeight = Math.max(1, Math.round(640 / Math.max(width / height, 1)));
    if (proxy.width !== proxyWidth || proxy.height !== proxyHeight) { proxy.width = proxyWidth;proxy.height = proxyHeight;gl.viewport(0, 0, proxy.width, proxy.height); }
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D, image);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
    gl.useProgram(program);gl.uniform2f(gl.getUniformLocation(program, 'geometry'), Math.max(1, Math.floor(canvas.width / size)), Math.max(1, Math.floor(canvas.height / size)));
    const mediaTime = Number.isFinite(media.currentTime) ? media.currentTime : 0;
    gl.uniform1f(gl.getUniformLocation(program, 'phase'), mediaTime * rate);
    gl.uniform1f(gl.getUniformLocation(program, 'amplitude'), strength / 100 * .08);
    gl.drawArrays(gl.TRIANGLES, 0, 6);renderer.draw(proxy, dt);
  }
  configureNoise(initialNoise);
  const api = {
    draw,
    resize: renderer.resize,
    configure,
    destroy() {
      if (destroyed) return;destroyed = true;renderer.destroy();gl.deleteTexture(image);gl.deleteBuffer(vertices);gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
  if (adjustable) api.configureNoise = configureNoise;
  return api;
}
