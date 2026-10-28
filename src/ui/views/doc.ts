import { drive } from '../../drive';
import { allBlocks, backlinksOf, blockById, related } from '../../library/derived';
import { getIndex, onLibraryChange } from '../../library/library';
import type { FileEntry } from '../../library/model';
import { displayTitle, firstUrl, hrefOf } from '../../md/blocks';
import { findUrls, urlKey } from '../../md/linkify';
import { parseDoc } from '../../md/frontmatter';
import { blockBadge, crumbs, docBadge, empty, loading, placeOf, switchToggle, tagChips } from '../components';
import { clear, formatDate, h, icon } from '../dom';
import { errorText } from '../feedback';
import { confirmDeleteDoc } from '../actions';
import { renderDocument } from '../render-doc';
import { go } from '../router';
import type { View } from './view';

/** Every link in a document once: from its text, its own link blocks and embedded ones. Code is skipped. */
function documentLinks(f: FileEntry): Array<{ url: string; blockId: string | null }> {
  const seen = new Map<string, { url: string; blockId: string | null }>();
  const add = (url: string, blockId: string | null = null) => {
    const key = urlKey(url);
    const had = seen.get(key);
    if (!had) seen.set(key, { url, blockId });
    else if (!had.blockId && blockId) had.blockId = blockId;
  };
  let fence = false;
  for (const line of f.text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence) findUrls(line).forEach((u) => add(u));
  }
  for (const id of f.embeds) {
    const b = blockById(id);
    const url = b?.type === 'link' ? firstUrl(b.content) : null;
    if (url) add(url, id);
  }
  // Point each link at its link block when there is one.
  const blocks = new Map<string, string>();
  for (const b of allBlocks()) {
    const url = b.type === 'link' && !b.synthetic ? firstUrl(b.content) : null;
    if (url && !blocks.has(urlKey(url))) blocks.set(urlKey(url), b.id);
  }
  return [...seen.values()].map((l) => ({ ...l, blockId: l.blockId ?? blocks.get(urlKey(l.url)) ?? null }));
}

