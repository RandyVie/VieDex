# CLAUDE.md

Personal knowledge base web app. Google Drive is the database, the app is a window onto it.
Name: **VieDex**.

## What this is

A single-user web app (PWA) for writing and collecting knowledge, organized like this:

- **Library**: the top level, like an Obsidian vault. There can be several. Libraries never reference each other.
- **Book**: a collection of documents inside a library. Books do not nest.
- **Document**: a Markdown (or plain text) file inside a book. Documents are the main way to read the library.
- **Block**: a marked section of a document with a type: `idea`, `list`, `link`, `code`, `image` or `reference`.
  Blocks can also be created on their own, outside any document. Each block type has its own browsable collection.

Accessible from desktop and phone. One copy of the data, living in Google Drive.

## Hard constraints

These are decisions, not suggestions. Do not work around them without asking.

- **Free.** No paid services, no paid hosting, no paid APIs.
- **Drive is the single source of truth.** No second database, no server-side copy. Browser caching is fine, but the app must treat Drive as authoritative.
- **Drive-native editing must work.** The user can add, edit, move or delete files directly in Google Drive (web or desktop), and the app must pick those changes up. The app must not assume it created every file.
- **No AI integrations.** No LLMs, no embeddings, no Ollama, no external AI APIs. "Smart" features are built with plain logic (shared tags, shared words, backlinks).
- **Single user.** No accounts, no sharing, no multi-tenant logic.
- **No secrets in the repo.** The OAuth client ID is public by nature; nothing else sensitive goes in the code.

## Architecture

### Frontend: PWA

- Static site, hosted on GitHub Pages.
- Installable on phone home screen.
- Android: register as a Web Share Target so URLs, text and images can be shared into the app.
- Stack: Vite + TypeScript, no heavy framework unless there is a clear reason. Keep dependencies few and boring.

### Auth: Google Identity Services

- Use Google Identity Services (GIS) token model. Do NOT use the deprecated `gapi.auth2`.
- Scope: full `https://www.googleapis.com/auth/drive`. Needed because the app must see files added outside the app. `drive.file` is explicitly rejected for this reason.
- The Google Cloud project stays in **Testing** mode with only the owner as test user. No verification process. The "unverified app" warning on login is expected.
- OAuth client restricted to the production origin and localhost.
- Access tokens expire after one hour; refresh silently where possible, prompt only when needed.
- Even though the scope covers the whole Drive, the app only ever reads and writes inside the configured root folder. Enforce this in code: every Drive call goes through one module that checks the root.

### Webpage archiving: Google Apps Script (side service)

- Browsers cannot fetch other sites (CORS), so a small Apps Script web app does server-side fetching.
- Flow: app sends URL, script fetches HTML, extracts readable content, saves it plus images into the clips folder, returns the file ID.
- Deployed as "execute as me", accessible only to the owner.
- Known limitation: JavaScript-rendered pages may come back empty. Later fix: browser extension that captures from the open tab (see Ideas).

## Data layout in Drive

Each library is one Drive folder. The app works inside one library at a time.

```
My library/              library root (ID stored in the app's library list)
  _system/
    index.json           search/block/link index, rebuildable at any time
    state.json           last sync token
  _blocks/               standalone blocks, one file per type
    ideas.md  lists.md  links.md  code.md  images.md  references.md
  _media/                image files used by image blocks
  Typography/            a book (any top-level folder not starting with _)
    Measure.md           a document
  Rebrand 2026/
    Brief.md
```

Rules:

- **Top-level folders are books.** Folders whose name starts with `_` are reserved. Files at the library root are "loose pages". If a book contains sub-folders (made in Drive), their documents count as part of that book.
- **The index is disposable.** `index.json` must always be rebuildable from the files themselves. Never store information only in the index.
- **Metadata lives in the files.** Documents use YAML frontmatter:

```yaml
---
title: Measure and scale
tags: [typography, reference]
created: 2026-10-28
---
```

- Files without frontmatter are still valid. Title falls back to the file name.
- Images are never modified. They live in `_media/` and are shown through image blocks.

## Blocks

Blocks are written in the Markdown itself, so they survive editing in Drive and still read as plain text:

