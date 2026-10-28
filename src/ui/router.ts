import { isBlockType, type BlockType } from '../md/blocks';

export type Route =
  | { name: 'home'; focus?: 'loose' }
  | { name: 'books' }
  | { name: 'book'; id: string }
  | { name: 'blocks-all' }
  | { name: 'doc'; id: string }
  | { name: 'edit-doc'; id: string }
  | { name: 'new-doc'; bookId: string | null }
  | { name: 'blocks'; type: BlockType }
  | { name: 'new-block'; type: BlockType }
  | { name: 'block'; id: string }
  | { name: 'edit-block'; id: string }
  | { name: 'file'; id: string }
  | { name: 'search' }
  | { name: 'broken' }
  | { name: 'settings' }
  | { name: 'add-library' };

// Routes carry Drive and block IDs only. Titles, queries and content never go in the URL.
export function parseRoute(hash = location.hash): Route {
  const [a, b, c] = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  switch (a) {
    case 'book':
      if (b) return { name: 'book', id: b };
      break;
    case 'doc':
      if (b) return c === 'edit' ? { name: 'edit-doc', id: b } : { name: 'doc', id: b };
      break;
    case 'new-doc':
      return { name: 'new-doc', bookId: b || null };
    case 'books':
      return { name: 'books' };
    case 'blocks':
      if (!b) return { name: 'blocks-all' };
      if (isBlockType(b)) return c === 'new' ? { name: 'new-block', type: b } : { name: 'blocks', type: b };
      break;
    case 'block':
      if (b) return c === 'edit' ? { name: 'edit-block', id: b } : { name: 'block', id: b };
      break;
    case 'file':
      if (b) return { name: 'file', id: b };
      break;
    case 'search':
      return { name: 'search' };
    case 'broken':
      return { name: 'broken' };
    case 'settings':
      return { name: 'settings' };
    case 'add-library':
      return { name: 'add-library' };
    case 'loose':
      return { name: 'home', focus: 'loose' };
  }
  return { name: 'home' };
}

export const go = (path: string) => {
  location.hash = path;
};
