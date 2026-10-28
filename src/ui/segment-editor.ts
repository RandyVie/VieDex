// Visual document editor. The file stays plain Markdown with `:::` blocks and
// `![[^id]]` embeds, but here each part is its own card and the codes stay hidden.
import { blockById, blockIdTaken, usedIn } from '../library/derived';
import { BLOCK_LABEL } from '../library/layout';
import { BLOCK_TYPES, blockMarkup, embedCode, newBlockId, parseBody, type BlockType } from '../md/blocks';
import { autoGrow, blockFields, type Fields } from './block-fields';
import { placeLink } from './components';
import { clear, h, icon } from './dom';
import { mediaImage } from './media';
import { pickBlock, pickMedia } from './pickers';
import { mediaByName } from '../library/derived';

type Seg = { key: number } & (
  | { kind: 'text'; text: string }
  | { kind: 'block'; id: string; type: BlockType; title: string; content: string }
  | { kind: 'embed'; id: string; ref: { type: BlockType; fileId: string } | null; title: string; content: string; origTitle: string; origContent: string }
  | { kind: 'media'; name: string }
);

export interface EmbedChange {
  id: string;
  title: string;
  content: string;
  expected: string;
}

export interface InsertTarget {
  block(type: BlockType, content: string): void;
  embed(id: string): void;
}

export interface SegmentEditor {
  el: HTMLElement;
  toolbar: HTMLElement;
  /** Send toolbar inserts somewhere else (the Markdown tab), or back to the cards with null. */
  setInsertTarget(target: InsertTarget | null): void;
  markdown(): string;
  /** Edits to blocks that live in other files, to be saved there first. */
  embedChanges(): EmbedChange[];
  /** Mark embed edits as saved, so a retry doesn't write them twice. */
  commitEmbeds(): void;
  /** Re-read the Markdown; `contentEdits` are edits to shared blocks made in the Markdown tab. */
  setMarkdown(body: string, contentEdits?: Map<string, string>): void;
  /** Current (possibly unsaved) title and content of an embedded block. */
  embedState(id: string): { title: string; content: string } | null;
  focus(): void;
}

let keySeq = 0;

