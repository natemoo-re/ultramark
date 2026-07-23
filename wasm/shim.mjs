// Minimal Node ESM wrapper around ultramark.wasm exposing the same
// { push, peek, end } string interface as the JS core (src/index.ts).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const bytes = readFileSync(join(dir, 'ultramark.wasm'));
const { instance } = await WebAssembly.instantiate(bytes, {});
const ex = instance.exports;
const mem = ex.memory;
const INBUF = ex.input_ptr();

const enc = new TextEncoder();
const dec = new TextDecoder();

const readOut = (packed) => {
  // i64: (out_ptr << 32) | out_len
  const ptr = Number(packed >> 32n) >>> 0;
  const len = Number(packed & 0xffffffffn) >>> 0;
  if (len === 0) return '';
  return dec.decode(new Uint8Array(mem.buffer, ptr, len));
};

const writeInput = (str) => {
  const b = enc.encode(str);
  new Uint8Array(mem.buffer, INBUF, b.length).set(b);
  return b.length;
};

export const createParser = () => {
  const h = ex.create();
  return {
    push(chunk) {
      const n = writeInput(chunk);
      return readOut(ex.push(h, INBUF, n));
    },
    peek() {
      return readOut(ex.peek(h));
    },
    end() {
      return readOut(ex.end(h));
    },
  };
};

export const parse = (input) => {
  const p = createParser();
  return p.push(input) + p.end();
};
