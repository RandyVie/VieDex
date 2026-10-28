import { allBlocks } from '../../library/derived';
import { BLOCK_LABEL } from '../../library/layout';
import { getIndex } from '../../library/library';
import { displayTitle, type BlockType } from '../../md/blocks';
import { empty } from '../components';
import { h, icon } from '../dom';
import { blockCard } from '../render-doc';
import type { View } from './view';

/** Every block of one type in the library, each with where it lives and where it is used. */
export function blocksView(type: BlockType): View {
  const label = BLOCK_LABEL[type];
  const blocks = allBlocks()
    .filter((b) => b.type === type)
    .sort((a, b) => (getIndex()!.files[b.fileId]?.modifiedTime ?? '').localeCompare(getIndex()!.files[a.fileId]?.modifiedTime ?? '') || displayTitle(a).localeCompare(displayTitle(b)));

  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h(
        'header',
        { class: 'view-head' },
        h('h1', null, label.many),
        h('span', { class: 'count' }, String(blocks.length)),
        h('a', { class: 'btn btn-small push', href: `#/blocks/${type}/new` }, icon('plus'), `New ${label.one.toLowerCase()}`),
      ),
      h('p', { class: 'muted lead' }, `Every ${label.one.toLowerCase()} block in this library, from documents and from the standalone collection.`),
      blocks.length
        ? h('div', { class: `block-grid${type === 'image' ? ' block-grid-images' : ''}` }, blocks.map((b) => blockCard(b, { usage: { homeId: b.fileId }, compact: true })))
        : empty(`No ${label.many.toLowerCase()} yet.`, 'Add one here, or write one inside a document with the Block button.'),
    ),
  };
}
