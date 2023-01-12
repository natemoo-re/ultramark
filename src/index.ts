export interface Options {

}

export function parse(input: string, opts: Options = {}) {
    const blocks = parseBlocks(input, opts);
    const refs = processLinkReferences(blocks);

    let result = ''
    for (const block of blocks) {
      const old = result;
      result += renderBlock(block);
      if (!is(result, old)) result += '\n';
    }

    return result;
}

// === CONSTANTS ===
// Tokens
const T_ANY = -1;
const T_WHITESPACE = 0;
const T_ASTERISK = 1;
const T_BACKSLASH = 2;
const T_BACKTICK = 3;
const T_CLOSE_BRACE = 4;
const T_CLOSE_PAREN = 5;
const T_COLON = 6;
const T_DASH = 7;
const T_EQUALS = 8;
const T_EXCLAMATION = 9;
const T_GREATER_THAN = 10;
const T_HASH = 11;
const T_LESS_THAN = 12;
const T_LINE_ENDING = 13;
const T_OPEN_BRACE = 14;
const T_OPEN_PAREN = 15;
const T_PIPE = 16;
const T_TILDE = 17;
const T_UNDERLINE = 18;
// (4) Blocks
const B_UNKNOWN = 0;
const B_THEMATIC_BREAK = 1;
const B_ATX_HEADING = 2;
const B_SETEXT_HEADING = 3;
const B_INDENTED_CODE = 4;
const B_FENCED_CODE = 5;
const B_HTML = 6;
const B_LINK_REFERENCE = 7;
const B_PARAGRAPH = 8;
const B_BLANK_LINE = 9;
// (5) Containers
const C_BLOCKQUOTE = 10;
const C_LIST_ITEM = 11;
const C_LIST = 12;
// (6) Spans
const S_CODE = 1;
const S_EMPHASIS = 2;
const S_LINK = 3;
const S_IMAGE = 4;
const S_AUTOLINK = 5;
const S_HTML = 6;
const S_HARD_BREAK = 7;
const S_SOFT_BREAK = 8;
const S_TEXT = 9;
// Data Helpers
const DATA_HAS_INLINE = 0;
const DATA_CONTAINER = 1;
const DATA_HEADING_LEVEL = 2;
const DATA_LINK_REF_START = 3;
const DATA_LINK_REF_END = 4;

