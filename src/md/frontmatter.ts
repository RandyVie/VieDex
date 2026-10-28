// A small YAML subset: `key: value`, `key: [a, b]` and block lists.
// Keys the app doesn't edit are written back exactly as they were found.

export type FmValue = string | string[];

export interface Doc {
  meta: Record<string, FmValue>;
  order: string[];
  /** Original lines per key, reused on save unless the key was changed. */
  raw: Record<string, string[]>;
  changed: Set<string>;
  body: string;
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_RE = /^([A-Za-z0-9_-]+):(.*)$/;

function unquote(s: string): string {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  // A trailing comment needs whitespace before the #, so URLs with fragments survive.
  return s.replace(/\s+#.*$/, '').trim();
}

function parseFlowList(s: string): string[] {
  return s
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(unquote)
    .filter(Boolean);
}

export function parseDoc(text: string): Doc {
  const doc: Doc = { meta: {}, order: [], raw: {}, changed: new Set(), body: text };
  const m = FM_RE.exec(text);
  if (!m) return doc;
  doc.body = text.slice(m[0].length);

  let key: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const km = /^\s/.test(line) || line.startsWith('-') ? null : KEY_RE.exec(line);
    if (km) {
      key = km[1];
      doc.order.push(key);
      doc.raw[key] = [line];
      const inline = km[2].replace(/\s+#.*$/, '').trim();
      doc.meta[key] = inline.startsWith('[') ? parseFlowList(inline) : unquote(km[2]);
      continue;
    }
    if (!key) continue;
    doc.raw[key].push(line);
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item) {
      const prev = doc.meta[key];
      doc.meta[key] = [...(Array.isArray(prev) ? prev : prev ? [prev] : []), unquote(item[1])];
    }
  }
  return doc;
}

export function setMeta(doc: Doc, key: string, value: FmValue | undefined) {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    if (!(key in doc.meta)) return;
    delete doc.meta[key];
    doc.order = doc.order.filter((k) => k !== key);
  } else {
    if (!(key in doc.meta)) doc.order.push(key);
    doc.meta[key] = value;
  }
  doc.changed.add(key);
}

function quote(s: string): string {
  return /^[\w./@+-][\w ./@+:?&=%#,-]*$/.test(s) && !/:\s|\s#|,/.test(s) ? s : JSON.stringify(s);
}

function formatValue(v: FmValue): string {
  return Array.isArray(v) ? `[${v.map(quote).join(', ')}]` : quote(v);
}

export function serializeDoc(doc: Doc): string {
  if (doc.order.length === 0) return doc.body;
  const lines = doc.order.flatMap((k) =>
    doc.changed.has(k) || !doc.raw[k] ? [`${k}: ${formatValue(doc.meta[k])}`] : doc.raw[k],
  );
  return `---\n${lines.join('\n')}\n---\n${doc.body.replace(/^\r?\n/, '')}`;
}

export const metaString = (v: FmValue | undefined) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));

export function metaList(v: FmValue | undefined): string[] {
  const list = Array.isArray(v) ? v : v ? v.split(',') : [];
  const seen = new Set<string>();
  return list
    .map((t) => t.trim().replace(/^#/, ''))
    .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
}
