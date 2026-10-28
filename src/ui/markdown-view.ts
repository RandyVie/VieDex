// The Markdown tab: the file as it is stored, with each embedded block's content
// shown under its `![[^id]]` line. That content is never written into this file:
// edits to it are saved to the block's own file, like edits in the Write tab.
import { blockById, blockIdTaken } from '../library/derived';
import { BLOCK_LABEL } from '../library/layout';
import { blockMarkup, embedCode, newBlockId, type BlockType } from '../md/blocks';
import { autoGrow } from './block-fields';
import { clear, h } from './dom';

const EMBED_RE = /^[ \t]*!\[\[\^([^\]|\n]+)(?:\|[^\]\n]*)?\]\][ \t]*$/;
const FENCE_RE = /^[ \t]*(```|~~~)/;
const OPEN_RE = /^:::(idea|list|link|code|image|reference)\b/i;
const CLOSE_RE = /^:::[ \t]*$/;

type Chunk = { kind: 'text'; area: HTMLTextAreaElement } | { kind: 'embed'; line: string };

export interface MarkdownView {
  el: HTMLElement;
  value(): string;
  set(md: string, current?: (id: string) => { content: string } | null, keepEdits?: boolean): void;
  /** Edited content of shared blocks, by block ID. */
  edits(): Map<string, string>;
  /** Insert a new block at the cursor, with the cursor inside it. */
  insertBlock(type: BlockType, content: string): void;
  /** Insert an embed line at the cursor and show the block under it. */
  insertEmbed(id: string): void;
}

export function markdownView(onDirty: () => void): MarkdownView {
  const el = h('div', { class: 'md-view', hidden: true });
  let chunks: Chunk[] = [];
  let edits = new Map<string, string>();
  let current: (id: string) => { content: string } | null = () => null;
  let active: { area: HTMLTextAreaElement; caret: number } | null = null;

  function textChunk(lines: string[]): Chunk {
    const area = autoGrow(h('textarea', { class: 'md-chunk', spellcheck: 'true', rows: 1 }));
    area.value = lines.join('\n');
    area.addEventListener('input', onDirty);
    const remember = () => (active = { area, caret: area.selectionStart });
    ['input', 'keyup', 'click', 'focus'].forEach((ev) => area.addEventListener(ev, remember));
    // Blank lines between two embeds stay in the file but need no box of their own.
    if (!area.value.trim()) area.classList.add('md-chunk-blank');
    return { kind: 'text', area };
  }

  function embedBox(line: string, id: string): HTMLElement {
    const ref = blockById(id);
    if (!ref) return h('div', { class: 'md-embed' }, h('div', { class: 'md-embed-line' }, line.trim()), h('p', { class: 'md-embed-note warn' }, 'No block with this ID.'));
    const area = autoGrow(h('textarea', { class: 'md-embed-content', spellcheck: 'true', rows: 1, 'aria-label': 'Shared block content' }));
    area.value = edits.get(id) ?? current(id)?.content ?? ref.content;
    area.addEventListener('input', () => {
      edits.set(id, area.value);
      onDirty();
    });
    return h(
      'div',
      { class: `md-embed block-${ref.type}` },
      h('div', { class: 'md-embed-line' }, line.trim()),
      area,
      h('p', { class: 'md-embed-note' }, `Shared ${BLOCK_LABEL[ref.type].one.toLowerCase()}. Edits here are saved to the original and show everywhere it is used.`),
    );
  }

  function set(md: string, lookup?: (id: string) => { content: string } | null, keepEdits = false) {
    current = lookup ?? (() => null);
    if (!keepEdits) edits = new Map();
    const lines = md.replace(/\n$/, '').split('\n');
    const nodes: Node[] = [];
    chunks = [];
    let buf: string[] = [];
    let fence: string | null = null;
    const flush = () => {
      const c = textChunk(buf);
      chunks.push(c);
      nodes.push((c as { area: HTMLTextAreaElement }).area);
      buf = [];
    };
    for (const line of lines) {
      const f = FENCE_RE.exec(line);
      if (fence) {
        if (f && f[1] === fence) fence = null;
      } else if (f) fence = f[1];
      const m = fence ? null : EMBED_RE.exec(line);
      if (!m) {
        buf.push(line);
        continue;
      }
      flush();
      chunks.push({ kind: 'embed', line });
      nodes.push(embedBox(line, m[1].trim()));
    }
    flush();
    clear(el, nodes);
  }

  const value = () => `${chunks.map((c) => (c.kind === 'text' ? c.area.value : c.line)).join('\n')}\n`;

  /** Blocks don't nest: a cursor inside a `:::` block moves to just after its closing line. */
  function outsideBlock(text: string, at: number): number {
    let open = false;
    for (const line of text.slice(0, at).split('\n')) {
      if (OPEN_RE.test(line)) open = true;
      else if (CLOSE_RE.test(line)) open = false;
    }
    if (!open) return at;
    const close = /^:::[ \t]*$/m.exec(text.slice(at));
    return close ? at + close.index + close[0].length : text.length;
  }

  /** Put text on its own lines at the cursor; returns where the inserted text starts. */
  function insertText(text: string): { area: HTMLTextAreaElement; start: number } | null {
    const texts = chunks.flatMap((c) => (c.kind === 'text' ? [c.area] : []));
    const area = active && texts.includes(active.area) ? active.area : texts[texts.length - 1];
    if (!area) return null;
    const at = outsideBlock(area.value, active?.area === area ? active.caret : area.value.length);
    const before = area.value.slice(0, at);
    const after = area.value.slice(at);
    const lead = !before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
    area.value = before + lead + text + trail + after;
    area.classList.remove('md-chunk-blank');
    area.dispatchEvent(new Event('input'));
    return { area, start: (before + lead).length };
  }

  function insertBlock(type: BlockType, content: string) {
    const id = newBlockId((x) => blockIdTaken(x) || value().includes(`^${x}`));
    const markup = blockMarkup(type, id, '', content);
    const spot = insertText(markup);
    if (!spot) return;
    // Cursor on the content line, inside the block, never after the closing :::.
    const caret = spot.start + markup.indexOf('\n') + 1 + content.length;
    spot.area.focus();
    spot.area.setSelectionRange(caret, caret);
    active = { area: spot.area, caret };
  }

  function insertEmbed(id: string) {
    if (!insertText(embedCode(id, blockById(id)))) return;
    // Re-split so the new embed gets its own box; keep unsaved edits to shared blocks.
    set(value(), current, true);
  }

  return {
    el,
    set,
    insertBlock,
    insertEmbed,
    edits: () => edits,
    value,
  };
}
