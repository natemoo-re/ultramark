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
        expect(p.peek()).toEqual('<p>hello *wor</p>\n');
        p.push('ld*\n\n');
        expect(p.peek()).toEqual('');
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
