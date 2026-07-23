import { parse } from "../src/index";
import { describe, expect, it } from "vitest";

// Documents the strict-subset calls: constructs that are intentionally
// NOT CommonMark, chosen to keep the parser streaming-safe and tiny.
describe('subset calls', () => {
    it('setext underline is not a heading (--- is an hr)', () => {
        expect(parse(`Title\n---`)).toEqual('<p>Title</p>\n<hr>\n')
    })

    it('=== is plain text', () => {
        expect(parse(`Title\n===`)).toEqual('<p>Title\n===</p>\n')
    })

    it('indented code is a paragraph', () => {
        expect(parse(`    not code`)).toEqual('<p>not code</p>\n')
    })

    it('raw HTML is escaped (safe for untrusted agent output)', () => {
        expect(parse(`<div onclick="x()">hi</div>`)).toEqual('<p>&lt;div onclick=&quot;x()&quot;&gt;hi&lt;/div&gt;</p>\n')
    })

    it('_ is not emphasis (snake_case is safe)', () => {
        expect(parse(`some_snake_case and _text_`)).toEqual('<p>some_snake_case and _text_</p>\n')
    })

    it('reference links render literally (but bare URLs still autolink)', () => {
        expect(parse(`[text][ref]\n\n[ref]: https://example.com`))
            .toEqual('<p>[text][ref]</p>\n<p>[ref]: <a href="https://example.com">https://example.com</a></p>\n')
    })

    it('javascript: URLs are neutralized', () => {
        expect(parse(`[x](javascript:alert(1))`)).toEqual('<p><a href="#">x</a></p>\n')
    })

    it('entities are not double-escaped', () => {
        expect(parse(`fish &amp; chips & salsa`)).toEqual('<p>fish &amp; chips &amp; salsa</p>\n')
    })

    it('quote breakout in alt text is escaped', () => {
        expect(parse(`![x" onerror="alert(1)](https://example.com/x.png)`))
            .toEqual('<p><img src="https://example.com/x.png" alt="x&quot; onerror=&quot;alert(1)"></p>\n')
    })
})
