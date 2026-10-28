import { blockById } from '../../library/derived';
import { BLOCK_LABEL } from '../../library/layout';
import { ConflictError, createBlock, updateBlock } from '../../library/writes';
import type { BlockType } from '../../md/blocks';
import { blockFields } from '../block-fields';
import { empty, placeOf } from '../components';
import { clear, h } from '../dom';
import { confirmDialog, errorText, toast } from '../feedback';
import { formatToolbar } from '../format';
import { blockCard } from '../render-doc';
import { go } from '../router';
import type { View } from './view';

/** Edit one block where it lives, or create a standalone one. */
export function blockEditorView(id: string | null, newType: BlockType | null): View {
  const ref = id ? blockById(id) : null;
  if (id && (!ref || ref.synthetic)) return { live: true, el: h('section', { class: 'view' }, empty('This block can not be edited here.', 'It may have no ID yet, or it was removed in Drive.')) };
  const type = ref?.type ?? newType!;
  const label = BLOCK_LABEL[type];
  let dirty = false;
  let saving = false;

  const title = h('input', { class: 'editor-title', placeholder: 'Title (optional)', value: ref?.title ?? '', 'aria-label': 'Title' });
  const fields = blockFields(type, ref?.content ?? '', () => (dirty = true));
  const preview = h('div', { class: 'editor-preview', hidden: true });
  const tabWrite = h('button', { class: 'tab is-active', type: 'button' }, 'Write');
  const tabPreview = h('button', { class: 'tab', type: 'button' }, 'Preview');
  const saveBtn = h('button', { class: 'btn btn-primary' }, 'Save');
  title.addEventListener('input', () => (dirty = true));

  const showPreview = (on: boolean) => {
    tabWrite.classList.toggle('is-active', !on);
    tabPreview.classList.toggle('is-active', on);
    fields.el.closest('.edit-card')?.toggleAttribute('hidden', on);
    preview.hidden = !on;
    if (on) clear(preview, blockCard({ id: null, type, title: title.value.trim(), content: fields.value() }));
  };
  tabWrite.addEventListener('click', () => showPreview(false));
  tabPreview.addEventListener('click', () => showPreview(true));


  const save = async (force = false) => {
    if (saving) return;
    if (!fields.value().replace(/```\w*\n?|\n?```/g, '').trim()) {
      fields.focus();
      return toast(`The ${label.one.toLowerCase()} is empty.`, 'error');
    }
    saving = true;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving';
    try {
      let target = id;
      if (ref) await updateBlock(ref.id, title.value, fields.value(), ref.content, force);
      else target = await createBlock(type, title.value, fields.value());
      dirty = false;
      toast('Saved');
      go(`/block/${encodeURIComponent(target!)}`);
    } catch (err) {
      if (err instanceof ConflictError) {
        saving = false;
        if (await confirmDialog('This block changed in Drive since you opened it. Save anyway and replace those changes?', 'Replace', true)) return save(true);
      } else toast(errorText(err), 'error');
    } finally {
      saving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save';
    }
  };
  saveBtn.addEventListener('click', () => save());

  const fmtSlot = h('div');
  const el = h(
    'section',
    { class: 'view editor' },
    h(
      'p',
      { class: 'eyebrow' },
      ref ? `Editing ${label.one.toLowerCase()} in ` : `New standalone ${label.one.toLowerCase()}`,
      ref && h('a', { href: placeOf(ref.fileId).href }, placeOf(ref.fileId).label),
    ),
    title,
    ref && h('p', { class: 'muted note' }, 'Changes show up everywhere this block is embedded.'),
    h('div', { class: 'editor-tabs' }, tabWrite, tabPreview, h('span', { class: 'hint' }, '⌘S to save')),
    type !== 'code' && type !== 'image' ? fmtSlot : null,
    h('section', { class: `block block-${type} edit-card edit-card-solo` }, h('div', { class: 'block-body' }, fields.el)),
    preview,
    h('div', { class: 'editor-actions' }, h('a', { class: 'btn', href: ref ? `#/block/${encodeURIComponent(ref.id)}` : `#/blocks/${type}` }, 'Cancel'), saveBtn),
  );
  el.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      save();
    }
  });
  fmtSlot.replaceWith(formatToolbar(el));
  queueMicrotask(() => (ref ? fields.focus() : title.focus()));

  return {
    el,
    canLeave: () => (dirty ? confirmDialog('You have unsaved changes. Leave without saving?', 'Leave', true) : Promise.resolve(true)),
  };
}
