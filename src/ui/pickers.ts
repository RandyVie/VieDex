import { displayTitle } from '../md/blocks';
import { allBlocks } from '../library/derived';
import { getIndex } from '../library/library';
import type { FileEntry } from '../library/model';
import { searchAll } from '../library/search';
import { uploadMedia } from '../library/writes';
import { extOf } from '../library/classify';
import { blockBadge, placeOf } from './components';
import { clear, h, icon } from './dom';
import { errorText, toast } from './feedback';
import { colorField, rememberColor } from './colors';
import { forgetMediaLinks, mediaImage } from './media';

function modal<T>(title: string, build: (done: (v: T | null) => void) => Node[]): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const dialog = h('dialog', { class: 'dialog dialog-wide' });
    // Resolve right away: the close event can arrive late, and Escape still lands in it below.
    const done = (v: T | null) => {
      if (!settled) resolve(v);
      settled = true;
      dialog.close();
    };
    dialog.append(
      h('header', { class: 'dialog-head' }, h('h2', null, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => done(null) }, icon('close'))),
      ...build(done),
    );
    dialog.addEventListener('close', () => {
      if (!settled) resolve(null);
      settled = true;
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function promptDialog(title: string, label: string, okLabel: string, initial = ''): Promise<string | null> {
  return modal<string>(title, (done) => {
    const input = h('input', { class: 'input', value: initial, 'aria-label': label, placeholder: label });
    const submit = () => input.value.trim() && done(input.value.trim());
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    queueMicrotask(() => input.focus());
    return [
      input,
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'), h('button', { class: 'btn btn-primary', onclick: submit }, okLabel)),
    ];
  });
}

/** Search all blocks in the library and pick one to embed. */
export function pickBlock(): Promise<string | null> {
  return modal<string>('Embed a block', (done) => {
    const input = h('input', { class: 'input', placeholder: 'Search blocks', 'aria-label': 'Search blocks' });
    const list = h('div', { class: 'pick-list' });
    const render = () => {
      const q = input.value.trim();
      const blocks = allBlocks().filter((b) => !b.synthetic);
      const shown = q
        ? searchAll([], blocks, q).flatMap((hit) => (hit.kind === 'block' ? [hit.block] : []))
        : blocks.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
      clear(
        list,
        shown.length
          ? shown.slice(0, 100).map((b) =>
              h('button', { class: 'pick-row', onclick: () => done(b.id) }, blockBadge(b.type), h('span', { class: 'pick-title' }, displayTitle(b)), h('span', { class: 'pick-meta' }, placeOf(b.fileId).label)),
            )
          : h('p', { class: 'muted pick-empty' }, 'No blocks match.'),
      );
    };
    input.addEventListener('input', render);
    render();
    queueMicrotask(() => input.focus());
    return [input, list];
  });
}

/** Pick an image from `_media`, or upload a new one there. Resolves to the file name. */
export function pickMedia(kind: 'image' | 'file' = 'image'): Promise<string | null> {
  const images = kind === 'image';
  return modal<string>(images ? 'Choose an image' : 'Choose a file', (done) => {
    const grid = h('div', { class: 'pick-grid' });
    const render = () => {
      const media = Object.values(getIndex()!.files)
        .filter((f): f is FileEntry => f.kind === 'media' && (!images || f.mimeType.startsWith('image/')))
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
      clear(
        grid,
        media.length
          ? media.map((f) =>
              h(
                'button',
                { class: 'pick-tile', onclick: () => done(f.name), title: f.name },
                // Only images get a picture here; other files a type tile, never a download.
                f.mimeType.startsWith('image/') ? mediaImage(f.id, f.name, 320) : h('span', { class: 'pick-file' }, (extOf(f.name) || 'file').toUpperCase().slice(0, 4)),
                h('span', null, f.name),
              ),
            )
          : h('p', { class: 'muted pick-empty' }, images ? 'No images in _media yet. Upload one.' : 'No files in _media yet. Upload one.'),
      );
    };
    const file = h('input', { type: 'file', accept: images ? 'image/*' : null, hidden: true });
    const upLabel = images ? 'Upload image' : 'Upload file';
    const upload = h('button', { class: 'btn btn-primary' }, icon('plus'), upLabel);
    upload.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      upload.disabled = true;
      upload.textContent = 'Uploading';
      try {
        const entry = await uploadMedia(chosen);
        forgetMediaLinks();
        done(entry.name);
      } catch (err) {
        toast(errorText(err), 'error');
        upload.disabled = false;
        upload.textContent = upLabel;
      }
    });
    render();
    return [h('div', { class: 'dialog-actions dialog-actions-start' }, upload, file), grid];
  });
}

/** Insert text at the cursor on its own lines. */
export function insertAtCursor(area: HTMLTextAreaElement, text: string) {
  const { selectionStart: s, selectionEnd: e, value } = area;
  const before = value.slice(0, s);
  const after = value.slice(e);
  const lead = before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  area.value = before + lead + text + trail + after;
  const caret = (before + lead + text).length;
  area.setSelectionRange(caret, caret);
  area.focus();
  area.dispatchEvent(new Event('input'));
}

/** Name and color for a new book, or just the color for an existing one. */
export function bookDialog(opts: { title: string; okLabel: string; name?: string; color?: string; askName: boolean }): Promise<{ name: string; color: string } | null> {
  return modal<{ name: string; color: string }>(opts.title, (done) => {
    const input = h('input', { class: 'input', value: opts.name ?? '', placeholder: 'Book name', 'aria-label': 'Book name' });
    const color = colorField(opts.color ?? '');
    const submit = () => {
      const name = input.value.trim();
      if (opts.askName && !name) return input.focus();
      rememberColor(color.value());
      done({ name, color: color.value() });
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    if (opts.askName) queueMicrotask(() => input.focus());
    const nodes: Node[] = [];
    if (opts.askName) nodes.push(h('label', { class: 'field' }, h('span', null, 'Name'), input));
    nodes.push(
      h('div', { class: 'field' }, h('span', null, 'Color'), color.el),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn', onclick: () => done(null) }, 'Cancel'), h('button', { class: 'btn btn-primary', onclick: submit }, opts.okLabel)),
    );
    return nodes;
  });
}
