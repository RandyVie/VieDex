import { drive } from '../../drive';
import { backlinksOf, blockById, related } from '../../library/derived';
import { getIndex, onLibraryChange } from '../../library/library';
import type { FileEntry } from '../../library/model';
import { displayTitle } from '../../md/blocks';
import { parseDoc } from '../../md/frontmatter';
import { blockBadge, crumbs, docBadge, empty, loading, placeOf, tagChips } from '../components';
import { clear, formatDate, h, icon } from '../dom';
import { errorText } from '../feedback';
import { renderDocument } from '../render-doc';
import type { View } from './view';

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

  return h(
    'aside',
    { class: 'item-side' },
    section('Blocks here', f.blocks.length, h('ul', { class: 'side-list' }, f.blocks.map(block)), 'No blocks written in this document.'),
    section('Embedded', embedded.length, h('ul', { class: 'side-list' }, embedded.map(block)), 'No blocks from elsewhere.'),
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

export function docView(id: string): View {
  let f = getIndex()!.files[id];
  if (!f) return { live: true, el: h('section', { class: 'view' }, empty('Document not found.', 'It may have been moved or deleted in Drive.')) };

  const body = h('div', { class: 'item-body' }, loading());
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
    if (!next) return clear(body, empty('This document was removed in Drive.'));
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
  return { el, dispose: off };
}
