// The one door to Drive. The token covers the whole Drive, so every call here
// checks that it stays inside the configured root folder.
import { googleDrive } from './google';
import { isFolder, type DriveBackend, type DriveChange, type DriveFile } from './types';

export * from './types';
export { DriveError } from './http';

export class OutsideRootError extends Error {
  constructor() {
    super('That file is outside the library folder.');
  }
}

let backend: DriveBackend = googleDrive;

export async function initDrive() {
  // Checked on the raw env flag so production builds drop the mock entirely.
  if (import.meta.env.VITE_DEMO === '1') backend = (await import('./mock')).createMockDrive();
}

/** Folders and files known to live under the root. Filled by the library as it indexes. */
export const guard = {
  rootId: '',
  folders: new Set<string>(),
  files: new Set<string>(),

  setRoot(id: string) {
    this.rootId = id;
    this.folders = new Set([id]);
    this.files = new Set();
  },
  addFolder(id: string) {
    this.folders.add(id);
  },
  addFile(id: string) {
    this.files.add(id);
  },
  forget(id: string) {
    this.folders.delete(id);
    this.files.delete(id);
  },
  inRoot(f: DriveFile): boolean {
    return f.id === this.rootId || (f.parents ?? []).some((p) => this.folders.has(p));
  },
};

function assertFolder(id: string) {
  if (!guard.rootId || !guard.folders.has(id)) throw new OutsideRootError();
}

async function assertFile(id: string) {
  if (guard.files.has(id)) return;
  const meta = await backend.getMeta(id);
  if (!guard.inRoot(meta)) throw new OutsideRootError();
  guard.addFile(id);
}

export const drive = {
  listChildren(folderId: string) {
    assertFolder(folderId);
    return backend.listChildren(folderId);
  },

  async getMeta(id: string) {
    const meta = await backend.getMeta(id);
    if (!guard.inRoot(meta)) throw new OutsideRootError();
    return meta;
  },

  async readText(id: string) {
    await assertFile(id);
    return backend.downloadText(id);
  },

  async readBlob(id: string) {
    await assertFile(id);
    return backend.downloadBlob(id);
  },

  async writeText(id: string, text: string, mimeType: string) {
    await assertFile(id);
    return backend.updateText(id, text, mimeType);
  },

  async createText(parentId: string, name: string, text: string, mimeType: string) {
    assertFolder(parentId);
    const f = await backend.createText(parentId, name, text, mimeType);
    guard.addFile(f.id);
    return f;
  },

  async trash(id: string) {
    await assertFile(id);
    await backend.trash(id);
    guard.forget(id);
  },

  async createBlob(parentId: string, name: string, blob: Blob) {
    assertFolder(parentId);
    const f = await backend.createBlob(parentId, name, blob);
    guard.addFile(f.id);
    return f;
  },

  async createFolder(parentId: string, name: string) {
    assertFolder(parentId);
    const f = await backend.createFolder(parentId, name);
    guard.addFolder(f.id);
    return f;
  },

  startPageToken: () => backend.startPageToken(),

  /**
   * Changes since the token, reduced to what concerns the root. A known file
   * that moved out of the root is reported as removed.
   */
  async changesSince(token: string) {
    const page = await backend.listChanges(token);
    const keep: DriveChange[] = [];
    const later: DriveChange[] = [];
    for (const ch of page.changes) {
      if (ch.removed || !ch.file || ch.file.trashed) {
        if (guard.files.has(ch.fileId) || guard.folders.has(ch.fileId)) keep.push({ fileId: ch.fileId, removed: true });
      } else later.push(ch);
    }
    // New folders can arrive before their own parent in the same page, so resolve until stable.
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = later.length - 1; i >= 0; i--) {
        const f = later[i].file!;
        if (guard.inRoot(f)) {
          if (isFolder(f)) guard.addFolder(f.id);
          else guard.addFile(f.id);
          keep.push(later[i]);
          later.splice(i, 1);
          progress = true;
        }
      }
    }
    for (const ch of later) {
      if (guard.files.has(ch.fileId) || guard.folders.has(ch.fileId)) keep.push({ fileId: ch.fileId, removed: true });
    }
    return { changes: keep, newStartPageToken: page.newStartPageToken };
  },

  /** Fallback when the change log is unavailable. Can't see deletions. */
  async modifiedSince(iso: string) {
    const files = await backend.listModifiedSince(iso);
    return files.filter((f) => guard.inRoot(f));
  },
};

/**
 * Read-only folder browsing for choosing the root, before one exists.
 * The only Drive access that is not limited to the root.
 */
export const picker = {
  listFolders: (parentId: string) => backend.listChildren(parentId, true),
  getFolder: async (id: string) => {
    const f = await backend.getMeta(id);
    if (!isFolder(f)) throw new Error('That link is not a folder.');
    return f;
  },
  createFolder: (parentId: string, name: string) => backend.createFolder(parentId, name),
};
