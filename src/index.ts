// Internal
const RAW = -1;
const DOM_PARSER_RE =
  /(?:<(\/?)([!?a-zA-Z][a-zA-Z0-9\:-]*)(?:\s([^>]*?))?((?:\s*\/)?)>|(<\!\-\-)([\s\S]*?)(\-\->)|(<\!)([\s\S]*?)(>))/gm;
const isHTML = (str: string) => {
  DOM_PARSER_RE.lastIndex = 0;
  return DOM_PARSER_RE.test(str);
}
// (4) Leaf Blocks
const BLOCK_THEMATIC_BREAK = 41;
const BLOCK_HEADING = 42;
const BLOCK_CODE = 45;
const BLOCK_HTML = 46;
const BLOCK_LINK_REFERENCE = 47;
const BLOCK_PARAGRAPH = 48;
// (5) Container Blocks
const BLOCK_QUOTE = 51;
const BLOCK_LIST_ITEM = 52;
const BLOCK_LIST_UNORDERED = 530;
const BLOCK_LIST_ORDERED = 531;
// (6) Inlines
const SPAN_CODE = 61;
const SPAN_EMPHASIS = 620;
const SPAN_STRONG = 621;
const SPAN_STRONG_EMPHASIS = 622;
const SPAN_LINK = 63;
const SPAN_IMAGE = 64;
const SPAN_AUTOLINK = 65;
const SPAN_HTML = 66;
const SPAN_HARD_LINE_BREAK = 67;
const SPAN_SOFT_LINE_BREAK = 68;
const SPAN_TEXT = 69;

const THEMATIC_BREAK_RE =
  /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const BLOCK_QUOTE_MARKER_RE = /^ {0,3}\>/;
const UNORDERED_LIST_MARKER_RE = /^[*+-]\s+/;
const ORDERED_LIST_MARKER_RE = /^(\d{1,9})([.)])/;
const LINK_REFERENCE_RE = /^\[[^\[]+\]:/;

const WHITESPACE_RE = /[ \t\f\v\r\n]/;
const BLANK_RE = /^[ \t\f\v\r\n]+$/;

const ATX_HEADING_MARKER_RE = /^#{1,6}(?:[ \t]+|$)/;
const CODE_FENCE_RE = /(^`{3,}(?!.*`)|^~{3,})/;
const CLOSING_CODE_FENCE_RE = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const SETEXT_HEADING_LINE_RE = /^(?:=+|-+)[ \t]*$/;
const ALLOWED_LEADING_WHITESPACE_RE = /^ {0,3}(?=\S)/;
const INDENTED_CODE_BLOCK_RE = /(?:(?:^ {4,})|(?:^ {0,3}\t))(?=\S)/;

const TRAILING_HARD_BREAK_RE = /(?:(?: {2,})|\\)\n/;

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

function encode(str: string) {
	return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescape(str: string = '') {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '\\' && str[i + 1]) continue;
    result += c;
  }
  return result;
}

function dedent(str: string) {
	return str.replace(RegExp('^'+(str.match(/^(\t| )+/) || '')[0], 'gm'), '');
}

function trim(line: string, flags: number) {
  if (flags & FLAG_NO_INDENTED_CODE_BLOCKS) return line.trimStart();
  return line.replace(ALLOWED_LEADING_WHITESPACE_RE, '');
}

