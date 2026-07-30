// ultramark/ast — streaming ultrahtml Documents for framework/transform contexts
import { parse as parseHTML, type DocumentNode } from 'ultrahtml';
import { createParser, parse } from './index.js';

export interface ASTParser {
  /** Feed a chunk. Returns a Document of the blocks completed by this chunk (stable). */
  push(chunk: string): DocumentNode;
  /** Tentative Document of the currently-open block. Not yet stable. */
  peek(): DocumentNode;
  /** Flush the remaining buffer and any open block. */
  end(): DocumentNode;
}

export const createASTParser = (): ASTParser => {
  const p = createParser();
  return {
    push: (chunk) => parseHTML(p.push(chunk)),
    peek: () => parseHTML(p.peek()),
    end: () => parseHTML(p.end()),
  };
};

export const parseAST = (input: string): DocumentNode => parseHTML(parse(input));
