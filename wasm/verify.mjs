// Runs the existing ultramark test corpus (basics, subset calls, and the
// streaming chunk-invariance cases) against the wasm shim, comparing against
// the reference JS core byte-for-byte. Reports pass/fail + a divergence list.
//
//   node wasm/build.mjs && node wasm/verify.mjs
import { parse as ref, createParser as refParser } from '../src/index.ts';
import { parse as wasm, createParser as wasmParser } from './shim.mjs';

let pass = 0, fail = 0;
const diverge = [];

const eq = (name, got, want) => {
  if (got === want) { pass++; return true; }
  fail++;
  diverge.push({ name, got, want });
  return false;
};

// ---- basics + subset: parse(input) must equal the reference core ----
const oneshot = [
  // headings
  '# Hello world!', '## Subheading', '### Heading 3', '## Closed ##', '#Nope',
  // blocks
  'This is a paragraph.', 'line one\nline two',
  '- Item 1\n- Item 2', '1. First item\n2. Second item', '3. three\n4. four',
  '- a\n  - b\n  - c\n- d', '- [ ] todo\n- [x] done',
  '> This is a quote', '> ## Title\n> - a\n> - b',
  '```js\nconsole.log("hello");\n```', '```\npartial',
  '---', '***', '___',
  '| a | b |\n|---|:-:|\n| 1 | 2 |',
  // inline
  'This is *italic* text.', 'This is **bold** text.', '***both***', '~~gone~~',
  'This is `inline code`.', '`**not bold** <tag>`',
  '[Link text](https://example.com)', '[**bold** link](https://example.com)',
  '![alt text](https://example.com/x.png)', 'see https://example.com/a?b=1.',
  // subset calls
  'Title\n---', 'Title\n===', '    not code', '<div onclick="x()">hi</div>',
  'some_snake_case and _text_', '[text][ref]\n\n[ref]: https://example.com',
  '[x](javascript:alert(1))', 'fish &amp; chips & salsa',
  '![x" onerror="alert(1)](https://example.com/x.png)',
];
for (const doc of oneshot) eq(`oneshot ${JSON.stringify(doc)}`, wasm(doc), ref(doc));

// ---- chunk-invariance: chunked wasm must equal one-shot reference ----
const corpus = [
  `# Title\n\nA paragraph with **bold** and *italic*.\n\n- a\n- b\n  - c\n\n> quote\n\n\`\`\`js\ncode();\n\`\`\`\n`,
  `| a | b |\n|---|---|\n| 1 | 2 |\n\ntail`,
  `1. one\n2. two\n\n---\n\ntext with [a link](https://example.com) and https://bare.url\n`,
  `no trailing newline`,
  `> multi\n> line\n> quote\n\`\`\`\nfence right after\n\`\`\``,
];
for (const doc of corpus) {
  const want = ref(doc);
  for (const size of [1, 2, 3, 5, 8, 13]) {
    const p = wasmParser();
    let out = '';
    for (let i = 0; i < doc.length; i += size) out += p.push(doc.slice(i, i + size));
    out += p.end();
    eq(`chunk(${size}) ${JSON.stringify(doc.slice(0, 24))}...`, out, want);
  }
}

// ---- streaming semantics (push only emits closed blocks; peek is tentative) ----
{
  const p = wasmParser();
  eq('push partial 1', p.push('partial para'), '');
  eq('push partial 2', p.push(' still going\n'), '');
  eq('push partial 3', p.push('\n'), '<p>partial para still going</p>\n');
}
{
  const p = wasmParser();
  eq('immediate h1', p.push('# Hi\n'), '<h1>Hi</h1>\n');
  eq('immediate hr', p.push('---\n'), '<hr>\n');
}
{
  const p = wasmParser();
  eq('fence hold', p.push('```js\nlet a = 1;\n'), '');
  eq('fence close', p.push('let b = 2;\n```\n'),
    '<pre><code class="language-js">let a = 1;\nlet b = 2;\n</code></pre>\n');
}
{
  const p = wasmParser();
  p.push('hello *wor');
  eq('peek open', p.peek(), '<p>hello *wor</p>\n');
  p.push('ld*\n\n');
  eq('peek closed', p.peek(), '');
}
{
  const p = wasmParser();
  p.push('```py\nx = 1\n');
  eq('peek fence', p.peek(), '<pre><code class="language-py">x = 1\n</code></pre>\n');
}
{
  const p = wasmParser();
  eq('end empty', p.end(), '');
  p.push('tail with no newline');
  eq('end flush', p.end(), '<p>tail with no newline</p>\n');
}
{
  const p = wasmParser();
  let stable = '';
  const doc = corpus[0];
  for (const ch of doc) stable += p.push(ch);
  eq('reconstruct via push+end', stable + p.end(), ref(doc));
}
// \r\n handling
eq('crlf', wasm('# a\r\n\r\nb\r\n'), ref('# a\n\nb\n'));

// ---- report ----
console.log(`\nwasm parity: ${pass}/${pass + fail} passing`);
if (diverge.length) {
  console.log(`\n${diverge.length} divergence(s):`);
  for (const d of diverge) {
    console.log(`\n  ✗ ${d.name}`);
    console.log(`    wasm: ${JSON.stringify(d.got)}`);
    console.log(`    ref : ${JSON.stringify(d.want)}`);
  }
  process.exit(1);
}
