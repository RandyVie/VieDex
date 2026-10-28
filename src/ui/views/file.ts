import { drive } from '../../drive';
import { extOf, isHtml, isTextLike } from '../../library/classify';
import { getIndex } from '../../library/library';
import { sanitizeToString } from '../../md/sanitize';
import { docBadge, empty, loading, placeOf } from '../components';
import { clear, formatDate, h, icon } from '../dom';
import { errorText, toast } from '../feedback';
import { mediaImage } from '../media';
import type { View } from './view';

/** Images in _media and any other file: a preview plus where it is used. */
export function fileView(id: string): View {
  const index = getIndex()!;
  const f = index.files[id];
  if (!f) return { live: true, el: h('section', { class: 'view' }, empty('File not found.')) };
  if (f.kind === 'document') location.replace(`#/doc/${id}`);

  const body = h('div', { class: 'item-body' }, loading());
  const users = Object.values(index.files).filter((x) => x.media.some((m) => m.toLowerCase() === f.name.toLowerCase()));

  if (f.kind === 'media') {
    clear(body, h('figure', { class: 'image-full' }, mediaImage(f.id, f.name, 1600)));
  } else if (isHtml(f)) {
    // Archived pages are untrusted: sanitized, and shown in a sandbox with scripts off.
    drive.readText(f.id).then((t) => {
      const frame = h('iframe', { class: 'clip-frame', sandbox: '', referrerpolicy: 'no-referrer', title: f.title });
      frame.srcdoc = sanitizeToString(t);
      clear(body, frame);
    });
  } else if (isTextLike(f)) {
    drive
      .readText(f.id)
      .then((text) => {
        const copy = h('button', { class: 'btn btn-small code-copy' }, icon('copy'), 'Copy');
        copy.addEventListener('click', async () => {
          await navigator.clipboard.writeText(text);
          toast('Copied');
        });
        clear(body, h('div', { class: 'code-block' }, h('div', { class: 'code-head' }, h('span', { class: 'mono' }, extOf(f.name) || 'text'), copy), h('pre', null, h('code', null, text))));
      })
      .catch((err) => clear(body, h('p', { class: 'error' }, errorText(err))));
  } else {
    clear(body, empty('No preview for this file type.', 'Open it in Drive to view it.'));
  }

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
          h('h1', null, f.name),
          h('div', { class: 'item-meta' }, h('span', { class: 'meta-text' }, `Edited ${formatDate(f.modifiedTime)}`)),
          h('div', { class: 'item-actions' }, h('a', { class: 'btn btn-small', href: `https://drive.google.com/file/d/${f.id}/view`, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open in Drive')),
        ),
        body,
      ),
      f.kind === 'media' &&
        h(
          'aside',
          { class: 'item-side' },
          h(
            'section',
            { class: 'side-block' },
            h('h2', null, 'Shown in', h('span', { class: 'count' }, String(users.length))),
            users.length
              ? h('ul', { class: 'side-list' }, users.map((u) => h('li', null, h('a', { href: placeOf(u.id).href }, docBadge(), h('span', null, placeOf(u.id).label)))))
              : h('p', { class: 'muted' }, 'No image block uses this file yet.'),
          ),
        ),
    ),
  };
}
