import { displayTitle, firstUrl, hrefOf, linkNote, parseBody, type BlockType, type Segment } from '../md/blocks';
import { findUrls, urlKey } from '../md/linkify';
import { plainText } from '../library/search';
import { renderMarkdown } from '../md/render';
import { blockById, lookupLink, mediaByName, usedIn } from '../library/derived';
import { BLOCK_LABEL } from '../library/layout';
import { getIndex } from '../library/library';
import type { FileEntry } from '../library/model';
import { confirmDeleteBlock } from './actions';
import { placeLink } from './components';
import { h, icon } from './dom';
import { toast } from './feedback';
import { fileCard } from './file-card';
import { mediaImage } from './media';
import { go } from './router';
import { ui } from './ui-state';

interface RenderContext {
  /** The file being shown, for resolving renamed links. */
  file: FileEntry | null;
  /** Embedded blocks render their own embeds as plain links, so nothing can loop. */
  depth: number;
}

interface CardBlock {
  id: string | null;
  type: BlockType;
  title: string;
  content: string;
}

export interface CardOptions {
  /** Show where it lives and where it is used, for collection views. */
  usage?: { homeId: string };
  compact?: boolean;
}

function markdown(text: string, ctx: RenderContext) {
  return renderMarkdown(text, {
    resolve: (t) => lookupLink(ctx.file, t),
    onMissing: (t) => {
      ui.pendingTitle = t;
      go(`/new-doc/${ctx.file?.book ?? ''}`);
    },
  });
}

function mediaFigure(name: string) {
  const id = mediaByName(name);
  if (!id) return h('div', { class: 'missing' }, `File not found in _media: ${name}`);
  // Images show as images; any other attachment as a file card.
  if (!getIndex()?.files[id]?.mimeType.startsWith('image/')) return fileCard(id);
  return h('figure', { class: 'media' }, h('a', { href: `#/file/${id}` }, mediaImage(id, name)));
}

function embedFigure(target: string, ctx: RenderContext): Node {
  if (!target.startsWith('^')) return mediaFigure(target);
  const id = target.slice(1);
  const ref = blockById(id);
  if (!ref) return h('div', { class: 'missing' }, `No block with ID ^${id}`);
  if (ctx.depth > 0) return h('p', null, h('a', { href: `#/block/${encodeURIComponent(id)}` }, `^${id} ${displayTitle(ref)}`));
  // In a document an embedded block reads like any other; where it lives is on its own page.
  return blockCard(ref, {}, ctx);
}

export function renderSegments(segments: Segment[], ctx: RenderContext): HTMLElement {
  const root = h('div', { class: 'doc-body' });
  // Links in the text just above. A link block repeating one of them is an "echo":
  // with blocks hidden, its URL is not shown a second time.
  let above = new Set<string>();
  const markEcho = (el: Node, type: BlockType | undefined, content: string) => {
    const url = type === 'link' ? firstUrl(content) : null;
    if (el instanceof HTMLElement && url && above.has(urlKey(url))) el.classList.add('is-echo');
  };
  for (const seg of segments) {
    if (seg.kind === 'text') {
      root.append(markdown(seg.text, ctx));
      above = new Set(seg.text.split('\n').flatMap(findUrls).map(urlKey));
    } else if (seg.kind === 'embed') {
      const el = embedFigure(seg.target, ctx);
      const ref = seg.target.startsWith('^') ? blockById(seg.target.slice(1)) : null;
      markEcho(el, ref?.type, ref?.content ?? '');
      root.append(el);
    } else {
      const el = blockCard(seg.block, {}, ctx);
      markEcho(el, seg.block.type, seg.block.content);
      root.append(el);
    }
  }
  return root;
}

export function renderDocument(body: string, file: FileEntry | null): HTMLElement {
  return renderSegments(parseBody(body), { file, depth: 0 });
}

