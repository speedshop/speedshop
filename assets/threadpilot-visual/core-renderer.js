// Compact textmode.js 0.18.0-compatible rendering pipeline; see textmode.LICENSE.
import conversion from './convert.frag';
import history from './history.frag';
import display from './display.frag';

const vertex = `#version 300 es
layout(location=0) in vec2 position;
out vec2 uv;
void main(){uv=(position+1.)/2.;gl_Position=vec4(position,0.,1.);}`;
const conversionVertex = `#version 300 es
layout(location=0) in vec2 position;
uniform vec2 geometry,projection;
out vec2 uv;
void main(){uv=(position+1.)/2.;vec2 point=position*.5*geometry;vec2 clip=point*projection;gl_Position=vec4(clip.x,-clip.y,0.,geometry.y*2.);}`;
const ramp = " .'`^\",:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
const defaults = { refresh: 75, size: 8, exposure: 167, contrast: 300, palette: 'cga', words: 51 };
const palettes = ['mono', 'cga', 'source'];
const settingNames = Object.keys(defaults);

function validated(changes, base) {
  for (const key of Object.keys(changes)) if (!settingNames.includes(key)) throw new Error(`Unknown renderer setting: ${key}`);
  const candidate = { ...base, ...changes };
  for (const [key, min, max] of [['refresh', 0, 100], ['size', 3, 24], ['exposure', 50, 400], ['contrast', 50, 300], ['words', 0, 100]]) {
    if (!Number.isFinite(candidate[key]) || candidate[key] < min || candidate[key] > max) throw new Error(`Invalid ${key}`);
  }
  if (!Number.isInteger(candidate.size) || !palettes.includes(candidate.palette)) throw new Error('Invalid size or palette');
  return candidate;
}

