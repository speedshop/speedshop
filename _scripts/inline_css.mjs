#!/usr/bin/env node
// Inline per-page purged CSS and update fingerprinted asset references.
// For each HTML page, PurgeCSS strips the built stylesheet down to only the
// selectors that page uses, and the result is inlined in place of the
// <!-- INLINE_CSS --> marker.

import { PurgeCSS } from 'purgecss';
import * as fs from 'fs';
import * as path from 'path';

const destDir = process.argv[2] || '_site';
const manifestPath = path.join(destDir, 'assets/manifest.json');
const MARKER = '<!-- INLINE_CSS -->';

function loadManifestEntries() {
  if (!fs.existsSync(manifestPath)) {
    return {};
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.warn(`Manifest JSON invalid at ${manifestPath}: ${error.message}`);
    return {};
  }

  const entries = manifest.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    console.warn(`Manifest entries missing or invalid at ${manifestPath}`);
    return {};
  }
  return entries;
}

function htmlFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...htmlFiles(fullPath));
    } else if (entry.name.endsWith('.html')) {
      found.push(fullPath);
    }
  }
  return found;
}

async function purgeForPage(html, css) {
  const results = await new PurgeCSS().purge({
    content: [{ raw: html, extension: 'html' }],
    css: [{ raw: css }],
  });
  return results[0].css;
}

async function main() {
  const manifestEntries = loadManifestEntries();

  const cssEntry = manifestEntries['/assets/css/app.css'] || '/assets/css/app.css';
  const cssPath = path.join(destDir, cssEntry.replace(/^\//, ''));

  if (!fs.existsSync(cssPath)) {
    throw new Error(`CSS file not found at ${cssPath}`);
  }
  const css = fs.readFileSync(cssPath, 'utf8');

  for (const htmlPath of htmlFiles(destDir)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    let modified = false;

    if (html.includes(MARKER)) {
      const purged = await purgeForPage(html, css);
      const kb = (bytes) => (bytes / 1024).toFixed(1);
      console.log(`Inlining CSS into ${htmlPath} (${kb(css.length)} KB -> ${kb(purged.length)} KB)`);
      html = html.replace(MARKER, () => `<style id="inline-css">${purged}</style>`);
      modified = true;
    }

    for (const [original, hashed] of Object.entries(manifestEntries)) {
      if (original === hashed) {
        continue;
      }
      if (html.includes(original)) {
        html = html.split(original).join(hashed);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(htmlPath, html);
    }
  }
}

main().catch((error) => {
  console.error('CSS inlining failed:', error);
  process.exit(1);
});
