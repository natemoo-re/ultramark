/* In MD_TEXT_NORMAL, collapse non-trivial whitespace into single ' ' */
const FLAG_COLLAPSE_WHITESPACE = 0x0001;
/* Do not require space in ATX headers ( ###header ) */
const FLAG_PERMISSIVE_ATX_HEADERS = 0x0002;
/* Recognize URLs as autolinks even without '<', '>' */
const FLAG_PERMISSIVE_URL_AUTOLINKS = 0x0004;
/* Recognize e-mails as autolinks even without '<', '>' and 'mailto:' */
const FLAG_PERMISSIVE_EMAIL_AUTOLINKS = 0x0008;
/* Disable indented code blocks. (Only fenced code works.) */
const FLAG_NO_INDENTED_CODE_BLOCKS = 0x0010;
/* Disable raw HTML blocks. */
const FLAG_NO_HTML_BLOCKS = 0x0020;
/* Disable raw HTML (inline). */
const FLAG_NO_HTML_SPANS = 0x0040;
/* Enable tables extension. */
const FLAG_TABLES = 0x0100;
/* Enable strikethrough extension. */
const FLAG_STRIKETHROUGH = 0x0200;
/* Enable WWW autolinks (even without any scheme prefix, if they begin with 'www.') */
const FLAG_PERMISSIVE_WWW_AUTOLINKS = 0x0400;
/* Enable task list extension. */
const FLAG_TASKLISTS = 0x0800;
/* Enable $ and $$ containing LaTeX equations. */
const FLAG_LATEX_MATH_SPANS = 0x1000;
/* Enable wiki links extension. */
const FLAG_WIKILINKS = 0x2000;
/* Enable underline extension (and disables '_' for normal emphasis). */
const FLAG_UNDERLINE = 0x4000;

const FLAG_PERMISSIVEAUTOLINKS =
  FLAG_PERMISSIVE_EMAIL_AUTOLINKS |
  FLAG_PERMISSIVE_URL_AUTOLINKS |
  FLAG_PERMISSIVE_WWW_AUTOLINKS;
const FLAG_NOHTML = FLAG_NO_HTML_BLOCKS | FLAG_NO_HTML_SPANS;

const DIALECT_COMMONMARK = 0;
const DIALECT_GITHUB =
  FLAG_PERMISSIVEAUTOLINKS | FLAG_TABLES | FLAG_STRIKETHROUGH | FLAG_TASKLISTS;

const isTokenAsterisk = (c: string) => c === '*';
const isTokenUnderline = (c: string) => c === '_';
const isTokenBackslash = (c: string) => c === '\\';
const isTokenDash = (c: string) => c === '-';
const isTokenEquals = (c: string) => c === '=';
const isTokenTilde = (c: string) => c === '~';
const isTokenPipe = (c: string) => c === '|';
const isTokenColon = (c: string) => c === ':';
const isTokenBacktick = (c: string) => c === '`';
const isTokenHash = (c: string) => c === '#';
const isTokenGreaterThan = (c: string) => c === '>';
const isTokenLessThan = (c: string) => c === '<';
const isTokenOpenBrace = (c: string) => c === '[';
const isTokenCloseBrace = (c: string) => c === ']';
const isTokenWhitespace = (c: string) => /^[ \t\f\v]/.test(c);
const isTokenLineEnding = (c: string) => /^[\r\n]/.test(c);
const isTokenAny = (_: string) => true;

const TOKEN = {
  '*': isTokenAsterisk,
  '_': isTokenUnderline,
  '\\': isTokenBackslash,
  '-': isTokenDash,
  '=': isTokenEquals,
  '~': isTokenTilde,
  '|': isTokenPipe,
  ':': isTokenColon,
  '`': isTokenBacktick,
  '#': isTokenHash,
  '>': isTokenGreaterThan,
  '<': isTokenLessThan,
  '[': isTokenOpenBrace,
  ']': isTokenCloseBrace,
  ' ': isTokenWhitespace,
  '\t': isTokenWhitespace,
  '\f': isTokenWhitespace,
  '\v': isTokenWhitespace,
  '\r': isTokenLineEnding,
  '\n': isTokenLineEnding,
}

