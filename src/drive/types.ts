export const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  modifiedTime: string;
  size?: string;
  trashed?: boolean;
  thumbnailLink?: string;
  webViewLink?: string;
  /** Custom key/value pairs stored on the file in Drive (used for book colors). */
  properties?: Record<string, string>;
  folderColorRgb?: string;
}

export interface DriveChange {
  fileId: string;
  removed: boolean;
  file?: DriveFile;
}

export interface ChangePage {
  changes: DriveChange[];
  newStartPageToken: string;
}

/** Raw Drive access, no root checks. Only `src/drive/index.ts` may use it. */
/** Folder metadata the app sets: its own properties, and Drive's folder color. */
export interface FolderExtra {
  properties?: Record<string, string>;
  folderColorRgb?: string;
}

export interface DriveBackend {
  listChildren(folderId: string, foldersOnly?: boolean): Promise<DriveFile[]>;
  getMeta(id: string): Promise<DriveFile>;
  downloadText(id: string): Promise<string>;
  downloadBlob(id: string): Promise<Blob>;
  updateText(id: string, text: string, mimeType: string): Promise<DriveFile>;
  createText(parentId: string, name: string, text: string, mimeType: string): Promise<DriveFile>;
  createFolder(parentId: string, name: string, extra?: FolderExtra): Promise<DriveFile>;
  updateFolder(id: string, extra: FolderExtra): Promise<DriveFile>;
  createBlob(parentId: string, name: string, blob: Blob): Promise<DriveFile>;
  /** Move to the Drive trash. Never deletes for good: the user can restore it in Drive. */
  trash(id: string): Promise<void>;
  startPageToken(): Promise<string>;
  listChanges(pageToken: string): Promise<ChangePage>;
  listModifiedSince(iso: string): Promise<DriveFile[]>;
}

export const isFolder = (f: { mimeType: string }) => f.mimeType === FOLDER_MIME;