function side(f: FileEntry) {
  const index = getIndex()!;
  const docLink = (id: string) => {
    const p = placeOf(id);
    return h('li', null, h('a', { href: p.href }, docBadge(), h('span', null, p.label)));
  };
  const block = (b: { id: string | null; type: Parameters<typeof blockBadge>[0]; title: string; content: string }) =>
    h('li', null, h('a', { href: b.id ? `#/block/${encodeURIComponent(b.id)}` : '#' }, blockBadge(b.type), h('span', null, displayTitle(b))));
  const section = (title: string, n: number, body: Node | null, emptyText: string, warn = false) =>
    h('section', { class: 'side-block' }, h('h2', null, title, h('span', { class: `count${warn ? ' count-warn' : ''}` }, String(n))), n ? body : h('p', { class: 'muted' }, emptyText));

  const backs = backlinksOf(f.id);
  const embedded = f.embeds.map((id) => blockById(id)).filter((b) => b !== null);
  const missingLinks = f.links.filter((_, i) => !f.linkIds[i]);
  const missingEmbeds = f.embeds.filter((id) => !blockById(id));
  const rel = related(index, f.id);
  const links = documentLinks(f);

  return h(
    'aside',
    { class: 'item-side' },
    section('Blocks here', f.blocks.length, h('ul', { class: 'side-list' }, f.blocks.map(block)), 'No blocks written in this document.'),
    section('Embedded', embedded.length, h('ul', { class: 'side-list' }, embedded.map(block)), 'No blocks from elsewhere.'),
    section(
      'Links',
      links.length,
      h(
        'ul',
        { class: 'side-list side-links' },
        links.map((l) =>
          h(
            'li',
            null,
            l.blockId ? h('a', { class: 'side-link-block', href: `#/block/${encodeURIComponent(l.blockId)}`, title: 'Open the link block' }, blockBadge('link')) : h('span', { class: 'side-link-block' }),
            h('a', { class: 'side-link-url', href: hrefOf(l.url), target: '_blank', rel: 'noopener noreferrer', title: l.url }, l.url.replace(/^[a-z]+:\/\//i, '')),
          ),
        ),
      ),
      'No links in this document.',
    ),
    section('Backlinks', backs.length, h('ul', { class: 'side-list' }, backs.map(docLink)), 'Nothing links here yet.'),
    missingLinks.length + missingEmbeds.length > 0 &&
      section(
        'Broken',
        missingLinks.length + missingEmbeds.length,
        h('ul', { class: 'side-list' }, missingLinks.map((t) => h('li', { class: 'mono warn' }, `[[${t}]]`)), missingEmbeds.map((t) => h('li', { class: 'mono warn' }, `![[^${t}]]`))),
        '',
        true,
      ),
    section('Related', rel.length, h('ul', { class: 'side-list' }, rel.map((r) => docLink(r.id))), 'No related documents found.'),
  );
}

// A reading preference for this device only; it never changes the file.
const SHOW_BLOCKS_KEY = 'viedex.showBlocks';

function loadShowBlocks(): boolean {
  try {
    return localStorage.getItem(SHOW_BLOCKS_KEY) !== 'off';
  } catch {
    return true;
  }
}

function saveShowBlocks(on: boolean) {
  try {
    localStorage.setItem(SHOW_BLOCKS_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

let showBlocks = loadShowBlocks();

// Focus mode: sidebars hidden, article centered. Also a per-device reading preference.
const FOCUS_KEY = 'viedex.focus';
let focus = (() => {
  try {
    return localStorage.getItem(FOCUS_KEY) === 'on';
  } catch {
    return false;
  }
})();

function setFocus(on: boolean) {
  focus = on;
  document.documentElement.classList.toggle('focus-mode', on);
  document.querySelectorAll('.focus-btn').forEach((b) => b.classList.toggle('is-on', on));
  try {
    localStorage.setItem(FOCUS_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: focus lasts until the page reloads.
  }
}

export function docView(id: string): View {
  let f = getIndex()!.files[id];
  if (!f) return { live: true, el: h('section', { class: 'view' }, empty('Document not found.', 'It may have been moved or deleted in Drive.')) };

  const body = h('div', { class: `item-body${showBlocks ? '' : ' blocks-plain'}` }, loading());
  const head = () =>
    h(
      'header',
      { class: 'item-head' },
      crumbs(f),
      h('h1', null, f.title),
      h('div', { class: 'item-meta' }, tagChips(f.tags), h('span', { class: 'meta-text' }, f.created ? `Created ${formatDate(f.created)} · ` : '', `Edited ${formatDate(f.modifiedTime)}`)),
      h(
        'div',
        { class: 'item-actions' },
        h('a', { class: 'btn btn-primary btn-small', href: `#/doc/${f.id}/edit` }, 'Edit'),
        h('a', { class: 'btn btn-small', href: `https://drive.google.com/file/d/${f.id}/view`, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open in Drive'),
        h(
          'button',
          {
            class: `btn btn-small focus-btn${focus ? ' is-on' : ''}`,
            title: 'Focus: hide the sidebars (F, Esc to leave)',
            onclick: () => setFocus(!focus),
          },
          icon('focus'),
          'Focus',
        ),
        switchToggle('Show blocks', showBlocks, (on) => {
          showBlocks = on;
          saveShowBlocks(on);
          body.classList.toggle('blocks-plain', !on);
        }),
        h(
          'button',
          {
            class: 'btn btn-small btn-quiet-danger push',
            onclick: async () => {
              const book = f.book;
              if (await confirmDeleteDoc(f.id)) go(book ? `/book/${book}` : '/');
            },
          },
          icon('trash'),
          'Delete',
        ),
      ),
    );
  let header = head();
  let aside = side(f);
  const el = h('article', { class: 'view item' }, h('div', { class: 'item-main' }, header, body), aside);

  // Read the file itself rather than the index: Drive is authoritative.
  const load = () =>
    drive
      .readText(f.id)
      .then((text) => clear(body, renderDocument(parseDoc(text).body, f)))
      .catch((err) => clear(body, h('p', { class: 'error' }, errorText(err))));
  load();

  const off = onLibraryChange((kind) => {
    if (kind !== 'index') return;
    const next = getIndex()?.files[id];
    if (!next) return clear(el, h('section', { class: 'view' }, empty('This document was deleted.')));
    const changed = next.modifiedTime !== f.modifiedTime;
    f = next;
    const nh = head();
    header.replaceWith(nh);
    header = nh;
    const na = side(f);
    aside.replaceWith(na);
    aside = na;
    // Embedded blocks may have changed elsewhere, so re-render either way.
    if (changed) load();
    else drive.readText(f.id).then((text) => clear(body, renderDocument(parseDoc(text).body, f))).catch(() => {});
  });
  // F toggles focus while reading, Esc leaves it. Never while typing in a field.
  const onKey = (e: KeyboardEvent) => {
    const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]');
    if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
    if (e.key === 'f' || e.key === 'F') setFocus(!focus);
    else if (e.key === 'Escape' && focus) setFocus(false);
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  document.documentElement.classList.toggle('focus-mode', focus);

  return {
    el,
    dispose: () => {
      off();
      window.removeEventListener('keydown', onKey);
      // Focus only applies to reading a document; other pages keep their sidebars.
      document.documentElement.classList.remove('focus-mode');
    },
  };
}
