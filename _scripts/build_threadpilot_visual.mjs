import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const root = "assets/threadpilot-visual";
await build({
  entryPoints: [`${root}/player.js`, `${root}/renderer.js`, `${root}/preview-renderer.js`],
  outdir: `${root}/dist`,
  bundle: true,
  format: "esm",
  target: "es2022",
  minify: true,
  legalComments: "none",
  banner: { js: "/*! Includes MIT-licensed textmode.js code; see ../textmode.LICENSE. */" },
  plugins: [{
    name: "shaders",
    setup(build) {
      build.onLoad({ filter: /\.frag$/ }, async ({ path }) => ({
        contents: (await readFile(path, "utf8"))
          .replace(/\/\/[^\n]*/g, "")
          .replace(/\s+/g, " ")
          .replace("#version 300 es ", "#version 300 es\n"),
        loader: "text",
      }));
    },
  }],
});
