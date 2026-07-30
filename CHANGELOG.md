# ultramark

## 0.1.0

### Minor Changes

- Rewrites ultramark as a streaming markdown parser for agents, implementing a strict, well-shaped subset of Markdown instead of full CommonMark

  The parser is now incremental: `createParser()` returns `push(chunk)` (stable HTML for closed blocks only), `peek()` (tentative, syntax-free render of the in-flight block), and `end()`. Two new entrypoints join the string core: `ultramark/ast` (ultrahtml Documents, for transforms and frameworks) and `ultramark/dom` (DocumentFragments, for the browser).

  **Breaking:** the 0.0.x API and CommonMark coverage are replaced. Raw HTML is escaped by default, and setext headings, reference links, `_` emphasis, indented code blocks, and hard breaks are intentionally unsupported — see the README for the documented subset.
