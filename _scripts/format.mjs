#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import * as prettier from 'prettier';

const [destination, cacheDirectory] = process.argv.slice(2);
const cacheEnabled = Boolean(cacheDirectory);
const hash = (content) => createHash('sha256').update(content).digest('hex');
const implementation = hash(fs.readFileSync(new URL(import.meta.url)));
const dependencies = hash(fs.readFileSync(new URL('../package-lock.json', import.meta.url)));

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(name);
    return /\.(html|css|js)$/.test(entry.name) ? [name] : [];
  });
}

if (cacheEnabled) fs.mkdirSync(cacheDirectory, { recursive: true });

for (const filename of files(destination)) {
  const info = await prettier.getFileInfo(filename, { ignorePath: '.prettierignore' });
  if (info.ignored) continue;
  const config = await prettier.resolveConfig(filename, { editorconfig: true });
  const input = fs.readFileSync(filename, 'utf8');
  const key = hash(JSON.stringify([prettier.version, implementation, dependencies, filename, config, input]));
  // Local plugins can change without a lockfile or resolved-config change.
  const cached = cacheEnabled && !config?.plugins?.length ? path.join(cacheDirectory, key) : null;
  let formatted;
  if (cached && fs.existsSync(cached)) {
    const entry = JSON.parse(fs.readFileSync(cached, 'utf8'));
    if (typeof entry.formatted !== 'string' || entry.digest !== hash(entry.formatted)) {
      throw new Error(`Corrupt formatter cache entry: ${cached}`);
    }
    formatted = entry.formatted;
  } else {
    try {
      formatted = await prettier.format(input, { ...config, filepath: filename });
    } catch (error) {
      console.error(`Formatting failed for ${filename}:`, error);
      process.exitCode = 1;
      continue;
    }
    if (cached) {
      const temporary = `${cached}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify({ digest: hash(formatted), formatted }));
      fs.renameSync(temporary, cached);
    }
  }
  if (formatted !== input) fs.writeFileSync(filename, formatted);
}
