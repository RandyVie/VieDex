import { drive } from '../drive';
import { MEDIA_FOLDER } from '../library/layout';
import { getIndex } from '../library/library';
import { thumb } from './components';
import { h } from './dom';

// Drive thumbnail links expire after a few hours and live outside the index,
// so they are fetched per session with one listing of _media.
const TTL = 20 * 60_000;
let cache: { at: number; root: string; links: Promise<Map<string, string>> } | null = null;

function links(): Promise<Map<string, string>> {
  const idx = getIndex();
  if (!idx) return Promise.resolve(new Map());
  if (cache && cache.root === idx.rootId && Date.now() - cache.at < TTL) return cache.links;
  const folder = Object.values(idx.folders).find((f) => f.parent === idx.rootId && f.name === MEDIA_FOLDER);
  const p = folder
    ? drive
        .listChildren(folder.id)
        .then((files) => new Map(files.filter((f) => f.thumbnailLink).map((f) => [f.id, f.thumbnailLink!])))
        .catch(() => new Map<string, string>())
    : Promise.resolve(new Map<string, string>());
  cache = { at: Date.now(), root: idx.rootId, links: p };
  return p;
}

export function forgetMediaLinks() {
  cache = null;
}

/** An image element for a `_media` file, filled in once its thumbnail link is known. */
export function mediaImage(fileId: string, alt: string, px = 1200): HTMLElement {
  const box = h('span', { class: 'media-slot' });
  links().then((m) => box.replaceWith(thumb(fileId, m.get(fileId), px, alt)));
  return box;
}