function extractATXHeading(line: string): [string, number] {
  const [marker] = ATX_HEADING_MARKER_RE.exec(line) ?? ['#'];
  return [line.slice(marker.length).replace(/^[ \t]*#+[ \t]*$/, "").replace(/[ \t]+#+[ \t]*$/, "").trim(), marker.trim().length];
}
function extractLinkDefinition(inline: string): string[] {
  if (inline[0] === '[') return ['', '', inline.slice(1, -1)];
  if (inline[0] !== '(') return [inline];
  inline = inline.slice(1, -1);
  const [href, ...title] = inline.split(/\s+/);

  return [href, title.join(' ').slice(1, -1)];
}
function extractCodeSpan(inline: string): string {
  if (BLANK_RE.test(inline)) return inline;
  inline = inline.replace(/\n/g, ' ');
  if (inline.length > 1 && inline[0] === ' ' && inline[inline.length - 1] === ' ') return inline.slice(1, -1);
  return inline;
}

function extractLinkReferences(lines: string): any[] {
  let references: any[] = [];
  let buf = '';
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i];
    const item = references.length > 0 ? references[references.length - 1] : [];
    if (c === '\\') {
      buf += c + lines[i + 1];
      i++;
      continue;
    }
    if (c === '[') {
      if (item.length === 2 && buf) {
        // TODO: fix slice here
        item.push(buf.trim().slice(1, -1));
        buf = '';
      }
      references.push([]);
      continue;
    }
    if (c === ']' && lines[i + 1] === ':') {
      item.push(buf);
      i++;
      continue;
    }
    if (item.length === 1) {
      if (buf[0] === '<' && c === '>') {
        item.push(buf.slice(1));
        buf = '';
        continue;
      }
      if (WHITESPACE_RE.test(c)) {
        if (buf === item[0]) {
          buf = '';
          continue;
        } else if (buf[0] !== '<') {
          item.push(buf);
          buf = '';
          continue;
        }
      } 
    }

    buf += c;
  }
  const item = references[references.length - 1];
  if (item.length === 2 && buf) {
    // TODO: fix slice here
    item.push(buf.trim().slice(1, -1));
    buf = '';
  }
  return references;
}

function removeLeadingPattern(input: string, re: RegExp): string {
  const lines = input.split(/\r?\n/);
  let output = '';
  for (const line of lines) {
    output += line.replace(re, '');
    output += '\n';
  }
  return output
}

function* blocks(input: string, flags: number, ctx: any): Generator<any[]> {
  const lines = input.split(/\r?\n/);
  let chunk = '';
  let chunkType = BLOCK_PARAGRAPH;
  let chunkDetail: any[] = [];

  function* flush(): Generator<any[]> {
    if (chunk) {
      if (INDENTED_CODE_BLOCK_RE.test(chunk)) {
        yield [BLOCK_CODE, chunk.trimStart() + '\n'];
      } else if (chunkType === BLOCK_CODE) {
        yield [BLOCK_CODE, chunk + '\n', chunkDetail[1]]
      } else if (chunkType === BLOCK_QUOTE) {
        yield [BLOCK_QUOTE, null, 1]
        yield* blocks(removeLeadingPattern(chunk, BLOCK_QUOTE_MARKER_RE), flags, ctx);
        yield [BLOCK_QUOTE, null, -1]
      } else if (chunkType === BLOCK_LIST_ORDERED || chunkType === BLOCK_LIST_UNORDERED) {
        yield [chunkType, null, 1]
        for (const block of blocks(removeLeadingPattern(dedent(chunk), chunkType === BLOCK_LIST_ORDERED ? ORDERED_LIST_MARKER_RE : UNORDERED_LIST_MARKER_RE), flags, ctx)) {
          if (block[0] === BLOCK_PARAGRAPH) {
            block[0] = BLOCK_LIST_ITEM;
          }
          yield block;
        }
        yield [chunkType, null, -1]
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
    } else if (BLOCK_QUOTE_MARKER_RE.test(trim(line, flags)) && chunkType !== BLOCK_QUOTE) {
      yield* flush();
      chunkType = BLOCK_QUOTE;
    } else if (chunkType === BLOCK_QUOTE && !BLOCK_QUOTE_MARKER_RE.test(line)) {
      yield* flush();
    } else if (UNORDERED_LIST_MARKER_RE.test(trim(line, flags))) {
      yield* flush();
      chunkType = BLOCK_LIST_UNORDERED;
    } else if (chunkType === BLOCK_LIST_UNORDERED && !UNORDERED_LIST_MARKER_RE.test(line)) {
      yield* flush();
    } else if (ORDERED_LIST_MARKER_RE.test(trim(line, flags)) && chunkType !== BLOCK_LIST_ORDERED) {
      yield* flush();
      chunkType = BLOCK_LIST_ORDERED;
    } else if (chunkType === BLOCK_LIST_ORDERED && !ORDERED_LIST_MARKER_RE.test(line)) {
      yield* flush();
    } else if (LINK_REFERENCE_RE.test(line)) {
      chunkType = BLOCK_LINK_REFERENCE;
    }
    
    if (chunk != '') {
      chunk += '\n';
    }
    chunk += line;
  }

  yield* flush();
}

const SPECIAL_RE = /^[_*`]/;
const BRACES_RE = /^[\[\]]/;

function isSpecial(str: string) {
  return SPECIAL_RE.test(str) || BRACES_RE.test(str);
}

function* inlineTokenize(input: string) {
  let sequence = '';

  function* flush(c: string = '') {
    if (sequence) yield sequence;
    sequence = c;
  }
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const next = input[i + 1] ?? '';

    if (c === '<' && isHTML(input.slice(i))) {
      yield* flush();
      const text = input.slice(i);
      yield text;
      i += text.length;
      continue;
    }

    if (WHITESPACE_RE.test(c)) {
      if (!WHITESPACE_RE.test(sequence)) {
        yield* flush()
      }
      sequence += c;
      continue;
    }

    if ((isSpecial(sequence) && ((sequence[0] !== '`' && sequence.length === 2) || !SPECIAL_RE.test(c))) || (WHITESPACE_RE.test(sequence) && !WHITESPACE_RE.test(c))) {
      yield* flush();
    }

    switch (true) {
      case c === '\\': {
        if (next === '`') {
          sequence += c;
          continue;
        }
        if (next === '\n') {
          yield* flush();
        }
        sequence += c;
        if (next) sequence += next;
        i++;
        break;
      }
      case SPECIAL_RE.test(c):
        if (!sequence || sequence[0] === c) {
          sequence += c;
        } else {
          yield* flush(c)
        }
        break;
      case BRACES_RE.test(c):
        yield* flush();
        yield c;
        break;
      case c === '!':
        if (next === '[') {
          yield* flush();
          yield '!['
          i++;
        } else {
          sequence += c;
        }
        break;
      default:
        sequence += c;
        break;
    }
  }
  yield sequence;
}

