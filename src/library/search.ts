import { displayTitle } from '../md/blocks';
import type { BlockRef } from './derived';
import type { FileEntry } from './model';

export type Hit = { kind: 'file'; file: FileEntry; score: number } | { kind: 'block'; block: BlockRef; score: number };

export interface ParsedQuery {
  terms: string[];
  tags: string[];
}

export function parseQuery(raw: string): ParsedQuery {
  const terms: string[] = [];
  const tags: string[] = [];
  for (const tok of raw.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (tok.startsWith('#') && tok.length > 1) tags.push(tok.slice(1));
    else terms.push(tok);
  }
  return { terms, tags };
}

interface Hay {
  title: string;
  tags: string[];
  name: string;
  text: string;
}

const cache = new WeakMap<object, Hay>();

function hayOf(key: object, make: () => Hay): Hay {
  let h = cache.get(key);
  if (!h) cache.set(key, (h = make()));
  return h;
}

/** Every term must match somewhere. Title hits rank above tag hits above full text. */
function score(h: Hay, q: ParsedQuery): number {
  if (!q.tags.every((t) => h.tags.includes(t))) return 0;
  let total = q.terms.length ? 0 : 1;
  for (const term of q.terms) {
    let s = 0;
    if (h.title.startsWith(term)) s += 15;
    else if (h.title.includes(term)) s += 10;
    if (h.tags.some((t) => t.includes(term))) s += 6;
    if (h.name.includes(term)) s += 3;
    if (h.text.includes(term)) s += 1;
    if (!s) return 0;
    total += s;
  }
  return total;
}

export function searchAll(files: FileEntry[], blocks: BlockRef[], raw: string): Hit[] {
  const q = parseQuery(raw);
  if (!q.terms.length && !q.tags.length) return [];
  const hits: Hit[] = [];
  for (const f of files) {
    if (f.kind !== 'document' && f.kind !== 'other') continue;
    const s = score(
      hayOf(f, () => ({ title: f.title.toLowerCase(), tags: f.tags.map((t) => t.toLowerCase()), name: f.name.toLowerCase(), text: f.text.toLowerCase() })),
      q,
    );
    if (s) hits.push({ kind: 'file', file: f, score: s });
  }
  // Blocks have no tags of their own; a tag filter only matches documents.
  if (!q.tags.length) {
    for (const b of blocks) {
      const s = score(hayOf(b, () => ({ title: displayTitle(b).toLowerCase(), tags: [], name: b.type, text: b.content.toLowerCase() })), q);
      if (s) hits.push({ kind: 'block', block: b, score: s });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Markdown as it reads: no block fences, embeds, tags, emphasis marks or heading hashes. */
export function plainText(text: string): string {
  return text
    .replace(/^:::.*$/gm, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A short excerpt around the first matching term, for result rows. */
export function excerpt(text: string, raw = '', len = 140): string {
  const flat = plainText(text);
  const { terms } = parseQuery(raw);
  const lower = flat.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).find((i) => i >= 0) ?? -1;
  if (at < 0) return flat.slice(0, len);
  const start = Math.max(0, at - 40);
  return (start ? '…' : '') + flat.slice(start, start + len);
}
