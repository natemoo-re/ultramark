// Bench the hand-written wasm core (one-shot + 64B streaming) against the
// shipped JS core (dist/index.js) and markdown-wasm, over three fixtures.
// Run: pnpm build && node wasm/bench.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { run, bench, group, summary, barplot } from 'mitata';
import { parse as jsCore, createParser as jsParser } from '../dist/index.js';
import { parse as wasm, createParser as wasmParser } from './shim.mjs';
import { parse as mdwasm } from 'markdown-wasm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = ['lorem1.md', 'lorem2.md', 'spec.md'];

const chunked = (createParser, input) => {
  const p = createParser();
  let out = '';
  for (let i = 0; i < input.length; i += 64) out += p.push(input.slice(i, i + 64));
  return out + p.end();
};

for (const f of fixtures) {
  const input = readFileSync(join(root, 'fixtures', f), 'utf8');
  barplot(() => {
    group(`${f} (${(input.length / 1024).toFixed(1)} KB)`, () => {
      summary(() => {
        bench('wasm', () => wasm(input));
        bench('wasm (64B chunks)', () => chunked(wasmParser, input));
        bench('js core', () => jsCore(input));
        bench('js core (64B chunks)', () => chunked(jsParser, input));
        bench('markdown-wasm', () => mdwasm(input));
      });
    });
  });
}

await run();