export async function createRenderer(canvas, settings = {}) {
  const initialConfig = validated(settings, defaults);
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: false, antialias: false,
    preserveDrawingBuffer: true, depth: false, powerPreference: 'high-performance',
  });
  if (!gl) throw new Error('WebGL 2 is required.');
  const textures = [], programs = [], buffers = [];
  const sample = document.createElement('canvas');
  const context = sample.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required.');
  let config = initialConfig, cols, rows, size, cssWidth, cssHeight, tick = 0, accumulator = 0, rebuild = true, destroyed = false;
  function program(fragment, vertexSource = vertex) {
    const handle = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);gl.shaderSource(shader, source);gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      gl.attachShader(handle, shader);gl.deleteShader(shader);
    }
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
    programs.push(handle);const locations = {};
    return {
      use() { gl.useProgram(handle); },
      uniform(name, type, ...values) { const location = locations[name] ??= gl.getUniformLocation(handle, name);gl[type](location, ...values); },
    };
  }
  function texture() {
    const handle = gl.createTexture();textures.push(handle);gl.bindTexture(gl.TEXTURE_2D, handle);
    for (const key of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, key, gl.NEAREST);
    for (const key of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, key, gl.CLAMP_TO_EDGE);
    return handle;
  }
  function bind(handle, unit) { gl.activeTexture(gl.TEXTURE0 + unit);gl.bindTexture(gl.TEXTURE_2D, handle); }
  function framebuffer() {
    const handle = gl.createFramebuffer(), attachments = [texture(), texture()];
    const buffer = { framebuffer: handle, attachments };buffers.push(buffer);return buffer;
  }

  const convert = program(conversion, conversionVertex), shift = program(history), output = program(display);
  const vertices = gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const image = texture();gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const palette = texture(), glyphs = new Uint8Array(ramp.length * 4);
  Array.from(ramp, (character, index) => { glyphs[index * 4] = character.charCodeAt(0);glyphs[index * 4 + 3] = 255; });
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, ramp.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, glyphs);
  const atlas = texture(), font = new Image();font.src = new URL('../atlas.png', import.meta.url);await font.decode();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, font);
  const fresh = framebuffer();let previous = framebuffer(), next = framebuffer();
  convert.use();convert.uniform('image', 'uniform1i', 0);convert.uniform('palette', 'uniform1i', 1);
  shift.use();for (const [index, name] of ['u_freshGlyph','u_freshInk','u_oldGlyph','u_oldInk'].entries()) shift.uniform(name, 'uniform1i', index);
  shift.uniform('u_wordGlyphs', 'uniform2fv', Array.from('threadpilotspeedshop', character => [character.charCodeAt(0) / 255, 0]).flat());
  output.use();for (const [index, name] of ['glyphs','inks','atlas'].entries()) output.uniform(name, 'uniform1i', index);

  function resize(width, height, layoutWidth = width, layoutHeight = height) {
    if (destroyed) throw new Error('Renderer is destroyed.');
    canvas.width = Math.max(1, Math.round(width));canvas.height = Math.max(1, Math.round(height));
    cssWidth = Math.max(1, layoutWidth);cssHeight = Math.max(1, layoutHeight);
    size = Math.max(1, Math.round(config.size * canvas.width / cssWidth));
    cols = Math.max(1, Math.floor(cssWidth / config.size));rows = Math.max(1, Math.floor(cssHeight / config.size));
    const aspect = cols / rows;sample.width = Math.max(1, Math.round(640 * Math.min(aspect, 1)));sample.height = Math.max(1, Math.round(640 / Math.max(aspect, 1)));
    for (const buffer of buffers) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer.framebuffer);
      buffer.attachments.forEach((handle, index) => {
        bind(handle, 0);gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, handle, 0);
      });
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Unable to allocate rendering buffers.');
    }
    rebuild = true;
  }
  function configure(changes) {
    if (destroyed) throw new Error('Renderer is destroyed.');
    const candidate = validated(changes, config);
    rebuild ||= ['size','exposure','contrast','palette','words'].some(key => candidate[key] !== config[key]);
    const sizeChanged = candidate.size !== config.size;
    config = candidate;if (sizeChanged) resize(canvas.width, canvas.height, cssWidth, cssHeight);
  }
  function draw(media, dt = 1 / 30) {
    if (destroyed) throw new Error('Renderer is destroyed.');
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Frame duration must be a nonnegative finite number.');
    const width = media.videoWidth || media.naturalWidth || media.width, height = media.videoHeight || media.naturalHeight || media.height;
    if (!width || !height) throw new Error('Source has no decoded frame.');
    context.filter = `brightness(${config.exposure / 100}) contrast(${config.contrast / 100})`;
    const scale = Math.max(sample.width / width, sample.height / height);
    context.drawImage(media, (sample.width - width * scale) / 2, (sample.height - height * scale) / 2, width * scale, height * scale);
    bind(image, 0);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sample);bind(palette, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fresh.framebuffer);gl.viewport(0, 0, cols, rows);convert.use();
    convert.uniform('geometry', 'uniform2f', cols, rows);convert.uniform('projection', 'uniform2f', Math.fround(4 / (cols / rows)), 4);convert.uniform('sampleSize', 'uniform2f', sample.width, sample.height);gl.drawArrays(gl.TRIANGLES, 0, 6);
    accumulator += dt * 3;const steps = Math.floor(accumulator);accumulator -= steps;
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer);[...fresh.attachments, ...previous.attachments].forEach(bind);shift.use();
    shift.uniform('u_size', 'uniform2f', cols, rows);shift.uniform('u_tick', 'uniform1f', ++tick);
    shift.uniform('u_refresh', 'uniform1f', 1 - Math.pow(1 - config.refresh / 100, dt * 30));shift.uniform('u_steps', 'uniform1i', steps);
    shift.uniform('u_palette', 'uniform1i', palettes.indexOf(config.palette));shift.uniform('u_rebuild', 'uniform1i', rebuild);shift.uniform('u_words', 'uniform1f', config.words / 100);gl.drawArrays(gl.TRIANGLES, 0, 6);
    [previous, next] = [next, previous];rebuild = false;gl.bindFramebuffer(gl.FRAMEBUFFER, null);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
    const x = Math.floor((canvas.width - cols * size) / 2), y = Math.floor((canvas.height - rows * size) / 2);gl.viewport(x, y, cols * size, rows * size);
    [...previous.attachments, atlas].forEach(bind);output.use();output.uniform('grid', 'uniform2f', cols, rows);output.uniform('pixels', 'uniform2f', cols * size, rows * size);output.uniform('offset', 'uniform2f', x, y);gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  resize(canvas.width, canvas.height);
  return { draw, resize, configure, destroy() {
    if (destroyed) return;destroyed = true;textures.forEach(handle => gl.deleteTexture(handle));programs.forEach(handle => gl.deleteProgram(handle));buffers.forEach(buffer => gl.deleteFramebuffer(buffer.framebuffer));gl.deleteBuffer(vertices);
  } };
}
