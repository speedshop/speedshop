#version 300 es
precision highp float;
uniform vec2 u_size;
uniform float u_tick, u_refresh;
uniform int u_steps, u_palette;
uniform float u_words;
uniform vec2 u_wordGlyphs[20];
uniform bool u_rebuild;
uniform sampler2D u_freshGlyph, u_freshInk;
uniform sampler2D u_oldGlyph, u_oldInk;
layout(location = 0) out vec4 o_glyph;
layout(location = 1) out vec4 o_ink;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy);
  vec2 block = floor(vec2(cell) / vec2(10. * 1.7, 10.));
  float direction = hash(block + floor(u_tick / 240.0));
  ivec2 movement;
  if (direction < 0.25) movement = ivec2(1, 0);
  else if (direction < 0.5) movement = ivec2(-1, 0);
  else if (direction < 0.75) movement = ivec2(0, 1);
  else movement = ivec2(0, -1);
  ivec2 origin = cell - movement * u_steps;
  bool outside = any(lessThan(origin, ivec2(0))) || any(greaterThanEqual(origin, ivec2(u_size)));
  bool replace = u_rebuild || outside || hash(vec2(cell) + u_tick * vec2(0.73, 1.39)) < u_refresh;
  if (replace) {
    o_glyph = texelFetch(u_freshGlyph, cell, 0);
    o_ink = texelFetch(u_freshInk, cell, 0);
  } else {
    o_glyph = texelFetch(u_oldGlyph, origin, 0);
    o_ink = texelFetch(u_oldInk, origin, 0);
  }
  // Stable word placements last three seconds, then enter the shifting history.
  ivec2 tile = cell / ivec2(24, 8);
  vec2 seed = vec2(tile) + floor(u_tick / 90.0) * vec2(7.13, 3.71);
  int wordLength = hash(seed + 5.0) < 0.5 ? 11 : 9;
  int offset = wordLength == 11 ? 0 : 11;
  ivec2 start = tile * ivec2(24, 8) + ivec2(int(hash(seed + 9.0) * 13.0), int(hash(seed + 17.0) * 8.0));
  int letter = cell.x - start.x;
  ivec2 center = start + ivec2(wordLength / 2, 0);
  vec4 wordInk = texelFetch(u_freshInk, clamp(center, ivec2(0), ivec2(u_size) - 1), 0);
  float wordLight = dot(wordInk.rgb, vec3(0.299, 0.587, 0.114));
  bool word = hash(seed) < u_words && cell.y == start.y && letter >= 0 && letter < wordLength
    && start.x + wordLength <= int(u_size.x) && wordLight > 0.15;
  if (word) {
    o_glyph = vec4(u_wordGlyphs[offset + letter], 0.0, 0.0);
    o_ink = wordInk;
  }
  if (replace || word) {
    float light = dot(o_ink.rgb, vec3(0.299, 0.587, 0.114));
    if (u_palette == 0) o_ink.rgb = vec3(0.91, 0.94, 0.85);
    else if (u_palette == 1) {
      o_ink.rgb = light > 0.7 ? vec3(1.0) : light > 0.35 ? vec3(0.33, 1.0, 1.0) : vec3(1.0, 0.33, 1.0);
    }
  }
}
