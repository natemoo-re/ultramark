// ultramark — aggressively small, streaming markdown for agents (strict subset)

export interface Parser {
  /** Feed a chunk. Returns HTML for blocks completed by this chunk (stable, append-only). */
  push(chunk: string): string;
  /** Tentative HTML for the currently-open block, if any. Not yet stable. */
  peek(): string;
  /** Flush the remaining buffer and any open block. */
  end(): string;
}

const esc = (s: string) =>
  s
    .replace(/&(?![#\w]+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const url = (u: string) => (/^\s*(javascript|vbscript):/i.test(u) ? '#' : u);

export const inline = (s: string): string => {
  const st: string[] = [];
  // Stash raw HTML behind \x00N\x00 so later passes can't touch it
  const keep = (h: string) => `\x00${st.push(h) - 1}\x00`;
  s = esc(s)
    // code spans (contents protected)
    .replace(/`([^`]+)`/g, (_, m) => keep(`<code>${m}</code>`))
    // links & images — tags stashed so emphasis still applies to the text
    // (destination allows one level of balanced parens, e.g. wikipedia URLs)
    .replace(/(!?)\[([^\]]*)\]\(\s*((?:[^\s()]|\([^)]*\))+)[^)]*\)/g, (_, b, t, u) =>
      b
        ? keep(`<img src="${url(u)}" alt="${t}">`)
        : keep(`<a href="${url(u)}">`) + t + keep('</a>')
    )
    // bare URLs
    .replace(/(^|[\s(])(https?:\/\/[^\s<)"']+)/g, (_, pre, u) => {
      const trail = /[.,;:!?]+$/.exec(u)?.[0] ?? '';
      u = u.slice(0, u.length - trail.length);
      return pre + keep(`<a href="${u}">${u}</a>`) + trail;
    })
    // emphasis — `*` only (subset call: `_` is literal, snake_case is safe)
    .replace(/(\*{1,3})([^*]+)\1/g, (_, m, t) =>
      m[2] ? `<strong><em>${t}</em></strong>` : m[1] ? `<strong>${t}</strong>` : `<em>${t}</em>`
    )
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
  return s.replace(/\x00(\d+)\x00/g, (_, i) => st[i]);
};

// Optimistic inline rendering for peek(): treat an unterminated trailing
// construct as an open element, and withhold a trailing unresolved marker
// run entirely — peek never shows raw syntax (no FOUT). Tentative by
// definition — content that turns out literal pops in, corrected, at close.
// Stable output never uses this.
const eager = (s: string): string => {
  // a trailing run of markers is unresolved syntax: hide it (it will render
  // as an opener once content follows, or pop in literal at close)
  const t = /(\*{1,3}|~{1,2}|`)$/.exec(s);
  if (t) return eager(s.slice(0, t.index));
  // unterminated code span: everything after the last backtick is code
  if ((s.split('`').length - 1) % 2) {
    const i = s.lastIndexOf('`');
    return eager(s.slice(0, i)) + `<code>${esc(s.slice(i + 1))}</code>`;
  }
  // link/image with a partial URL — `](` is the unambiguous signal
  const lk = /(!?)\[([^\]]*)\]\(([^)\s]*)$/.exec(s);
  if (lk)
    return (
      eager(s.slice(0, lk.index)) +
      (lk[1] ? `<img src="${url(lk[3])}" alt="${lk[2]}">` : `<a href="${url(lk[3])}">${eager(lk[2])}</a>`)
    );
  // unterminated emphasis: last opener followed by a non-space char
  let best = -1,
    open = '',
    shut = '',
    width = 0;
  for (const [m, o, c] of [
    ['***', '<strong><em>', '</em></strong>'],
    ['**', '<strong>', '</strong>'],
    ['~~', '<del>', '</del>'],
    ['*', '<em>', '</em>'],
  ]) {
    const i = s.lastIndexOf(m),
      n = s[i + m.length];
    if (i > best && n && !/\s/.test(n) && (m[0] !== '*' || (s[i - 1] !== '*' && n !== '*'))) {
      best = i;
      open = o;
      shut = c;
      width = m.length;
    }
  }
  if (best > -1) return eager(s.slice(0, best)) + open + eager(s.slice(best + width)) + shut;
  return inline(s);
};

// Active inline renderer — renderers always go through this so peek() can
// swap in the optimistic variant. Stable paths always see `inline`.
let il: (s: string) => string = inline;

const cells = (r: string) => r.replace(/^\s*\||\|\s*$/g, '').split('|').map((c) => c.trim());

const task = (t: string) =>
  t.replace(/^\[([ xX])\]( |$)/, (_, c) => `<input type="checkbox" disabled${c === ' ' ? '' : ' checked'}> `);

const renderPara = (ls: string[]): string => {
  // GFM table: header row, delimiter row, body rows — detected at flush time,
  // so it costs the stream nothing
  if (ls.length > 1 && ls[0].includes('|') && cells(ls[1]).every((c) => /^:?-+:?$/.test(c))) {
    const al = cells(ls[1]).map((c) =>
      c[0] === ':' ? (c.slice(-1) === ':' ? 'center' : 'left') : c.slice(-1) === ':' ? 'right' : ''
    );
    const at = (i: number) => (al[i] ? ` align="${al[i]}"` : '');
    let h =
      '<table>\n<thead>\n<tr>' +
      cells(ls[0]).map((c, i) => `<th${at(i)}>${il(c)}</th>`).join('') +
      '</tr>\n</thead>\n<tbody>\n';
    for (const r of ls.slice(2))
      h += '<tr>' + cells(r).map((c, i) => `<td${at(i)}>${il(c)}</td>`).join('') + '</tr>\n';
    return h + '</tbody>\n</table>\n';
  }
  return `<p>${il(ls.join('\n'))}</p>\n`;
};

