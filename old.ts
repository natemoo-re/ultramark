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

const T_ASTERISK = (c: string) => c === '*';
const T_UNDERLINE = (c: string) => c === '_';
const T_BACKSLASH = (c: string) => c === '\\';
const T_EXCLAMATION = (c: string) => c === '!';
const T_DASH = (c: string) => c === '-';
const T_EQUALS = (c: string) => c === '=';
const T_TILDE = (c: string) => c === '~';
const T_PIPE = (c: string) => c === '|';
const T_COLON = (c: string) => c === ':';
const T_BACKTICK = (c: string) => c === '`';
const T_HASH = (c: string) => c === '#';
const T_GREATER_THAN = (c: string) => c === '>';
const T_LESS_THAN = (c: string) => c === '<';
const T_OPEN_BRACE = (c: string) => c === '[';
const T_CLOSE_BRACE = (c: string) => c === ']';
const T_WHITESPACE = (c: string) => /^[ \t\f\v]/.test(c);
const T_LINE_ENDING = (c: string) => /^[\r\n]/.test(c);
const T_ANY = (_: string) => true;

const TOKEN = {
  '*': T_ASTERISK,
  '_': T_UNDERLINE,
  '\\': T_BACKSLASH,
  '-': T_DASH,
  '=': T_EQUALS,
  '~': T_TILDE,
  '|': T_PIPE,
  '!': T_EXCLAMATION,
  ':': T_COLON,
  '`': T_BACKTICK,
  '#': T_HASH,
  '>': T_GREATER_THAN,
  '<': T_LESS_THAN,
  '[': T_OPEN_BRACE,
  ']': T_CLOSE_BRACE,
  ' ': T_WHITESPACE,
  '\t': T_WHITESPACE,
  '\f': T_WHITESPACE,
  '\v': T_WHITESPACE,
  '\r': T_LINE_ENDING,
  '\n': T_LINE_ENDING,
}

const INLINE_TOKENS = new Set([T_ASTERISK, T_UNDERLINE, T_TILDE, T_BACKTICK, T_OPEN_BRACE, T_BACKSLASH])

type Token = [string, (c: string) => boolean]
function tokenize(input: string, opts: Options): Block[] {
  let p = -1;
  let prevTokenType: ((c: string) => boolean) = () => true;
  let blocks: Block[] = [];

  let block: Block = { type: BLOCK_UNKNOWN, tokens: [], data: {} };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    let tokenType = (TOKEN as any)[c] ?? T_ANY;
    if (prevTokenType === T_BACKSLASH) tokenType = T_ANY;

    if (tokenType === prevTokenType) continue;
    const chunk = input.slice(p, i);
    if (chunk) append(block, [chunk, prevTokenType]);

    p = i;
    prevTokenType = tokenType;

    if (tokenType === T_LINE_ENDING) processBlock(block, opts);
    if (i === input.length - 1 || (tokenType === T_LINE_ENDING && canExit(blocks, block, opts))) {
      blocks.push(block);
      block = { type: BLOCK_UNKNOWN, tokens: [], data: {} };
    }
  }
  
  return blocks;
}

function canExit(blocks: Block[], block: Block, opts: Options): boolean {
  if (block.type === BLOCK_HTML) {
    const chunk = block.tokens.map(t => t[0]).join('');
    const condition: number = block.data.condition;
    // TODO: correct end conditions
    return BLOCK_HTML_CLOSE_RE[condition]?.test(chunk) ?? block.tokens[block.tokens.length - 1][1] === T_LINE_ENDING;
  }
  if (block.type === CONTAINER_BLOCKQUOTE) {
    
  }
  return true;
}

function append(block: Block, token: Token) {
  if (INLINE_TOKENS.has(token[1])) {
    block.data.inline = true;
  }
  block.tokens.push(token);
}

const BLOCK_UNKNOWN = 40;
const BLOCK_THEMATIC_BREAK = 41;
const BLOCK_ATX_HEADING = 42;
const BLOCK_SETEXT_HEADING = 43;
const BLOCK_INDENTED_CODE = 44;
const BLOCK_FENCED_CODE = 45;
const BLOCK_HTML = 46;
const BLOCK_LINK_REFERENCE = 47;
const BLOCK_PARAGRAPH = 48;
const BLOCK_BLANK_LINE = 49;

const CONTAINER_BLOCKQUOTE = 51;
const CONTAINER_LIST_ITEM = 52;
const CONTAINER_LIST = 53;

const ASCII_LETTER_RE = /[a-z]/i

