// Allow-list sanitizer. Notes and archived pages are untrusted, so anything not
// listed here is dropped. DOMParser builds an inert document: nothing runs while parsing.

const ALLOWED = new Set(
  'a abbr article aside b blockquote br caption cite code dd del details div dl dt em figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img input kbd li main mark nav ol p pre q s section small span strong sub summary sup table tbody td tfoot th thead time tr u ul'.split(' '),
);

// Removed together with their content, not unwrapped.
const DROP = new Set(
  'script style iframe frame frameset object embed noscript template svg math form textarea select button link meta base title head canvas video audio source picture applet'.split(' '),
);

const GLOBAL_ATTRS = new Set(['title', 'lang', 'dir']);
const TAG_ATTRS: Record<string, string[]> = {
  a: ['href', 'data-wikilink'],
  img: ['src', 'alt', 'width', 'height'],
  td: ['align', 'colspan', 'rowspan'],
  th: ['align', 'colspan', 'rowspan', 'scope'],
  ol: ['start'],
  code: ['class'],
  time: ['datetime'],
  details: ['open'],
  input: ['type', 'checked'],
  span: ['class'],
};

function safeUrl(value: string, forImage: boolean): boolean {
  const v = value.trim();
  if (/^(#|\/(?!\/)|\.\.?\/)/.test(v)) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return !v.startsWith('//');
  if (forImage) return /^https:/i.test(v) || /^data:image\/(png|gif|jpe?g|webp);/i.test(v);
  return /^(https?|mailto):/i.test(v);
}

function clean(node: Node, out: Document): Node | null {
  if (node.nodeType === Node.TEXT_NODE) return out.createTextNode(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return null;

  const kids = () => {
    const frag = out.createDocumentFragment();
    el.childNodes.forEach((c) => {
      const k = clean(c, out);
      if (k) frag.append(k);
    });
    return frag;
  };
  if (!ALLOWED.has(tag)) return kids();
  if (tag === 'input' && el.getAttribute('type') !== 'checkbox') return null;

  const copy = out.createElement(tag);
  const allowed = TAG_ATTRS[tag] ?? [];
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (!GLOBAL_ATTRS.has(name) && !allowed.includes(name)) continue;
    if ((name === 'href' || name === 'src') && !safeUrl(attr.value, name === 'src')) continue;
    // Classes only from a fixed list: code languages, and text colors from the editor.
    if (name === 'class' && !/^language-[\w+-]+$/.test(attr.value) && !(tag === 'span' && /^color-(red|orange|yellow|green|blue|purple|gray)$/.test(attr.value))) continue;
    copy.setAttribute(name, attr.value);
  }
  if (tag === 'input') copy.setAttribute('disabled', '');
  copy.append(kids());
  return copy;
}

export function sanitize(html: string): DocumentFragment {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const frag = document.createDocumentFragment();
  parsed.body.childNodes.forEach((c) => {
    const k = clean(c, document);
    if (k) frag.append(k);
  });
  return frag;
}

export function sanitizeToString(html: string): string {
  const box = document.createElement('div');
  box.append(sanitize(html));
  return box.innerHTML;
}
