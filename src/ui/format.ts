// Text formatting for the editors. Everything is written as plain Markdown, plus
// <span style="color: #hex"> for colors (older files may use <span class="color-…">).
import { isColor, recentColors, rememberColor, TEXT_RECENT_KEY } from './colors';
import { h } from './dom';
import { activeRich, richBold, richColor, richItalic, richSize } from './rich';

/** The colors offered first; they match the named colors of older files. */
const SUGGESTED_TEXT = ['#ff7a6e', '#ffa45c', '#ffd55c', '#8be08b', '#7fb2ff', '#c49bff', '#8b9099'];

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

const COLOR_SPAN = /^<span (?:class="color-[a-z]+"|style="color: ?#[0-9a-f]{3,6};?")>([\s\S]*)<\/span>$/i;
const OPEN_TAG = /<span (?:class="color-[a-z]+"|style="color: ?#[0-9a-f]{3,6};?")>$/i;

/** Color the selection with a hex color, change its color, or remove it with null. */
export function setColor(area: HTMLTextAreaElement, color: string | null) {
  const { selectionStart: s, selectionEnd: e, value } = area;
  // Selection is exactly the text inside a color span: widen it to the whole span.
  let from = s;
  let to = e;
  const open = OPEN_TAG.exec(value.slice(Math.max(0, s - 60), s));
  if (open && value.startsWith('</span>', e)) {
    from = s - open[0].length;
    to = e + '</span>'.length;
  }
  const selected = value.slice(from, to);
  const inner = COLOR_SPAN.exec(selected)?.[1] ?? selected;
  if (!color) {
    edit(area, from, to, inner, from, from + inner.length);
    return;
  }
  const openTag = `<span style="color: ${color}">`;
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
  // The color picker takes focus (the system picker even more), so the selection is
  // captured when it opens and put back when a color is applied.
  let saved: { rich: HTMLElement; range: Range } | { area: HTMLTextAreaElement; start: number; end: number } | null = null;
  const capture = () => {
    const rich = activeRich(scope);
    const sel = getSelection();
    if (rich && sel?.rangeCount) return void (saved = { rich, range: sel.getRangeAt(0).cloneRange() });
    const active = document.activeElement;
    const area = active instanceof HTMLTextAreaElement && active.matches(FORMATTABLE) && scope.contains(active) ? active : target;
    saved = area ? { area, start: area.selectionStart, end: area.selectionEnd } : null;
  };
  const applyColor = (color: string | null) => {
    colorMenu.hidden = true;
    if (!saved) return;
    if (color) rememberColor(color, TEXT_RECENT_KEY);
    if ('rich' in saved) {
      saved.rich.focus();
      const sel = getSelection();
      sel?.removeAllRanges();
      sel?.addRange(saved.range);
      richColor(saved.rich, color);
    } else {
      saved.area.focus();
      saved.area.setSelectionRange(saved.start, saved.end);
      setColor(saved.area, color);
    }
  };

  const colorMenu = h('div', { class: 'menu fmt-colors', hidden: true });
  const swatch = (c: string) => {
    const b = h('button', { class: 'color-swatch', type: 'button', title: c, 'aria-label': `Color ${c}` });
    b.style.setProperty('--swatch', c);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => applyColor(c));
    return b;
  };
  const row = (label: string, colors: string[]) =>
    colors.length ? h('div', { class: 'color-row' }, h('span', { class: 'color-label' }, label), h('div', { class: 'color-swatches' }, colors.map(swatch))) : null;
  const native = h('input', { type: 'color', class: 'color-native', value: '#ff7a6e', 'aria-label': 'Pick any color' });
  native.addEventListener('change', () => isColor(native.value) && applyColor(native.value.toLowerCase()));
  const fillMenu = () => {
    colorMenu.replaceChildren(
      ...[row('Recent', recentColors(TEXT_RECENT_KEY)), row('Suggested', SUGGESTED_TEXT)].filter((x): x is HTMLDivElement => x !== null),
      h(
        'div',
        { class: 'fmt-color-actions' },
        h('label', { class: 'fmt-any' }, native, '+ Any color'),
        (() => {
          const none = h('button', { class: 'fmt-none', type: 'button' }, 'No color');
          none.addEventListener('mousedown', (e) => e.preventDefault());
          none.addEventListener('click', () => applyColor(null));
          return none;
        })(),
      ),
    );
  };

  const colorBtn = h('button', { class: 'fmt-btn fmt-color', type: 'button', title: 'Text color', 'aria-label': 'Text color' }, h('span', { class: 'fmt-color-a' }, 'A'));
  colorBtn.addEventListener('mousedown', (e) => e.preventDefault());
  colorBtn.addEventListener('click', () => {
    if (colorMenu.hidden) {
      capture();
      fillMenu();
    }
    colorMenu.hidden = !colorMenu.hidden;
  });
  scope.addEventListener('focusin', (e) => {
    if (!colorMenu.contains(e.target as Node)) colorMenu.hidden = true;
  });

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
