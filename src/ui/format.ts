// Text formatting for the editors. Everything is written as plain Markdown, plus a
// whitelisted <span class="color-…"> for colors, so files stay readable in Drive.
import { h } from './dom';
import { activeRich, richBold, richColor, richItalic, richSize } from './rich';

export const TEXT_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

/** Text fields formatting applies to. Code fields are left alone. */
const FORMATTABLE = '.seg-text, .field-area:not(.field-code), .md-chunk, .md-embed-content, .editor-body';

function edit(area: HTMLTextAreaElement, start: number, end: number, text: string, selStart: number, selEnd: number) {
  area.setRangeText(text, start, end);
  area.setSelectionRange(selStart, selEnd);
  area.focus();
  area.dispatchEvent(new Event('input'));
}

/** Wrap the selection in markers, or remove them when it already has them. */
export function toggleWrap(area: HTMLTextAreaElement, open: string, close = open) {
  const { selectionStart: s, selectionEnd: e, value } = area;
  const before = value.slice(Math.max(0, s - open.length), s);
  const after = value.slice(e, e + close.length);
  let wrapped = before === open && after === close;
  // For *italic*, a selection inside **bold** only looks wrapped in *.
  if (open === '*' && wrapped && value[s - 2] === '*' && value[e + 1] === '*' && value[s - 3] !== '*') wrapped = false;
  if (wrapped) {
    edit(area, s - open.length, e + close.length, value.slice(s, e), s - open.length, e - open.length);
    return;
  }
  const inner = value.slice(s, e);
  // Markers must hug the text: keep spaces from the selection outside them.
  const lead = inner.match(/^\s*/)![0];
  const trail = inner.slice(lead.length).match(/\s*$/)![0];
  const core = inner.slice(lead.length, inner.length - trail.length);
  const text = `${lead}${open}${core}${close}${trail}`;
  const from = s + lead.length + open.length;
  edit(area, s, e, text, from, from + core.length);
}

// Size steps for a line, smallest first. A line can only have one.
const SIZES = ['small', 'normal', 'h3', 'h2', 'h1'] as const;
type Size = (typeof SIZES)[number];

function readSize(line: string): { size: Size; text: string } {
  const head = /^(#{1,6})\s+(.*)$/.exec(line);
  if (head) return { size: head[1].length === 1 ? 'h1' : head[1].length === 2 ? 'h2' : 'h3', text: head[2] };
  const small = /^<small>(.*)<\/small>$/.exec(line);
  if (small) return { size: 'small', text: small[1] };
  return { size: 'normal', text: line };
}

function writeSize(size: Size, text: string): string {
  if (!text.trim()) return text;
  if (size === 'h1') return `# ${text}`;
  if (size === 'h2') return `## ${text}`;
  if (size === 'h3') return `### ${text}`;
  if (size === 'small') return `<small>${text}</small>`;
  return text;
}

/** Make the selected line(s) one step larger or smaller. */
export function stepSize(area: HTMLTextAreaElement, dir: 1 | -1) {
  const { selectionStart: s, selectionEnd: e, value } = area;
  const start = value.lastIndexOf('\n', s - 1) + 1;
  const endNl = value.indexOf('\n', e);
  const end = endNl === -1 ? value.length : endNl;
  const lines = value.slice(start, end).split('\n').map((line) => {
    const { size, text } = readSize(line);
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf(size) + dir))];
    return writeSize(next, text);
  });
  const text = lines.join('\n');
  edit(area, start, end, text, start, start + text.length);
}

const COLOR_SPAN = /^<span class="color-([a-z]+)">([\s\S]*)<\/span>$/;

/** Color the selection, change its color, or remove it with null. */
export function setColor(area: HTMLTextAreaElement, color: TextColor | null) {
  const { selectionStart: s, selectionEnd: e, value } = area;
  // Selection is the text inside a color span: widen it to the whole span.
  const open = value.lastIndexOf('<span class="color-', s);
  let from = s;
  let to = e;
  if (open !== -1) {
    const tagEnd = value.indexOf('">', open);
    const close = value.indexOf('</span>', e);
    if (tagEnd !== -1 && tagEnd + 2 === s && close === e) {
      from = open;
      to = close + '</span>'.length;
    }
  }
  const selected = value.slice(from, to);
  const inner = COLOR_SPAN.exec(selected)?.[2] ?? selected;
  if (!color) {
    edit(area, from, to, inner, from, from + inner.length);
    return;
  }
  const openTag = `<span class="color-${color}">`;
  edit(area, from, to, `${openTag}${inner}</span>`, from + openTag.length, from + openTag.length + inner.length);
}

