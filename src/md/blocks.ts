// Blocks are fenced sections inside Markdown:
//
//   :::idea ^b7f3 Optional title
//   content
//   :::
//
// and `![[^b7f3]]` on its own line shows a block that lives elsewhere.

export const BLOCK_TYPES = ['idea', 'list', 'link', 'code', 'image', 'reference'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface ParsedBlock {
  type: BlockType;
  id: string | null;
  title: string;
  content: string;
  /** Line range in the body, `end` is the closing ::: line (or last line if unclosed). */
  start: number;
  end: number;
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'block'; block: ParsedBlock }
  | { kind: 'embed'; target: string; label: string };

const OPEN_RE = /^:::(idea|list|link|code|image|reference)(?:[ \t]+\^([A-Za-z0-9_-]+))?(?:[ \t]+(.*?))?[ \t]*$/i;
const CLOSE_RE = /^:::[ \t]*$/;
const EMBED_RE = /^[ \t]*!\[\[([^\]\n]+)\]\][ \t]*$/;
const FENCE_RE = /^[ \t]*(```|~~~)/;

export const isBlockType = (s: string): s is BlockType => (BLOCK_TYPES as readonly string[]).includes(s);

export function parseBody(body: string): Segment[] {
  const lines = body.split(/\r?\n/);
  const out: Segment[] = [];
  let text: string[] = [];
  let fence: string | null = null;
  const flush = () => {
    if (text.some((l) => l.trim())) out.push({ kind: 'text', text: text.join('\n') });
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const f = FENCE_RE.exec(line);
    if (fence) {
      if (f && f[1] === fence) fence = null;
      text.push(line);
      continue;
    }
    if (f) {
      fence = f[1];
      text.push(line);
      continue;
    }

    const open = OPEN_RE.exec(line);
    if (open) {
      flush();
      const start = i;
      const content: string[] = [];
      let inner: string | null = null;
      for (i++; i < lines.length; i++) {
        const fi = FENCE_RE.exec(lines[i]);
        if (inner) {
          if (fi && fi[1] === inner) inner = null;
        } else if (fi) inner = fi[1];
        else if (CLOSE_RE.test(lines[i])) break;
        content.push(lines[i]);
      }
      out.push({
        kind: 'block',
        block: {
          type: open[1].toLowerCase() as BlockType,
          id: open[2] ?? null,
          title: (open[3] ?? '').trim(),
          content: content.join('\n').replace(/^\n+|\n+$/g, ''),
          start,
          end: Math.min(i, lines.length - 1),
        },
      });
      continue;
    }

    const embed = EMBED_RE.exec(line);
    if (embed) {
      flush();
      // `![[^id|Title]]`: the part after | is only there so the file reads well.
      const [target, label = ''] = embed[1].split('|');
      out.push({ kind: 'embed', target: target.trim(), label: label.trim() });
      continue;
    }
    text.push(line);
  }
  flush();
  return out;
}

/** `![[name]]` lines inside block content, for image blocks. */
export function mediaRefs(content: string): string[] {
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = EMBED_RE.exec(line);
    if (m && !m[1].startsWith('^')) out.push(m[1].split('|')[0].trim());
  }
  return out;
}

/** Title to show: the explicit one, else the first line of content without Markdown marks. */
export function displayTitle(b: Pick<ParsedBlock, 'title' | 'content' | 'type'>): string {
  if (b.title) return b.title;
  const first = b.content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('```') && !EMBED_RE.test(l));
  const clean = (first ?? '')
    .replace(/^([-*+]|\d+\.)\s+(\[[ x]\]\s+)?/i, '')
    .replace(/^#+\s+|^>\s*/, '')
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  if (clean) return clean.length > 90 ? `${clean.slice(0, 88)}…` : clean;
  if (b.type === 'image') return mediaRefs(b.content)[0] ?? 'Image';
  return `Untitled ${b.type}`;
}

/** The first link in a block's content, exactly as written (with or without http). */
export function firstUrl(content: string): string | null {
  return /(?:https?:\/\/|www\.)[^\s<>)\]]+/i.exec(content)?.[0] ?? null;
}

