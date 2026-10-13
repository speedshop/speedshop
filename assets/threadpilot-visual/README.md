# Threadpilot visualization

Copied from `~/src/tries/2026-09-14-threadpilot-visual/production` at commit
`54461d9bc54d1e5fd2dffa8335091e02c4c86104`.

The Threadpilot hero embeds `index.html` in an iframe to isolate the player's
document selectors, styles, and lifecycle from the site's charts and PJAX.
The parent page supplies the heading and a fixed mute/unmute icon in the
viewport's top-right corner. The embedded player binds that same-origin parent
control to its audio; the frame itself fills the hero. Music starts only
on request. Reduced motion loads `still.jpg`, the original video frame at 22.492708 seconds
(frame-selection candidate 07), instead of loading the video. The 160 × 90 JPEG
runs through the normal ASCII renderer in the browser, drawing once at dt=0 and
redrawing only on resize. The frame timestamp also fixes the noise preprocessing
phase. Desktop and mobile use the same source image, rendered at their actual
canvas dimensions. Normal-motion clients never request the JPEG.

Renderer source, shaders, atlas, license, built JavaScript, and selected video
and audio are all copied into this directory and committed. Nothing loads from
the original project. `dist/video.mp4` and `dist/music.m4a` are the selected
production media, copied byte-for-byte.

After editing renderer or player source, rebuild from the repository root:

```fish
node _scripts/build_threadpilot_visual.mjs
```

Commit the rebuilt `dist/*.js` alongside source changes. The shader loader and
bundle options match the original production build. The build leaves media intact.
The renderer retains the upstream MIT notice in `textmode.LICENSE`.
