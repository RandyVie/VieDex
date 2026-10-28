// Book colors: a picker with suggestions and the 10 most recent picks on this device.
import { h, icon } from './dom';

export const DEFAULT_BOOK_COLOR = '#c8f560';
const RECENT_KEY = 'viedex.recentColors';
/** Text colors have their own recent list, apart from book colors. */
export const TEXT_RECENT_KEY = 'viedex.recentTextColors';
const MAX_RECENT = 10;
const SUGGESTED = ['#c8f560', '#ffcf5c', '#ff8f6b', '#ff6b9a', '#c49bff', '#8ab4ff', '#5ce0c6', '#a4a8b0'];

export const isColor = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

export function recentColors(key = RECENT_KEY): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((c) => typeof c === 'string' && isColor(c)) : [];
  } catch {
    return [];
  }
}

export function rememberColor(color: string, key = RECENT_KEY) {
  const c = color.toLowerCase();
  try {
    localStorage.setItem(key, JSON.stringify([c, ...recentColors(key).filter((x) => x.toLowerCase() !== c)].slice(0, MAX_RECENT)));
  } catch {
    // Storage blocked: recent colors just won't be remembered.
  }
}

export interface ColorField {
  el: HTMLElement;
  value(): string;
}

export interface ColorFieldOptions {
  /** Which recent list to show (books, text and accent each keep their own). */
  recentKey?: string;
  suggested?: string[];
  /** Every change, also while dragging in the system picker. */
  onChange?: (color: string) => void;
  /** A finished pick: a swatch click, or closing the system picker. */
  onPick?: (color: string) => void;
}

/** Swatches plus a full picker. The chosen color shows as a large preview. */
export function colorField(initial: string, opts: ColorFieldOptions = {}): ColorField {
  let value = isColor(initial) ? initial.toLowerCase() : DEFAULT_BOOK_COLOR;
  const preview = h('span', { class: 'color-preview' });
  const hex = h('span', { class: 'color-hex' });
  const native = h('input', { type: 'color', class: 'color-native', value, 'aria-label': 'Pick any color' });
  const swatchRows = h('div', { class: 'color-rows' });

  const set = (c: string, final = false) => {
    value = c.toLowerCase();
    opts.onChange?.(value);
    if (final) opts.onPick?.(value);
    preview.style.setProperty('--swatch', value);
    hex.textContent = value;
    native.value = value;
    swatchRows.querySelectorAll<HTMLButtonElement>('.color-swatch').forEach((b) => b.classList.toggle('is-picked', b.dataset.color === value));
  };

  const row = (label: string, colors: string[]) => {
    if (!colors.length) return null;
    return h(
      'div',
      { class: 'color-row' },
      h('span', { class: 'color-label' }, label),
      h(
        'div',
        { class: 'color-swatches' },
        colors.map((c) => {
          const b = h('button', { class: 'color-swatch', type: 'button', 'data-color': c.toLowerCase(), title: c, 'aria-label': `Color ${c}`, onclick: () => set(c, true) });
          b.style.setProperty('--swatch', c);
          return b;
        }),
      ),
    );
  };

  swatchRows.append(...[row('Recent', recentColors(opts.recentKey)), row('Suggested', opts.suggested ?? SUGGESTED)].filter((x): x is HTMLDivElement => x !== null));
  native.addEventListener('input', () => set(native.value));
  native.addEventListener('change', () => set(native.value, true));
  set(value);

  return {
    el: h(
      'div',
      { class: 'color-field' },
      h('label', { class: 'color-current', title: 'Pick any color' }, preview, hex, native, h('span', { class: 'color-more' }, icon('settings'), 'Any color')),
      swatchRows,
    ),
    value: () => value,
  };
}
