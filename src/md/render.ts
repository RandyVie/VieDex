import { Marked, type Tokens } from 'marked';
import { cleanUrl, hrefOf, LINK_SOURCE } from './blocks';
import { languageLabel } from './detect-lang';
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

/**
 * Make links Markdown leaves as plain text clickable, like `coolors.co` or `studio.be/work`.
 * Only the shown page changes, never the file. Code and existing links are left alone.
 */
function linkBareUrls(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('a, code, pre') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.textContent ?? '';
    const re = new RegExp(LINK_SOURCE, 'gi');
    let last = 0;
    const parts: Node[] = [];
    for (const m of text.matchAll(re)) {
      const url = cleanUrl(m[0]);
      if (!/\.[a-z]{2,}/i.test(url)) continue;
      const at = m.index!;
      parts.push(document.createTextNode(text.slice(last, at)));
      const a = document.createElement('a');
      a.href = hrefOf(url);
      a.textContent = url;
      parts.push(a);
      last = at + url.length;
    }
    if (!parts.length) continue;
    parts.push(document.createTextNode(text.slice(last)));
    node.replaceWith(...parts);
  }
}

/** A small language label in the top right corner of each code box (```css and so on). */
function labelCode(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('pre > code[class*="language-"]').forEach((code) => {
    const lang = /language-([\w+#.-]+)/.exec(code.className)?.[1];
    const pre = code.parentElement!;
    if (!lang) return;
    const wrap = document.createElement('div');
    wrap.className = 'code-box';
    const label = document.createElement('span');
    label.className = 'code-lang';
    label.textContent = languageLabel(lang);
    pre.replaceWith(wrap);
    wrap.append(pre, label);
  });
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
      a.href = `#/doc/${id}`;
    } else {
      a.classList.add('is-broken');
      a.title = 'No item with this title yet. Click to create it.';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        opts.onMissing(target);
      });
    }
  });
  linkBareUrls(root);
  labelCode(root);
  root.querySelectorAll<HTMLAnchorElement>('a[href^="http"], a[href^="mailto"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  return root;
}