export function segmentEditor(body: string, docId: string | null, onDirty: () => void): SegmentEditor {
  let segs: Seg[] = [];
  let active: { key: number; caret: number | null } | null = null;
  const list = h('div', { class: 'seg-list' });
  const ids = () => new Set(segs.flatMap((s) => (s.kind === 'block' ? [s.id] : [])));
  const freshId = () => newBlockId((x) => blockIdTaken(x) || ids().has(x));
  const text = (t = ''): Seg => ({ key: ++keySeq, kind: 'text', text: t });

  function load(md: string, pending = new Map<string, { title: string; content: string }>()) {
    const out: Seg[] = [];
    for (const s of parseBody(md)) {
      if (s.kind === 'text') out.push(text(s.text.replace(/^\n+|\n+$/g, '')));
      else if (s.kind === 'block') {
        const b = s.block;
        out.push({ key: ++keySeq, kind: 'block', id: b.id ?? '', type: b.type, title: b.title, content: b.content });
      } else if (s.target.startsWith('^')) {
        const id = s.target.slice(1);
        const ref = blockById(id);
        const edit = pending.get(id);
        out.push({
          key: ++keySeq,
          kind: 'embed',
          id,
          ref: ref && { type: ref.type, fileId: ref.fileId },
          title: edit?.title ?? ref?.title ?? '',
          content: edit?.content ?? ref?.content ?? '',
          origTitle: ref?.title ?? '',
          origContent: ref?.content ?? '',
        });
      } else out.push({ key: ++keySeq, kind: 'media', name: s.target });
    }
    // Blocks written in Drive without an ID get one now, so they can be embedded later.
    for (const s of out) if (s.kind === 'block' && !s.id) s.id = freshId();
    segs = out;
    tidy();
  }

  /** Merge neighbouring text and keep a text area at the end to type into. */
  function tidy() {
    const out: Seg[] = [];
    for (const s of segs) {
      const prev = out[out.length - 1];
      if (s.kind === 'text' && prev?.kind === 'text') {
        prev.text = [prev.text, s.text].filter((t) => t.trim()).join('\n\n');
      } else out.push(s);
    }
    if (out[out.length - 1]?.kind !== 'text') out.push(text());
    segs = out;
  }

  function markdown(): string {
    // A block of this document embedded in itself: the embed's edits apply to the original here.
    const local = new Map(segs.flatMap((s) => (s.kind === 'embed' && s.ref?.fileId === docId ? [[s.id, s] as const] : [])));
    const parts = segs.map((s) => {
      switch (s.kind) {
        case 'text':
          return s.text.trim() ? s.text.replace(/\s+$/, '') : '';
        case 'block': {
          // A block added and left empty is dropped rather than saved as "Untitled".
          if (!s.title.trim() && !s.content.replace(/```\w*\n?|\n?```/g, '').trim()) return '';
          const e = local.get(s.id);
          const changed = e && (e.title !== e.origTitle || e.content !== e.origContent);
          return blockMarkup(s.type, s.id, (changed ? e.title : s.title).trim(), changed ? e.content : s.content);
        }
        case 'embed':
          return embedCode(s.id, s.ref ? { type: s.ref.type, title: s.title, content: s.content } : null);
        case 'media':
          return `![[${s.name}]]`;
      }
    });
    return `${parts.filter(Boolean).join('\n\n')}\n`;
  }

  // --- Rendering -------------------------------------------------------------

  const fieldsByKey = new Map<number, Fields | HTMLTextAreaElement>();

  function tools(i: number) {
    const btn = (label: string, name: Parameters<typeof icon>[0], run: () => void, cls = '') =>
      h('button', { class: `icon-btn ${cls}`, type: 'button', title: label, 'aria-label': label, onclick: run }, icon(name));
    return h(
      'div',
      { class: 'seg-tools' },
      i > 0 && btn('Move up', 'chevron', () => move(i, -1), 'rot-up'),
      i < segs.length - 1 && btn('Move down', 'chevron', () => move(i, 1), 'rot-down'),
      btn('Remove', 'close', () => remove(i)),
    );
  }

  function renderSeg(s: Seg, i: number): HTMLElement {
    const track = (el: HTMLElement) =>
      el.addEventListener('focusin', () => {
        active = { key: s.key, caret: null };
      });

    if (s.kind === 'text') {
      const area = autoGrow(h('textarea', { class: 'seg-text', rows: 1, placeholder: segs.length === 1 ? 'Start writing. Use the toolbar to add blocks.' : 'Write here', spellcheck: 'true' }));
      area.value = s.text;
      const remember = () => (active = { key: s.key, caret: area.selectionStart });
      area.addEventListener('input', () => {
        s.text = area.value;
        remember();
        onDirty();
      });
      ['keyup', 'click', 'focus'].forEach((ev) => area.addEventListener(ev, remember));
      fieldsByKey.set(s.key, area);
      const wrap = h('div', { class: 'seg seg-is-text' }, area, segs.length > 1 && s.text.trim() === '' && i < segs.length - 1 && tools(i));
      return wrap;
    }

    if (s.kind === 'media') {
      const id = mediaByName(s.name);
      const wrap = h('div', { class: 'seg' }, tools(i), h('figure', { class: 'media' }, id ? mediaImage(id, s.name) : h('div', { class: 'missing' }, `Image not found: ${s.name}`)));
      track(wrap);
      return wrap;
    }

    if (s.kind === 'embed' && !s.ref) {
      const wrap = h('div', { class: 'seg' }, tools(i), h('div', { class: 'missing' }, 'This embedded block no longer exists. Remove it, or restore the block.'));
      track(wrap);
      return wrap;
    }

    const type = s.kind === 'block' ? s.type : s.ref!.type;
    const title = h('input', { class: 'card-title', placeholder: 'Title (optional)', value: s.title, 'aria-label': 'Block title' });
    const fields = blockFields(type, s.content, () => {
      s.content = fields.value();
      onDirty();
    });
    title.addEventListener('input', () => {
      s.title = title.value;
      onDirty();
    });
    fieldsByKey.set(s.key, fields);

    const uses = s.kind === 'block' ? usedIn(s.id).filter((f) => f !== docId).length : 0;
    const card = h(
      'section',
      { class: `block block-${type} edit-card${s.kind === 'embed' ? ' is-embedded' : ''}` },
      h(
        'header',
        { class: 'block-head' },
        h('span', { class: 'block-type' }, BLOCK_LABEL[type].one),
        title,
        s.kind === 'embed' && h('span', { class: 'block-from' }, 'from ', placeLink(s.ref!.fileId)),
        uses > 0 && h('span', { class: 'block-uses' }, `used in ${uses} other`),
      ),
      h('div', { class: 'block-body' }, fields.el),
      s.kind === 'embed' && h('p', { class: 'card-note' }, 'Shared block. Edits here are saved to the original and show everywhere it is used.'),
      s.kind === 'block' && uses > 0 && h('p', { class: 'card-note' }, 'Other documents embed this block. Edits show there too.'),
    );
    const wrap = h('div', { class: 'seg' }, tools(i), card);
    track(wrap);
    return wrap;
  }

  function render(focusKey?: number) {
    fieldsByKey.clear();
    clear(list, segs.map(renderSeg));
    if (focusKey !== undefined) fieldsByKey.get(focusKey)?.focus();
  }

  // --- Structure changes ------------------------------------------------------

  function insert(seg: Seg) {
    let at = segs.length;
    const i = active ? segs.findIndex((s) => s.key === active!.key) : -1;
    if (i >= 0) {
      const cur = segs[i];
      if (cur.kind === 'text' && active!.caret !== null && cur.text.trim()) {
        // Split the text at the cursor and put the new part in between.
        const before = cur.text.slice(0, active!.caret).replace(/\s+$/, '');
        const after = cur.text.slice(active!.caret).replace(/^\s+/, '');
        segs.splice(i, 1, text(before), seg, text(after));
        at = -1;
      } else at = cur.kind === 'text' && !cur.text.trim() ? i : i + 1;
    }
    if (at >= 0) segs.splice(at, 0, seg);
    tidy();
    active = { key: seg.key, caret: null };
    onDirty();
    render(seg.key);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    [segs[i], segs[j]] = [segs[j], segs[i]];
    tidy();
    onDirty();
    render();
  }

  function remove(i: number) {
    segs.splice(i, 1);
    tidy();
    onDirty();
    render();
  }

  // --- Toolbar ---------------------------------------------------------------

  const menu = h('div', { class: 'menu', hidden: true });
  const addBtn = h('button', { class: 'btn btn-small', type: 'button', 'aria-haspopup': 'true' }, icon('plus'), 'Add block');
  for (const type of BLOCK_TYPES) {
    menu.append(
      h(
        'button',
        {
          class: 'menu-item',
          type: 'button',
          onclick: async () => {
            menu.hidden = true;
            let content = '';
            if (type === 'image') {
              const name = await pickMedia();
              if (!name) return;
              content = `![[${name}]]`;
            }
            if (target) target.block(type, content);
            else insert({ key: ++keySeq, kind: 'block', id: freshId(), type, title: '', content });
          },
        },
        h('span', { class: `swatch swatch-${type}` }),
        BLOCK_LABEL[type].one,
      ),
    );
  }
  // Keep the cursor position: clicking the toolbar must not reset where the block goes.
  addBtn.addEventListener('mousedown', (e) => e.preventDefault());
  addBtn.addEventListener('click', () => (menu.hidden = !menu.hidden));
  list.addEventListener('focusin', () => (menu.hidden = true));

  const embedBtn = h('button', { class: 'btn btn-small', type: 'button' }, icon('link'), 'Embed existing block');
  embedBtn.addEventListener('mousedown', (e) => e.preventDefault());
  embedBtn.addEventListener('click', async () => {
    const id = await pickBlock();
    const ref = id ? blockById(id) : null;
    if (!id || !ref) return;
    if (target) return target.embed(id);
    insert({ key: ++keySeq, kind: 'embed', id, ref: { type: ref.type, fileId: ref.fileId }, title: ref.title, content: ref.content, origTitle: ref.title, origContent: ref.content });
  });

  const toolbar = h('div', { class: 'block-tools' }, h('div', { class: 'menu-wrap' }, addBtn, menu), embedBtn);
  let target: InsertTarget | null = null;

  load(body);
  render();

  return {
    el: list,
    toolbar,
    setInsertTarget(t) {
      target = t;
    },
    markdown,
    embedChanges() {
      const out = new Map<string, EmbedChange>();
      for (const s of segs) {
        if (s.kind !== 'embed' || !s.ref || s.ref.fileId === docId) continue;
        if (s.title !== s.origTitle || s.content !== s.origContent) out.set(s.id, { id: s.id, title: s.title, content: s.content, expected: s.origContent });
      }
      return [...out.values()];
    },
    commitEmbeds() {
      for (const s of segs) {
        if (s.kind !== 'embed') continue;
        s.origTitle = s.title;
        s.origContent = s.content;
      }
    },
    setMarkdown(md: string, contentEdits = new Map<string, string>()) {
      const pending = new Map(segs.flatMap((s) => (s.kind === 'embed' && (s.title !== s.origTitle || s.content !== s.origContent) ? [[s.id, { title: s.title, content: s.content }] as const] : [])));
      for (const [id, content] of contentEdits) {
        const ref = blockById(id);
        pending.set(id, { title: pending.get(id)?.title ?? ref?.title ?? '', content });
      }
      load(md, pending);
      render();
    },
    embedState(id: string) {
      const s = segs.find((x) => x.kind === 'embed' && x.id === id);
      return s && s.kind === 'embed' ? { title: s.title, content: s.content } : null;
    },
    focus() {
      const first = segs[0];
      if (first) fieldsByKey.get(first.key)?.focus();
    },
  };
}