const INLINE_TOKENS = new Set([isTokenAsterisk, isTokenUnderline, isTokenTilde, isTokenBacktick, isTokenOpenBrace, isTokenBackslash])

type Token = [string, (c: string) => boolean]
function tokenize(input: string, opts: Options): Block[] {
  let p = -1;
  let prevTokenType: ((c: string) => boolean) = () => true;
  let blocks: Block[] = [];

  let block: Block = { tokens: [], type: BLOCK_BLANK_LINE, data: {} };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    let tokenType = (TOKEN as any)[c] ?? isTokenAny;
    if (prevTokenType === isTokenBackslash) tokenType = isTokenAny;

    if (tokenType === prevTokenType) continue;
    const chunk = input.slice(p, i);

    p = i;
    if (chunk) append(block, [chunk, prevTokenType]);
    prevTokenType = tokenType;

    if (tokenType === isTokenLineEnding) {
      processBlock(block, opts);
      if (i !== input.length - 1 && block.type === BLOCK_PARAGRAPH && blocks.length > 0 && blocks[blocks.length - 1].type === BLOCK_PARAGRAPH) continue;
      blocks.push(block);
      block = { tokens: [], type: BLOCK_BLANK_LINE, data: {} };
    }
  }
  
  return blocks;
}

function append(block: Block, token: Token) {
  if (INLINE_TOKENS.has(token[1])) {
    block.hasInline = true;
  }
  block.tokens.push(token);
}

const BLOCK_THEMATIC_BREAK = 41;
const BLOCK_ATX_HEADING = 42;
const BLOCK_SETEXT_HEADING = 43;
const BLOCK_INDENTED_CODE = 44;
const BLOCK_FENCED_CODE = 45;
const BLOCK_HTML = 46;
const BLOCK_LINK_REFERENCE = 47;
const BLOCK_PARAGRAPH = 48;
const BLOCK_BLANK_LINE = 49;

function processBlock(block: Block, opts: Options) {
  if (block.tokens.length === 0) {
    block.type = BLOCK_BLANK_LINE;
    return;
  }
  let i = 0;
  for (const token of block.tokens) {
    if (i === 0 && token[1] === isTokenWhitespace) {
      if (token[0].length > 3) {
        block.type = BLOCK_INDENTED_CODE;
        return;
      }
    };
    if (i === 0 || i === 1) {
      if (token[1] === isTokenDash || token[1] === isTokenUnderline || token[1] === isTokenAsterisk) {
        block.type = BLOCK_THEMATIC_BREAK;
        for (let t of block.tokens.slice(i)) {
          if (t[1] === isTokenLineEnding) continue;
          if (t[1] === isTokenWhitespace || t[1] === token[1]) continue;
          block.type = BLOCK_PARAGRAPH;
          return;
        }
        return;
      }
      if (token[1] === isTokenHash && token[0].length < 7) {
        block.type = BLOCK_ATX_HEADING;
        block.data.level = token[0].length;
        return;
      }
      if (token[0].length > 2 && (token[1] === isTokenBacktick || token[1] === isTokenTilde)) {
        block.type = BLOCK_FENCED_CODE;
        return;
      }
    }
    i++;
  }
  block.type = BLOCK_PARAGRAPH;
}

function renderInline(block: Block) {
  if (!block.hasInline) return block.tokens.map(([text]) => text).join('').trimStart();
  return block.tokens.map(([text]) => text).join('').trimStart();
}

const RENDER: Record<number, (...args: any) => string> = {
  [BLOCK_THEMATIC_BREAK]: () => `<hr />`,
  [BLOCK_ATX_HEADING]: (block: Block) => `<h${block.data.level}></h${block.data.level}>`,
  [BLOCK_PARAGRAPH]: (block: Block) => `<p>${renderInline(block)}</p>`,
  [BLOCK_BLANK_LINE]: () => '',
}

interface Block {
  tokens: Token[];
  type: number;
  data: Record<string, any>;
  hasInline?: boolean;
}

export interface Options {}
export function parse(input: string, opts: Options = {}) {
  const blocks = tokenize(input, opts);

  let result = '';
  for (const block of blocks) {
    result += RENDER[block.type](block, opts) + '\n';
  }
  
  return result;
}
