// Holds the in-memory index and keeps it in step with Drive.
import { drive, guard, isFolder, type DriveFile } from '../drive';
import { AuthError } from '../drive/auth';
import { buildFile, indexFile, type IndexContext } from './indexer';
import { derive } from './derived';
import { SYSTEM_FOLDER } from './layout';
import type { FileEntry, Folder, KbIndex, KbState } from './model';

const INDEX_FILE = 'index.json';
const STATE_FILE = 'state.json';
const CONCURRENCY = 4;

export type Phase = 'idle' | 'syncing' | 'error';
export const status = { phase: 'idle' as Phase, message: '' };

let index: KbIndex | null = null;
let state: KbState | null = null;
let sys = { folderId: '', indexId: null as string | null, stateId: null as string | null };
let running: Promise<void> | null = null;
// Bumped when the open library changes, so a sync still running for the old one drops its results.
let generation = 0;

// 'status' is sync progress only; 'index' means the items themselves changed.
export type ChangeKind = 'index' | 'status';
const listeners = new Set<(kind: ChangeKind) => void>();
export function onLibraryChange(fn: (kind: ChangeKind) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (kind: ChangeKind = 'index') => listeners.forEach((fn) => fn(kind));

function setStatus(phase: Phase, message = '') {
  status.phase = phase;
  status.message = message;
  emit('status');
}

export const getIndex = () => index;
export const lastSync = () => state?.lastSync ?? null;
export const systemFolderId = () => sys.folderId;

async function mapLimit<T>(list: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, list.length) }, async () => {
      while (i < list.length) await fn(list[i++]);
    }),
  );
}

const ctx = (): IndexContext => ({ rootId: index!.rootId, folders: index!.folders });

async function readJson<T>(id: string | null): Promise<T | null> {
  if (!id) return null;
  try {
    return JSON.parse(await drive.readText(id)) as T;
  } catch {
    return null;
  }
}

async function writeJson(name: string, data: unknown) {
  const text = JSON.stringify(data);
  const key = name === INDEX_FILE ? 'indexId' : 'stateId';
  if (sys[key]) await drive.writeText(sys[key]!, text, 'application/json');
  else sys[key] = (await drive.createText(sys.folderId, name, text, 'application/json')).id;
}

async function persist(withIndex: boolean) {
  if (withIndex && index) await writeJson(INDEX_FILE, index);
  if (state) await writeJson(STATE_FILE, state);
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persist(true).catch(() => setStatus('error', 'Could not save the index.')), 1500);
}

function registerGuard() {
  if (!index) return;
  guard.setRoot(index.rootId);
  guard.addFolder(sys.folderId);
  Object.keys(index.folders).forEach((id) => guard.addFolder(id));
  Object.keys(index.files).forEach((id) => guard.addFile(id));
  if (sys.indexId) guard.addFile(sys.indexId);
  if (sys.stateId) guard.addFile(sys.stateId);
}

async function ensureSystem(rootId: string) {
  const children = await drive.listChildren(rootId);
  const folder = children.find((c) => c.name === SYSTEM_FOLDER && isFolder(c)) ?? (await drive.createFolder(rootId, SYSTEM_FOLDER));
  guard.addFolder(folder.id);
  const files = await drive.listChildren(folder.id);
  const idOf = (name: string) => files.find((f) => f.name === name)?.id ?? null;
  sys = { folderId: folder.id, indexId: idOf(INDEX_FILE), stateId: idOf(STATE_FILE) };
  [sys.indexId, sys.stateId].forEach((id) => id && guard.addFile(id));
}

