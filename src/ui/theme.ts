// The app's accent color. A per-device display preference, like Show blocks and Focus.
export const DEFAULT_ACCENT = '#c8f560';
export const ACCENT_RECENT_KEY = 'viedex.recentAccentColors';
const KEY = 'viedex.accent';

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);

export function loadAccent(): string {
  try {
    const c = localStorage.getItem(KEY) ?? '';
    return isHex(c) ? c.toLowerCase() : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

/** Dark text on light accents, white on dark ones, so accent buttons stay readable. */
function inkFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.3 ? '#0e0f11' : '#ffffff';
}

/** Set the accent on the page. Every other accent shade is derived from it in CSS. */
export function applyAccent(color: string) {
  const c = isHex(color) ? color.toLowerCase() : DEFAULT_ACCENT;
  const root = document.documentElement.style;
  root.setProperty('--accent', c);
  root.setProperty('--accent-ink', inkFor(c));
}

export function saveAccent(color: string) {
  applyAccent(color);
  try {
    if (color.toLowerCase() === DEFAULT_ACCENT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, color.toLowerCase());
  } catch {
    // Storage blocked: the accent lasts until the page reloads.
  }
}
