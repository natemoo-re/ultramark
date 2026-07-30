import { parseAST, createASTParser } from "../src/ast";
import { renderSync, transformSync, walkSync, ELEMENT_NODE } from "ultrahtml";
import { describe, expect, it } from "vitest";

const elements = (doc: any) => doc.children.filter((n: any) => n.type === ELEMENT_NODE);

describe('ast entrypoint', () => {
    it('parseAST returns an ultrahtml Document', () => {
        const doc = parseAST('# Hi\n\n- a\n- b\n');
        expect(doc.type).toEqual(0); // DOCUMENT_NODE
        const [h1, list] = elements(doc);
        expect(h1.name).toEqual('h1');
        expect(h1.children[0].value).toEqual('Hi');
        expect(list.name).toEqual('ul');
        expect(elements(list)).toHaveLength(2);
    })

    it('streaming deltas are Documents of closed blocks', () => {
        const p = createASTParser();
        expect(elements(p.push('half a para'))).toHaveLength(0);
        const delta = p.push('\n\n# next\n');
        expect(elements(delta).map((n: any) => n.name)).toEqual(['p', 'h1']);
    })

    it('round-trips through ultrahtml render', () => {
        const doc = parseAST('**bold** and `code`\n');
        expect(renderSync(doc)).toEqual('<p><strong>bold</strong> and <code>code</code></p>\n');
    })

    it('supports ultrahtml transforms (framework story)', () => {
        const out = transformSync(parseAST('[x](https://example.com)\n'), [
            (doc) => {
                walkSync(doc, (node) => {
                    if (node.type === ELEMENT_NODE && node.name === 'a') {
                        node.attributes.target = '_blank';
                        node.attributes.rel = 'noopener';
                    }
                });
                return doc;
            },
        ]);
        expect(out).toEqual('<p><a href="https://example.com" target="_blank" rel="noopener">x</a></p>\n');
    })
})
