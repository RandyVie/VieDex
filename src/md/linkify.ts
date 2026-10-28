// Finds web links in normal text and adds a link block after each paragraph that has one.
// The sentence keeps its link; code, blocks, embeds and frontmatter are never touched.
import { blockMarkup, embedCode, firstUrl, newBlockId, parseBody, type ParsedBlock } from './blocks';

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`[\]]+/gi;
const FENCE_RE = /^[ \t]*(```|~~~)/;
const OPEN_RE = /^:::(idea|list|link|code|image|reference)\b/i;
const CLOSE_RE = /^:::[ \t]*$/;
const EMBED_RE = /^[ \t]*!\[\[[^\]\n]+\]\][ \t]*$/;

/** Drop punctuation that ends a sentence rather than the link, and a closing ) without its (. */
export function cleanUrl(raw: string): string {
  let u = raw.replace(/[.,;:!?'"*_]+$/, '');
  while (u.endsWith(')') && (u.match(/\(/g)?.length ?? 0) < (u.match(/\)/g)?.length ?? 0)) u = u.slice(0, -1).replace(/[.,;:!?]+$/, '');
  return u;
}

export const hrefOf = (url: string) => (/^www\./i.test(url) ? `https://${url}` : url);

/** Compare links loosely: no scheme, no www, no trailing slash, case-insensitive host. */
export function urlKey(url: string): string {
  try {
    const u = new URL(hrefOf(url));
    return `${u.host.replace(/^www\./i, '')}${u.pathname.replace(/\/$/, '')}${u.search}${u.hash}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Links in one line of normal text, ignoring inline code and images. */
export function findUrls(line: string): string[] {
  const text = line.replace(/`[^`]*`/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  return [...text.matchAll(URL_RE)].map((m) => cleanUrl(m[0])).filter((u) => /\.[a-z]{2,}/i.test(u));
}

export interface LinkifyContext {
  /** A link block anywhere in the library with this URL key. */
  existing(key: string): { id: string; block: Pick<ParsedBlock, 'title' | 'content' | 'type'> } | null;
  /** URL key of a link block, for embeds already in the text. */
  keyOfBlock(id: string): string | null;
  taken(id: string): boolean;
}

export interface LinkifyResult {
  body: string;
  /** Links that got a new link block. */
  created: string[];
  /** Links that got an embed of an existing link block. */
  embedded: string[];
}

export function linkify(body: string, ctx: LinkifyContext): LinkifyResult {
  // Links this document already has as a block, its own or embedded.
  const have = new Set<string>();
  for (const seg of parseBody(body)) {
    if (seg.kind === 'block' && seg.block.type === 'link') {
      const url = firstUrl(seg.block.content) ?? findUrls(seg.block.content)[0];
      if (url) have.add(urlKey(url));
    } else if (seg.kind === 'embed' && seg.target.startsWith('^')) {
      const key = ctx.keyOfBlock(seg.target.slice(1));
      if (key) have.add(key);
    }
  }

  const result: LinkifyResult = { body, created: [], embedded: [] };
  const usedIds = new Set<string>();
  const out: string[] = [];
  let paragraph: string[] = [];
  let fence: string | null = null;
  let inBlock = false;
  let needBlank = false;

  const push = (line: string) => {
    if (needBlank && line.trim() !== '') out.push('');
    needBlank = false;
    out.push(line);
  };

  const flush = () => {
    const additions: string[] = [];
    for (const url of paragraph) {
      const key = urlKey(url);
      if (have.has(key)) continue;
      have.add(key);
      const ex = ctx.existing(key);
      if (ex) {
        additions.push(embedCode(ex.id, ex.block));
        result.embedded.push(url);
      } else {
        const id = newBlockId((x) => ctx.taken(x) || usedIds.has(x));
        usedIds.add(id);
        additions.push(blockMarkup('link', id, '', hrefOf(url)));
        result.created.push(url);
      }
    }
    paragraph = [];
    if (!additions.length) return;
    for (const a of additions) {
      if (out.length && out[out.length - 1].trim() !== '') out.push('');
      out.push(...a.split('\n'));
    }
    needBlank = true;
  };

  for (const line of body.split('\n')) {
    if (fence) {
      push(line);
      if (FENCE_RE.exec(line)?.[1] === fence) fence = null;
      continue;
    }
    if (inBlock) {
      push(line);
      if (CLOSE_RE.test(line)) inBlock = false;
      continue;
    }
    const f = FENCE_RE.exec(line);
    if (f || OPEN_RE.test(line) || EMBED_RE.test(line) || !line.trim()) {
      flush();
      if (f) fence = f[1];
      else if (OPEN_RE.test(line)) inBlock = true;
      push(line);
      continue;
    }
    paragraph.push(...findUrls(line));
    push(line);
  }
  flush();

  if (result.created.length || result.embedded.length) result.body = out.join('\n');
  return result;
}