/** Where a link goes when clicked. The text itself is never changed: `www.` only gets a scheme here. */
export const hrefOf = (url: string) => (/^www\./i.test(url) ? `https://${url}` : url);

/** A link block's note: its content without the line that is only the link. */
export function linkNote(content: string, url: string | null): string {
  if (!url) return content;
  return content
    .split('\n')
    .filter((l) => l.trim() !== url)
    .join('\n')
    .trim();
}

/** The line that shows a block elsewhere, with its title for anyone reading the raw file. */
export function embedCode(id: string, b?: Pick<ParsedBlock, 'title' | 'content' | 'type'> | null): string {
  const label = b ? displayTitle(b).replace(/[\]|\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  return label ? `![[^${id}|${label}]]` : `![[^${id}]]`;
}

export function blockMarkup(type: BlockType, id: string, title: string, content: string): string {
  return `:::${type} ^${id}${title ? ` ${title}` : ''}\n${content.replace(/\n+$/, '')}\n:::`;
}

export function newBlockId(taken: (id: string) => boolean): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 7);
    if (/^[a-z]/.test(id) && !taken(id)) return id;
  }
}

/** Give every block without an ID a fresh one, so it can be embedded. */
export function ensureIds(body: string, taken: (id: string) => boolean): string {
  const lines = body.split('\n');
  const used = new Set<string>();
  for (const seg of parseBody(body)) {
    if (seg.kind !== 'block') continue;
    const b = seg.block;
    if (b.id && !used.has(b.id)) {
      used.add(b.id);
      continue;
    }
    const id = newBlockId((x) => taken(x) || used.has(x));
    used.add(id);
    lines[b.start] = `:::${b.type} ^${id}${b.title ? ` ${b.title}` : ''}`;
  }
  return lines.join('\n');
}

/** Replace one block's title and content, leaving the rest of the body untouched. */
export function replaceBlock(body: string, id: string, title: string, content: string): string | null {
  const seg = parseBody(body).find((s) => s.kind === 'block' && s.block.id === id);
  if (!seg || seg.kind !== 'block') return null;
  const b = seg.block;
  const lines = body.split('\n');
  // An unclosed block runs to the end of the file; the replacement closes it.
  lines.splice(b.start, b.end - b.start + 1, ...blockMarkup(b.type, id, title, content).split('\n'));
  return lines.join('\n');
}

/** Replace a block (opening line through closing :::) with plain text, or drop it when text is ''. */
export function unwrapBlock(body: string, id: string, text: string): string | null {
  const seg = parseBody(body).find((s) => s.kind === 'block' && s.block.id === id);
  if (!seg || seg.kind !== 'block') return null;
  const lines = body.split('\n');
  lines.splice(seg.block.start, seg.block.end - seg.block.start + 1, ...(text ? text.split('\n') : []));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/** Replace every `![[^id]]` line (outside code) with plain text. */
export function replaceEmbeds(body: string, id: string, text: string): string {
  let fence: string | null = null;
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const f = FENCE_RE.exec(line);
    if (fence) {
      if (f && f[1] === fence) fence = null;
    } else if (f) fence = f[1];
    const m = fence ? null : EMBED_RE.exec(line);
    if (m && m[1].split('|')[0].trim() === `^${id}`) out.push(...text.split('\n'));
    else out.push(line);
  }
  return out.join('\n');
}

/** What a deleted block leaves behind: its title in bold, then its content. */
export function blockAsText(b: Pick<ParsedBlock, 'title' | 'content'>): string {
  return [b.title.trim() && `**${b.title.trim()}**`, b.content.trim()].filter(Boolean).join('\n\n');
}