const modifiers: Record<string, number> = { '*': SPAN_EMPHASIS, '_': SPAN_EMPHASIS, '__': SPAN_STRONG, '**': SPAN_STRONG, '***': SPAN_STRONG_EMPHASIS, '___': SPAN_STRONG_EMPHASIS, '[': SPAN_LINK, '![': SPAN_IMAGE, '`': SPAN_CODE, '``': SPAN_CODE }
function needles(token: string) {
  if (token === '[' || token === '![') return [']'];
  if (token[0] === '`') return [token];
  if (token.length === 2) return [token, token[0]];
  return [token]
}
function* inlines(input: string, opts: Options): Generator<any[]> {
  let tokens = Array.from(inlineTokenize(input));

  outer: for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token[0] === '`') {
      const needle = needles(token);
      for (let j = i + 1; j < tokens.length; j++) {
        const closer = tokens[j];
        for (const n of needle) {
          if (closer === n) {
            yield [SPAN_CODE, extractCodeSpan(tokens.slice(i + 1, j).join(''))];
            i = j;
            continue outer;
          }
        }
      }
    }

    if (token === '[' || token === '![') {
      const needle = [']'];
      for (let j = tokens.length - 1; j > i; j--) {
        const closer = tokens[j];
        for (const n of needle) {
          if (closer === n) {
            const text = tokens.slice(i + 1, j).join('');
            let tail = tokens.slice(j + 1);

            if (tail[0][0] === '(') {
              const k = tail.findIndex(value => value.endsWith(')'));
              tail = tail.slice(0, k + 1);
            } else if (tail[0][0] === '[') {
              const k = tail.findIndex(value => value.endsWith(']'));
              tail = tail.slice(0, k + 1);
            } else {
              tail = [];
            }

            yield [modifiers[token], text, extractLinkDefinition(tail.join(''))];
            i = j;
            i += tail.length;
            continue outer;
          }
        }
      }
    }

    if (isSpecial(token)) {
      const needle = needles(token);
      for (let j = tokens.length - 1; j > i; j--) {
        const opener = tokens[j];
        if (opener[0] === '`') {
          yield [SPAN_TEXT, token]
          continue outer;
        }
        if (opener[0] === '[' || opener[0] === '![') {
          yield [SPAN_TEXT, token]
          continue outer;
        }
        for (const n of needle) {
          if (opener === n) {
            const text = tokens.slice(i + 1, j).join('');
            yield [modifiers[opener], text, []];
            i = j;
            continue outer;
          }
        }
      }
    }

    if (isHTML(token)) {
      yield [SPAN_HTML, token]
    } else if (TRAILING_HARD_BREAK_RE.test(token)) {
      yield [SPAN_HARD_LINE_BREAK];
    } else {
      yield [SPAN_TEXT, token]
    }
  }
}

