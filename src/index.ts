// (4) Leaf Blocks
const BLOCK_THEMATIC_BREAK = 41;
const BLOCK_HEADING = 42;
const BLOCK_CODE = 45;
const BLOCK_HTML = 46;
const BLOCK_LINK_REFERENCE = 47;
const BLOCK_PARAGRAPH = 48;
// (5) Container Blocks
const BLOCK_QUOTE_OPEN = 510;
const BLOCK_QUOTE_CLOSE = 511;
const BLOCK_LIST_ITEM = 52;
const BLOCK_LIST_OPEN = 530;
const BLOCK_LIST_CLOSE = 531;

const THEMATIC_BREAK_RE =
  /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const BLOCK_QUOTE_MARKER_RE = /^[ \t]{0,3}\>/;
const BULLET_LIST_MARKER_RE = /^[*+-]/;
const ORDERED_LIST_MARKER_RE = /^(\d{1,9})([.)])/;

const MAYBE_SPECIAL_RE = /^[#`~*+_=<>0-9-]/;
const NON_SPACE_RE = /[^ \t\f\v\r\n]/;

const ATX_HEADING_MARKER_RE = /^#{1,6}(?:[ \t]+|$)/;
const CODE_FENCE_RE = /(^`{3,}(?!.*`)|^~{3,})/;
const CLOSING_CODE_FENCE_RE = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const SETEXT_HEADING_LINE_RE = /^(?:=+|-+)[ \t]*$/;
const ALLOWED_LEADING_WHITESPACE_RE = /^\s{0,3}(?=\S)/;
const INDENTED_CODE_BLOCK_RE = /^\s{4,}(?=\S)/;

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

interface Options {
  unsafeHTML?: boolean;
  gfm?: boolean;
}

function resolveFlags(opts: Options): number {
  let flags = opts.gfm ? DIALECT_GITHUB : DIALECT_COMMONMARK;
  if (!opts.unsafeHTML) {
    flags = flags | FLAG_NOHTML;
  }
  return flags;
}

function encode(str: string) {
	return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trim(line: string, flags: number) {
  if (flags & FLAG_NO_INDENTED_CODE_BLOCKS) return line.trimStart();
  return line.replace(ALLOWED_LEADING_WHITESPACE_RE, '');
}

function extractATXHeading(line: string): [string, number] {
  const [marker] = ATX_HEADING_MARKER_RE.exec(line) ?? ['#'];
  return [line.slice(marker.length).replace(/^[ \t]*#+[ \t]*$/, "").replace(/[ \t]+#+[ \t]*$/, "").trim(), marker.trim().length];
}

function* blocks(input: string, flags: number) {
  const lines = input.split(/\r?\n/);
  let chunk = '';
  let chunkType = BLOCK_PARAGRAPH;
  let chunkDetail: any[] = [];

  function* flush() {
    if (chunk) {
      if (INDENTED_CODE_BLOCK_RE.test(chunk)) {
        yield [BLOCK_CODE, chunk.trimStart() + '\n'];
      } else if (chunkType === BLOCK_CODE) {
        yield [BLOCK_CODE, chunk + '\n', chunkDetail[1]]
      } else {
        yield [chunkType, chunk.trim(), chunkDetail];
      }
    }

    chunk = '';
    chunkType = BLOCK_PARAGRAPH;
    chunkDetail = [];
  }

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const next = lines[i + 1] ?? '';

    if (!line.trim()) {
      yield* flush();
      continue;
    }

    if (THEMATIC_BREAK_RE.test(trim(line, flags))) {
      yield* flush();
      yield [BLOCK_THEMATIC_BREAK];
      continue;
    } else if (next && SETEXT_HEADING_LINE_RE.test(next)) {
      yield* flush();
      yield [BLOCK_HEADING, line.trim(), next[0] === '=' ? 1 : 2];
      i++;
      continue;
    } else if (ATX_HEADING_MARKER_RE.test(trim(line, flags))) {
      yield* flush();
      yield [BLOCK_HEADING, ...extractATXHeading(trim(line, flags))]
      continue;
    } else if (chunkType === BLOCK_CODE && CLOSING_CODE_FENCE_RE.test(line)) {
      if (line === chunkDetail[0]) {
        yield* flush();
        continue;
      }
      // Fall-through
    } else if (CODE_FENCE_RE.test(line)) {
      chunkType = BLOCK_CODE;
      const marker = CODE_FENCE_RE.exec(line)![1];
      const detail = line.slice(marker.length)
      let lang = '';
      let attr = '';
      if (detail) {
        const [tag, ...attrs] = detail.trim().split(/\s+/);
        lang = tag;
        attr = attrs.join(' ');
      }
      chunkDetail = [marker, lang, attr]
      continue;
    }
    
    if (chunk != '') {
      chunk += '\n';
      if (chunkType !== BLOCK_CODE) line = line.trim();
    }
    chunk += line;
  }

  yield* flush();
}

export function parse(input: string, opts: Options = {}) {
  const flags = resolveFlags(opts);
  let result = ''
  for (const [block, children, detail] of blocks(input, flags)) {
    switch (block) {
      case BLOCK_THEMATIC_BREAK: {
        result += '<hr />';
        break;
      }
      case BLOCK_HEADING: {
        result += `<h${detail}>${children}</h${detail}>`;
        break;
      }
      case BLOCK_PARAGRAPH: {
        result += `<p>${children}</p>`;
        break;
      }
      case BLOCK_CODE: {
        const lang = detail;
        result += `<pre><code${lang ? ` class="language-${lang}"` : ''}>${children}</code></pre>`
        break;
      }
      // case BLOCK_QUOTE_OPEN: {
      //   result += '<blockquote>';
      //   break;
      // }
      // case BLOCK_QUOTE_CLOSE: {
      //   result += '</blockquote>';
      //   break;
      // }
      // case BLOCK_LIST_OPEN: {
      //   result += `<${detail}>`;
      //   break;
      // }
      // case BLOCK_QUOTE_CLOSE: {
      //   result += `</${detail}>`;
      //   break;
      // }
    }
    if (block) result += '\n';
  }
  return result;
}
