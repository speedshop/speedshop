#version 300 es
precision highp float;
uniform sampler2D glyphs;
uniform sampler2D inks;
uniform sampler2D atlas;
uniform vec2 grid;
uniform vec2 pixels;
uniform vec2 offset;
out vec4 color;
void main() {
  vec2 cell = ((gl_FragCoord.xy - offset) / pixels) * grid;
  ivec2 gridCell = ivec2(floor(cell));
  vec4 glyph = texelFetch(glyphs, gridCell, 0);
  int index = int(glyph.r * 255. + 0.5);
  vec2 origin = vec2(float(index % 16), 15. - float(index / 16)) / 16.;
  vec2 position = origin + clamp(fract(cell), 0., 1.) / 16.;
  vec4 bit = texture(atlas, position);
  float mask = (bit.a > 0. && dot(bit.rgb, vec3(0.299, 0.587, 0.114)) > 0.5) ? 1. : 0.;
  color = mix(vec4(8./255., 12./255., 9./255., 1.), texelFetch(inks, gridCell, 0), mask);
}
