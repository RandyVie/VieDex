import { brokenLinks } from '../../library/derived';
import { getIndex } from '../../library/library';
import { empty, placeOf } from '../components';
import { h } from '../dom';
import type { View } from './view';

const LABEL = { link: 'Link', embed: 'Embed', media: 'Image' };
const syntax = (kind: 'link' | 'embed' | 'media', target: string) =>
  kind === 'link' ? `[[${target}]]` : kind === 'embed' ? `![[^${target}]]` : `![[${target}]]`;

export function brokenView(): View {
  const list = brokenLinks(getIndex()!);
  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-head' }, h('h1', null, 'Broken links'), h('span', { class: 'count' }, String(list.length))),
      h('p', { class: 'muted lead' }, 'Links to documents that do not exist, embeds of blocks that are gone, and images missing from _media.'),
      list.length
        ? h(
            'div',
            { class: 'rows' },
            list.map(({ from, kind, target }) =>
              h(
                'a',
                { class: 'row', href: placeOf(from.id).href },
                h('span', { class: 'badge badge-warn' }, LABEL[kind]),
                h('span', { class: 'row-main' }, h('span', { class: 'row-title' }, placeOf(from.id).label), h('span', { class: 'row-excerpt mono' }, syntax(kind, target))),
              ),
            ),
          )
        : empty('No broken links.'),
    ),
  };
}
