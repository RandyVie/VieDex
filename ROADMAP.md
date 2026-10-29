# VieDex roadmap

What comes next, roughly in order. The brief and the rules for what exists are in `CLAUDE-VieDex.md`; this file is the plan. Each item says what it is, how it fits Drive, and what is still to decide.

## Next

### Done: tag suggestions

Hashtags stay the way documents are grouped and filtered. The Tags field in the editor now suggests tags already used in the library while typing (most used first).

### 1. More list types

Today a list block is one Markdown list. Add list types, so a list can be a checklist, a numbered list, a ranked list, a pros/cons list and so on.

- **Open question:** "the same thing as vielistr". Which app or project is that, and which of its list types matter most? Needs a link or a short description before starting.
- **Stored as:** the list type after the block opening, e.g. `:::list ^id checklist`, content stays plain Markdown so Drive stays readable.

### 2. New book item: Board

A book holds only documents now. A board is a free canvas where images and notes are placed and dragged around (moodboards).

- **Stored as:** a `.board.json` file in the book folder: canvas items with position, size and what they show (an image from `_media/`, a block by `^id`, or a free note).
- **Reuses blocks:** notes on a board are note blocks, so they appear in collections and can be embedded in documents (one source).
- **In the app:** pan and zoom, drag to move, resize, drop images to upload into `_media/`, add or embed blocks.
- **Index:** boards count in their book, show in search by their notes, and their blocks show "Used in" the board.

### 3. New book item: Gallery

A document type focused on images: a grid of images with captions, in a chosen order.

- **Stored as:** a Markdown document with `type: gallery` in its frontmatter and image blocks as content, so it stays readable in Drive and reuses image blocks.
- **In the app:** a grid view instead of the reading view, drag to reorder, multi-upload, a full-screen viewer.

## Later

Kept from the brief's ideas list, not yet planned in detail:

- Syntax highlighting in code blocks (needs a small library; ask first).
- Tag management: rename and merge tags across all files.
- Graph view of links between documents.
- Saved searches as virtual collections.
- Offline read cache for recently opened documents (read-only; Drive stays authoritative).
- Webpage archiving: a link block with an archived copy (Apps Script fetcher, browser extension for JavaScript-heavy pages).
- Link checker for dead links, duplicate detection for images.
- Android share target and quick capture on the phone.
- Import from Evernote (.enex).
- Real Google Drive setup and a first test outside demo mode.
