import { getIndex, status } from '../../library/library';
import { bookCard, bookStats, docRow, empty, loading } from '../components';
import { h, icon } from '../dom';
import { newBook } from './book';
import type { View } from './view';

export function homeView(focus?: 'loose'): View {
  const index = getIndex();
  if (!index) return { live: true, el: h('section', { class: 'view' }, loading(status.message || 'Loading library')) };

  const files = Object.values(index.files);
  const docs = files.filter((f) => f.kind === 'document');
  const books = bookStats();
  const loose = docs.filter((d) => !d.book).sort((a, b) => a.title.localeCompare(b.title));
  const recent = [...docs].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime)).slice(0, 8);

  // The sidebar's Loose pages link lands on that section of Home.
  if (focus === 'loose') requestAnimationFrame(() => document.getElementById('loose')?.scrollIntoView({ block: 'start' }));

  const addBook = h('button', { class: 'book-card book-new', onclick: newBook }, icon('plus'), 'New book');

  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-head' }, h('h1', null, h('a', { href: '#/books' }, 'Books')), h('span', { class: 'count' }, String(books.length))),
      h(
        'div',
        { class: 'books' },
        books.map(bookCard),
        addBook,
      ),
      loose.length > 0 && [h('h2', { class: 'section-title', id: 'loose' }, 'Loose pages', h('span', { class: 'count' }, String(loose.length))), h('div', { class: 'rows' }, loose.map((f) => docRow(f)))],
      h('h2', { class: 'section-title' }, 'Recently edited'),
      recent.length ? h('div', { class: 'rows' }, recent.map((f) => docRow(f))) : empty('No documents yet.', 'Create a book, then add documents to it.'),
    ),
  };
}
