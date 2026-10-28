import { getIndex, status } from '../../library/library';
import { isReserved } from '../../library/layout';
import { docRow, empty, loading } from '../components';
import { formatDate, h, icon } from '../dom';
import { newBook } from './book';
import type { View } from './view';

export function homeView(): View {
  const index = getIndex();
  if (!index) return { live: true, el: h('section', { class: 'view' }, loading(status.message || 'Loading library')) };

  const files = Object.values(index.files);
  const docs = files.filter((f) => f.kind === 'document');
  const books = Object.values(index.folders)
    .filter((f) => f.parent === index.rootId && !isReserved(f.name))
    .map((b) => {
      const inBook = docs.filter((d) => d.book === b.id);
      return {
        ...b,
        docs: inBook.length,
        blocks: inBook.reduce((n, d) => n + d.blocks.length, 0),
        edited: inBook.reduce((m, d) => (d.modifiedTime > m ? d.modifiedTime : m), ''),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const loose = docs.filter((d) => !d.book).sort((a, b) => a.title.localeCompare(b.title));
  const recent = [...docs].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 8);

  const addBook = h('button', { class: 'book-card book-new', onclick: newBook }, icon('plus'), 'New book');

  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-head' }, h('h1', null, 'Books'), h('span', { class: 'count' }, String(books.length))),
      h(
        'div',
        { class: 'books' },
        books.map((b) =>
          h(
            'a',
            { class: 'book-card', href: `#/book/${b.id}` },
            h('span', { class: 'book-spine' }),
            h('span', { class: 'book-name' }, b.name),
            h('span', { class: 'book-meta' }, `${b.docs} ${b.docs === 1 ? 'document' : 'documents'} · ${b.blocks} blocks`),
            b.edited && h('span', { class: 'book-meta' }, `Edited ${formatDate(b.edited)}`),
          ),
        ),
        addBook,
      ),
      loose.length > 0 && [h('h2', { class: 'section-title' }, 'Loose pages', h('span', { class: 'count' }, String(loose.length))), h('div', { class: 'rows' }, loose.map((f) => docRow(f)))],
      h('h2', { class: 'section-title' }, 'Recently edited'),
      recent.length ? h('div', { class: 'rows' }, recent.map((f) => docRow(f))) : empty('No documents yet.', 'Create a book, then add documents to it.'),
    ),
  };
}