function exclusive(fn: () => Promise<void>): Promise<void> {
  running ??= fn()
    .catch((err) => {
      if (err instanceof AuthError) setStatus('idle');
      else setStatus('error', err instanceof Error ? err.message : 'Sync failed.');
      throw err;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

export async function openLibrary(rootId: string): Promise<void> {
  const mine = ++generation;
  await running?.catch(() => {});
  if (mine !== generation) return;
  return exclusive(async () => {
    index = null;
    state = null;
    guard.setRoot(rootId);
    setStatus('syncing', 'Opening library');
    await ensureSystem(rootId);
    const [savedIndex, savedState] = await Promise.all([readJson<KbIndex>(sys.indexId), readJson<KbState>(sys.stateId)]);
    state = savedState?.version === 5 && savedState.rootId === rootId ? savedState : { version: 5, rootId, pageToken: null, lastSync: null };
    if (savedIndex?.version === 5 && savedIndex.rootId === rootId) {
      index = savedIndex;
      derive(index);
      registerGuard();
      emit();
      await syncChanges();
    } else {
      await rebuildIndex(rootId);
    }
    setStatus('idle');
  });
}

export const refresh = () => exclusive(async () => {
  await syncChanges();
  setStatus('idle');
});

export const rebuild = () => exclusive(async () => {
  await rebuildIndex(index?.rootId ?? guard.rootId);
  setStatus('idle');
});

export const COLOR_PROPERTY = 'viedexColor';

function folderEntry(f: DriveFile, parent: string): Folder {
  const color = f.properties?.[COLOR_PROPERTY];
  return { id: f.id, name: f.name, parent, ...(color && /^#[0-9a-f]{6}$/i.test(color) ? { color } : {}) };
}

/** Walk a folder tree, recording folders and collecting files. */
async function walk(startId: string, folders: Record<string, Folder>): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let level = [startId];
  while (level.length) {
    const next: string[] = [];
    await mapLimit(level, CONCURRENCY, async (folderId) => {
      for (const c of await drive.listChildren(folderId)) {
        if (isFolder(c)) {
          if (c.id === sys.folderId) continue;
          folders[c.id] = folderEntry(c, folderId);
          guard.addFolder(c.id);
          next.push(c.id);
        } else {
          guard.addFile(c.id);
          files.push({ ...c, parents: [folderId] });
        }
      }
    });
    level = next;
  }
  return files;
}

async function rebuildIndex(rootId: string) {
  const mine = generation;
  setStatus('syncing', 'Reading folders');
  // Take the token first so edits made during the rebuild are picked up next sync.
  const token = await drive.startPageToken();
  const prev = index;
  const folders: Record<string, Folder> = {};
  const files = await walk(rootId, folders);
  const next: KbIndex = { version: 5, rootId, builtAt: new Date().toISOString(), folders, files: {} };
  const c: IndexContext = { rootId, folders };

  let done = 0;
  await mapLimit(files, CONCURRENCY, async (f) => {
    const old = prev?.files[f.id];
    // A file moved between books keeps its modifiedTime but changes kind or book, so compare parents too.
    const unchanged = old && old.modifiedTime === f.modifiedTime && old.parent === f.parents![0] && old.name === f.name;
    next.files[f.id] = unchanged ? old : await indexFile(f, c, old);
    if (++done % 10 === 0) setStatus('syncing', `Indexing ${done} of ${files.length}`);
  });

  if (mine !== generation) return;
  derive(next);
  index = next;
  state = { version: 5, rootId, pageToken: token, lastSync: new Date().toISOString() };
  registerGuard();
  await persist(true);
  emit();
}

function removeFolderTree(id: string) {
  const idx = index!;
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of Object.values(idx.folders)) {
      if (!doomed.has(f.id) && doomed.has(f.parent)) {
        doomed.add(f.id);
        grew = true;
      }
    }
  }
  for (const fid of doomed) {
    delete idx.folders[fid];
    guard.forget(fid);
  }
  for (const it of Object.values(idx.files)) {
    if (doomed.has(it.parent)) {
      delete idx.files[it.id];
      guard.forget(it.id);
    }
  }
}

async function syncChanges() {
  if (!index || !state) return;
  const mine = generation;
  setStatus('syncing', 'Checking for changes');
  const idx = index;
  let changed: DriveFile[] = [];
  const removed: string[] = [];
  let token: string;

  try {
    if (!state.pageToken) throw new Error('No change token yet.');
    const page = await drive.changesSince(state.pageToken);
    token = page.newStartPageToken;
    for (const ch of page.changes) {
      if (ch.removed || !ch.file || ch.file.trashed) removed.push(ch.fileId);
      else changed.push(ch.file);
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (!state.lastSync) return rebuildIndex(idx.rootId);
    token = await drive.startPageToken();
    changed = await drive.modifiedSince(state.lastSync);
  }

  let dirty = false;
  for (const id of removed) {
    if (idx.folders[id]) removeFolderTree(id);
    if (idx.files[id]) delete idx.files[id];
    guard.forget(id);
    dirty = true;
  }

  // Folders first, so files inside new folders get the right collection.
  const newFolders: string[] = [];
  for (const f of changed.filter(isFolder)) {
    if (f.id === sys.folderId || f.id === idx.rootId) continue;
    if (!idx.folders[f.id]) newFolders.push(f.id);
    idx.folders[f.id] = folderEntry(f, f.parents?.[0] ?? idx.rootId);
    dirty = true;
  }

  const files = changed.filter((f) => !isFolder(f) && f.parents?.[0] !== sys.folderId);
  // A folder moved in from elsewhere brings files that have no change entries of their own.
  for (const id of newFolders) files.push(...(await walk(id, idx.folders)));

  let done = 0;
  await mapLimit(files, CONCURRENCY, async (f) => {
    const old = idx.files[f.id];
    if (old && old.modifiedTime === f.modifiedTime && old.parent === f.parents?.[0] && old.name === f.name) return;
    idx.files[f.id] = await indexFile(f, ctx(), old);
    dirty = true;
    if (++done % 10 === 0) setStatus('syncing', `Indexing ${done} of ${files.length}`);
  });

  if (mine !== generation) return;
  if (dirty) {
    derive(idx);
    idx.builtAt = new Date().toISOString();
  }
  const tokenMoved = token !== state.pageToken;
  state = { ...state, pageToken: token, lastSync: new Date().toISOString() };
  if (dirty || tokenMoved) await persist(dirty);
  emit();
}

/** Update the index right after the app itself wrote a file, without waiting for a sync. */
export function applyLocalWrite(file: DriveFile, text: string | null): FileEntry {
  const idx = index!;
  guard.addFile(file.id);
  const parents = file.parents ?? [idx.files[file.id]?.parent ?? idx.rootId];
  const entry = buildFile({ ...file, parents }, text, ctx(), idx.files[file.id]);
  idx.files[file.id] = entry;
  derive(idx);
  emit();
  persistSoon();
  return entry;
}

/** Drop a file the app itself just trashed. */
export function applyLocalRemove(id: string) {
  const idx = index!;
  delete idx.files[id];
  guard.forget(id);
  derive(idx);
  emit();
  persistSoon();
}

/** Drop a folder (and anything under it) the app itself just trashed. */
export function applyLocalRemoveFolder(id: string) {
  const idx = index!;
  removeFolderTree(id);
  derive(idx);
  emit();
  persistSoon();
}

export function registerFolder(f: DriveFile) {
  index!.folders[f.id] = folderEntry(f, f.parents?.[0] ?? index!.rootId);
  emit();
  persistSoon();
}

/** A folder directly under the root, created when missing. */
export async function ensureTopFolder(name: string): Promise<string> {
  const idx = index!;
  const found = Object.values(idx.folders).find((f) => f.parent === idx.rootId && f.name === name);
  if (found) return found.id;
  const f = await drive.createFolder(idx.rootId, name);
  registerFolder(f);
  return f.id;
}

export function closeLibrary() {
  generation++;
  index = null;
  state = null;
  emit();
}