function deleteButton(id: string) {
  const b = h('button', { class: 'icon-btn block-copy', title: 'Delete block', 'aria-label': 'Delete block' }, icon('trash'));
  b.addEventListener('click', (e) => {
    e.preventDefault();
    confirmDeleteBlock(id);
  });
  return b;
}

/** What copying a block gives you: the code without fences, a link's URL, or the text. */
function copyText(b: CardBlock): string {
  if (b.type === 'code') {
    const m = /^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(b.content);
    return m ? m[1] : b.content;
  }
  if (b.type === 'link') return firstUrl(b.content) ?? b.content;
  return b.content;
}

function copyButton(b0: CardBlock) {
  const b = h('button', { class: 'icon-btn block-copy', title: b0.type === 'code' ? 'Copy code' : b0.type === 'link' ? 'Copy link' : 'Copy text', 'aria-label': 'Copy content' }, icon('copy'));
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    await navigator.clipboard.writeText(copyText(b0));
    toast(b0.type === 'code' ? 'Code copied' : b0.type === 'link' ? 'Link copied' : 'Copied');
  });
  return b;
}

export function blockCard(b: CardBlock, opts: CardOptions = {}, ctx: RenderContext = { file: null, depth: 0 }): HTMLElement {
  const href = b.id ? `#/block/${encodeURIComponent(b.id)}` : null;
  const url = b.type === 'link' ? firstUrl(b.content) : null;
  // A link without its own title is named after its website: short, and something to click.
  const site = url && !b.title.trim() ? displayTitle(b) : null;
  const title = displayTitle(b);
  const showTitle = !!b.title.trim() || !!site || !!opts.compact;


  const head = h(
    'header',
    { class: 'block-head' },
    // Without a title to click, the type label opens the block.
    href && !showTitle ? h('a', { class: 'block-type', href, title: 'Open block' }, BLOCK_LABEL[b.type].one) : h('span', { class: 'block-type' }, BLOCK_LABEL[b.type].one),
    showTitle
      ? href
        ? h('a', { class: `block-title${site ? ' is-site' : ''}`, href }, title)
        : h('span', { class: `block-title${site ? ' is-site' : ''}` }, title)
      : h('span', { class: 'block-title' }),
    // Code has its own copy button on the code box itself.
    b.type !== 'image' && b.type !== 'code' && b.type !== 'file' && b.content.trim() && copyButton(b),
    opts.usage && b.id && !b.id.startsWith('~') && deleteButton(b.id),
  );

  // A link card shows its URL once, as the link line; the body is only the note.
  const text = url ? linkNote(b.content, url) : b.content;
  const body = !text.trim()
    ? null
    : opts.compact && b.type !== 'image' && b.type !== 'code' && b.type !== 'file'
      ? h('div', { class: 'block-body' }, h('p', { class: 'block-clip' }, plainText(text).slice(0, 220)))
      : h('div', { class: 'block-body' }, renderSegments(parseBody(text), { file: ctx.file, depth: ctx.depth + 1 }));

  return h(
    'section',
    { class: `block block-${b.type}${url && !body && !b.title.trim() ? ' is-bare-link' : ''}` },
    head,
    url && h('a', { class: 'block-url', href: hrefOf(url), target: '_blank', rel: 'noopener noreferrer', title: url }, icon('external'), h('span', { class: 'block-url-text' }, url)),
    body,
    opts.usage && usageFooter(b.id, opts.usage.homeId),
  );
}

export function usageFooter(id: string | null, homeId: string) {
  const uses = id ? usedIn(id).filter((f) => f !== homeId) : [];
  return h(
    'footer',
    { class: 'block-foot' },
    h('div', null, h('span', { class: 'foot-label' }, 'Lives in'), placeLink(homeId)),
    h(
      'div',
      null,
      h('span', { class: 'foot-label' }, 'Used in'),
      uses.length ? uses.map((f, i) => [i > 0 && h('span', { class: 'sep' }, ', '), placeLink(f)]) : h('span', { class: 'muted' }, 'not embedded anywhere yet'),
    ),
  );
}
