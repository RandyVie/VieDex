import { allBlocks, brokenLinks } from '../library/derived';
import { BLOCK_LABEL, isReserved } from '../library/layout';
import { getIndex, lastSync, onLibraryChange, refresh, status } from '../library/library';
import { BLOCK_TYPES } from '../md/blocks';
import { paintBook } from './components';
import { clear, formatTime, h, icon } from './dom';
import { errorText, toast } from './feedback';
import { parseRoute, type Route } from './router';
import { ui } from './ui-state';
import { blockView } from './views/block';
import { blockEditorView } from './views/block-editor';
import { blocksOverview, blocksView } from './views/blocks';
import { booksView, bookView, newBook } from './views/book';
import { brokenView } from './views/broken';
import { docView } from './views/doc';
import { docEditorView } from './views/doc-editor';
import { fileView } from './views/file';
import { homeView } from './views/home';
import { searchView } from './views/search';
import { settingsView } from './views/settings';
import { pickRootView } from './views/setup';
import type { View } from './views/view';

export interface LibraryRef {
  id: string;
  name: string;
}

export interface ShellHost {
  libraries: LibraryRef[];
  current: LibraryRef;
  switchTo(id: string): void;
  addLibrary(lib: LibraryRef): void;
  removeLibrary(id: string): void;
  signOut(): void;
}

// Refresh on return to the tab, so edits made in Drive show up without a click.
const STALE_MS = 2 * 60_000;

