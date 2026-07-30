// ultramark/dom — streaming DocumentFragments for the browser
import { createParser, parse } from './index.js';

export interface DOMParser {
  /** Feed a chunk. Returns a Fragment of the blocks completed by this chunk (stable). */
  push(chunk: string): DocumentFragment;
  /** Tentative Fragment of the currently-open block. Not yet stable. */
  peek(): DocumentFragment;
  /** Flush the remaining buffer and any open block. */
  end(): DocumentFragment;
}

const toFragment = (html: string, transform?: (el: Element) => void): DocumentFragment => {
  const f = document.createRange().createContextualFragment(html);
  if (transform) f.querySelectorAll('*').forEach(transform);
  return f;
};

export const createDOMParser = (transform?: (el: Element) => void): DOMParser => {
  const p = createParser();
  return {
    push: (chunk) => toFragment(p.push(chunk), transform),
    peek: () => toFragment(p.peek(), transform),
    end: () => toFragment(p.end(), transform),
  };
};

export const parseDOM = (input: string, transform?: (el: Element) => void): DocumentFragment =>
  toFragment(parse(input), transform);
