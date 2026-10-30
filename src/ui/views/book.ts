import { getIndex } from '../../library/library';
import { bookFileCount, createBook, deleteBook, updateBook } from '../../library/writes';
import { bookCard, bookStats, docRow, empty, paintBook } from '../components';
import { h, icon } from '../dom';
import { confirmDialog, errorText, toast } from '../feedback';
import { bookDialog } from '../pickers';
import { go } from '../router';
import type { View } from './view';

export async function newBook() {
  const picked = await bookDialog({ title: 'New book', okLabel: 'Create book', askName: true });
  if (!picked) return;
  try {
    go(`/book/${await createBook(picked.name, picked.color)}`);
  } catch (err) {
    toast(errorText(err), 'error');
  }
}

async function editBook(id: string) {
  const book = getIndex()!.folders[id];
  const picked = await bookDialog({ title: 'Edit book', okLabel: 'Save', name: book.name, color: book.color, askName: true });
  if (!picked) return;
  try {
    await updateBook(id, picked.name, picked.color);
    toast('Book saved');
  } catch (err) {
    toast(errorText(err), 'error');
  }
}

/** Only empty books can be deleted, so nothing is ever lost by accident. */
function deleteBookButton(id: string, name: string) {
  const n = bookFileCount(id);
  const b = h(
    'button',
    {
      class: 'btn btn-small btn-quiet-danger',
      disabled: n > 0,
      title: n ? `Only empty books can be deleted. Move or delete its ${n} ${n === 1 ? 'file' : 'files'} first.` : 'Delete this empty book',
    },
    icon('trash'),
    'Delete book',
  );
  b.addEventListener('click', async () => {
    if (!(await confirmDialog(`Delete the empty book "${name}"? Its folder goes to your Google Drive trash, where you can restore it.`, 'Delete', true))) return;
    try {
      await deleteBook(id);
      toast('Book deleted');
      go('/books');
    } catch (err) {
      toast(errorText(err), 'error');
    }
  });
  return b;
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
    el: paintBook(
      h(
      'section',
      { class: 'view' },
      h('nav', { class: 'crumbs' }, h('a', { href: '#/books' }, 'Books'), h('span', { class: 'crumb-sep' }, '/'), h('span', null, book.name)),
      h(
        'header',
        { class: 'view-head' },
        h('button', { class: 'book-swatch', type: 'button', title: 'Edit name and color', 'aria-label': 'Edit book name and color', onclick: () => editBook(id) }),
        h('h1', null, book.name),
        h('span', { class: 'count' }, String(docs.length)),
        h('button', { class: 'btn btn-small push', onclick: () => editBook(id) }, 'Edit book'),
        deleteBookButton(id, book.name),
        h('a', { class: 'btn btn-small', href: `#/new-doc/${id}` }, icon('plus'), 'New document'),
      ),
      docs.length ? h('div', { class: 'rows' }, docs.map((f) => docRow(f))) : empty('This book is empty.', 'Add a document, or drop Markdown files into its folder in Drive.'),
      others.length > 0 && [h('h2', { class: 'section-title' }, 'Other files'), h('div', { class: 'rows' }, others.map((f) => docRow(f)))],
      ),
      book.color,
    ),
  };
}

export function booksView(): View {
  const books = bookStats();
  const loose = Object.values(getIndex()!.files).filter((f) => f.kind === 'document' && !f.book).length;
  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-head' }, h('h1', null, 'Books'), h('span', { class: 'count' }, String(books.length)), h('button', { class: 'btn btn-small push', onclick: newBook }, icon('plus'), 'New book')),
      h(
        'div',
        { class: 'books' },
        books.map(bookCard),
        loose > 0 &&
          h(
            'a',
            { class: 'book-card book-loose', href: '#/loose' },
            h('span', { class: 'book-name' }, 'Loose pages'),
            h('span', { class: 'book-meta' }, `${loose} ${loose === 1 ? 'document' : 'documents'} outside any book`),
          ),
      ),
      !books.length && empty('No books yet.', 'A book is a folder in your library. Create one, or add a folder in Drive.'),
    ),
  };
}
