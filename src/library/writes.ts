// Everything the app writes to a library. Each write updates the index right away.
import { drive, type DriveFile } from '../drive';
import { blockMarkup, ensureIds, newBlockId, parseBody, replaceBlock, type BlockType } from '../md/blocks';
import { parseDoc, serializeDoc } from '../md/frontmatter';
import { blockById, blockIdTaken } from './derived';
import { BLOCKS_FOLDER, COLLECTION_FILE, MEDIA_FOLDER } from './layout';
import { applyLocalWrite, ensureTopFolder, getIndex, registerFolder } from './library';
import type { FileEntry } from './model';

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

export async function createBook(name: string): Promise<string> {
  const idx = getIndex()!;
  const clean = safeName(name).replace(/^_+/, '');
  if (Object.values(idx.folders).some((f) => f.parent === idx.rootId && f.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error('A book with that name already exists.');
  }
  const f = await drive.createFolder(idx.rootId, clean);
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
  const file = await drive.writeText(id, final, loaded.mimeType || 'text/markdown');
  return applyLocalWrite(file, final);
}

/** Standalone blocks go to the end of their type's file in `_blocks/`. */
export async function createBlock(type: BlockType, title: string, content: string): Promise<string> {
  const idx = getIndex()!;
  const folder = await ensureTopFolder(BLOCKS_FOLDER);
  const id = newBlockId(blockIdTaken);
  const markup = blockMarkup(type, id, title.trim(), content);
  const existing = Object.values(idx.files).find((f) => f.parent === folder && f.name.toLowerCase() === COLLECTION_FILE[type]);
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
