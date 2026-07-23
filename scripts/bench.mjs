// Bench the shipped artifact (dist/) against common parsers.
// Run: pnpm build && node scripts/bench.mjs [fixture]
import { readFileSync, readdirSync } from 'node:fs';
import { run, bench, group, summary, barplot } from 'mitata';
import { parse as ultramark, createParser } from '../dist/index.js';
import { parse as wasm } from 'markdown-wasm';
import { Parser, HtmlRenderer } from 'commonmark';
import { marked } from 'marked';
import MarkdownIt from 'markdown-it';

const reader = new Parser();
const writer = new HtmlRenderer();
const mdit = new MarkdownIt();

const fixtures = readdirSync('fixtures')
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !process.argv[2] || f.includes(process.argv[2]));

for (const f of fixtures) {
  const input = readFileSync(`fixtures/${f}`, 'utf8');
  barplot(() => {
    group(`${f} (${(input.length / 1024).toFixed(1)} KB)`, () => {
      summary(() => {
        bench('ultramark', () => ultramark(input));
        bench('ultramark (64B chunks)', () => {
          const p = createParser();
          let out = '';
          for (let i = 0; i < input.length; i += 64) out += p.push(input.slice(i, i + 64));
          return out + p.end();
        });
        bench('markdown-wasm', () => wasm(input));
        bench('marked', () => marked(input));
        bench('markdown-it', () => mdit.render(input));
        bench('commonmark.js', () => writer.render(reader.parse(input)));
      });
    });
  });
}

await run();
