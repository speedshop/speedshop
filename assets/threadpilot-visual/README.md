# Threadpilot visualization

Copied from `~/src/tries/2026-09-14-threadpilot-visual/production` at commit
`54461d9bc54d1e5fd2dffa8335091e02c4c86104`.

The Threadpilot page embeds `index.html` in four iframes, one per THREAD and
PILOT box, to isolate the player's document selectors, styles, and lifecycle
from the site's charts and PJAX. Each frame picks its video with `?scene=01`
through `?scene=04`, defaulting to scene 01. `?scene=all` plays
`scenes/threadpilot-scene-all.mp4`, the full multi-scene video, which the
single mobile wordmark box uses. `assets/js/threadpilot_frames.js` sets each
frame's `src` from `data-src` (or `data-mobile-src` on phones) only when its
box is displayed, so hidden boxes never load a player.
The parent page supplies the wordmarks, the music, and a fixed mute/unmute icon
in the viewport's top-right corner. `assets/js/threadpilot_music.js` binds that
single control to the page's one audio element, so every embedded player shares
it; each frame fills its box and has no audio. The audio
has no `src` until the first unmute click, so it makes no music requests on page
load.
Playback uses the native audio element's progressive buffering, not a full-file
fetch or blob. The agent worker forwards asset requests, including `Range` and
`If-Range`, so S3 can return partial content. Browsers control how far ahead to
buffer and may eventually download the entire track.
Reduced motion loads `still.jpg`, the original single-video hero's frame at
22.492708 seconds (frame-selection candidate 07), instead of loading a scene. The 160 × 90 JPEG
runs through the normal ASCII renderer in the browser, drawing once at dt=0 and
redrawing only on resize. The frame timestamp also fixes the noise preprocessing
phase. Desktop and mobile use the same source image, rendered at their actual
canvas dimensions. Normal-motion clients never request the JPEG.

The display background and renderer clear color are opaque black. The production
CGA palette uses only black, white, cyan (#55ffff), and magenta (#ff55ff).

The canvas backing store matches its device-pixel content box, using
ResizeObserver's exact device dimensions when they agree within one device
pixel with rounded CSS dimensions times devicePixelRatio, and those rounded
dimensions otherwise. Layout remains in CSS pixels:
the player sets a 4 CSS pixel cell, so columns and rows are the CSS width and
height divided by 4, rounded down. On a 2x display each cell is 8 device pixels,
the atlas's native glyph size.
Each cell occupies round(4 × device width / CSS width) device pixels, with
nearest-neighbor atlas sampling and integer device-pixel centering. Higher
pixel densities do not increase the column or row count or change the CSS
layout size. The renderer's size setting remains in CSS pixels; its scaled
device-pixel cell size is not subject to the setting's validation ceiling.

Renderer source, shaders, atlas, license, built JavaScript, and selected video
and audio are all copied into this directory and committed. Nothing loads from
the original project. `scenes/threadpilot-scene-01.mp4` through `04.mp4` are
160 × 90, 24 fps H.264 scenes with no audio, encoded with the original two-pass
19 kbps recipe. `scenes/threadpilot-scene-all.mp4` is the original project's
69-second `production/dist/video.mp4`, copied byte-for-byte, in the same format. `dist/music.m4a` is the selected production music, copied
byte-for-byte. The music is 142 seconds of stereo AAC-LC
at 44.1 kHz and approximately 96 kbps (1.73 MB). Its MP4 metadata already precedes
the audio data for progressive playback. Keep this encode rather than lowering
its bitrate or sample rate: transcoding this lossy source adds quality loss.
Any future codec comparison should use the original lossless master and listening
tests rather than re-encoding this M4A.

After editing renderer or player source, rebuild from the repository root:

```fish
node _scripts/build_threadpilot_visual.mjs
```

Commit the rebuilt `dist/*.js` alongside source changes. The shader loader and
bundle options match the original production build. The build leaves media intact.
The renderer retains the upstream MIT notice in `textmode.LICENSE`.
