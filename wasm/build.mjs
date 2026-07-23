// Compile wasm/ultramark.wat -> ultramark.wasm (+ optional wasm-opt -Oz), report sizes.
// Run: node wasm/build.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import wabtInit from 'wabt';

const dir = dirname(fileURLToPath(import.meta.url));
const watPath = join(dir, 'ultramark.wat');
const rawPath = join(dir, 'ultramark.wasm');

const wabt = await wabtInit();
const mod = wabt.parseWat(watPath, readFileSync(watPath, 'utf8'), {
  // features we lean on
  mutable_globals: true,
  bulk_memory: true,
  sign_extension: true,
});
mod.resolveNames();
mod.validate();
const { buffer } = mod.toBinary({ log: false, write_debug_names: false });
const raw = Buffer.from(buffer);
writeFileSync(rawPath, raw);

let optBytes = null;
const wasmOpt = join(dir, '..', 'node_modules', '.bin', 'wasm-opt');
if (existsSync(wasmOpt)) {
  const optPath = join(dir, 'ultramark.opt.wasm');
  try {
    execFileSync(wasmOpt, ['-Oz', '--enable-bulk-memory', '--enable-sign-ext', rawPath, '-o', optPath]);
    optBytes = readFileSync(optPath);
    writeFileSync(rawPath, optBytes); // ship the optimized one as the canonical artifact
    execFileSync('rm', ['-f', optPath]); // drop the temp
  } catch (e) {
    console.warn('wasm-opt failed, using unoptimized:', e.message);
  }
}

const report = (label, buf) =>
  console.log(`${label}\t${buf.length} B\t${gzipSync(buf).length} B gzip`);

report('wat2wasm', raw);
if (optBytes) report('wasm-opt -Oz', optBytes);
console.log(`\nJS core (ref)\t3070 B\t1523 B gzip`);
