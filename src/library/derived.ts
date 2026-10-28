// Lookups computed from the index after every change. Never stored: the index
// holds what the files say, this holds what follows from it.
import { stripExt } from './classify';
import type { BlockEntry, FileEntry, KbIndex } from './model';

export interface BlockRef extends BlockEntry {
  id: string;
  /** File the block lives in. */
  fileId: string;
  /** True when the ID is made up by the app because the file has none (or a duplicate). */
  synthetic: boolean;
}

interface Derived {
  titles: Map<string, string>;
  blocks: Map<string, BlockRef>;
  usedIn: Map<string, string[]>;
  backlinks: Map<string, string[]>;
  media: Map<string, string>;
}

export const titleKey = (s: string) => s.trim().toLowerCase();

let d: Derived = { titles: new Map(), blocks: new Map(), usedIn: new Map(), backlinks: new Map(), media: new Map() };

const push = (m: Map<string, string[]>, key: string, value: string) => {
  const list = m.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  m.set(key, list);
};

export function derive(index: KbIndex) {
  const next: Derived = { titles: new Map(), blocks: new Map(), usedIn: new Map(), backlinks: new Map(), media: new Map() };
  // Oldest first, so when two files claim the same block ID the original keeps it.
  const files = Object.values(index.files).sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime) || a.id.localeCompare(b.id));
  const docs = files.filter((f) => f.kind === 'document');

  for (const f of docs) if (!next.titles.has(titleKey(f.title))) next.titles.set(titleKey(f.title), f.id);
  for (const f of docs) {
    const k = titleKey(stripExt(f.name));
    if (!next.titles.has(k)) next.titles.set(k, f.id);
  }
  for (const f of files) if (f.kind === 'media') next.media.set(f.name.toLowerCase(), f.id);

  for (const f of files) {
    f.blocks.forEach((b, i) => {
      const own = b.id && !next.blocks.has(b.id);
      const id = own ? b.id! : `~${f.id}-${i}`;
      next.blocks.set(id, { ...b, id, fileId: f.id, synthetic: !own });
    });
    f.linkIds = f.links.map((l, i) => {
      const byTitle = next.titles.get(titleKey(l));
      if (byTitle) return byTitle;
      const old = f.linkIds[i];
      return old && index.files[old] ? old : null;
    });
    for (const id of f.linkIds) if (id && id !== f.id) push(next.backlinks, id, f.id);
    for (const id of f.embeds) push(next.usedIn, id, f.id);
  }
  d = next;
}

export const blockById = (id: string) => d.blocks.get(id) ?? null;
export const allBlocks = () => [...d.blocks.values()];
export const usedIn = (blockId: string) => d.usedIn.get(blockId) ?? [];
export const backlinksOf = (fileId: string) => d.backlinks.get(fileId) ?? [];
export const mediaByName = (name: string) => d.media.get(name.trim().toLowerCase()) ?? null;
export const blockIdTaken = (id: string) => d.blocks.has(id);

export function lookupLink(file: FileEntry | null, target: string): string | null {
  const byTitle = d.titles.get(titleKey(target));
  if (byTitle) return byTitle;
  if (!file) return null;
  const i = file.links.findIndex((l) => titleKey(l) === titleKey(target));
  return i >= 0 ? file.linkIds[i] : null;
}

export interface Broken {
  from: FileEntry;
  kind: 'link' | 'embed' | 'media';
  target: string;
}

export function brokenLinks(index: KbIndex): Broken[] {
  const out: Broken[] = [];
  for (const f of Object.values(index.files)) {
    f.links.forEach((l, i) => {
      if (!f.linkIds[i]) out.push({ from: f, kind: 'link', target: l });
    });
    for (const id of f.embeds) if (!d.blocks.has(id)) out.push({ from: f, kind: 'embed', target: id });
    for (const name of f.media) if (!d.media.has(name.toLowerCase())) out.push({ from: f, kind: 'media', target: name });
  }
  return out.sort((a, b) => a.from.title.localeCompare(b.from.title));
}

const STOP = new Set('a an and are as at be by for from in is it of on or the to with my our your this that'.split(' '));
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !STOP.has(w));

/** Plain-logic suggestions: shared tags, shared links and blocks, same book, shared title words. */
export function related(index: KbIndex, id: string, limit = 6): FileEntry[] {
  const me = index.files[id];
  if (!me) return [];
  const myTags = new Set(me.tags.map(titleKey));
  const myRefs = new Set([...me.linkIds.filter(Boolean), ...me.embeds]);
  const myWords = new Set(words(me.title));
  const scored: Array<[FileEntry, number]> = [];
  for (const f of Object.values(index.files)) {
    if (f.kind !== 'document' || f.id === id || me.linkIds.includes(f.id) || f.linkIds.includes(id)) continue;
    let score = 0;
    for (const t of f.tags) if (myTags.has(titleKey(t))) score += 3;
    for (const r of [...f.linkIds, ...f.embeds]) if (r && myRefs.has(r)) score += 2;
    if (f.book && f.book === me.book) score += 1;
    for (const w of words(f.title)) if (myWords.has(w)) score += 1;
    if (score >= 2) scored.push([f, score]);
  }
  return scored
    .sort((a, b) => b[1] - a[1] || b[0].modifiedTime.localeCompare(a[0].modifiedTime))
    .slice(0, limit)
    .map(([f]) => f);
}
