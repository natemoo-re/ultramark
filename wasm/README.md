# ultramark — hand-written WebAssembly experiment

A bounded experiment: can the ultramark core (`src/index.ts`) be reimplemented
as hand-written WebAssembly text (`.wat`), and how do size + performance compare?
Side-by-side only — nothing in `src/`, `test/`, or elsewhere is touched.

## Layout

| file | what |
| --- | --- |
| `ultramark.wat` | the parser: line-fed block state machine + 6-pass inline pipeline with a stash side-table. No regex — hand-rolled byte scanners. |
| `build.mjs` | `wat` → `wasm` via the `wabt` npm package, then `wasm-opt -Oz` (binaryen). Prints raw + gzip bytes. |
| `shim.mjs` | Node ESM wrapper exposing the same `{ push, peek, end }` string API as the JS core (TextEncoder/Decoder marshaling). |
| `verify.mjs` | runs the existing test corpus (basics, subset calls, chunk-invariance @ 1/2/3/5/8/13) against the shim, byte-for-byte vs the JS core. |
| `bench.mjs` | mitata: wasm (one-shot + 64B chunks) vs `dist/index.js` vs `markdown-wasm` over `fixtures/{lorem1,lorem2,spec}.md`. |

```sh
node wasm/build.mjs     # produces wasm/ultramark.wasm (gitignored)
node wasm/verify.mjs    # 83/83 parity checks
pnpm build && node wasm/bench.mjs
```

## Design

- **No regex.** Every JS regex is a hand-rolled scanner/DFA over linear memory
  (block matchers, the emphasis backreference, balanced-paren link URLs, the
  `&(?![#\w]+;)` entity lookahead, table delimiter rows).
- **Two bump arenas + stable/scratch output.** `push()` appends to a stable
  output watermark and returns `[old, new)`; `peek()` clones the live parser
  (struct + line records) into scratch memory, renders tentatively, and rolls
  the watermark back — no mutation of stable state.
- **Inline stash.** Code spans and link/image tags are stashed behind `\0N\0`
  placeholders in a side table so later passes (emphasis, strike, autolink)
  can't touch them; a final pass expands them into the output.
- **Blockquotes recurse** via a fresh parser over the inner line range; lists
  use an index array + indent comparison for nesting; tables are detected at
  paragraph-flush time. String constants live in one data-segment blob.
- Classification (`isws`/`isdigit`/`isword`) is inline comparisons rather than a
  256-byte table — smaller in wasm for this subset.

## Results

**Size** (vs JS core 3070 B raw / 1523 B gzip):

| | raw | gzip |
| --- | --- | --- |
| `wat2wasm` | 9089 B | 3898 B |
| `wasm-opt -Oz` | **7973 B** | **3549 B** |

~2.6× the JS core raw, ~2.3× gzipped.

**Bench** (median µs/ms per parse; lower is better):

| fixture | wasm | wasm 64B | js core | js core 64B | markdown-wasm |
| --- | --- | --- | --- | --- | --- |
| lorem1 (3.7 KB) | 75.8 µs | 116 µs | **22.9 µs** | 32.7 µs | 25.4 µs |
| lorem2 (14.7 KB) | 295 µs | 549 µs | **84.5 µs** | 123 µs | 89.3 µs |
| spec (159 KB) | 3.88 ms | 5.26 ms | 5.63 ms | 6.17 ms | **2.98 ms** |

There's a **crossover**: the JS core wins decisively on small inputs (V8 JITs
the regex pipeline superbly and there's no FFI/marshaling overhead), but the
wasm one-shot **beats the JS core at scale** (spec.md: 3.88 ms vs 5.63 ms) while
allocating ~440 KB vs the JS core's ~5 MB per parse. `markdown-wasm` (a mature
C library) stays fastest on the large input. The 64B-chunk streaming path pays a
per-`push` cost (boundary crossing + TextEncoder/Decoder ~2500× for spec.md), so
it trails its one-shot sibling everywhere.

**Test parity: 83/83** verify checks pass. Across all 27 fixtures × 2 modes
(one-shot + 64B chunked), **53/54 match the JS core byte-for-byte**.

### Divergences

- **42-digit ordered-list `start`** (`fixtures/block-list-flat.md`): a list item
  beginning with a 42-digit number. The JS core does `+"111…"` → the float
  `1.11e+41`; the wasm parses into an `i32` and wraps to `3340530119`. Both
  mangle a pathological input differently; not worth an i64/bignum path.

## Honest assessment

Hand-written WAT is **viable but not a clear win as a distribution target here.**

- **Easy:** the block state machine ported almost 1:1 — line splitting, the
  fence/heading/hr/quote/list matchers, and the peek-via-clone rollback are
  natural in a bump-allocated linear-memory model, and streaming
  chunk-invariance fell out for free once `push`/`peek`/`end` were plumbed.
- **Hard:** faithfully reproducing regex semantics by hand — the emphasis
  backreference (`\1`), balanced-paren link destinations, the entity-aware `&`
  escape, and setext/hash-stripping edge cases — is where the line count and the
  bug surface live. It works, but it's the bulk of the code.
- **Size** is the real problem for a "~1.5 KB" library: even at `-Oz` the binary
  is ~2.3× the gzipped JS core, and that's *before* the JS shim a host needs.
- **Perf** only pays off past ~100 KB one-shot; ultramark's actual workload is
  small streamed chunks, which is exactly where the FFI overhead makes wasm
  lose. For this parser's shape, the zero-dep JS core remains the better target;
  wasm would only make sense for very large one-shot documents.