```markdown
:::idea ^b7f3 Optional title
Big grotesk numerals on dark backgrounds.
:::

:::image ^c01d
![[Grid poster.png]]
Caption for the image.
:::

![[^b7f3|Big grotesk numerals]]
```

- `:::type ^id title` opens a block, a line with only `:::` closes it. Blocks do not nest.
- `^id` is a short ID, unique within the library. The app adds IDs to blocks that lack one when it saves a file.
- **One source.** Every block lives in exactly one file: the document it was written in, or its `_blocks/` collection file when created on its own. `![[^id]]` on its own line shows a block from elsewhere. The app writes it as `![[^id|Block title]]` so the raw file reads well; only the ID counts, the label is refreshed on every save. Editing an embedded block edits its source.
- `![[file name.png]]` inside an image block shows a file from `_media/`.
- Each block type has a collection view listing every block of that type in the library. Each block shows where it lives and every document (and book) that uses it.

## Linking

- Wikilinks: `[[Document title]]` in Markdown.
- Resolve by title first, store the Drive file ID in the index so renames can be repaired.
- Backlinks shown on every document. "Used in" shown on every block.
- "Related" suggestions: plain logic only. Shared tags, shared links, same book, overlapping words in titles. No AI.
- Broken links and broken embeds are listed, not silently dropped.

## Sync

- On startup and on manual refresh, use the Drive Changes API (`changes.list` with a stored start page token) to find what changed since the last sync.
- Fallback: query by `modifiedTime` within the root folder.
- Re-index only changed files. Full rebuild available as a manual action.
- Conflict policy: Drive wins. If a file changed in Drive while open in the editor, warn before saving.

## Security

- Archived webpages are untrusted. Render them in a sandboxed `<iframe>` without `allow-scripts`. Sanitize HTML on save as well (DOMPurify or equivalent).
- Markdown rendering must sanitize output. No raw HTML execution from notes.
- Strict Content Security Policy on the app itself.
- Never put file contents, tokens or personal data in URLs or query strings.

## MVP scope (v0.1)

1. Login, add one or more libraries (each a Drive folder), switch between them.
2. Books and documents: browse, search, view and edit Markdown with frontmatter.
3. Blocks: write them in documents, create them standalone, embed them, browse each type's collection with "used in".
4. Image blocks backed by `_media/`, with Drive thumbnails and upload.
5. Wikilinks, backlinks and broken link reporting.
6. Sync picks up files added or edited directly in Drive.
7. Installable PWA, works on phone.

Archiving (a `link` block with an archived copy) and share target come right after MVP.

## Code conventions

- TypeScript, strict mode.
- All Drive access goes through `src/drive/` (one place for auth, root-folder enforcement, rate limiting, retries).
- Small modules, no god files.
- UI copy: US spelling, plain and short, no em dashes.
- Comment the why, not the what.
- Keep the build working on every commit.

## Working with the owner

- The owner is a senior visual designer: strong in HTML and CSS, familiar with JS. Explain architectural choices briefly when making them.
- Design matters. The UI should feel considered, not like a default template. Ask before making big visual decisions.
- Prefer showing working code over long discussion.
- Ask before adding dependencies.

## Todo / ideas

Not in MVP. Kept here so they don't get lost.

- [ ] **URL scanner.** Scan a document, a book (EPUB/PDF), a collection, or the whole library and produce a list of every URL found. To be fleshed out: output format (note, table, export), deduplication, grouping by domain, link checking (dead or alive), one-click archive of found URLs.
- [ ] **Browser extension** for clipping from the open tab, to fix JS-rendered pages the Apps Script fetcher can't read.
- [ ] **Syntax highlighting** for code blocks, language filter.
- [ ] **Boards / moodboards.** Freeform canvas for arranging images and notes, saved as a JSON file in Drive.
- [ ] **Tag management.** Rename and merge tags across all files.
- [ ] **Graph view** of links between items.
- [ ] **Saved searches** as virtual collections.
- [ ] **Offline read cache** for recently opened items (read-only, Drive still authoritative).
- [ ] **Link checker** for archived clips: flag sources that went offline (the archive keeps them anyway).
- [ ] **Duplicate detection** for images and clips.
- [ ] **Import from Evernote** (.enex) into Markdown + images.
- [ ] **Quick capture** on phone: one tap to new note, photo or URL.
- [ ] **Keyboard shortcuts** for search, new note, jump to item.
