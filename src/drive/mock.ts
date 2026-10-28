// In-memory stand-in for Drive, used by `npm run demo` only. Never in production builds.
import { FOLDER_MIME, type ChangePage, type DriveBackend, type DriveChange, type DriveFile } from './types';

interface Node extends DriveFile {
  content?: string;
  blob?: Blob;
}

const MD = 'text/markdown';

function svg(bg: string, fg: string, shape: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${bg}"/>${shape.replaceAll('FG', fg)}</svg>`;
}

const IMAGES: Array<[string, string]> = [
  ['Grid poster.svg', svg('#1d2b53', '#ff6b4a', '<rect x="40" y="40" width="140" height="220" fill="FG"/><rect x="200" y="40" width="160" height="100" fill="#f4f1de"/>')],
  ['Circle study.svg', svg('#f4f1de', '#e07a5f', '<circle cx="200" cy="150" r="100" fill="FG"/><circle cx="260" cy="110" r="40" fill="#3d405b"/>')],
  ['Stripes.svg', svg('#111', '#c8f560', '<rect x="0" y="40" width="400" height="20" fill="FG"/><rect x="0" y="100" width="400" height="20" fill="FG"/><rect x="0" y="160" width="400" height="20" fill="FG"/><rect x="0" y="220" width="400" height="20" fill="FG"/>')],
  ['Serif A.svg', svg('#efe9dc', '#222', '<text x="200" y="230" font-family="Georgia,serif" font-size="240" text-anchor="middle" fill="FG">Aa</text>')],
  ['Mono g.svg', svg('#222', '#efe9dc', '<text x="200" y="220" font-family="monospace" font-size="200" text-anchor="middle" fill="FG">g{}</text>')],
  ['Grotesk R.svg', svg('#6c63ff', '#fff', '<text x="200" y="230" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="230" text-anchor="middle" fill="FG">R</text>')],
];

// [library, folder path inside the library ('' for root), file name, content]
const FILES: Array<[string, string, string, string]> = [
  ['Design library', 'Typography', 'Measure and scale.md', `---
title: Measure and scale
tags: [typography, reference]
created: 2026-09-14
---
## Measure

Keep body text between 60 and 75 characters per line (see https://practicaltypography.com/line-length.html). Wider than that and the eye loses the start of the next line.

:::idea ^ms4ur Measure as a token
Store measure as a design token (\`--measure: 68ch\`) instead of a max-width in pixels.
:::

## Scale

A modular scale of 1.25 works well for UI. See [[Pairing fonts]] for how the scale changes per typeface.

:::code ^sc4le Modular scale in CSS
\`\`\`css
:root {
  --step-0: 1rem;
  --step-1: calc(var(--step-0) * 1.25);
  --step-2: calc(var(--step-1) * 1.25);
}
\`\`\`
:::

Good background reading:

![[^lk1gr]]
`],
  ['Design library', 'Typography', 'Pairing fonts.md', `---
title: Pairing fonts
tags: [typography]
created: 2026-10-02
---
Pair on contrast, not on similarity. One family carries the reading, the other one the structure.

:::list ^pa1rs Pairings that worked
- Grotesk headings, serif body
- Mono captions with a humanist sans
- One family, two optical sizes
:::

![[^id3a1]]

The specimen we keep coming back to:

![[^im9rk]]
`],
  ['Design library', 'Rebrand 2026', 'Brief.md', `---
title: Rebrand brief
tags: [rebrand, client]
created: 2026-08-20
---
Goal: a calmer, more editorial identity. Start from [[Measure and scale]].\nThe Swiss archive is a good start: https://example.com/swiss-style-archive/ and also www.grid-system.example/history.

:::reference ^rf8br Client interview, 12 Aug
"We want to look like we have time for our customers."
:::

Two ideas to test in the first round:

![[^ms4ur]]

![[^id3a1]]

Open questions live in [[Rebrand questions]].
`],
  ['Design library', 'Rebrand 2026', 'Moodboard.md', `---
title: Moodboard
tags: [rebrand, inspiration]
---
First pass at a visual direction.

:::image ^mb0p1 Poster grid
![[Grid poster.svg]]
Hard grid, one loud color.
:::

:::image ^mb0p2
![[Circle study.svg]]
Soft shapes as a counterweight.
:::

:::link ^lk2sw
https://example.com/swiss-style-archive
Archive of Swiss style posters.
:::
`],
  ['Design library', '', 'Inbox.md', `Loose page at the library root, outside any book. Read https://example.com/why-grids-work later.\n\n\`\`\`\ncurl https://example.com/inside-code-is-ignored\n\`\`\`

:::idea
This block has no ID yet. Saving this page in the app gives it one.
:::
`],
  ['Design library', '_blocks', 'ideas.md', `:::idea ^id3a1 Numerals as image
Big grotesk numerals on dark backgrounds, used as the main visual.
:::

:::idea ^id7q2
A colophon page in every document that lists the typefaces used.
:::
`],
  ['Design library', '_blocks', 'links.md', `:::link ^lk1gr Why grids work
https://example.com/why-grids-work
Grids reduce decisions, not options.
:::
`],
  ['Design library', '_blocks', 'images.md', `:::image ^im9rk Grotesk specimen
![[Grotesk R.svg]]
:::

:::image ^im2sf
![[Serif A.svg]]
Serif reference for body text.
:::
`],
  ['Design library', '_blocks', 'code.md', `:::code ^cd0db debounce
\`\`\`ts
export function debounce<T extends (...args: never[]) => void>(fn: T, ms = 200) {
  let t: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
\`\`\`
:::
`],
  ['Work notes', 'Meetings', 'Kickoff.md', `---
title: Kickoff
tags: [meeting]
---
A second library. Nothing here can link to the design library.

:::list ^wk1ls Action points
- [x] Send the brief
- [ ] Book the workshop room
:::
`],
];