const BLOCK_HTML_PRE = new Set('pre|script|style|textarea'.split('|'));
const BLOCK_HTML_STANDARD = new Set(`address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul`.split('|'));

const BLOCK_HTML_OPEN = [
  (tokens: Token[]) => tokens.length > 1 && tokens[1][1] === T_ANY && BLOCK_HTML_PRE.has(tokens[1][0]),
  (tokens: Token[]) => tokens.length > 2 && tokens[1][1] === T_EXCLAMATION && tokens[2][1] === T_DASH && tokens[2][0].length > 1,
  (tokens: Token[]) => tokens.length > 1 && tokens[1][0][0] === '?',
  (tokens: Token[]) => tokens.length > 2 && tokens[1][1] === T_EXCLAMATION && ASCII_LETTER_RE.test(tokens[2][0][0]),
  (tokens: Token[]) => tokens.length > 4 && tokens[1][1] === T_EXCLAMATION && tokens[2][1] === T_OPEN_BRACE && tokens[3][0] === 'CDATA' && tokens[4][1] === T_OPEN_BRACE,
  (tokens: Token[]) => tokens.length > 1 && tokens[1][1] === T_ANY && BLOCK_HTML_STANDARD.has(tokens[1][0]),
  // /^<\/?(?:()(?:[ \t>]|\/?>|$))/i,
  // TODO: any tag
]
const BLOCK_HTML_CLOSE_RE = [
  /<\/(pre|script|style|textarea)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
  // TODO: end condition,
  // TODO: end condition,
  // TODO: end condition,
]

function processBlock(block: Block, opts: Options) {
  if (block.type !== BLOCK_UNKNOWN) return;

  if (block.tokens.length === 0) {
    block.type = BLOCK_BLANK_LINE;
    return;
  }
  for (let i = 0; i < block.tokens.length; i++) {
    const token = block.tokens[i];
    if (i === 0 && token[1] === T_WHITESPACE) {
      if (token[0].length > 3) {
        block.type = BLOCK_INDENTED_CODE;
        return;
      }
      continue;
    };
    if (i === 0 || i === 1) {
      const text = token[0];
      const tokenType = token[1];
      if (tokenType === T_DASH || tokenType === T_UNDERLINE || tokenType === T_ASTERISK) {
        block.type = BLOCK_THEMATIC_BREAK;
        for (let t of block.tokens.slice(i)) {
          if (t[1] === T_LINE_ENDING) continue;
          if (t[1] === T_WHITESPACE || t[1] === tokenType) continue;
          block.type = BLOCK_PARAGRAPH;
          return;
        }
        return;
      }
      if (tokenType === T_HASH && text.length < 7) {
        block.type = BLOCK_ATX_HEADING;
        block.data.level = text.length;
        return;
      }
      if (text.length > 2 && (tokenType === T_BACKTICK || tokenType === T_TILDE)) {
        block.type = BLOCK_FENCED_CODE;
        return;
      }
      if (tokenType === T_LESS_THAN) {
        for (let k = 0; k < BLOCK_HTML_OPEN.length; k++) {
          const condition = BLOCK_HTML_OPEN[k];
          if (condition(block.tokens)) {
            block.data.condition = k;
            block.type = BLOCK_HTML;
            return;
          }
        }
      }
      if (tokenType === T_GREATER_THAN) {
        block.type = CONTAINER_BLOCKQUOTE;
        return;
      }
    }
  }

  block.type = BLOCK_PARAGRAPH;
}

function renderInline(block: Block) {
  if (!block.data.inline) return block.tokens.map((token) => token[0]).join('').trimStart();
  return block.tokens.map((token) => token[0]).join('').trimStart();
}

const RENDER: Record<number, (...args: any) => string> = {
  [BLOCK_THEMATIC_BREAK]: () => `<hr />`,
  [BLOCK_ATX_HEADING]: (block: Block) => `<h${block.data.level}>${renderInline(block)}</h${block.data.level}>`,
  [BLOCK_SETEXT_HEADING]: (block: Block) => `<h${block.data.level}>${renderInline(block)}</h${block.data.level}>`,
  [BLOCK_PARAGRAPH]: (block: Block) => `<p>${renderInline(block)}</p>`,
  [BLOCK_HTML]: (block: Block) => renderInline(block),
  [BLOCK_BLANK_LINE]: () => '',
  [BLOCK_UNKNOWN]: () => '',
}

interface Block {
  tokens: Token[];
  type: number;
  data: Record<string, any>;
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
