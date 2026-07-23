import { parse } from "../src/index";
import { describe, expect, it } from "vitest";

describe('headings', () => {
    it('h1', () => {
        expect(parse(`# Hello world!`)).toEqual('<h1>Hello world!</h1>\n')
    })

    it('h2', () => {
        expect(parse(`## Subheading`)).toEqual('<h2>Subheading</h2>\n')
    })

    it('h3', () => {
        expect(parse(`### Heading 3`)).toEqual('<h3>Heading 3</h3>\n')
    })

    it('closing hashes', () => {
        expect(parse(`## Closed ##`)).toEqual('<h2>Closed</h2>\n')
    })

    it('requires a space', () => {
        expect(parse(`#Nope`)).toEqual('<p>#Nope</p>\n')
    })
})

describe('blocks', () => {
    it('paragraph', () => {
        expect(parse(`This is a paragraph.`)).toEqual('<p>This is a paragraph.</p>\n')
    })

    it('multi-line paragraph', () => {
        expect(parse(`line one\nline two`)).toEqual('<p>line one\nline two</p>\n')
    })

    it('unordered lists', () => {
        expect(parse(`- Item 1\n- Item 2`)).toEqual('<ul>\n<li>Item 1</li>\n<li>Item 2</li>\n</ul>\n')
    })

    it('ordered lists', () => {
        expect(parse(`1. First item\n2. Second item`)).toEqual('<ol>\n<li>First item</li>\n<li>Second item</li>\n</ol>\n')
    })

    it('ordered list with start', () => {
        expect(parse(`3. three\n4. four`)).toEqual('<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>\n')
    })

    it('nested lists', () => {
        expect(parse(`- a\n  - b\n  - c\n- d`)).toEqual('<ul>\n<li>a\n<ul>\n<li>b</li>\n<li>c</li>\n</ul></li>\n<li>d</li>\n</ul>\n')
    })

    it('task lists', () => {
        expect(parse(`- [ ] todo\n- [x] done`)).toEqual('<ul>\n<li><input type="checkbox" disabled> todo</li>\n<li><input type="checkbox" disabled checked> done</li>\n</ul>\n')
    })

    it('blockquotes', () => {
        expect(parse(`> This is a quote`)).toEqual('<blockquote>\n<p>This is a quote</p>\n</blockquote>\n')
    })

    it('blockquote with nested block', () => {
        expect(parse(`> ## Title\n> - a\n> - b`)).toEqual('<blockquote>\n<h2>Title</h2>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</blockquote>\n')
    })

    it('code blocks', () => {
        expect(parse('```js\nconsole.log("hello");\n```')).toEqual('<pre><code class="language-js">console.log(&quot;hello&quot;);\n</code></pre>\n')
    })

    it('unterminated code blocks', () => {
        expect(parse('```\npartial')).toEqual('<pre><code>partial\n</code></pre>\n')
    })

    it('horizontal rules', () => {
        expect(parse(`---`)).toEqual('<hr>\n')
        expect(parse(`***`)).toEqual('<hr>\n')
    })

    it('tables', () => {
        expect(parse(`| a | b |\n|---|:-:|\n| 1 | 2 |`)).toEqual('<table>\n<thead>\n<tr><th>a</th><th align="center">b</th></tr>\n</thead>\n<tbody>\n<tr><td>1</td><td align="center">2</td></tr>\n</tbody>\n</table>\n')
    })
})

describe('inline', () => {
    it('emphasis', () => {
        expect(parse(`This is *italic* text.`)).toEqual('<p>This is <em>italic</em> text.</p>\n')
    })

    it('strong', () => {
        expect(parse(`This is **bold** text.`)).toEqual('<p>This is <strong>bold</strong> text.</p>\n')
    })

    it('strong emphasis', () => {
        expect(parse(`***both***`)).toEqual('<p><strong><em>both</em></strong></p>\n')
    })

    it('strikethrough', () => {
        expect(parse(`~~gone~~`)).toEqual('<p><del>gone</del></p>\n')
    })

    it('code spans', () => {
        expect(parse('This is `inline code`.')).toEqual('<p>This is <code>inline code</code>.</p>\n')
    })

    it('code spans are protected from formatting', () => {
        expect(parse('`**not bold** <tag>`')).toEqual('<p><code>**not bold** &lt;tag&gt;</code></p>\n')
    })

    it('links', () => {
        expect(parse(`[Link text](https://example.com)`)).toEqual('<p><a href="https://example.com">Link text</a></p>\n')
    })

    it('links with emphasis', () => {
        expect(parse(`[**bold** link](https://example.com)`)).toEqual('<p><a href="https://example.com"><strong>bold</strong> link</a></p>\n')
    })

    it('images', () => {
        expect(parse(`![alt text](https://example.com/x.png)`)).toEqual('<p><img src="https://example.com/x.png" alt="alt text"></p>\n')
    })

    it('bare URLs autolink', () => {
        expect(parse(`see https://example.com/a?b=1.`)).toEqual('<p>see <a href="https://example.com/a?b=1">https://example.com/a?b=1</a>.</p>\n')
    })
})