const TOKEN_RE = /(?:(([\(\)\[\]\<\>\-_~|!:`#\\*\n])\2*)|^(\s+)|([^\(\)\[\]\<\>#\-_~|!:`\\*\n])+)/gm;
const startsWithWhitespace = (str: string, len: number = 1) => new RegExp(`^\\s{${len},}`).test(str);
const endsWithWhitespace = (str: string, len: number = 1) => new RegExp(`\\s{${len},}$`).test(str);
// Data Sets
const TOKENS: Record<string, any> = {
  '*': T_ASTERISK,
  '\\': T_BACKSLASH,
  '`': T_BACKTICK,
  ']': T_CLOSE_BRACE,
  ':': T_COLON,
  '-': T_DASH,
  '=': T_EQUALS,
  '!': T_EXCLAMATION,
  '>': T_GREATER_THAN,
  '#': T_HASH,
  '<': T_LESS_THAN,
  '\n': T_LINE_ENDING,
  '[': T_OPEN_BRACE,
  '|': T_PIPE,
  '~': T_TILDE,
  '_': T_UNDERLINE,
  '(': T_OPEN_PAREN,
  ')': T_CLOSE_PAREN,
};
const set = (v: string) => new Set(v.split('|'));
const TOKENS_INLINE = new Set([T_ASTERISK, T_UNDERLINE, T_TILDE, T_BACKTICK, T_OPEN_BRACE, T_BACKSLASH]);
const HTML_PRE = set('pre|script|style|textarea');
const HTML_INLINE = set('address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul');
const ATX_TRAILER_RE = /(?<![#\\\S])#+\s*$/gm;
const PARAGRAPH_LEADING_WHITESPACE_RE = /^\s+/gm;

// === UTILITIES ===
const is = (a: any, b: any) => a === b;
const isAny = (a: any, ...b: any) => b.includes(a);
const len = (v: any): number => v.length;
const arrN = (n: number, arr: any[]) => arr[n];
const arr0 = arrN.bind(null, 0);
const arr1 = arrN.bind(null, 1);
const arr2 = arrN.bind(null, 2);

// === DATA STRUCTURES ===
type Token = [value: string, type: number];
const getTokenValue: ((token: Token) => string) = arr0;
const getTokenType: ((token: Token) => number) = arr1;
const isTokenLengthGreaterThanEqual = (token: Token, l: number): boolean => len(getTokenValue(token)) >= l;
const isTokenLengthLessThan = (token: Token, l: number): boolean => len(getTokenValue(token)) < l;

type Block = [tokens: Token[], type: number, datas: Record<string, any>];
const getBlockTokens: ((block: Block) => Token[]) = arr0;
const getBlockText = (block: Block, start?: number, end?: number) => {
  let tokens = getBlockTokens(block);
  if (start) tokens = tokens.slice(start, end);
  return tokens.map(t => getTokenValue(t)).join('');
}
const getBlockToken = (block: Block, n: number): Token => arrN(n, getBlockTokens(block));
const getBlockType: ((block: Block) => number) = arr1;
const getBlockData = (block: Block, name: number): any => block[2][name];

const setBlockType = (block: Block, type: number) => { block[1] = type; return true };
const sliceBlockTokens = (block: Block, n: number) => { block[0] = block[0].slice(n) };
const dropBlockTokens = (block: Block, n: number) => { block[0] = block[0].slice(0, n) };
const setBlockData = (block: Block, name: number, value: any) => { block[2][name] = value };

export function parseBlocks(input: string, opts: Options): Block[] {
  TOKEN_RE.lastIndex = 0;
  let blocks: Block[] = [];

  let block: Block = [[], B_UNKNOWN, {}];
  function merge() {
    const prevBlock = blocks[blocks.length - 1];
    getBlockTokens(prevBlock).push(...getBlockTokens(block));
    block = [[], B_UNKNOWN, {}];
  }
  function flush() {
    if (is(getBlockType(block), B_UNKNOWN)) return;
    processBlock(block, opts);

    const prevBlock = blocks[blocks.length - 1];
    const type = getBlockType(block);
    const prevType = getBlockType(prevBlock ?? []);

    if (prevType === B_PARAGRAPH && isAny(type, B_PARAGRAPH, B_INDENTED_CODE)) {
      if (type === B_INDENTED_CODE) return merge();
      const prevTokens = getBlockTokens(prevBlock);
      const prevTrailer = getBlockToken(prevBlock, len(prevTokens) - 1);
      if (getTokenValue(prevTrailer).length === 1) return merge();
    }

    blocks.push(block);
    block = [[], B_UNKNOWN, {}];
  }

  let m;
  while (m = TOKEN_RE.exec(input)) {
    const chunk = m[0];
    const tokenType = TOKENS[chunk[0]] ?? (m[3] ? T_WHITESPACE : T_ANY);

    appendToken(block, [chunk, tokenType]);
    if (is(tokenType, T_LINE_ENDING)) processBlock(block, opts);
    if (is(tokenType, T_LINE_ENDING) && canExit(block)) {
      flush()
    }
  }
  flush();

  return blocks;
}

const tag = (name: string, content?: string) => `<${name}>${content ?? ''}</${name}>`
const render = (name: string, block: Block) => tag(name, renderInline(block));
function renderBlock(block: Block): string {
  switch (getBlockType(block)) {
    case B_THEMATIC_BREAK: return '<hr />';
    case B_ATX_HEADING: return render('h' + getBlockData(block, DATA_HEADING_LEVEL), block);
    case B_SETEXT_HEADING: return render('h' + getBlockData(block, DATA_HEADING_LEVEL), block);
    case B_PARAGRAPH: return render('p', block);
    case B_INDENTED_CODE: return tag('pre', render('code', block));
    case B_FENCED_CODE: return tag('pre', render('code', block));
  }
  return '';
}

function renderInline(block: Block): string {
  switch (getBlockType(block)) {
    case B_PARAGRAPH: return getBlockText(block).replace(PARAGRAPH_LEADING_WHITESPACE_RE, '').trim();
    case B_ATX_HEADING: return getBlockText(block).replace(ATX_TRAILER_RE, '').trim();
    case B_INDENTED_CODE: return getBlockText(block).trim() + '\n';
    case B_FENCED_CODE: return getBlockText(block) + '\n';
  }
  return '';
}

function appendToken(block: Block, token: Token) {
  if (TOKENS_INLINE.has(getTokenType(token))) {
    setBlockData(block, DATA_HAS_INLINE, true);
  }
  getBlockTokens(block).push(token);
}

function canExit(block: Block): boolean {
  const type = getBlockType(block);
  if (type === B_PARAGRAPH) {
    return true;
  } if (is(type, B_HTML)) {
    const chunk = block[0].map(t => t[0]).join('');
    const condition: number = block[2][0];
    // TODO: correct end conditions
    return false;
    // return BLOCK_HTML_CLOSE_RE[condition]?.test(chunk) ?? block.tokens[block.tokens.length - 1][1] === T_LINE_ENDING;
  } else if (is(type, B_LINK_REFERENCE) && getBlockData(block, DATA_LINK_REF_END)) {
    return false;
  }
  return true;
}

function processBlock(block: Block, opts: Options) {
  if (getBlockType(block) !== B_UNKNOWN) return;

  let token = getBlockToken(block, 0);
  let i = 0;
  if (!token || is(getTokenType(token), T_LINE_ENDING)) return setBlockType(block, B_BLANK_LINE);
  
  if (is(getTokenType(token), T_WHITESPACE)) {
    if (len(getTokenValue(token)) >= 4) {
      return setBlockType(block, B_INDENTED_CODE);
    }
    token = getBlockToken(block, 1);
    i = 1;
  }
  const [value, type] = token;

  if (is(type, T_ANY)) {
    return setBlockType(block, B_PARAGRAPH);
  }

  if (isAny(type, T_DASH, T_UNDERLINE, T_ASTERISK)) {
    return setBlockType(block, B_THEMATIC_BREAK);
  }

  if (is(type, T_HASH) && len(value) < 7) {
    // No permissive ATX Headers
    if (!startsWithWhitespace(getTokenValue(getBlockToken(block, i + 1)))) return setBlockType(block, B_PARAGRAPH);

    setBlockData(block, DATA_HEADING_LEVEL, len(getTokenValue(token)));
    sliceBlockTokens(block, i + 1);
    return setBlockType(block, B_ATX_HEADING);
  }

  if (isAny(type, T_BACKTICK, T_TILDE) && len(value) >= 3) {
    return setBlockType(block, B_FENCED_CODE);
  }

  if (is(type, T_LESS_THAN)) {
    return setBlockType(block, B_HTML);
  }

  if (is(type, T_GREATER_THAN)) {
    return setBlockType(block, C_BLOCKQUOTE);
  }

  if (is(type, T_OPEN_BRACE)) {
    const tokens = getBlockTokens(block);
    for (let j = i; j < len(tokens); j++) {
      const type = getTokenType(tokens[j]);
      if (is(type, T_LINE_ENDING)) {
        return setBlockType(block, B_LINK_REFERENCE);
      }
      const nextType = getTokenType(tokens[j + 1] ?? []);
      if (is(type, T_CLOSE_BRACE) && is(nextType, T_COLON)) {
        setBlockData(block, DATA_LINK_REF_START, i + 1);
        setBlockData(block, DATA_LINK_REF_END, j);
        return setBlockType(block, B_LINK_REFERENCE);
      }
    }
  }

  return setBlockType(block, B_PARAGRAPH);
}

function processLinkReferences(blocks: Block[]) {
  let refs: Record<string, () => string[]> = {};
  for (const block of blocks) {
    if (getBlockType(block) === B_LINK_REFERENCE) {
      const id = getBlockText(block,getBlockData(block, DATA_LINK_REF_START), getBlockData(block, DATA_LINK_REF_END));
      if (id in refs) continue;
      refs[id] = () => {
        const info = getBlockText(block, getBlockData(block, DATA_LINK_REF_END) + 2).trim();
        return info.split(' ');
      };
    }
  }
  return refs;
}