const renderFence = (ls: string[], info: string): string =>
  `<pre><code${info ? ` class="language-${info}"` : ''}>${ls.length ? esc(ls.join('\n')) + '\n' : ''}</code></pre>\n`;

// items: [indent, ordered, text, startNumber]
const renderList = (items: any[][]): string => {
  const tag = items[0][1] ? 'ol' : 'ul';
  let h = `<${tag}${items[0][3] > 1 ? ` start="${items[0][3]}"` : ''}>\n`,
    i = 0;
  while (i < items.length) {
    const it = items[i];
    const kids: any[][] = [];
    let j = i + 1;
    while (j < items.length && items[j][0] > it[0]) kids.push(items[j++]);
    h += `<li>${task(il(it[2]))}${kids.length ? '\n' + renderList(kids).slice(0, -1) : ''}</li>\n`;
    i = j;
  }
  return h + `</${tag}>\n`;
};

export const createParser = (): Parser => {
  let buf = '',
    open = '',
    info = '',
    fenceEnd: RegExp = /$^/,
    lines: any[] = [];

  const quote = (qs: string[]): string => {
    const p = createParser();
    let h = '';
    for (const l of qs) h += p.push(l + '\n');
    return `<blockquote>\n${h + p.end()}</blockquote>\n`;
  };

  // Render the committed open block, if any (dispatch on block kind)
  const R: Record<string, (ls: any[], i: string) => string> = {
    p: renderPara,
    f: renderFence,
    q: quote,
    l: renderList,
  };
  const draft = (): string => (R[open] ? R[open](lines, info) : '');

  const close = () => {
    const h = draft();
    open = '';
    lines = [];
    info = '';
    return h;
  };

  // Close the current block and open a new one of the given kind
  const swap = (t: string) => {
    const h = close();
    open = t;
    lines = [];
    return h;
  };

  const feed = (line: string): string => {
    let m: RegExpMatchArray | null,
      h = '';
    // inside a fence: everything is literal until the closing fence
    if (open === 'f') {
      if (fenceEnd.test(line)) return close();
      lines.push(line);
      return '';
    }
    if (!line.trim()) return close();
    if ((m = line.match(/^\s{0,3}(`{3,}|~{3,})\s*(\S*)/))) {
      h = swap('f');
      fenceEnd = new RegExp(`^\\s{0,3}${m[1][0]}{${m[1].length},}\\s*$`);
      info = m[2] || '';
      return h;
    }
    if ((m = line.match(/^\s{0,3}(#{1,6})(?:\s+|$)(.*)$/)))
      return close() + `<h${m[1].length}>${il(m[2].replace(/\s+#*\s*$/, '').trimEnd())}</h${m[1].length}>\n`;
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return close() + '<hr>\n';
    if ((m = line.match(/^\s{0,3}>[ ]?(.*)$/))) {
      if (open !== 'q') h = swap('q');
      lines.push(m[1]);
      return h;
    }
    if ((m = line.match(/^(\s*)(?:(\d+)[.)]|[-*+])\s+(.*)$/))) {
      if (open !== 'l') h = swap('l');
      lines.push([m[1].length, m[2] ? 1 : 0, m[3], +(m[2] || 0)]);
      return h;
    }
    if (open !== 'p') h = swap('p');
    lines.push(line.trimStart());
    return h;
  };

  return {
    push(chunk: string) {
      buf += chunk.replace(/\r/g, '');
      let h = '',
        i: number;
      while (~(i = buf.indexOf('\n'))) {
        h += feed(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
      return h;
    },
    peek: () => {
      // tentatively feed the buffered partial line, then roll state back;
      // inline rendering is optimistic (unterminated constructs shown open)
      const o = open,
        l = lines.slice(),
        i = info,
        f = fenceEnd;
      il = eager;
      let h = '';
      // ...but a partial line that is still-resolving line-start syntax
      // (list/fence/hr markers, partial checkbox) is withheld, not fed
      if (buf && !/^\s*(\d+[.)]?|[-*+`~]{1,2})$/.test(buf)) {
        const cb = /^(\s*(?:(?:\d+)[.)]|[-*+])\s+)\[[ xX]?$/.exec(buf);
        h = feed(cb ? cb[1] : buf);
      }
      const d = draft();
      // a paragraph starting with `|` is a table-in-progress: withhold it
      // until a delimiter cell proves it (or it pops in as prose at close)
      h += d.startsWith('<p>|') ? '' : d;
      il = inline;
      open = o;
      lines = l;
      info = i;
      fenceEnd = f;
      return h;
    },
    end() {
      const h = (buf ? feed(buf) : '') + close();
      buf = '';
      return h;
    },
  };
};

export const parse = (input: string) => {
  const p = createParser();
  return p.push(input) + p.end();
};
