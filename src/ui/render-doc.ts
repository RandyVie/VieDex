import { displayTitle, embedCode, firstUrl, parseBody, type BlockType, type Segment } from '../md/blocks';
import { renderMarkdown } from '../md/render';
import { blockById, lookupLink, mediaByName, usedIn } from '../library/derived';
import { BLOCK_LABEL } from '../library/layout';
import type { FileEntry } from '../library/model';
import { placeLink } from './components';
import { h, icon } from './dom';
import { toast } from './feedback';
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
  /** Show where the block comes from, for embeds. */
  fromFileId?: string;
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
  if (!id) return h('div', { class: 'missing' }, `Image not found in _media: ${name}`);
  return h('figure', { class: 'media' }, h('a', { href: `#/file/${id}` }, mediaImage(id, name)));
}

function embedFigure(target: string, ctx: RenderContext): Node {
  if (!target.startsWith('^')) return mediaFigure(target);
  const id = target.slice(1);
  const ref = blockById(id);
  if (!ref) return h('div', { class: 'missing' }, `No block with ID ^${id}`);
  if (ctx.depth > 0) return h('p', null, h('a', { href: `#/block/${encodeURIComponent(id)}` }, `^${id} ${displayTitle(ref)}`));
  return blockCard(ref, { fromFileId: ref.fileId }, ctx);
}

export function renderSegments(segments: Segment[], ctx: RenderContext): HTMLElement {
  const root = h('div', { class: 'doc-body' });
  for (const seg of segments) {
    if (seg.kind === 'text') root.append(markdown(seg.text, ctx));
    else if (seg.kind === 'embed') root.append(embedFigure(seg.target, ctx));
    else root.append(blockCard(seg.block, {}, ctx));
  }
  return root;
}

export function renderDocument(body: string, file: FileEntry | null): HTMLElement {
  return renderSegments(parseBody(body), { file, depth: 0 });
}

function copyEmbed(id: string, b0: CardBlock) {
  const b = h('button', { class: 'icon-btn block-copy', title: 'Copy embed code, to paste into a file in Drive', 'aria-label': 'Copy embed code' }, icon('copy'));
  b.addEventListener('click', async (e) => {
    e.preventDefault();
    await navigator.clipboard.writeText(embedCode(id, b0));
    toast('Embed code copied');
  });
  return b;
}

export function blockCard(b: CardBlock, opts: CardOptions = {}, ctx: RenderContext = { file: null, depth: 0 }): HTMLElement {
  const href = b.id ? `#/block/${encodeURIComponent(b.id)}` : null;
  const uses = b.id ? usedIn(b.id) : [];
  const title = displayTitle(b);
  const url = b.type === 'link' ? firstUrl(b.content) : null;

  const head = h(
    'header',
    { class: 'block-head' },
    // Without its own title the first line would show twice, so the label links instead.
    href && !b.title.trim() ? h('a', { class: 'block-type', href, title: 'Open block' }, BLOCK_LABEL[b.type].one) : h('span', { class: 'block-type' }, BLOCK_LABEL[b.type].one),
    b.title.trim() || opts.compact
      ? href
        ? h('a', { class: 'block-title', href }, title)
        : h('span', { class: 'block-title' }, title)
      : h('span', { class: 'block-title' }),
    opts.fromFileId && h('span', { class: 'block-from' }, 'from ', placeLink(opts.fromFileId)),
    !opts.fromFileId && !opts.usage && uses.length > 0 && h('a', { class: 'block-uses', href: href!, title: 'Documents that embed this block' }, `used in ${uses.length}`),
    b.id && !b.id.startsWith('~') && copyEmbed(b.id, b),
  );

  const body = opts.compact && b.type !== 'image' && b.type !== 'code'
    ? h('div', { class: 'block-body' }, h('p', { class: 'block-clip' }, b.content.replace(/\s+/g, ' ').slice(0, 220)))
    : h('div', { class: 'block-body' }, renderSegments(parseBody(b.content), { file: ctx.file, depth: ctx.depth + 1 }));

  return h(
    'section',
    { class: `block block-${b.type}${opts.fromFileId ? ' is-embedded' : ''}` },
    head,
    url && b.type === 'link' && h('a', { class: 'block-url', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), url.replace(/^https?:\/\//, '')),
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
