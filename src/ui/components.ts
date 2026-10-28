import { drive } from '../drive';
import { displayTitle, type BlockType } from '../md/blocks';
import type { BlockRef } from '../library/derived';
import { BLOCK_LABEL } from '../library/layout';
import { getIndex } from '../library/library';
import type { FileEntry } from '../library/model';
import { excerpt } from '../library/search';
import { formatDate, h } from './dom';
import { ui } from './ui-state';

export const blockBadge = (type: BlockType) => h('span', { class: `badge badge-${type}` }, BLOCK_LABEL[type].one);
export const docBadge = () => h('span', { class: 'badge badge-doc' }, 'Doc');

export function tagChips(tags: string[]) {
  if (!tags.length) return null;
  return h(
    'span',
    { class: 'tags' },
    tags.map((t) =>
      h(
        'button',
        {
          class: 'tag',
          type: 'button',
          onclick: (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            setQuery(`#${t.toLowerCase()}`);
          },
        },
        `#${t}`,
      ),
    ),
  );
}

/** Put a query in the search box and show results. */
export function setQuery(q: string) {
  ui.query = q;
  const input = document.querySelector<HTMLInputElement>('#search');
  if (input) input.value = q;
  if (location.hash === '#/search') window.dispatchEvent(new Event('viedex:query'));
  else location.hash = '#/search';
}

export const bookName = (bookId: string | null) => (bookId ? (getIndex()?.folders[bookId]?.name ?? 'Book') : 'Loose pages');

/** Where a file sits, as a short label and a link: "Book › Document" or "Ideas collection". */
export function placeOf(fileId: string): { label: string; href: string; book: string | null } {
  const f = getIndex()?.files[fileId];
  if (!f) return { label: 'Unknown file', href: '#/', book: null };
  if (f.kind === 'collection') {
    const type = f.blocks[0]?.type;
    return { label: f.title, href: type ? `#/blocks/${type}` : `#/file/${f.id}`, book: null };
  }
  return { label: `${bookName(f.book)} › ${f.title}`, href: `#/doc/${f.id}`, book: f.book };
}

export function placeLink(fileId: string) {
  const p = placeOf(fileId);
  return h('a', { class: 'place', href: p.href }, p.label);
}

export function crumbs(f: FileEntry) {
  return h(
    'nav',
    { class: 'crumbs', 'aria-label': 'Book' },
    h('a', { href: '#/' }, 'Home'),
    h('span', { class: 'crumb-sep' }, '/'),
    f.book ? h('a', { href: `#/book/${f.book}` }, bookName(f.book)) : h('span', null, 'Loose pages'),
  );
}

export function docRow(f: FileEntry, query = '') {
  const counts = new Map<BlockType, number>();
  for (const b of f.blocks) counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
  return h(
    'a',
    { class: 'row', href: f.kind === 'document' ? `#/doc/${f.id}` : `#/file/${f.id}` },
    f.kind === 'document' ? docBadge() : h('span', { class: 'badge badge-file' }, 'File'),
    h(
      'span',
      { class: 'row-main' },
      h('span', { class: 'row-title' }, f.title),
      f.text && h('span', { class: 'row-excerpt' }, excerpt(f.text, query)),
      (f.tags.length > 0 || counts.size > 0) &&
        h(
          'span',
          { class: 'row-chips' },
          tagChips(f.tags),
          [...counts].map(([type, n]) => h('span', { class: `dot-count dot-${type}` }, `${n} ${n === 1 ? BLOCK_LABEL[type].one : BLOCK_LABEL[type].many}`.toLowerCase())),
        ),
    ),
    h('span', { class: 'row-meta' }, h('span', { class: 'row-path' }, bookName(f.book)), h('span', { class: 'row-date' }, formatDate(f.modifiedTime))),
  );
}

export function blockRow(b: BlockRef, query = '') {
  return h(
    'a',
    { class: 'row', href: `#/block/${encodeURIComponent(b.id)}` },
    blockBadge(b.type),
    h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, displayTitle(b)), h('span', { class: 'row-excerpt' }, excerpt(b.content, query))),
    h('span', { class: 'row-meta' }, h('span', { class: 'row-path' }, placeOf(b.fileId).label)),
  );
}

export const empty = (title: string, detail?: string) =>
  h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, title), detail && h('p', null, detail));

export const loading = (label = 'Loading') => h('div', { class: 'loading' }, h('span', { class: 'spinner' }), label);

function sized(link: string, px: number) {
  return /=s\d+(-[a-z]+)?$/.test(link) ? link.replace(/=s\d+(-[a-z]+)?$/, `=s${px}`) : link;
}

/** An image from Drive: the thumbnail if there is one, else the file itself. */
export function thumb(fileId: string, link: string | undefined | null, px: number, alt: string) {
  const img = h('img', { alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  let fellBack = false;
  const fallback = async () => {
    if (fellBack) return;
    fellBack = true;
    try {
      img.src = URL.createObjectURL(await drive.readBlob(fileId));
    } catch {
      img.replaceWith(h('div', { class: 'thumb-missing' }, 'No preview'));
    }
  };
  img.addEventListener('error', fallback);
  if (link) img.src = sized(link, px);
  else fallback();
  return img;
}