interface Options {
  mode?: 'default' | 'inline';
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

function parseInline(input: string, opts: Options, ctx: any) {
  let result = ''

  for (let [inline, text, detail] of inlines(input, opts)) {
    switch (inline) {
      case RAW: {
        result += parseInline(inline, opts, ctx);
      }
      case SPAN_CODE: {
        result += `<code>${text}</code>`;
        break;
      }
      case SPAN_EMPHASIS: {
        result += `<em>${parseInline(text, opts, ctx)}</em>`;
        break;
      }
      case SPAN_STRONG: {
        result += `<strong>${parseInline(text, opts, ctx)}</strong>`;
        break;
      }
      case SPAN_LINK: {
        if (!detail[0]) detail = ctx.refs.find((ref: any[]) => ref[0] === text || ref[0] === detail[2]) ?? []
        if (detail[0]) {
          result += `<a href="${detail[0]}"${detail[1] ? ` title="${detail[1]}"` : ''}>${parseInline(text, opts, ctx)}</a>`;
        } else {
          result += `[${encode(unescape(text))}]`;
        }
        break;
      }
      case SPAN_IMAGE: {
        console.log({ detail });
        result += `<img src="${detail[0]}"${text ? ` alt="${text}"` : ''}${detail[1] ? ` title="${detail[1]}"` : ''} />`;
        break;
      }
      case SPAN_AUTOLINK: {
        result += `<a href="${text}">${text}</a>`;
        break;
      }
      case SPAN_TEXT: {
        result += encode(unescape(text));
        break;
      }
      case SPAN_HTML: {
        result += text;
        break;
      }
      case SPAN_HARD_LINE_BREAK: {
        result += `<br />\n`;
        break;
      }
    }
  }

  return result;
}

export function parse(input: string, opts: Options = {}) {
  if (opts.mode === 'inline') return parseInline(input, opts, {});

  const flags = resolveFlags(opts);
  const _blocks = Array.from(blocks(input, flags, {}));

  const refs = _blocks.filter(b => b[0] === BLOCK_LINK_REFERENCE).map(b => extractLinkReferences(b[1])).flat(1);
  const content = _blocks.filter(b => b[0] !== BLOCK_LINK_REFERENCE);
  let result = ''
  const ctx: any = { refs };
  for (const [block, children, detail] of content) {
    switch (block) {
      case BLOCK_QUOTE: {
        result += `<${detail === 1 ? '' : '/'}blockquote>`;
        break;
      }
      case BLOCK_LIST_ITEM: {
        result += `<li>${children}</li>`;
        break;
      }
      case BLOCK_LIST_ORDERED: {
        result += `<${detail === 1 ? '' : '/'}ol>`;
        break;
      }
      case BLOCK_LIST_UNORDERED: {
        result += `<${detail === 1 ? '' : '/'}ul>`;
        break;
      }
      case BLOCK_THEMATIC_BREAK: {
        result += '<hr />';
        break;
      }
      case BLOCK_HEADING: {
        result += `<h${detail}>${parseInline(children, opts, ctx)}</h${detail}>`;
        break;
      }
      case BLOCK_PARAGRAPH: {
        result += `<p>${parseInline(children, opts, ctx)}</p>`;
        break;
      }
      case BLOCK_CODE: {
        const lang = unescape(detail);
        result += `<pre><code${lang ? ` class="language-${lang}"` : ''}>${children}</code></pre>`
        break;
      }
    }
    if (block) {
      result += '\n';
    }
  }
  return result;
}
