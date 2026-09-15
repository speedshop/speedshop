# Threadpilot visualization

Copied from `~/src/tries/2026-09-14-threadpilot-visual/production` at commit
`54461d9bc54d1e5fd2dffa8335091e02c4c86104`.

The Threadpilot hero embeds `index.html` in an iframe to isolate the player's
document selectors, styles, and lifecycle from the site's charts and PJAX.
The parent page supplies the heading; the frame fills the hero and supplies
video and music playback controls. Music starts only on request.

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
