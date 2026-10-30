// Everything the app writes to a library. Each write updates the index right away.
import { drive, type DriveFile } from '../drive';
import { blockAsText, blockMarkup, ensureIds, firstUrl, newBlockId, parseBody, replaceBlock, replaceEmbeds, unwrapBlock, type BlockType } from '../md/blocks';
import { parseDoc, serializeDoc } from '../md/frontmatter';
import { findUrls, linkify, urlKey, type LinkifyContext } from '../md/linkify';
import { allBlocks, blockById, blockIdTaken, usedIn, type BlockRef } from './derived';
import { BLOCKS_FOLDER, COLLECTION_FILE, MEDIA_FOLDER } from './layout';
import { applyLocalRemove, applyLocalRemoveFolder, applyLocalWrite, COLOR_PROPERTY, ensureTopFolder, getIndex, registerFolder } from './library';
import type { BlockEntry, FileEntry } from './model';

export class ConflictError extends Error {
  constructor() {
    super('This changed in Drive since you opened it.');
  }
}

const safeName = (s: string) =>
  s.replace(/[\\/:*?"<>|#[\]^]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Untitled';

function uniqueName(base: string, ext: string, folderId: string): string {
  const taken = new Set(Object.values(getIndex()!.files).filter((f) => f.parent === folderId).map((f) => f.name.toLowerCase()));
  let name = `${base}${ext}`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} ${n}${ext}`;
  return name;
}

/** Give blocks without an ID one, everywhere in a document body. */
export function withBlockIds(text: string): string {
  const doc = parseDoc(text);
  const body = ensureIds(doc.body, blockIdTaken);
  if (body === doc.body) return text;
  doc.body = body;
  return serializeDoc(doc);
}

/** Book color on the folder: exact for VieDex, and Drive's own folder color (Drive snaps it to its palette). */
const colorExtra = (color: string) => ({ properties: { [COLOR_PROPERTY]: color }, folderColorRgb: color });

/** A usable book name: no characters Drive or the app trip over, no leading _ (reserved folders). */
function bookName(name: string, exceptId?: string): string {
  const idx = getIndex()!;
  const clean = safeName(name).replace(/^_+/, '').trim();
  if (!clean) throw new Error('Give the book a name.');
  if (Object.values(idx.folders).some((f) => f.id !== exceptId && f.parent === idx.rootId && f.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('A book with that name already exists.');
  }
  return clean;
}

/** Rename a book and/or change its color. Renaming renames its folder in Drive. */
export async function updateBook(id: string, name: string, color: string): Promise<void> {
  const current = getIndex()!.folders[id];
  const clean = bookName(name, id);
  registerFolder(await drive.updateFolder(id, { ...(clean !== current?.name ? { name: clean } : {}), ...colorExtra(color) }));
}

/** Files in a book, also in sub-folders made in Drive. */
export const bookFileCount = (id: string) => Object.values(getIndex()!.files).filter((f) => f.book === id).length;

/** Move an empty book's folder to the Drive trash. Books with files are refused. */
export async function deleteBook(id: string): Promise<void> {
  const idx = getIndex()!;
  const book = idx.folders[id];
  if (!book || book.parent !== idx.rootId) throw new Error('That is not a book in this library.');
  const n = bookFileCount(id);
  if (n) throw new Error(`This book still has ${n} ${n === 1 ? 'file' : 'files'}. Move or delete ${n === 1 ? 'it' : 'them'} first.`);
  await drive.trash(id);
  applyLocalRemoveFolder(id);
}

export async function createBook(name: string, color?: string): Promise<string> {
  const idx = getIndex()!;
  const clean = bookName(name);
  const f = await drive.createFolder(idx.rootId, clean, color ? colorExtra(color) : undefined);
  registerFolder(f);
  return f.id;
}

export async function createDocument(bookId: string | null, title: string, text: string): Promise<FileEntry> {
  const parent = bookId ?? getIndex()!.rootId;
  const file = await drive.createText(parent, uniqueName(safeName(title), '.md', parent), withBlockIds(text), 'text/markdown');
  return applyLocalWrite(file, withBlockIds(text));
}

/** Save a document; throws ConflictError if Drive has a newer version than `loadedModified`. */
export async function saveDocument(id: string, text: string, loaded: DriveFile, force = false): Promise<FileEntry> {
  if (!force) {
    const now = await drive.getMeta(id);
    if (now.modifiedTime !== loaded.modifiedTime) throw new ConflictError();
  }
  const final = withBlockIds(text);
  const before = getIndex()!.files[id]?.blocks ?? [];
  const file = await drive.writeText(id, final, loaded.mimeType || 'text/markdown');
  // A block taken out of this document but embedded elsewhere moves to its collection.
  const kept = new Set(parseBody(parseDoc(final).body).flatMap((s) => (s.kind === 'block' && s.block.id ? [s.block.id] : [])));
  const orphaned = before.filter((b) => b.id && !kept.has(b.id) && usedIn(b.id).some((f) => f !== id));
  const entry = applyLocalWrite(file, final);
  if (orphaned.length) await appendToCollections(orphaned);
  return entry;
}

/** Append blocks to the end of their type's file in `_blocks/`, keeping their IDs. */
async function appendToCollections(blocks: BlockEntry[]) {
  const folder = await ensureTopFolder(BLOCKS_FOLDER);
  const byType = new Map<BlockType, BlockEntry[]>();
  for (const b of blocks) byType.set(b.type, [...(byType.get(b.type) ?? []), b]);
  for (const [type, list] of byType) {
    const markup = list.map((b) => blockMarkup(type, b.id ?? newBlockId(blockIdTaken), b.title, b.content)).join('\n\n');
    const existing = Object.values(getIndex()!.files).find((f) => f.parent === folder && f.name.toLowerCase() === COLLECTION_FILE[type]);
    let file: DriveFile;
    let text: string;
    if (existing) {
      const current = await drive.readText(existing.id);
      text = `${current.replace(/\s+$/, '')}\n\n${markup}\n`;
      file = await drive.writeText(existing.id, text, existing.mimeType || 'text/markdown');
    } else {
      text = `${markup}\n`;
      file = await drive.createText(folder, COLLECTION_FILE[type], text, 'text/markdown');
    }
    applyLocalWrite(file, text);
  }
}

/** Standalone blocks go to the end of their type's file in `_blocks/`. */
export async function createBlock(type: BlockType, title: string, content: string): Promise<string> {
  const id = newBlockId(blockIdTaken);
  await appendToCollections([{ id, type, title: title.trim(), content }]);
  return id;
}

/**
 * Edit a block in the one file it lives in. `expected` is the content the user started from;
 * if the file in Drive no longer has that, the edit would overwrite someone else's change.
 */
export async function updateBlock(id: string, title: string, content: string, expected: string, force = false): Promise<void> {
  const ref = blockById(id);
  if (!ref || ref.synthetic) throw new Error('This block has no ID yet. Open its document and save it once.');
  const home = getIndex()!.files[ref.fileId];
  const text = await drive.readText(home.id);
  const doc = parseDoc(text);
  const current = parseBody(doc.body).find((s) => s.kind === 'block' && s.block.id === id);
  if (!current || current.kind !== 'block') throw new Error('The block is no longer in its file. Refresh and try again.');
  // Already saved (a retry after a later step failed): nothing to do.
  if (current.block.content === content && current.block.title === title.trim()) return;
  if (!force && current.block.content !== expected) throw new ConflictError();
  const body = replaceBlock(doc.body, id, title.trim(), content);
  if (body == null) throw new Error('Could not find the block to update.');
  doc.body = body;
  const out = serializeDoc(doc);
  const file = await drive.writeText(home.id, out, home.mimeType || 'text/markdown');
  applyLocalWrite(file, out);
}

export async function uploadMedia(blob: File): Promise<FileEntry> {
  const folder = await ensureTopFolder(MEDIA_FOLDER);
  const dot = blob.name.lastIndexOf('.');
  const base = safeName(dot > 0 ? blob.name.slice(0, dot) : blob.name);
  const ext = dot > 0 ? blob.name.slice(dot).toLowerCase() : '';
  const file = await drive.createBlob(folder, uniqueName(base, ext, folder), blob);
  return applyLocalWrite(file, null);
}

/**
 * Move a document to the Drive trash. Blocks written in it move to their collections
 * first, with the same IDs, so embeds elsewhere keep working.
 */
export async function deleteDocument(id: string): Promise<void> {
  const doc = parseDoc(await drive.readText(id));
  const blocks: BlockEntry[] = parseBody(doc.body).flatMap((s) =>
    s.kind === 'block' ? [{ id: s.block.id, type: s.block.type, title: s.block.title, content: s.block.content }] : [],
  );
  if (blocks.length) await appendToCollections(blocks);
  await drive.trash(id);
  applyLocalRemove(id);
}

/** Rewrite one file's body, keeping its frontmatter. */
async function editBody(fileId: string, change: (body: string) => string | null) {
  const f = getIndex()!.files[fileId];
  if (!f) return;
  const doc = parseDoc(await drive.readText(fileId));
  const body = change(doc.body);
  if (body == null || body === doc.body) return;
  doc.body = body;
  const text = serializeDoc(doc);
  applyLocalWrite(await drive.writeText(fileId, text, f.mimeType || 'text/markdown'), text);
}

/**
 * Delete a block. Where it was embedded, and in the document it was written in,
 * its text stays behind as normal text. In a collection file it is simply removed.
 */
export async function deleteBlock(id: string): Promise<void> {
  const ref = blockById(id);
  if (!ref || ref.synthetic) throw new Error('This block has no ID, so it can only be removed by editing its document.');
  const text = blockAsText(ref);
  for (const fileId of usedIn(id)) {
    if (fileId !== ref.fileId) await editBody(fileId, (body) => replaceEmbeds(body, id, text));
  }
  const home = getIndex()!.files[ref.fileId];
  await editBody(ref.fileId, (body) => {
    const out = unwrapBlock(body, id, home?.kind === 'collection' ? '' : text);
    // The home may also embed itself somewhere lower down.
    return out == null ? null : replaceEmbeds(out, id, text);
  });
}

// --- Links in text ------------------------------------------------------------

const linkUrl = (content: string) => firstUrl(content) ?? findUrls(content)[0] ?? null;

/** Lookups for turning links into link blocks, built from the current index. */
export function linkContext(): LinkifyContext {
  const byKey = new Map<string, BlockRef>();
  for (const b of allBlocks()) {
    if (b.type !== 'link' || b.synthetic) continue;
    const url = linkUrl(b.content);
    if (url && !byKey.has(urlKey(url))) byKey.set(urlKey(url), b);
  }
  return {
    existing: (key) => {
      const b = byKey.get(key);
      return b ? { id: b.id, block: b } : null;
    },
    keyOfBlock: (id) => {
      const b = blockById(id);
      const url = b?.type === 'link' ? linkUrl(b.content) : null;
      return url ? urlKey(url) : null;
    },
    taken: blockIdTaken,
  };
}

/** A document's full text with link blocks added after paragraphs that have links. */
export function linkifyText(text: string): { text: string; count: number } {
  const doc = parseDoc(text);
  const r = linkify(doc.body, linkContext());
  const count = r.created.length + r.embedded.length;
  if (!count) return { text, count };
  doc.body = r.body;
  return { text: serializeDoc(doc), count };
}

const pendingCache = new WeakMap<FileEntry, string[]>();

/** Links in a document's text that have no link block there yet. Read from the index, no download. */
export function pendingLinks(f: FileEntry): string[] {
  if (f.kind !== 'document') return [];
  let hit = pendingCache.get(f);
  if (!hit) {
    const r = linkify(f.text, linkContext());
    hit = [...r.created, ...r.embedded];
    pendingCache.set(f, hit);
  }
  return hit;
}

/** Convert the links in one document now. Returns how many got a block. */
export async function convertLinks(fileId: string): Promise<number> {
  const f = getIndex()!.files[fileId];
  if (!f || f.kind !== 'document') return 0;
  const { text, count } = linkifyText(await drive.readText(fileId));
  if (!count) return 0;
  const final = withBlockIds(text);
  applyLocalWrite(await drive.writeText(fileId, final, f.mimeType || 'text/markdown'), final);
  return count;
}
