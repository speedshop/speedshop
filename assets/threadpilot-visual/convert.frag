#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D image;
uniform sampler2D palette;
uniform vec2 sampleSize;
layout(location=0) out vec4 glyph;
layout(location=1) out vec4 ink;
void main() {
  vec2 centered = uv - .5;
  float dx = .01927651 + .01432108 * centered.x - .01298926 * centered.y;
  float dy = -.00706319 + .02753666 * centered.x + .10902656 * centered.y;
  vec4 color = texture(image, vec2(uv.x + dx / sampleSize.x, 1. - uv.y - dy / sampleSize.y));
  float light = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  int index = int(floor(clamp(light * 67., 0., 67.) + 0.5));
  glyph = vec4(texelFetch(palette, ivec2(index, 0), 0).rg, 0., 0.);
  ink = color;
}
