// Live formatting in the Write tab. A contenteditable shows Markdown as formatted text and
// turns it back into Markdown on every change. A section is only made live when that round
// trip gives the same result; anything else (tables, raw HTML) stays a plain text field.
import { markdownHtml } from '../md/render';

export const TEXT_COLOR_RE = /^color-(red|orange|yellow|green|blue|purple|gray)$/;

export interface RichField {
  el: HTMLElement;
  value(): string;
  focus(): void;
  /** Markdown before and after the block the cursor is in, for inserting a block there. */
  splitAtCursor(): [string, string] | null;
}

class Unsupported extends Error {}

const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'FIGURE']);

// --- HTML to Markdown ----------------------------------------------------------

/** Escape what would otherwise turn into formatting. [[wikilinks]] and URLs stay as typed. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([*`])/g, '\\$1')
    .replace(/(^|[^\w])_|_(?=[^\w]|$)/g, (m) => m.replace('_', '\\_'))
    .replace(/</g, '&lt;');
}

/** A line that would start a heading, list or quote by accident gets its first mark escaped. */
function escapeLineStarts(md: string): string {
  return md
    .split('\n')
    .map((line) => line.replace(/^(\s*)([#>+-]|\d+\.)(?=\s)/, (_, sp: string, mark: string) => `${sp}${mark.length > 1 ? mark.replace('.', '\\.') : `\\${mark}`}`))
    .join('\n');
}

/** Emphasis marks must hug the text: keep outer spaces outside them. */
function wrap(open: string, inner: string, close = open): string {
  const lead = inner.match(/^\s*/)![0];
  const trail = inner.slice(lead.length).match(/\s*$/)![0];
  const core = inner.slice(lead.length, inner.length - trail.length);
  return core ? `${lead}${open}${core}${close}${trail}` : inner;
}

function inline(node: Node): string {
  let out = '';
  node.childNodes.forEach((c) => {
    out += inlineNode(c);
  });
  return out;
}

function inlineNode(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return escapeText(n.textContent ?? '');
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const el = n as HTMLElement;
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      return wrap('**', inline(el));
    case 'EM':
    case 'I':
      return wrap('*', inline(el));
    case 'DEL':
    case 'S':
      return wrap('~~', inline(el));
    case 'CODE':
      return `\`${el.textContent ?? ''}\``;
    case 'BR':
      return '  \n';
    case 'SMALL':
      return `<small>${inline(el)}</small>`;
    case 'SPAN': {
      const color = [...el.classList].find((c) => TEXT_COLOR_RE.test(c));
      return color ? `<span class="${color}">${inline(el)}</span>` : inline(el);
    }
    case 'A': {
      const target = el.dataset.wikilink;
      const label = el.textContent ?? '';
      if (target) return label === target ? `[[${target}]]` : `[[${target}|${label}]]`;
      const href = el.getAttribute('href') ?? '';
      // A link written as plain text (also www. and email, which get a scheme added) stays plain text.
      if (label === href || href === `http://${label}` || href === `https://${label}` || href === `mailto:${label}`) return label;
      return `[${inline(el)}](${href})`;
    }
    case 'IMG':
      return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`;
    case 'INPUT':
      return '';
    default:
      if (BLOCK.has(el.tagName)) throw new Unsupported(el.tagName);
      return inline(el);
  }
}

function listMd(list: HTMLElement, depth: number): string {
  const ordered = list.tagName === 'OL';
  let n = Number(list.getAttribute('start') ?? 1);
  const indent = '  '.repeat(depth);
  const items: string[] = [];
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') throw new Unsupported('list');
    const box = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]') as HTMLInputElement | null;
    const marker = `${ordered ? `${n++}.` : '-'} ${box ? (box.checked || box.hasAttribute('checked') ? '[x] ' : '[ ] ') : ''}`;
    const textParts: string[] = [];
    const nested: string[] = [];
    li.childNodes.forEach((c) => {
      if (c instanceof HTMLElement && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(listMd(c, depth + 1));
      else if (c instanceof HTMLElement && c.tagName === 'P') textParts.push(inline(c));
      else textParts.push(inlineNode(c));
    });
    const text = textParts.join('').replace(/^\s+/, '').replace(/\s+$/, '');
    items.push(`${indent}${marker}${text}${nested.length ? `\n${nested.join('\n')}` : ''}`);
  }
  return items.join('\n');
}

function blockMd(el: HTMLElement): string {
  switch (el.tagName) {
    case 'P':
    case 'DIV':
      return escapeLineStarts(inline(el).replace(/\s+$/, ''));
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return `${'#'.repeat(Number(el.tagName[1]))} ${inline(el).replace(/\n/g, ' ').trim()}`;
    case 'UL':
    case 'OL':
      return listMd(el, 0);
    case 'BLOCKQUOTE':
      return blocksMd(el)
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'PRE': {
      const code = el.querySelector('code');
      const lang = (code?.className.match(/language-([\w+-]+)/) ?? [])[1] ?? '';
      return `\`\`\`${lang}\n${(code ?? el).textContent?.replace(/\n$/, '') ?? ''}\n\`\`\``;
    }
    case 'HR':
      return '---';
    default:
      throw new Unsupported(el.tagName);
  }
}

function blocksMd(root: Node): string {
  const parts: string[] = [];
  let loose = '';
  const flushLoose = () => {
    if (loose.trim()) parts.push(escapeLineStarts(loose.trim()));
    loose = '';
  };
  root.childNodes.forEach((c) => {
    if (c instanceof HTMLElement && BLOCK.has(c.tagName)) {
      flushLoose();
      const md = blockMd(c);
      if (md.trim()) parts.push(md);
    } else loose += inlineNode(c);
  });
  flushLoose();
  return parts.join('\n\n');
}

/** Markdown for the editor's content. Throws Unsupported for things it can't write back. */
export function htmlToMarkdown(root: Node): string {
  return blocksMd(root);
}

// --- Markdown to editable HTML -------------------------------------------------

/** Drop whitespace that only separates blocks; the editor shows text with pre-wrap. */
function tidy(node: Node) {
  const container = node instanceof HTMLElement && ['DIV', 'UL', 'OL', 'BLOCKQUOTE', 'LI'].includes(node.tagName);
  for (const c of Array.from(node.childNodes)) {
    if (c.nodeType !== Node.TEXT_NODE) {
      tidy(c);
      continue;
    }
    const next = c.nextSibling as HTMLElement | null;
    if (container && !c.textContent!.trim()) c.remove();
    else if (next && /^(UL|OL)$/.test(next.tagName ?? '')) c.textContent = c.textContent!.replace(/\s+$/, '');
  }
  // A trailing newline inside a block would show as an empty line.
  if (node instanceof HTMLElement && /^(P|H[1-6]|LI)$/.test(node.tagName) && node.lastChild?.nodeType === Node.TEXT_NODE) {
    node.lastChild.textContent = node.lastChild.textContent!.replace(/\n+$/, '');
  }
}

function editableFragment(md: string): DocumentFragment {
  const frag = markdownHtml(md);
  const box = document.createElement('div');
  box.append(frag);
  tidy(box);
  // Wikilinks and links are text to edit, not things to follow from the editor.
  box.querySelectorAll('input').forEach((i) => i.removeAttribute('disabled'));
  const out = document.createDocumentFragment();
  out.append(...Array.from(box.childNodes));
  return out;
}

const normalize = (html: string) => html.replace(/\s+/g, ' ').replace(/> </g, '><').trim();

function htmlOf(md: string): string {
  const box = document.createElement('div');
  box.append(markdownHtml(md));
  return normalize(box.innerHTML);
}

/** Can this Markdown be edited live and written back with the same result? */
export function canEditLive(md: string): boolean {
  if (!md.trim()) return true;
  try {
    const box = document.createElement('div');
    box.append(editableFragment(md));
    return htmlOf(htmlToMarkdown(box)) === htmlOf(md);
  } catch {
    return false;
  }
}

// --- The field -------------------------------------------------------------------

export function richField(md: string, placeholder: string, onChange: () => void, cls = ''): RichField | null {
  if (!canEditLive(md)) return null;
  const el = document.createElement('div');
  el.className = `rich prose ${cls}`.trim();
  el.contentEditable = 'true';
  el.spellcheck = true;
  el.setAttribute('role', 'textbox');
  el.setAttribute('aria-multiline', 'true');
  el.dataset.placeholder = placeholder;
  el.append(editableFragment(md));

  // Untouched sections keep their exact original text; edited ones are written fresh.
  let edited = false;
  let last = md;
  const value = () => {
    if (!edited) return md;
    try {
      last = htmlToMarkdown(el);
    } catch {
      // Keep the last good version if the browser produced something odd.
    }
    return last;
  };

  const syncEmpty = () => el.classList.toggle('is-empty', !el.textContent?.trim() && !el.querySelector('img, hr, li'));
  syncEmpty();
  el.addEventListener('input', () => {
    edited = true;
    syncEmpty();
    onChange();
  });
  // New lines start a paragraph, not a <div>, so they map to Markdown paragraphs.
  el.addEventListener('focus', () => document.execCommand('defaultParagraphSeparator', false, 'p'));
  // Paste as plain text: formatting from other apps would not survive as Markdown.
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
  });
  // Links are edited, not followed, inside the editor.
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a')) e.preventDefault();
  });

  return {
    el,
    value,
    focus: () => {
      el.focus();
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    },
    splitAtCursor() {
      const sel = getSelection();
      if (!sel?.rangeCount || !el.contains(sel.anchorNode)) return null;
      let block: Node | null = sel.anchorNode;
      while (block && block.parentNode !== el) block = block.parentNode;
      if (!block) return null;
      const index = Array.from(el.childNodes).indexOf(block as ChildNode);
      const pick = (nodes: ChildNode[]) => {
        const box = document.createElement('div');
        box.append(...nodes.map((n) => n.cloneNode(true)));
        return htmlToMarkdown(box);
      };
      const kids = Array.from(el.childNodes);
      return [pick(kids.slice(0, index + 1)), pick(kids.slice(index + 1))];
    },
  };
}

