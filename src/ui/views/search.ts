import { allBlocks } from '../../library/derived';
import { getIndex } from '../../library/library';
import { searchAll } from '../../library/search';
import { blockRow, docRow, empty } from '../components';
import { clear, h } from '../dom';
import { ui } from '../ui-state';
import type { View } from './view';

export function searchView(): View {
  const el = h('section', { class: 'view view-list' });
  const render = () => {
    const index = getIndex();
    if (!index) return;
    const hits = searchAll(Object.values(index.files), allBlocks(), ui.query).slice(0, 300);
    clear(
      el,
      h('header', { class: 'view-head' }, h('h1', null, ui.query ? `Results for "${ui.query}"` : 'Search'), h('span', { class: 'count' }, String(hits.length))),
      !ui.query
        ? empty('Type to search.', 'Searches document titles, tags and text, and every block. Use #tag to filter documents by tag.')
        : hits.length
          ? h('div', { class: 'rows' }, hits.map((hit) => (hit.kind === 'file' ? docRow(hit.file, ui.query) : blockRow(hit.block, ui.query))))
          : empty('Nothing matches.'),
    );
  };
  render();
  window.addEventListener('kb:query', render);
  return { el, live: true, dispose: () => window.removeEventListener('kb:query', render) };
}
