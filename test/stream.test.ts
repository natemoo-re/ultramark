import { createParser, parse } from "../src/index";
import { describe, expect, it } from "vitest";

const corpus = [
    `# Title\n\nA paragraph with **bold** and *italic*.\n\n- a\n- b\n  - c\n\n> quote\n\n\`\`\`js\ncode();\n\`\`\`\n`,
    `| a | b |\n|---|---|\n| 1 | 2 |\n\ntail`,
    `1. one\n2. two\n\n---\n\ntext with [a link](https://example.com) and https://bare.url\n`,
    `no trailing newline`,
    `> multi\n> line\n> quote\n\`\`\`\nfence right after\n\`\`\``,
];

describe('streaming', () => {
    it('chunked parsing is identical to one-shot parsing', () => {
        for (const doc of corpus) {
            const expected = parse(doc);
            for (const size of [1, 2, 3, 5, 8, 13]) {
                const p = createParser();
                let out = '';
                for (let i = 0; i < doc.length; i += size) out += p.push(doc.slice(i, i + size));
                out += p.end();
                expect(out, `chunk size ${size}`).toEqual(expected);
            }
        }
    })

    it('handles \\r\\n', () => {
        expect(parse('# a\r\n\r\nb\r\n')).toEqual(parse('# a\n\nb\n'))
    })

    it('push only emits closed blocks', () => {
        const p = createParser();
        expect(p.push('partial para')).toEqual('');
        expect(p.push(' still going\n')).toEqual('');
        expect(p.push('\n')).toEqual('<p>partial para still going</p>\n');
    })

    it('headings and hrs emit immediately', () => {
        const p = createParser();
        expect(p.push('# Hi\n')).toEqual('<h1>Hi</h1>\n');
        expect(p.push('---\n')).toEqual('<hr>\n');
    })

    it('fences hold until closed', () => {
        const p = createParser();
        expect(p.push('```js\nlet a = 1;\n')).toEqual('');
        expect(p.push('let b = 2;\n```\n')).toEqual('<pre><code class="language-js">let a = 1;\nlet b = 2;\n</code></pre>\n');
    })

    it('peek returns the tentative open block', () => {
        const p = createParser();
        p.push('hello *wor');
        expect(p.peek()).toEqual('<p>hello <em>wor</em></p>\n');
        p.push('ld*\n\n');
        expect(p.peek()).toEqual('');
    })

    it('peek eagerly opens unterminated inline constructs', () => {
        const p = createParser();
        p.push('some **bo');
        expect(p.peek()).toEqual('<p>some <strong>bo</strong></p>\n');
        p.push('ld** and `co');
        expect(p.peek()).toEqual('<p>some <strong>bold</strong> and <code>co</code></p>\n');
        p.push('de` plus ~~st');
        expect(p.peek()).toEqual('<p>some <strong>bold</strong> and <code>code</code> plus <del>st</del></p>\n');
        const q = createParser();
        q.push('***bo');
        expect(q.peek()).toEqual('<p><strong><em>bo</em></strong></p>\n');
    })

    it('peek withholds trailing unresolved markers (no FOUT)', () => {
        const p = createParser();
        p.push('about **');
        expect(p.peek()).toEqual('<p>about </p>\n');
        p.push('1.6 KB');
        expect(p.peek()).toEqual('<p>about <strong>1.6 KB</strong></p>\n');
    })

    it('withheld markers still render just-closed constructs', () => {
        for (const [md, html] of [
            ['**bold**', '<p><strong>bold</strong></p>\n'],
            ['`x`', '<p><code>x</code></p>\n'],
            ['a *b*', '<p>a <em>b</em></p>\n'],
            ['~~gone~~', '<p><del>gone</del></p>\n'],
        ]) {
            const p = createParser();
            p.push(md);
            expect(p.peek(), md).toEqual(html);
        }
    })

    it('withheld markers pop in literal when disproven', () => {
        const p = createParser();
        p.push('a **');
        expect(p.peek()).toEqual('<p>a </p>\n');
        p.push(' b');
        expect(p.peek()).toEqual('<p>a ** b</p>\n');
    })

    it('peek flips to a table as soon as a delimiter cell exists', () => {
        const p = createParser();
        p.push('| a | b |');
        expect(p.peek()).toEqual('<p>| a | b |</p>\n'); // pipes alone are ambiguous
        p.push('\n|-');
        expect(p.peek()).toEqual('<table>\n<thead>\n<tr><th>a</th><th>b</th></tr>\n</thead>\n<tbody>\n</tbody>\n</table>\n');
    })

    it('peek shows checkboxes mid-item', () => {
        const p = createParser();
        p.push('- [ ] bu');
        expect(p.peek()).toEqual('<ul>\n<li><input type="checkbox" disabled> bu</li>\n</ul>\n');
        p.push('y\n- [x]');
        expect(p.peek()).toEqual('<ul>\n<li><input type="checkbox" disabled> buy</li>\n<li><input type="checkbox" disabled checked> </li>\n</ul>\n');
    })

    it('peek eagerly links a partial URL after ](', () => {
        const p = createParser();
        p.push('see [the docs](https://exa');
        expect(p.peek()).toEqual('<p>see <a href="https://exa">the docs</a></p>\n');
    })

    it('peek does not open ambiguous constructs', () => {
        const p = createParser();
        p.push('a ** b and [brackets');  // `**` followed by space, bare `[`
        expect(p.peek()).toEqual('<p>a ** b and [brackets</p>\n');
    })

    it('peek speculation never leaks into stable output', () => {
        const p = createParser();
        p.push('2 * 3');
        p.peek(); // would eagerly render <em>3</em> if it leaked
        expect(p.end()).toEqual('<p>2 * 3</p>\n');
        const q = createParser();
        q.push('not **emphasis at all** done');
        q.peek();
        expect(q.end()).toEqual('<p>not <strong>emphasis at all</strong> done</p>\n');
    })

    it('peek renders an unterminated fence', () => {
        const p = createParser();
        p.push('```py\nx = 1\n');
        expect(p.peek()).toEqual('<pre><code class="language-py">x = 1\n</code></pre>\n');
    })

    it('stable output + peek reconstruct the full document', () => {
        const p = createParser();
        let stable = '';
        const doc = corpus[0];
        for (const ch of doc) stable += p.push(ch);
        // mid-stream invariant: at any point, stable is always well-formed closed blocks
        expect(stable + p.end()).toEqual(parse(doc));
    })

    it('end flushes a partial last line', () => {
        const p = createParser();
        expect(p.end()).toEqual('');
        p.push('tail with no newline');
        expect(p.end()).toEqual('<p>tail with no newline</p>\n');
    })
})
