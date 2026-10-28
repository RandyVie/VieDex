import { Marked, type Tokens } from 'marked';
import { sanitize } from './sanitize';

// Kept in sync with the wikilink tokenizer below: [[Target]] or [[Target|label]].
export const WIKILINK_RE = /(?<!!)\[\[([^\]\n|^]+?)(?:\|([^\]\n]+))?\]\]/g;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const marked = new Marked({
  gfm: true,
  extensions: [
    {
      name: 'wikilink',
      level: 'inline',
      start: (src: string) => src.indexOf('[['),
      tokenizer(src: string) {
        const m = /^\[\[([^\]\n|^]+?)(?:\|([^\]\n]+))?\]\]/.exec(src);
        if (!m) return undefined;
        return { type: 'wikilink', raw: m[0], target: m[1].trim(), label: (m[2] ?? m[1]).trim() };
      },
      renderer(token: Tokens.Generic) {
        return `<a data-wikilink="${escapeHtml(token.target)}" href="#">${escapeHtml(token.label)}</a>`;
      },
    },
  ],
});

/** Markdown as sanitized HTML, without link resolving. Used by the live editor. */
export function markdownHtml(md: string): DocumentFragment {
  return sanitize(marked.parse(md, { async: false }) as string);
}

/** Wikilink targets in a Markdown body, ignoring code. */
export function extractLinks(body: string): string[] {
  const text = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const out: string[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const t = m[1].trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export interface RenderOptions {
  resolve: (title: string) => string | null;
  onMissing: (title: string) => void;
}

export function renderMarkdown(body: string, opts: RenderOptions): HTMLElement {
  const root = document.createElement('div');
  root.className = 'prose';
  root.append(sanitize(marked.parse(body, { async: false }) as string));

  root.querySelectorAll<HTMLAnchorElement>('a[data-wikilink]').forEach((a) => {
    const target = a.dataset.wikilink!;
    const id = opts.resolve(target);
    a.classList.add('wikilink');
    if (id) {
      a.href = `#/item/${id}`;
    } else {
      a.classList.add('is-broken');
      a.title = 'No item with this title yet. Click to create it.';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        opts.onMissing(target);
      });
    }
  });
  root.querySelectorAll<HTMLAnchorElement>('a[href^="http"], a[href^="mailto"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  return root;
}
