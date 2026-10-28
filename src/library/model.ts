import type { BlockType } from '../md/blocks';

/** What a file is to the app, decided by where it lives in the library. */
export type FileKind = 'document' | 'collection' | 'media' | 'other';

export interface BlockEntry {
  /** null when the file in Drive has a block without an ID yet. */
  id: string | null;
  type: BlockType;
  /** Explicit title from the opening line, often empty. Use displayTitle() to show one. */
  title: string;
  content: string;
}

export interface FileEntry {
  id: string;
  name: string;
  mimeType: string;
  parent: string;
  modifiedTime: string;
  size?: number;
  kind: FileKind;
  /** Top-level folder this file belongs to, null for loose pages and reserved folders. */
  book: string | null;
  title: string;
  tags: string[];
  created?: string;
  /** Searchable text, capped. Rebuilt from the file, never edited here. */
  text: string;
  /** Wikilink targets as written. */
  links: string[];
  /** Drive ID each link resolved to, kept so a renamed target still resolves. */
  linkIds: (string | null)[];
  /** Block IDs shown with `![[^id]]`. */
  embeds: string[];
  /** `_media` file names shown with `![[name]]`. */
  media: string[];
  blocks: BlockEntry[];
}

export interface Folder {
  id: string;
  name: string;
  parent: string;
  /** Book color, read from the folder's Drive properties. */
  color?: string;
}

/** Disposable: always rebuildable from the files in Drive. */
export interface KbIndex {
  version: 3;
  rootId: string;
  builtAt: string;
  folders: Record<string, Folder>;
  files: Record<string, FileEntry>;
}

export interface KbState {
  version: 3;
  rootId: string;
  pageToken: string | null;
  lastSync: string | null;
}