/**
 * A formatting toolbar for one editor. It acts on the text field that last had focus
 * inside `scope`, so it works with many small fields (cards) as well as one big one.
 */
export function formatToolbar(scope: HTMLElement): HTMLElement {
  let target: HTMLTextAreaElement | null = null;
  const pick = (e: Event) => {
    const el = e.target as HTMLElement;
    if (el instanceof HTMLTextAreaElement && el.matches(FORMATTABLE)) target = el;
  };
  scope.addEventListener('focusin', pick);

  interface Command {
    area: (a: HTMLTextAreaElement) => void;
    rich: (r: HTMLElement) => void;
  }
  const run = (cmd: Command) => () => {
    // Live text in Write first, then the plain field with the cursor, then the last one used.
    const rich = activeRich(scope);
    if (rich) return cmd.rich(rich);
    const active = document.activeElement;
    const area = active instanceof HTMLTextAreaElement && active.matches(FORMATTABLE) && scope.contains(active) ? active : target;
    if (area && area.isConnected) cmd.area(area);
  };
  const press = (b: HTMLElement, cmd: Command) => {
    // Keep the selection where it is when the button is pressed.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', run(cmd));
    return b;
  };
  const btn = (label: string, title: string, cmd: Command, cls = '') =>
    press(h('button', { class: `fmt-btn ${cls}`, type: 'button', title, 'aria-label': title }, label), cmd);

  const bold: Command = { area: (a) => toggleWrap(a, '**'), rich: () => richBold() };
  const italic: Command = { area: (a) => toggleWrap(a, '*'), rich: () => richItalic() };
  const color = (c: TextColor | null): Command => ({ area: (a) => setColor(a, c), rich: (r) => richColor(r, c) });

  const colorMenu = h('div', { class: 'menu fmt-colors', hidden: true });
  for (const c of TEXT_COLORS) {
    const b = press(h('button', { class: `fmt-swatch color-swatch-${c}`, type: 'button', title: c, 'aria-label': `Color ${c}` }), color(c));
    b.addEventListener('click', () => (colorMenu.hidden = true));
    colorMenu.append(b);
  }
  const none = press(h('button', { class: 'fmt-none', type: 'button' }, 'No color'), color(null));
  none.addEventListener('click', () => (colorMenu.hidden = true));
  colorMenu.append(none);

  const colorBtn = h('button', { class: 'fmt-btn fmt-color', type: 'button', title: 'Text color', 'aria-label': 'Text color' }, h('span', { class: 'fmt-color-a' }, 'A'));
  colorBtn.addEventListener('mousedown', (e) => e.preventDefault());
  colorBtn.addEventListener('click', () => (colorMenu.hidden = !colorMenu.hidden));
  scope.addEventListener('focusin', () => (colorMenu.hidden = true));

  // ⌘B / ⌘I in plain fields. Live text gets them from the browser itself.
  scope.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLTextAreaElement) || !el.matches(FORMATTABLE)) return;
    const key = e.key.toLowerCase();
    if (key === 'b') toggleWrap(el, '**');
    else if (key === 'i') toggleWrap(el, '*');
    else return;
    e.preventDefault();
  });

  return h(
    'div',
    { class: 'fmt-bar', role: 'toolbar', 'aria-label': 'Text formatting' },
    btn('B', 'Bold (⌘B)', bold, 'fmt-bold'),
    btn('I', 'Italic (⌘I)', italic, 'fmt-italic'),
    h('span', { class: 'fmt-sep' }),
    btn('A', 'Smaller text', { area: (a) => stepSize(a, -1), rich: (r) => richSize(r, -1) }, 'fmt-size-down'),
    btn('A', 'Larger text', { area: (a) => stepSize(a, 1), rich: (r) => richSize(r, 1) }, 'fmt-size-up'),
    h('span', { class: 'fmt-sep' }),
    h('div', { class: 'menu-wrap' }, colorBtn, colorMenu),
  );
}
