# Threadpilot visualization

Copied from `~/src/tries/2026-09-14-threadpilot-visual/production` at commit
`54461d9bc54d1e5fd2dffa8335091e02c4c86104`.

The Threadpilot hero embeds `index.html` in an iframe to isolate the player's
document selectors, styles, and lifecycle from the site's charts and PJAX.
The parent page supplies the heading and a fixed mute/unmute icon in the
viewport's top-right corner. The embedded player binds that same-origin parent
control to its audio; the frame itself fills the hero. The audio has no `src`
until the first unmute click, so it makes no music requests on page load.
Playback uses the native audio element's progressive buffering, not a full-file
fetch or blob. The agent worker forwards asset requests, including `Range` and
`If-Range`, so S3 can return partial content. Browsers control how far ahead to
buffer and may eventually download the entire track.
Reduced motion loads `still.jpg`, the original video frame at 22.492708 seconds
(frame-selection candidate 07), instead of loading the video. The 160 × 90 JPEG
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
columns and rows are the CSS width and height divided by 8, rounded down.
Each cell occupies round(8 × device width / CSS width) device pixels, with
nearest-neighbor atlas sampling and integer device-pixel centering. Higher
pixel densities do not increase the column or row count or change the CSS
layout size. The renderer's size setting remains in CSS pixels; its scaled
device-pixel cell size is not subject to the setting's validation ceiling.

Renderer source, shaders, atlas, license, built JavaScript, and selected video
and audio are all copied into this directory and committed. Nothing loads from
the original project. `dist/video.mp4` and `dist/music.m4a` are the selected
production media, copied byte-for-byte. The music is 142 seconds of stereo AAC-LC
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
