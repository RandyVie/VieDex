// How an attached file shows in a document: icon, name, size, Drive's preview if any,
// and buttons to open it in Drive or download it.
import { drive } from '../drive';
import { extOf } from '../library/classify';
import { getIndex } from '../library/library';
import { h, icon } from './dom';
import { errorText, toast } from './feedback';
import { previewOnly } from './media';

export function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

async function download(fileId: string, name: string, button: HTMLButtonElement) {
  button.disabled = true;
  try {
    const url = URL.createObjectURL(await drive.readBlob(fileId));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (err) {
    toast(errorText(err), 'error');
  } finally {
    button.disabled = false;
  }
}

export function fileCard(fileId: string): HTMLElement {
  const f = getIndex()?.files[fileId];
  if (!f) return h('div', { class: 'missing' }, 'This file is no longer in _media.');
  const ext = extOf(f.name).toUpperCase() || 'FILE';
  const get = h('button', { class: 'btn btn-small', type: 'button' }, 'Download');
  get.addEventListener('click', () => download(f.id, f.name, get));
  return h(
    'div',
    { class: 'file-card' },
    previewOnly(f.id, f.name),
    h(
      'div',
      { class: 'file-row' },
      h('span', { class: 'file-ext' }, ext.slice(0, 4)),
      h('span', { class: 'file-info' }, h('span', { class: 'file-name' }, f.name), h('span', { class: 'file-meta' }, [ext, formatSize(f.size)].filter(Boolean).join(' · '))),
      h(
        'span',
        { class: 'file-actions' },
        h('a', { class: 'btn btn-small', href: `https://drive.google.com/file/d/${f.id}/view`, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open'),
        get,
      ),
    ),
  );
}
