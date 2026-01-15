#!/usr/bin/env node
// Build script using esbuild for both JS and CSS bundling

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const destDir = args[0] || '_site';

console.log(`Building assets to ${destDir}...`);

// Ensure output directories exist
const jsOutDir = path.join(destDir, 'assets/js');
const cssOutDir = path.join(destDir, 'assets/css');

fs.mkdirSync(jsOutDir, { recursive: true });
fs.mkdirSync(cssOutDir, { recursive: true });

// Build JavaScript with tree-shaking
async function buildJS() {
  console.log('Building JavaScript with tree-shaking...');

  const result = await esbuild.build({
    entryPoints: ['assets/js/main.js'],
    bundle: true,
    minify: true,
    treeShaking: true,
    outfile: path.join(jsOutDir, 'app.js'),
    format: 'iife',
    target: ['es2017'],
    metafile: true,
  });

  // Log bundle analysis
  const outputs = result.metafile.outputs;
  for (const [file, info] of Object.entries(outputs)) {
    console.log(`  -> ${file}: ${(info.bytes / 1024).toFixed(2)} KB`);
  }
}

// Build CSS with bundling (replaces postcss-import and postcss-nested)
// Target older browsers to transform CSS nesting syntax
async function buildCSS() {
  console.log('Building CSS...');

  const result = await esbuild.build({
    entryPoints: ['assets/css/app.css'],
    bundle: true,
    minify: true,
    outfile: path.join(cssOutDir, 'app.css'),
    loader: { '.css': 'css' },
    // Target Chrome 100, Firefox 100, Safari 15 to transform CSS nesting
    target: ['chrome100', 'firefox100', 'safari15'],
    metafile: true,
  });

  // Log bundle analysis
  const outputs = result.metafile.outputs;
  for (const [file, info] of Object.entries(outputs)) {
    console.log(`  -> ${file}: ${(info.bytes / 1024).toFixed(2)} KB`);
  }
}

async function main() {
  try {
    await Promise.all([buildJS(), buildCSS()]);
    console.log('Build complete!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
