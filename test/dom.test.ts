// @vitest-environment happy-dom
import { parseDOM, createDOMParser } from "../src/dom";
import { describe, expect, it } from "vitest";

describe('dom entrypoint', () => {
    it('parseDOM returns a DocumentFragment', () => {
        const f = parseDOM('# Hi\n\npara\n');
        expect(f).toBeInstanceOf(DocumentFragment);
        expect(f.querySelector('h1')?.textContent).toEqual('Hi');
        expect(f.querySelector('p')?.textContent).toEqual('para');
    })

    it('streaming fragments can be appended as they arrive', () => {
        const target = document.createElement('div');
        const p = createDOMParser();
        target.append(p.push('# One\n\n'));
        target.append(p.push('- a\n- b\n'));
        target.append(p.end());
        expect(target.innerHTML).toEqual('<h1>One</h1>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n');
    })

    it('transform hook runs on every element', () => {
        const f = parseDOM('[x](https://example.com)\n', (el) => {
            if (el.tagName === 'A') el.setAttribute('target', '_blank');
        });
        expect(f.querySelector('a')?.getAttribute('target')).toEqual('_blank');
    })

    it('empty deltas produce empty fragments', () => {
        const p = createDOMParser();
        expect(p.push('unfinished').childNodes).toHaveLength(0);
    })
})
