#!/usr/bin/env node
// Build script using esbuild for both JS and CSS bundling.

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const destDir = args[0] || '_site';

const JS_ENTRYPOINTS = { app: 'assets/js/main.js' };
const CSS_ENTRYPOINTS = { app: 'assets/css/app.css' };

console.log(`Building assets to ${destDir}...`);

const jsOutDir = path.join(destDir, 'assets/js');
const cssOutDir = path.join(destDir, 'assets/css');
const manifestPath = path.join(destDir, 'assets/manifest.json');

function assertFileExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found at ${filePath}`);
  }
  if (!fs.statSync(filePath).isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
}

function ensureDirectory(dirPath, label) {
  if (fs.existsSync(dirPath) && !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} must be a directory: ${dirPath}`);
  }
  fs.mkdirSync(dirPath, { recursive: true });
}

function validateInputs() {
  ensureDirectory(destDir, 'Destination');
  Object.values(JS_ENTRYPOINTS).forEach((entry) => assertFileExists(entry, 'JS entrypoint'));
  Object.values(CSS_ENTRYPOINTS).forEach((entry) => assertFileExists(entry, 'CSS entrypoint'));
}

function logOutputs(result) {
  for (const [file, info] of Object.entries(result.metafile.outputs)) {
    console.log(`  -> ${file}: ${(info.bytes / 1024).toFixed(2)} KB`);
  }
}

function manifestEntryLookup(entrypoints) {
  const lookup = new Map();
  Object.entries(entrypoints).forEach(([name, entryPath]) => {
    lookup.set(path.resolve(entryPath), name);
  });
  return lookup;
}

function addManifestEntries(manifest, result, entrypoints, logicalDir, extension) {
  const lookup = manifestEntryLookup(entrypoints);
  for (const [outputPath, outputInfo] of Object.entries(result.metafile.outputs)) {
    if (!outputInfo.entryPoint) {
      continue;
    }
    const entryName = lookup.get(path.resolve(outputInfo.entryPoint));
    if (!entryName) {
      continue;
    }
    const logicalPath = `/${logicalDir}/${entryName}.${extension}`;
    const relativeOutput = path.relative(destDir, outputPath).replace(/\\/g, '/');
    manifest.entries[logicalPath] = `/${relativeOutput}`;
  }
}

function writeManifest(manifest) {
  ensureDirectory(path.dirname(manifestPath), 'Manifest directory');
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote manifest to ${manifestPath}`);
}

// Build JavaScript with tree-shaking.
async function buildJS() {
  console.log('Building JavaScript with tree-shaking...');

  // Keep IIFE output because the HTML uses a classic script tag (not type="module").
  const result = await esbuild.build({
    entryPoints: JS_ENTRYPOINTS,
    bundle: true,
    minify: true,
    treeShaking: true,
    outdir: jsOutDir,
    entryNames: '[name]-[hash]',
    assetNames: '[name]-[hash]',
    format: 'iife',
    target: ['es2017'],
    metafile: true,
  });

  logOutputs(result);
  return result;
}

// Build CSS with bundling (replaces postcss-import and postcss-nested).
// Target older browsers to transform CSS nesting syntax.
async function buildCSS() {
  console.log('Building CSS...');

  const result = await esbuild.build({
    entryPoints: CSS_ENTRYPOINTS,
    bundle: true,
    minify: true,
    outdir: cssOutDir,
    entryNames: '[name]-[hash]',
    assetNames: '[name]-[hash]',
    loader: { '.css': 'css' },
    // Target Chrome 100, Firefox 100, Safari 15 to transform CSS nesting.
    target: ['chrome100', 'firefox100', 'safari15'],
    metafile: true,
  });

  logOutputs(result);
  return result;
}

async function main() {
  try {
    validateInputs();
    ensureDirectory(jsOutDir, 'JavaScript output');
    ensureDirectory(cssOutDir, 'CSS output');

    const [jsResult, cssResult] = await Promise.all([buildJS(), buildCSS()]);

    const manifest = {
      version: 1,
      generatedAt: new Date().toISOString(),
      entries: {},
    };
    addManifestEntries(manifest, jsResult, JS_ENTRYPOINTS, 'assets/js', 'js');
    addManifestEntries(manifest, cssResult, CSS_ENTRYPOINTS, 'assets/css', 'css');
    writeManifest(manifest);

    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
