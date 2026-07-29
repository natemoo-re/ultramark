# `ultramark`

An **aggressively small, streaming markdown parser** for agents — **~1.5 KB gzipped**, zero dependencies.

Agent output is reliably well-shaped, so ultramark implements a strict, streaming-safe subset of Markdown rather than all of CommonMark. Every ambiguity that would require lookahead is resolved by a documented call (see below), which keeps the parser incremental, partial-safe, and tiny.

Companion to [`ultrahtml`](https://github.com/natemoo-re/ultrahtml).

## Entrypoints

| import | returns | deps | gzip |
| --- | --- | --- | --- |
| `ultramark` | HTML **strings** | none | ~1.5 KB |
| `ultramark/ast` | **ultrahtml `Document`s** (transforms, frameworks) | `ultrahtml` | +60 B |
| `ultramark/dom` | **`DocumentFragment`s** (browser) | none | +110 B |

## Usage

```ts
import { createParser, parse } from 'ultramark';

// One-shot
parse('# Hello **world**'); // => '<h1>Hello <strong>world</strong></h1>\n'

// Streaming: push() returns HTML for blocks completed by that chunk.
// Output is stable and append-only — safe to stream straight into the DOM.
const p = createParser();
for await (const chunk of stream) {
  target.innerHTML = stableHTML + p.peek(); // tentative in-flight block
  stableHTML += p.push(chunk);              // newly closed blocks
}
stableHTML += p.end(); // flush
```

- `push(chunk): string` — HTML for blocks *closed* by this chunk. A block is only emitted once it's complete, so stable output is always well-formed.
- `peek(): string` — tentative render of the currently-open block (including the buffered partial line). **Optimistic and syntax-free**: unterminated constructs render as open elements (`**bol` → `<strong>bol</strong>`, `` `co` `` → `<code>co</code>`, `[text](https://exa` → a partial link), and still-resolving syntax is withheld entirely — trailing marker runs (`about **` → `about `), partial line-start markers (`-`, `1.`, `` ` `` `` ` ``), partial checkboxes, and pipe-first paragraphs (tables-in-progress). peek never shows raw markdown syntax; content that turns out literal pops in, corrected, at close. Stable output is never affected.
- `end(): string` — flush the remaining buffer and any open block.

### `ultramark/ast`

```ts
import { createASTParser, parseAST } from 'ultramark/ast';
import { transformSync, walkSync } from 'ultrahtml';

// Same streaming contract, but each delta is an ultrahtml Document.
// Render to vnodes in your framework, or transform before rendering:
const out = transformSync(parseAST(md), [
  (doc) => (walkSync(doc, (n) => { if (n.name === 'a') n.attributes.rel = 'noopener'; }), doc),
]);
```

### `ultramark/dom`

```ts
import { createDOMParser } from 'ultramark/dom';

const p = createDOMParser((el) => {
  if (el.tagName === 'A') el.setAttribute('target', '_blank');
});
target.append(p.push(chunk)); // DocumentFragment per delta
```

## Supported subset

- **Blocks:** ATX headings (`#`–`######`), paragraphs, fenced code (```` ``` ````/`~~~`, info string → `class="language-x"`), bulleted/ordered lists (indent-nested, `<ol start>`), blockquotes (nestable, full block support via a recursive parser), thematic breaks, GFM tables (with `align`), task lists
- **Inline:** `*em*`, `**strong**`, `***both***`, `~~del~~`, `` `code` ``, `[links](url)`, `![images](url)`, bare-URL autolinks
- **Safe by default:** all raw HTML is escaped; `javascript:`/`vbscript:` URLs are neutralized

## Subset calls (intentionally not CommonMark)

Each of these removes a lookahead that would break incremental streaming:

| Input | Renders as | Why |
| --- | --- | --- |
| `Title\n---` | paragraph + `<hr>` | setext headings need 1-line lookahead |
| `Title\n===` | paragraph with `===` text | same |
| 4-space indent | paragraph text | indented code conflicts with list continuation; agents use fences |
| `<div>` | escaped text | raw HTML is a security hole for untrusted output |
| `_em_` | literal | `_` emphasis breaks on `snake_case` |
| `[text][ref]` | literal | reference definitions can appear after use (whole-doc lookahead) |
| hard breaks (`  \n`) | plain newline | bytes |
| entities | passed through untouched (never double-escaped) | a decoder table costs more than it's worth |
| list item continuation lines | new paragraph | items are single-line + nested lists only |
| fences interrupting lists | closes the list | keeps fence state single-level |

## Development

```sh
pnpm install
pnpm test    # vitest — includes chunk-invariance streaming tests
pnpm build   # esbuild + terser, prints per-entrypoint byte sizes
pnpm bench   # mitata vs markdown-wasm/marked/markdown-it/commonmark.js
pnpm demo    # → http://localhost:3000 — simulated token stream into the DOM
```

The demo (`demo/index.html`) renders a simulated LLM stream with `ultramark/dom`: stable blocks append once, and the dimmed tail is `peek()` — the only region that ever re-renders.
