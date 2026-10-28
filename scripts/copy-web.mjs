import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
const entries = ['index.html', 'manifest.webmanifest', 'sw.js', 'icons', 'css', 'js', 'vendor'];

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of entries) {
  await cp(path.join(root, entry), path.join(out, entry), { recursive: true });
}

console.log('Aset web disalin ke www/');
