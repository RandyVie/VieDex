import type { BlockType } from '../md/blocks';

// Reserved folders at the library root. Anything else at the top level is a book.
export const SYSTEM_FOLDER = '_system';
export const BLOCKS_FOLDER = '_blocks';
export const MEDIA_FOLDER = '_media';

export const isReserved = (name: string) => name.startsWith('_');

export const COLLECTION_FILE: Record<BlockType, string> = {
  idea: 'ideas.md',
  list: 'lists.md',
  link: 'links.md',
  code: 'code.md',
  image: 'images.md',
  reference: 'references.md',
};

export const BLOCK_LABEL: Record<BlockType, { one: string; many: string }> = {
  idea: { one: 'Idea', many: 'Ideas' },
  list: { one: 'List', many: 'Lists' },
  link: { one: 'Link', many: 'Links' },
  code: { one: 'Code', many: 'Code' },
  image: { one: 'Image', many: 'Images' },
  reference: { one: 'Reference', many: 'References' },
};
