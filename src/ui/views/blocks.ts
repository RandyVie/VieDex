import { allBlocks } from '../../library/derived';
import { BLOCK_LABEL } from '../../library/layout';
import { getIndex } from '../../library/library';
import { BLOCK_TYPES, displayTitle, type BlockType } from '../../md/blocks';
import { codeBlockLanguage, languageLabel } from '../../md/detect-lang';
import type { BlockRef } from '../../library/derived';
import { empty } from '../components';
import { pendingDocs } from './links-found';
import { clear, h, icon } from '../dom';
import { blockCard } from '../render-doc';
import type { View } from './view';

const pendingCount = () => pendingDocs().reduce((n, d) => n + d.urls.length, 0);

// The chosen language on the Code page, kept while moving around the app.
let codeFilter: string | null = null;

/** Code blocks with a side list of the languages used, which filters them. */
function codeWithLanguages(blocks: BlockRef[]): HTMLElement {
  const langOf = new Map(blocks.map((b) => [b, codeBlockLanguage(b.content)]));
  const counts = new Map<string, number>();
  for (const lang of langOf.values()) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  if (codeFilter !== null && !counts.has(codeFilter)) codeFilter = null;
  const langs = [...counts.keys()].filter((l) => l).sort((a, b) => languageLabel(a).localeCompare(languageLabel(b)));

  const grid = h('div', { class: 'block-grid' });
  const side = h('aside', { class: 'lang-side', 'aria-label': 'Filter by language' });

  const render = () => {
    clear(
      grid,
      blocks.filter((b) => codeFilter === null || langOf.get(b) === codeFilter).map((b) => blockCard(b, { usage: { homeId: b.fileId }, compact: true })),
    );
    const item = (key: string | null, label: string, n: number) => {
      const b = h('button', { class: `lang-item${codeFilter === key ? ' is-active' : ''}`, type: 'button', 'aria-pressed': String(codeFilter === key) }, h('span', null, label), h('span', { class: 'count' }, String(n)));
      b.addEventListener('click', () => {
        // Clicking the active language again shows everything.
        codeFilter = codeFilter === key ? null : key;
        render();
      });
      return b;
    };
    clear(
      side,
      h('h2', null, 'Languages'),
      item(null, 'All', blocks.length),
      langs.map((l) => item(l, languageLabel(l), counts.get(l)!)),
      counts.has('') && item('', 'No language', counts.get('')!),
    );
  };
  render();
  return h('div', { class: 'with-side' }, grid, side);
}

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
      type === 'link' && pendingCount() > 0 && h('a', { class: 'notice', href: '#/links-found' }, icon('link'), pendingCount() === 1 ? '1 link in your text is not a link block yet. Review and convert it.' : `${pendingCount()} links in your text are not link blocks yet. Review and convert them.`),
      !blocks.length
        ? empty(`No ${label.many.toLowerCase()} yet.`, 'Add one here, or write one inside a document with the Block button.')
        : type === 'code'
          ? codeWithLanguages(blocks)
          : h('div', { class: `block-grid${type === 'image' ? ' block-grid-images' : ''}` }, blocks.map((b) => blockCard(b, { usage: { homeId: b.fileId }, compact: true }))),
    ),
  };
}

/** All block types at a glance: count and the latest few of each. */
export function blocksOverview(): View {
  const index = getIndex()!;
  const edited = (fileId: string) => index.files[fileId]?.modifiedTime ?? '';
  const all = allBlocks().filter((b) => !b.synthetic);
  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-head' }, h('h1', null, 'Blocks'), h('span', { class: 'count' }, String(all.length))),
      h('p', { class: 'muted lead' }, 'Every block in this library, by type. Open a type to see where each block lives and where it is used.'),
      h(
        'div',
        { class: 'type-grid' },
        BLOCK_TYPES.map((type) => {
          const list = all.filter((b) => b.type === type).sort((a, b) => edited(b.fileId).localeCompare(edited(a.fileId)));
          return h(
            'section',
            { class: `type-card block-${type}` },
            h('a', { class: 'type-head', href: `#/blocks/${type}` }, h('span', { class: `swatch swatch-${type}` }), h('span', { class: 'type-name' }, BLOCK_LABEL[type].many), h('span', { class: 'count' }, String(list.length))),
            list.length
              ? h('ul', { class: 'type-list' }, list.slice(0, 4).map((b) => h('li', null, h('a', { href: `#/block/${encodeURIComponent(b.id)}` }, displayTitle(b)))))
              : h('p', { class: 'muted type-empty' }, `No ${BLOCK_LABEL[type].many.toLowerCase()} yet.`),
            h(
              'footer',
              { class: 'type-foot' },
              list.length > 4 && h('a', { href: `#/blocks/${type}` }, `All ${list.length}`),
              h('a', { class: 'type-new', href: `#/blocks/${type}/new` }, icon('plus'), `New ${BLOCK_LABEL[type].one.toLowerCase()}`),
            ),
          );
        }),
      ),
    ),
  };
}
