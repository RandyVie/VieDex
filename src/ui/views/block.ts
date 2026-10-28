import { blockById, usedIn } from '../../library/derived';
import { BLOCK_LABEL } from '../../library/layout';
import { getIndex } from '../../library/library';
import { displayTitle, embedCode } from '../../md/blocks';
import { blockBadge, docBadge, empty, placeOf } from '../components';
import { h, icon } from '../dom';
import { toast } from '../feedback';
import { blockCard } from '../render-doc';
import type { View } from './view';

export function blockView(id: string): View {
  const b = blockById(id);
  if (!b) return { live: true, el: h('section', { class: 'view' }, empty('Block not found.', 'Its file may have changed in Drive. Try Refresh.')) };

  const home = placeOf(b.fileId);
  const homeFile = getIndex()!.files[b.fileId];
  const uses = usedIn(id).filter((f) => f !== b.fileId);
  const copy = h('button', { class: 'btn btn-small' }, icon('copy'), 'Copy embed code');
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(embedCode(id, b));
    toast('Embed code copied');
  });
  const useRow = (fileId: string) => {
    const p = placeOf(fileId);
    return h('li', null, h('a', { href: p.href }, docBadge(), h('span', null, p.label)));
  };

  return {
    live: true,
    el: h(
      'article',
      { class: 'view item' },
      h(
        'div',
        { class: 'item-main' },
        h(
          'header',
          { class: 'item-head' },
          h('nav', { class: 'crumbs' }, h('a', { href: `#/blocks/${b.type}` }, BLOCK_LABEL[b.type].many), h('span', { class: 'crumb-sep' }, '/'), h('span', null, `^${b.synthetic ? 'no id' : id}`)),
          h('h1', null, displayTitle(b)),
          h('div', { class: 'item-meta' }, blockBadge(b.type), h('span', { class: 'meta-text' }, homeFile?.kind === 'collection' ? 'Standalone block' : `Written in ${home.label}`)),
          h(
            'div',
            { class: 'item-actions' },
            !b.synthetic && h('a', { class: 'btn btn-primary btn-small', href: `#/block/${encodeURIComponent(id)}/edit` }, 'Edit'),
            !b.synthetic && copy,
            h('a', { class: 'btn btn-small', href: home.href }, homeFile?.kind === 'collection' ? 'Open collection' : 'Open document'),
          ),
        ),
        h('div', { class: 'item-body' }, blockCard(b)),
        b.synthetic && h('p', { class: 'muted' }, 'This block has no ID yet, so it can not be embedded. Open its document and save it once to give it one.'),
      ),
      h(
        'aside',
        { class: 'item-side' },
        h('section', { class: 'side-block' }, h('h2', null, 'Lives in'), h('ul', { class: 'side-list' }, h('li', null, h('a', { href: home.href }, homeFile?.kind === 'collection' ? blockBadge(b.type) : docBadge(), h('span', null, home.label))))),
        h(
          'section',
          { class: 'side-block' },
          h('h2', null, 'Used in', h('span', { class: 'count' }, String(uses.length))),
          uses.length ? h('ul', { class: 'side-list' }, uses.map(useRow)) : h('p', { class: 'muted' }, 'Not embedded in any document yet.'),
        ),
      ),
    ),
  };
}
