import { getIndex } from '../../library/library';
import type { FileEntry } from '../../library/model';
import { convertLinks, pendingLinks } from '../../library/writes';
import { hrefOf } from '../../md/blocks';
import { empty, placeOf } from '../components';
import { h, icon } from '../dom';
import { errorText, toast } from '../feedback';
import type { View } from './view';

/** Documents with links that have no link block yet, mostly text edited in Drive. */
export function pendingDocs(): Array<{ file: FileEntry; urls: string[] }> {
  const index = getIndex();
  if (!index) return [];
  return Object.values(index.files)
    .map((file) => ({ file, urls: pendingLinks(file) }))
    .filter((d) => d.urls.length)
    .sort((a, b) => placeOf(a.file.id).label.localeCompare(placeOf(b.file.id).label));
}

async function run(button: HTMLButtonElement, ids: string[]) {
  button.disabled = true;
  let total = 0;
  try {
    for (const [i, id] of ids.entries()) {
      if (ids.length > 1) button.textContent = `Converting ${i + 1} of ${ids.length}`;
      total += await convertLinks(id);
    }
    toast(`${total === 1 ? '1 link was' : `${total} links were`} added as link blocks.`);
  } catch (err) {
    toast(errorText(err), 'error');
    button.disabled = false;
  }
}

export function linksFoundView(): View {
  const docs = pendingDocs();
  const total = docs.reduce((n, d) => n + d.urls.length, 0);
  const all = h('button', { class: 'btn btn-primary btn-small push' }, `Convert all (${total})`);
  all.addEventListener('click', () => run(all, docs.map((d) => d.file.id)));

  return {
    live: true,
    el: h(
      'section',
      { class: 'view' },
      h('header', { class: 'view-head' }, h('h1', null, 'Links to convert'), h('span', { class: 'count' }, String(total)), docs.length > 0 && all),
      h(
        'p',
        { class: 'muted lead' },
        'Links in your text that are not link blocks yet, mostly from files edited in Drive. Converting adds a link block after each paragraph; the text itself stays as it is. A link that already has a block somewhere is embedded instead.',
      ),
      docs.length
        ? h(
            'div',
            { class: 'found-list' },
            docs.map(({ file, urls }) => {
              const btn = h('button', { class: 'btn btn-small' }, 'Convert');
              btn.addEventListener('click', () => run(btn, [file.id]));
              return h(
                'section',
                { class: 'found-doc' },
                h('header', { class: 'found-head' }, h('a', { class: 'found-title', href: placeOf(file.id).href }, placeOf(file.id).label), h('span', { class: 'count' }, String(urls.length)), btn),
                h(
                  'ul',
                  { class: 'found-urls' },
                  urls.map((u) => h('li', null, h('a', { href: hrefOf(u), target: '_blank', rel: 'noopener noreferrer' }, icon('external'), u))),
                ),
              );
            }),
          )
        : empty('Every link is a link block.', 'New links you type are converted when you save the document.'),
    ),
  };
}