export function createMockDrive(): DriveBackend & Record<string, unknown> {
  const nodes = new Map<string, Node>();
  const log: DriveChange[] = [];
  let seq = 0;
  let clock = Date.parse('2026-10-01T09:00:00Z');
  const tick = () => new Date((clock += 60_000)).toISOString();
  const wait = <T>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 40 + Math.random() * 60));
  const pub = (n: Node): DriveFile => {
    const { content: _content, blob: _blob, ...meta } = n;
    return meta;
  };

  function add(parent: string, name: string, mimeType: string, content?: string): Node {
    const id = `m${(++seq).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const n: Node = {
      id,
      name,
      mimeType,
      parents: [parent],
      modifiedTime: tick(),
      size: content ? String(content.length) : undefined,
      content,
      webViewLink: `https://drive.google.com/file/d/${id}/view`,
    };
    if (mimeType.startsWith('image/') && content) {
      n.thumbnailLink = `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
    }
    nodes.set(id, n);
    log.push({ fileId: id, removed: false, file: pub(n) });
    return n;
  }

  function folderPath(path: string, root: string): string {
    let parent = root;
    for (const part of path.split('/')) {
      const found = [...nodes.values()].find((n) => n.parents?.[0] === parent && n.name === part && n.mimeType === FOLDER_MIME);
      parent = (found ?? add(parent, part, FOLDER_MIME)).id;
    }
    return parent;
  }

  nodes.set('root', { id: 'root', name: 'My Drive', mimeType: FOLDER_MIME, modifiedTime: tick() });
  const libs = new Map<string, string>();
  for (const name of ['Design library', 'Work notes']) libs.set(name, add('root', name, FOLDER_MIME).id);
  add('root', 'Taxes 2025', FOLDER_MIME);
  for (const [lib, dir, name, text] of FILES) {
    add(dir ? folderPath(dir, libs.get(lib)!) : libs.get(lib)!, name, MD, text);
  }
  // Demo book colors, as VieDex would store them on the folder.
  for (const [name, color] of [['Typography', '#8ab4ff'], ['Rebrand 2026', '#ff8f6b'], ['Meetings', '#c49bff']]) {
    const folder = [...nodes.values()].find((n) => n.name === name && n.mimeType === FOLDER_MIME);
    if (folder) folder.properties = { viedexColor: color };
  }
  const media = folderPath('_media', libs.get('Design library')!);
  for (const [name, content] of IMAGES) add(media, name, 'image/svg+xml', content);
  add(libs.get('Design library')!, 'Scan of receipt.pdf', 'application/pdf', '%PDF');

  const get = (id: string) => {
    const n = nodes.get(id);
    if (!n || n.trashed) throw new Error('File not found');
    return n;
  };
  const touch = (n: Node) => {
    n.modifiedTime = tick();
    log.push({ fileId: n.id, removed: false, file: pub(n) });
  };
  const byName = (name: string) => [...nodes.values()].find((n) => n.name === name && !n.trashed);

  const api = {
    listChildren: (folderId: string, foldersOnly = false) =>
      wait(
        [...nodes.values()]
          .filter((n) => n.parents?.[0] === folderId && !n.trashed && (!foldersOnly || n.mimeType === FOLDER_MIME))
          .sort((a, b) => Number(b.mimeType === FOLDER_MIME) - Number(a.mimeType === FOLDER_MIME) || a.name.localeCompare(b.name))
          .map(pub),
      ),
    getMeta: (id: string) => wait(pub(get(id))),
    downloadText: (id: string) => wait(get(id).content ?? ''),
    downloadBlob: async (id: string) => get(id).blob ?? new Blob([get(id).content ?? ''], { type: get(id).mimeType }),
    updateText(id: string, text: string) {
      const n = get(id);
      n.content = text;
      n.size = String(text.length);
      touch(n);
      return wait(pub(n));
    },
    createText: (parentId: string, name: string, text: string, mimeType: string) => wait(pub(add(parentId, name, mimeType, text))),
    createFolder(parentId: string, name: string, extra: { properties?: Record<string, string>; folderColorRgb?: string } = {}) {
      const n = add(parentId, name, FOLDER_MIME);
      Object.assign(n, extra);
      log[log.length - 1] = { fileId: n.id, removed: false, file: pub(n) };
      return wait(pub(n));
    },
    updateFolder(id: string, extra: { name?: string; properties?: Record<string, string>; folderColorRgb?: string }) {
      const n = get(id);
      if (extra.name) n.name = extra.name;
      n.properties = { ...n.properties, ...extra.properties };
      if (extra.folderColorRgb) n.folderColorRgb = extra.folderColorRgb;
      touch(n);
      return wait(pub(n));
    },
    trash(id: string) {
      const n = get(id);
      n.trashed = true;
      log.push({ fileId: id, removed: true });
      return wait(undefined);
    },
    async createBlob(parentId: string, name: string, blob: Blob) {
      const n = add(parentId, name, blob.type || 'application/octet-stream');
      n.blob = blob;
      n.size = String(blob.size);
      if (blob.type.startsWith('image/')) {
        n.thumbnailLink = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.readAsDataURL(blob);
        });
      }
      return wait(pub(n));
    },
    startPageToken: () => wait(String(log.length)),
    listChanges: (token: string): Promise<ChangePage> =>
      wait({ changes: log.slice(Number(token)), newStartPageToken: String(log.length) }),
    listModifiedSince: (iso: string) => wait([...nodes.values()].filter((n) => !n.trashed && n.modifiedTime > iso).map(pub)),
  };

  // Console helpers to simulate edits made directly in Google Drive.
  const sim = {
    editExternally(name: string, text: string) {
      const n = byName(name);
      if (!n) return 'not found';
      n.content = text;
      touch(n);
      return 'edited, now press Refresh';
    },
    addNote(folderName: string, name: string, text: string) {
      const folder = byName(folderName);
      if (!folder) return 'folder not found';
      add(folder.id, name, MD, text);
      return 'added, now press Refresh';
    },
    remove(name: string) {
      const n = byName(name);
      if (!n) return 'not found';
      n.trashed = true;
      log.push({ fileId: n.id, removed: true });
      return 'removed, now press Refresh';
    },
  };
  (window as unknown as { viedexMock: typeof sim }).viedexMock = sim;
  return api;
}
