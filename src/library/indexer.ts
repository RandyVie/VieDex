import { drive, type DriveFile } from '../drive';
import { mediaRefs, parseBody } from '../md/blocks';
import { metaList, metaString, parseDoc } from '../md/frontmatter';
import { extractLinks } from '../md/render';
import { extOf, isHtml, isTextLike, stripExt } from './classify';
import { BLOCK_LABEL, BLOCKS_FOLDER, COLLECTION_FILE, MEDIA_FOLDER, isReserved } from './layout';
import type { FileEntry, FileKind, Folder } from './model';

const MAX_DOWNLOAD = 2_000_000;
const MAX_TEXT = 100_000;
const MAX_BLOCK = 20_000;
const DOC_EXT = new Set(['md', 'markdown', 'txt', 'text']);

export interface IndexContext {
  rootId: string;
  folders: Record<string, Folder>;
}

/** The folder directly under the root that contains this folder. */
export function topFolder(folderId: string, ctx: IndexContext): Folder | null {
  let f = ctx.folders[folderId];
  while (f && f.parent !== ctx.rootId) f = ctx.folders[f.parent];
  return f ?? null;
}

function kindOf(f: Pick<DriveFile, 'name' | 'mimeType'>, top: Folder | null): FileKind {
  const isDoc = DOC_EXT.has(extOf(f.name)) || f.mimeType === 'text/markdown';
  if (top?.name === BLOCKS_FOLDER) return isDoc ? 'collection' : 'other';
  if (top?.name === MEDIA_FOLDER) return f.mimeType.startsWith('image/') ? 'media' : 'other';
  if (top && isReserved(top.name)) return 'other';
  return isDoc ? 'document' : 'other';
}

function collectionTitle(name: string): string {
  const entry = Object.entries(COLLECTION_FILE).find(([, file]) => file === name.toLowerCase());
  if (entry) return `${BLOCK_LABEL[entry[0] as keyof typeof BLOCK_LABEL].many} collection`;
  // Older collection files (ideas.md, references.md) hold notes now but keep their name.
  const base = stripExt(name);
  return `${base.charAt(0).toUpperCase()}${base.slice(1)} collection`;
}

export function buildFile(f: DriveFile, text: string | null, ctx: IndexContext, prev?: FileEntry): FileEntry {
  const parent = f.parents?.[0] ?? ctx.rootId;
  const top = topFolder(parent, ctx);
  const kind = kindOf(f, top);
  const entry: FileEntry = {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    parent,
    modifiedTime: f.modifiedTime,
    size: f.size ? Number(f.size) : undefined,
    kind,
    book: top && !isReserved(top.name) ? top.id : null,
    title: kind === 'collection' ? collectionTitle(f.name) : stripExt(f.name),
    tags: [],
    text: '',
    links: [],
    linkIds: [],
    embeds: [],
    media: [],
    blocks: [],
  };
  if (text == null) return entry;

  if (kind === 'document' || kind === 'collection') {
    const doc = parseDoc(text);
    const title = metaString(doc.meta.title).trim();
    if (title && kind === 'document') entry.title = title;
    entry.tags = metaList(doc.meta.tags);
    entry.created = metaString(doc.meta.created) || undefined;
    entry.text = doc.body.slice(0, MAX_TEXT);
    entry.links = extractLinks(doc.body);
    // Keep earlier resolutions by link text so renamed targets still resolve.
    entry.linkIds = entry.links.map((l) => {
      const i = prev?.links.indexOf(l) ?? -1;
      return i >= 0 ? (prev!.linkIds[i] ?? null) : null;
    });
    for (const seg of parseBody(doc.body)) {
      if (seg.kind === 'embed') {
        if (seg.target.startsWith('^')) entry.embeds.push(seg.target.slice(1));
        else entry.media.push(seg.target);
      } else if (seg.kind === 'block') {
        const b = seg.block;
        entry.blocks.push({ id: b.id, type: b.type, title: b.title, content: b.content.slice(0, MAX_BLOCK) });
        entry.media.push(...mediaRefs(b.content));
      }
    }
  } else if (isHtml(f)) {
    // Index what a reader sees, not the markup. DOMParser output is inert.
    const page = new DOMParser().parseFromString(text, 'text/html');
    page.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
    // textContent ignores layout, so pad blocks to keep words from running together.
    page.body?.querySelectorAll('p, li, div, br, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach((el) => el.append(' '));
    entry.text = (page.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  } else {
    entry.text = text.slice(0, MAX_TEXT);
  }
  return entry;
}

export async function indexFile(f: DriveFile, ctx: IndexContext, prev?: FileEntry): Promise<FileEntry> {
  const wantText = isTextLike(f) && Number(f.size ?? 0) <= MAX_DOWNLOAD;
  const text = wantText ? await drive.readText(f.id) : null;
  return buildFile(f, text, ctx, prev);
}