// --- Commands for the toolbar ------------------------------------------------------

/** The live field the selection is in, if any. */
export function activeRich(scope: HTMLElement): HTMLElement | null {
  const sel = getSelection();
  const node = sel?.anchorNode ?? null;
  const el = node instanceof HTMLElement ? node : node?.parentElement;
  const rich = el?.closest<HTMLElement>('.rich');
  return rich && scope.contains(rich) ? rich : null;
}

const changed = (rich: HTMLElement) => rich.dispatchEvent(new Event('input', { bubbles: true }));

export function richBold() {
  document.execCommand('bold');
}

export function richItalic() {
  document.execCommand('italic');
}

/** Color the selection, or remove color with null. */
export function richColor(rich: HTMLElement, color: string | null) {
  const sel = getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  // Inside one colored span with nothing selected: change or remove that span.
  const holder = (range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement)?.closest<HTMLElement>('span[class^="color-"]');
  if (holder && rich.contains(holder) && (range.collapsed || holder.textContent === range.toString())) {
    if (color) holder.className = `color-${color}`;
    else holder.replaceWith(...Array.from(holder.childNodes));
    changed(rich);
    return;
  }
  if (range.collapsed) return;
  const frag = range.extractContents();
  frag.querySelectorAll('span[class^="color-"]').forEach((s) => s.replaceWith(...Array.from(s.childNodes)));
  if (color) {
    const span = document.createElement('span');
    span.className = `color-${color}`;
    span.append(frag);
    range.insertNode(span);
    sel.removeAllRanges();
    const r = document.createRange();
    r.selectNodeContents(span);
    sel.addRange(r);
  } else {
    range.insertNode(frag);
  }
  changed(rich);
}

