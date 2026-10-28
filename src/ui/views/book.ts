import { getIndex } from '../../library/library';
import { createBook } from '../../library/writes';
import { docRow, empty } from '../components';
import { h, icon } from '../dom';
import { errorText, toast } from '../feedback';
import { promptDialog } from '../pickers';
import { go } from '../router';
import type { View } from './view';

export async function newBook() {
  const name = await promptDialog('New book', 'Book name', 'Create book');
  if (!name) return;
  try {
    go(`/book/${await createBook(name)}`);
  } catch (err) {
    toast(errorText(err), 'error');
  }
}

export function bookView(id: string): View {
  const index = getIndex()!;
  const book = index.folders[id];
  if (!book || book.parent !== index.rootId) {
    return { live: true, el: h('section', { class: 'view' }, empty('Book not found.', 'It may have been moved or renamed in Drive.')) };
  }
  const files = Object.values(index.files).filter((f) => f.book === id);
  const docs = files.filter((f) => f.kind === 'document').sort((a, b) => a.title.localeCompare(b.title));
  const others = files.filter((f) => f.kind !== 'document').sort((a, b) => a.name.localeCompare(b.name));

  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('nav', { class: 'crumbs' }, h('a', { href: '#/' }, 'Home'), h('span', { class: 'crumb-sep' }, '/'), h('span', null, 'Book')),
      h(
        'header',
        { class: 'view-head' },
        h('h1', null, book.name),
        h('span', { class: 'count' }, String(docs.length)),
        h('a', { class: 'btn btn-small push', href: `#/new-doc/${id}` }, icon('plus'), 'New document'),
      ),
      docs.length ? h('div', { class: 'rows' }, docs.map((f) => docRow(f))) : empty('This book is empty.', 'Add a document, or drop Markdown files into its folder in Drive.'),
      others.length > 0 && [h('h2', { class: 'section-title' }, 'Other files'), h('div', { class: 'rows' }, others.map((f) => docRow(f)))],
    ),
  };
}
