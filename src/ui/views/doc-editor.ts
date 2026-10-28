import { drive, type DriveFile } from '../../drive';
import { getIndex } from '../../library/library';
import { ConflictError, createDocument, saveDocument, updateBlock } from '../../library/writes';
import { metaList, metaString, parseDoc, serializeDoc, setMeta, type Doc } from '../../md/frontmatter';
import { bookName, crumbs, loading } from '../components';
import { clear, h } from '../dom';
import { confirmDialog, errorText, toast } from '../feedback';
import { markdownView } from '../markdown-view';
import { renderDocument } from '../render-doc';
import { segmentEditor } from '../segment-editor';
import { go } from '../router';
import { ui } from '../ui-state';
import type { View } from './view';

const today = () => new Date().toISOString().slice(0, 10);

export function docEditorView(id: string | null, bookId: string | null): View {
  const index = getIndex()!;
  const existing = id ? index.files[id] : undefined;
  const targetBook = existing?.book ?? (bookId && index.folders[bookId] ? bookId : null);
  const el = h('section', { class: 'view editor' }, loading('Opening document'));
  let dirty = false;
  let saving = false;

  const build = (doc: Doc, loaded: DriveFile | null) => {
    const initial = {
      title: metaString(doc.meta.title) || existing?.title || ui.pendingTitle,
      tags: metaList(doc.meta.tags).join(', '),
    };
    ui.pendingTitle = '';

    const title = h('input', { class: 'editor-title', placeholder: 'Title', value: initial.title, 'aria-label': 'Title' });
    const tags = h('input', { class: 'input', placeholder: 'typography, reference', value: initial.tags });
    const markDirty = () => (dirty = true);
    const segs = segmentEditor(doc.body.replace(/^\r?\n/, ''), existing?.id ?? null, markDirty);
    const raw = markdownView(markDirty);
    const preview = h('div', { class: 'editor-preview', hidden: true });
    const tabs = { write: h('button', { class: 'tab is-active', type: 'button' }, 'Write'), markdown: h('button', { class: 'tab', type: 'button' }, 'Markdown'), preview: h('button', { class: 'tab', type: 'button' }, 'Preview') };
    const saveBtn = h('button', { class: 'btn btn-primary' }, 'Save');
    let mode: keyof typeof tabs = 'write';

    [title, tags].forEach((i) => i.addEventListener('input', markDirty));

    const show = (next: keyof typeof tabs) => {
      // The Markdown tab is the file itself; coming back re-reads it into cards.
      if (mode === 'markdown' && next !== 'markdown') segs.setMarkdown(raw.value(), raw.edits());
      if (next === 'markdown') raw.set(segs.markdown(), (id) => segs.embedState(id));
      if (next === 'preview') clear(preview, renderDocument(segs.markdown(), existing ?? null));
      mode = next;
      for (const [k, b] of Object.entries(tabs)) b.classList.toggle('is-active', k === next);
      segs.el.hidden = next !== 'write';
      segs.toolbar.hidden = next === 'preview';
      segs.setInsertTarget(next === 'markdown' ? { block: raw.insertBlock, embed: raw.insertEmbed } : null);
      raw.el.hidden = next !== 'markdown';
      preview.hidden = next !== 'preview';
    };
    tabs.write.addEventListener('click', () => show('write'));
    tabs.markdown.addEventListener('click', () => show('markdown'));
    tabs.preview.addEventListener('click', () => show('preview'));

    const save = async (force = false) => {
      if (saving) return;
      const t = title.value.trim();
      if (!t) {
        title.focus();
        return toast('Give the document a title first.', 'error');
      }
      if (mode === 'markdown') segs.setMarkdown(raw.value(), raw.edits());
      // Only touch frontmatter keys the user changed, so files edited in Drive keep their shape.
      if (t !== initial.title || 'title' in doc.meta || !existing) setMeta(doc, 'title', t);
      if (tags.value !== initial.tags) setMeta(doc, 'tags', metaList(tags.value));
      if (!existing && !doc.meta.created) setMeta(doc, 'created', today());
      doc.body = segs.markdown();
      const text = serializeDoc(doc);

      saving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving';
      try {
        // Shared blocks first: they live in other files.
        for (const ch of segs.embedChanges()) {
          try {
            await updateBlock(ch.id, ch.title, ch.content, ch.expected, force);
          } catch (err) {
            if (!(err instanceof ConflictError)) throw err;
            if (!(await confirmDialog('A shared block in this document changed in Drive since you opened it. Save your version anyway?', 'Replace', true))) return;
            await updateBlock(ch.id, ch.title, ch.content, ch.expected, true);
          }
        }
        segs.commitEmbeds();
        const entry = existing && loaded ? await saveDocument(existing.id, text, loaded, force) : await createDocument(targetBook, t, text);
        dirty = false;
        toast('Saved');
        go(`/doc/${entry.id}`);
      } catch (err) {
        if (err instanceof ConflictError) {
          saving = false;
          if (await confirmDialog('This document changed in Drive since you opened it. Save anyway and replace those changes?', 'Replace', true)) return save(true);
        } else toast(errorText(err), 'error');
      } finally {
        saving = false;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };
    saveBtn.addEventListener('click', () => save());
    el.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        save();
      }
    });

    const cancel = h('a', { class: 'btn', href: existing ? `#/doc/${existing.id}` : targetBook ? `#/book/${targetBook}` : '#/' }, 'Cancel');
    clear(
      el,
      existing ? crumbs(existing) : h('p', { class: 'eyebrow' }, `New document in ${bookName(targetBook)}`),
      title,
      h('div', { class: 'editor-fields editor-fields-one' }, h('label', { class: 'field' }, h('span', null, 'Tags'), tags)),
      h('div', { class: 'editor-tabs' }, tabs.write, tabs.markdown, tabs.preview, segs.toolbar, h('span', { class: 'hint' }, '⌘S to save')),
      segs.el,
      raw.el,
      preview,
      h('div', { class: 'editor-actions' }, cancel, saveBtn),
    );
    if (existing) segs.focus();
    else title.focus();
  };

  if (existing) {
    Promise.all([drive.getMeta(existing.id), drive.readText(existing.id)])
      .then(([meta, text]) => build(parseDoc(text), meta))
      .catch((err) => clear(el, h('p', { class: 'error' }, errorText(err))));
  } else {
    build(parseDoc(''), null);
  }

  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty) e.preventDefault();
  };
  window.addEventListener('beforeunload', beforeUnload);
  return {
    el,
    canLeave: () => (dirty ? confirmDialog('You have unsaved changes. Leave without saving?', 'Leave', true) : Promise.resolve(true)),
    dispose: () => window.removeEventListener('beforeunload', beforeUnload),
  };
}
