# ultramark

Aggressively small, streaming, browser-embeddable markdown parser for agents. Strict, well-shaped subset of Markdown — not CommonMark. Companion to ultrahtml (HTML strings ↔ AST bridge lives there).

## Architecture

- `src/index.ts` — string core, zero deps. Line-fed state machine (`createParser`); `push(chunk)` returns HTML for **closed blocks only** (stable, append-only), `peek()` tentatively renders the in-flight block (feeds the partial line buffer, then rolls state back), `end()` flushes.
- Inline = single pass: escape → stash code/link tags behind `\x00N\x00` → regex pipeline → restore. No AST is built anywhere in the core.
- `peek()` swaps the active inline renderer (`il`) from `inline` to `eager`: unterminated trailing constructs (`` ` ``, `**`/`*`/`***`/`~~` with a non-space after the run, `[text](partial-url`) render as open elements, trailing unresolved marker runs are withheld, and still-resolving line-start syntax (list/fence markers, partial checkboxes, pipe-first paragraphs) is not fed at all. Tentative-only; stable output always uses the conservative pipeline. `test/stream.test.ts` enforces a no-raw-syntax invariant char-by-char.
- Blocks: fence state holds until closing fence; lists collect `[indent, ordered, text, start]` tuples grouped by indent at flush; tables are detected at paragraph-flush time (header + delimiter row); blockquotes recurse via a fresh `createParser`.
- `src/ast.ts` (`ultramark/ast`) — wraps the core, each delta parsed into an ultrahtml `Document`. Only entrypoint that depends on ultrahtml.
- `src/dom.ts` (`ultramark/dom`) — deltas → `DocumentFragment` via `createContextualFragment`, optional per-element transform hook.

## Conventions

- **Changesets are required** for user-facing changes: `pnpm change` records a `.changeset/*.md` intent (present-tense, user-facing message; minor = feature, patch = fix). CI consumes them on main via `pnpm version -r` → `pnpm publish -r` (npm trusted publishing, OIDC).
- Subset calls (setext→hr, escaped HTML, no ref links, no `_` emphasis, single-line list items, …) are documented in README.md and tested in `test/subset.test.ts`. Any new call must be added to both.
- Streaming correctness is enforced by chunk-invariance tests (`test/stream.test.ts`): chunked input must equal one-shot `parse`.
- Size is a feature. `pnpm build` prints raw + gzip bytes per entrypoint; core should stay well under 2 KB gzip. Codegolf techniques are welcome in the core (regex pipelines, stash placeholders, dispatch maps) but keep tests exhaustive to match.
- Build: esbuild bundle (ultrahtml external) → terser `--toplevel`. Three self-contained ESM bundles; `.d.ts` via `tsc`.

## Commands

- `pnpm test` — vitest (node + happy-dom for `test/dom.test.ts`)
- `pnpm build` — build + size report
- `pnpm bench` — mitata vs markdown-wasm/marked/markdown-it/commonmark.js over `fixtures/`; benches the shipped `dist/` artifact. Note: callback-style `.replace()` is far slower than literal replacements in V8 — keep the hot path literal.
- `pnpm demo` — static server (zero-dep `scripts/serve.mjs`) for `demo/index.html`: simulated token stream → `ultramark/dom`, stable appends + dimmed `peek()` tail.