export function mountShell(root: HTMLElement, host: ShellHost): () => void {
  const nav = h('nav', { class: 'nav' });
  const statusText = h('span', { class: 'status-text' });
  const statusDot = h('span', { class: 'status-dot' });
  const refreshBtn = h('button', { class: 'icon-btn', title: 'Refresh from Drive', 'aria-label': 'Refresh from Drive' }, icon('refresh'));

  const libMenu = h(
    'div',
    { class: 'menu lib-menu', hidden: true },
    host.libraries.map((l) =>
      h('button', { class: `menu-item${l.id === host.current.id ? ' is-current' : ''}`, onclick: () => l.id !== host.current.id && host.switchTo(l.id) }, h('img', { src: './icons/icon.svg', alt: '', width: 16, height: 16 }), l.name),
    ),
    h('a', { class: 'menu-item', href: '#/add-library' }, icon('plus'), 'Add library'),
  );
  const libBtn = h('button', { class: 'lib-switch', 'aria-haspopup': 'true' }, h('img', { src: './icons/icon.svg', alt: '', width: 22, height: 22 }), h('span', { class: 'lib-name' }, host.current.name), icon('chevron'));
  libBtn.addEventListener('click', () => (libMenu.hidden = !libMenu.hidden));
  const closeMenu = (e: Event) => {
    if (!libBtn.contains(e.target as Node)) libMenu.hidden = true;
  };
  document.addEventListener('click', closeMenu);

  const sidebar = h(
    'aside',
    { class: 'sidebar' },
    h('div', { class: 'lib-wrap' }, libBtn, libMenu),
    nav,
    h(
      'footer',
      { class: 'sidebar-foot' },
      statusDot,
      statusText,
      refreshBtn,
      h('a', { class: 'icon-btn', href: '#/settings', title: 'Settings', 'aria-label': 'Settings' }, icon('settings')),
    ),
  );

  const search = h('input', { id: 'search', class: 'search', type: 'search', placeholder: 'Search documents and blocks', autocomplete: 'off', 'aria-label': 'Search', value: ui.query });
  const menuBtn = h('button', { class: 'icon-btn menu-btn', 'aria-label': 'Menu' }, icon('menu'));
  const toolbar = h(
    'header',
    { class: 'toolbar' },
    menuBtn,
    h('label', { class: 'search-wrap' }, icon('search'), search, h('kbd', { class: 'search-key' }, '/')),
    h('a', { class: 'btn btn-primary new-btn', href: '#/new-doc' }, icon('plus'), h('span', null, 'New document')),
  );
  const host_ = h('div', { class: 'host' });
  const scrim = h('div', { class: 'scrim' });
  const shell = h('div', { class: 'shell' }, sidebar, scrim, h('div', { class: 'main' }, toolbar, host_));
  clear(root, shell);

  const setDrawer = (open: boolean) => shell.classList.toggle('drawer-open', open);
  menuBtn.addEventListener('click', () => setDrawer(!shell.classList.contains('drawer-open')));
  scrim.addEventListener('click', () => setDrawer(false));

  // --- Sidebar ---------------------------------------------------------------

  function renderNav() {
    const index = getIndex();
    const link = (href: string, label: string, count?: number, extra?: Node) =>
      h('a', { class: 'nav-link', href }, extra, h('span', { class: 'nav-label' }, label), count !== undefined && h('span', { class: 'count' }, String(count)));
    if (!index) return clear(nav, link('#/', 'Home'));

    const docs = Object.values(index.files).filter((f) => f.kind === 'document');
    const books = Object.values(index.folders)
      .filter((f) => f.parent === index.rootId && !isReserved(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    const blockCounts = new Map<string, number>();
    for (const b of allBlocks()) blockCounts.set(b.type, (blockCounts.get(b.type) ?? 0) + 1);
    const broken = brokenLinks(index).length;
    const loose = docs.filter((d) => !d.book).length;

    const addBook = h('button', { class: 'icon-btn nav-add', title: 'New book', 'aria-label': 'New book', onclick: newBook }, icon('plus'));
    clear(
      nav,
      link('#/', 'Home', undefined, icon('home')),
      h('div', { class: 'nav-head' }, h('a', { class: 'nav-head-link', href: '#/books' }, 'Books'), addBook),
      books.map((b) => link(`#/book/${b.id}`, b.name, docs.filter((d) => d.book === b.id).length, paintBook(h('span', { class: 'book-dot' }), b.color))),
      !books.length && h('p', { class: 'nav-empty' }, 'No books yet.'),
      loose > 0 && link('#/loose', 'Loose pages', loose, h('span', { class: 'book-dot book-dot-loose' })),
      h('div', { class: 'nav-head' }, h('a', { class: 'nav-head-link', href: '#/blocks' }, 'Blocks')),
      BLOCK_TYPES.map((t) => link(`#/blocks/${t}`, BLOCK_LABEL[t].many, blockCounts.get(t) ?? 0, h('span', { class: `swatch swatch-${t}` }))),
      broken > 0 && [h('div', { class: 'nav-head' }), h('a', { class: 'nav-link nav-warn', href: '#/broken' }, h('span', { class: 'nav-label' }, 'Broken links'), h('span', { class: 'count' }, String(broken)))],
    );
    markActive();
  }

  function renderStatus() {
    shell.dataset.sync = status.phase;
    statusText.textContent = status.phase === 'syncing' ? status.message : status.phase === 'error' ? status.message || 'Sync failed' : `Synced ${formatTime(lastSync())}`;
    refreshBtn.disabled = status.phase === 'syncing';
  }

  function markActive() {
    const hash = location.hash || '#/';
    shell.querySelectorAll<HTMLAnchorElement>('.nav-link').forEach((a) => {
      const href = a.getAttribute('href')!;
      a.classList.toggle('is-active', href === hash || (href !== '#/' && hash.startsWith(`${href}/`)));
    });
  }

  refreshBtn.addEventListener('click', () => refresh().catch((err) => toast(errorText(err), 'error')));

  // --- Views -----------------------------------------------------------------

  let view: View | null = null;
  let route: Route = parseRoute();
  let currentHash = location.hash;

  function makeView(r: Route): View {
    if (r.name === 'add-library') {
      return {
        el: h('section', { class: 'view' }, pickRootView((picked) => host.addLibrary(picked), true)),
      };
    }
    if (r.name === 'settings') return settingsView(host);
    if (!getIndex()) return homeView();
    switch (r.name) {
      case 'home':
        return homeView(r.focus);
      case 'books':
        return booksView();
      case 'book':
        return bookView(r.id);
      case 'blocks-all':
        return blocksOverview();
      case 'doc':
        return docView(r.id);
      case 'edit-doc':
        return docEditorView(r.id, null);
      case 'new-doc':
        return docEditorView(null, r.bookId);
      case 'blocks':
        return blocksView(r.type);
      case 'new-block':
        return blockEditorView(null, r.type);
      case 'block':
        return blockView(r.id);
      case 'edit-block':
        return blockEditorView(r.id, null);
      case 'file':
        return fileView(r.id);
      case 'search':
        return searchView();
      case 'broken':
        return brokenView();
    }
  }

  function renderView(keepScroll = false) {
    const scroll = host_.scrollTop;
    view?.dispose?.();
    view = makeView(route);
    clear(host_, view.el);
    host_.scrollTop = keepScroll ? scroll : 0;
    markActive();
  }

  async function onHashChange() {
    const target = location.hash;
    if (view?.canLeave) {
      // Put the old URL back while asking, then move on only if confirmed.
      history.replaceState(null, '', currentHash || '#/');
      if (!(await view.canLeave())) return;
      history.pushState(null, '', target);
    }
    currentHash = target;
    route = parseRoute(target);
    setDrawer(false);
    renderView();
  }
  window.addEventListener('hashchange', onHashChange);

  // --- Search ----------------------------------------------------------------

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ui.query = search.value.trim();
      if (route.name === 'search') window.dispatchEvent(new Event('viedex:query'));
      else location.hash = '#/search';
    }, 120);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      ui.query = '';
      window.dispatchEvent(new Event('viedex:query'));
      search.blur();
    }
    if (e.key === 'Enter') host_.querySelector<HTMLAnchorElement>('.row')?.focus();
  });
  const onKey = (e: KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
    if (e.key === '/' && !typing) {
      e.preventDefault();
      search.focus();
      search.select();
    }
  };
  window.addEventListener('keydown', onKey);

  // --- Library events ---------------------------------------------------------

  const off = onLibraryChange((kind) => {
    renderStatus();
    if (kind !== 'index') return;
    renderNav();
    if (view?.live) renderView(true);
  });

  const onVisible = () => {
    const last = lastSync();
    if (document.visibilityState === 'visible' && getIndex() && status.phase !== 'syncing' && (!last || Date.now() - Date.parse(last) > STALE_MS)) {
      refresh().catch(() => {});
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  const clock = setInterval(renderStatus, 30_000);

  renderNav();
  renderStatus();
  renderView();

  return () => {
    view?.dispose?.();
    off();
    clearInterval(clock);
    document.removeEventListener('click', closeMenu);
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