const SIZES = ['small', 'normal', 'H3', 'H2', 'H1'] as const;

/** One size step up or down for the paragraph or heading the cursor is in. */
export function richSize(rich: HTMLElement, dir: 1 | -1) {
  const sel = getSelection();
  if (!sel?.rangeCount) return;
  let block: Node | null = sel.anchorNode;
  while (block && block.parentNode !== rich) block = block.parentNode;
  if (!(block instanceof HTMLElement) || !/^(P|DIV|H[1-6])$/.test(block.tagName)) return;

  const onlySmall = block.childNodes.length === 1 && (block.firstChild as HTMLElement)?.tagName === 'SMALL';
  const current = /^H[1-3]$/.test(block.tagName) ? block.tagName : /^H[4-6]$/.test(block.tagName) ? 'H3' : onlySmall ? 'small' : 'normal';
  const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(current as (typeof SIZES)[number]) + dir))];
  if (next === current) return;

  const content = onlySmall ? Array.from(block.firstChild!.childNodes) : Array.from(block.childNodes);
  const el = document.createElement(next === 'small' || next === 'normal' ? 'p' : next.toLowerCase());
  if (next === 'small') {
    const small = document.createElement('small');
    small.append(...content);
    el.append(small);
  } else el.append(...content);
  block.replaceWith(el);
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  sel.removeAllRanges();
  sel.addRange(r);
  changed(rich);
}
