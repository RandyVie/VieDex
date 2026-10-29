// Suggestions for a comma-separated tags field: tags already used in the library,
// most used first, matching what is being typed after the last comma.
import { getIndex } from '../library/library';
import { h } from './dom';

const MAX = 8;

function knownTags(): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const f of Object.values(getIndex()?.files ?? {})) {
    for (const t of f.tags) {
      const key = t.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count++;
      else counts.set(key, { tag: t, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Wrap a tags input so it suggests existing tags. Returns the element to place instead of the input. */
export function withTagSuggestions(input: HTMLInputElement): HTMLElement {
  const list = h('ul', { class: 'suggest', role: 'listbox', hidden: true });
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  let items: string[] = [];
  let active = 0;

  // The part after the last comma is what is being typed; the rest is done.
  const parts = () => {
    const at = input.value.lastIndexOf(',');
    return { done: at === -1 ? '' : input.value.slice(0, at + 1), typing: input.value.slice(at + 1).trim() };
  };

  const close = () => {
    list.hidden = true;
    items = [];
  };

  const show = () => {
    const { done, typing } = parts();
    const taken = new Set(done.split(',').map((t) => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean));
    const q = typing.replace(/^#/, '').toLowerCase();
    items = knownTags()
      .filter(({ tag }) => !taken.has(tag.toLowerCase()) && tag.toLowerCase() !== q && (!q || tag.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.tag.toLowerCase().startsWith(q)) - Number(a.tag.toLowerCase().startsWith(q)))
      .slice(0, MAX)
      .map(({ tag }) => tag);
    active = 0;
    if (!items.length) return close();
    list.replaceChildren(
      ...items.map((tag, i) => {
        const li = h('li', { class: `suggest-item${i === active ? ' is-active' : ''}`, role: 'option' }, `#${tag}`);
        // mousedown, not click: picking must happen before the input loses focus.
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          pick(tag);
        });
        return li;
      }),
    );
    list.hidden = false;
  };

  const highlight = () => list.querySelectorAll('.suggest-item').forEach((li, i) => li.classList.toggle('is-active', i === active));

  const pick = (tag: string) => {
    const { done } = parts();
    input.value = `${done}${done ? ' ' : ''}${tag}, `;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    show();
  };

  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(close, 100));
  input.addEventListener('keydown', (e) => {
    if (list.hidden || !items.length) return;
    if (e.key === 'ArrowDown') active = (active + 1) % items.length;
    else if (e.key === 'ArrowUp') active = (active - 1 + items.length) % items.length;
    else if (e.key === 'Enter' || (e.key === 'Tab' && parts().typing)) pick(items[active]);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
    highlight();
  });

  return h('div', { class: 'suggest-wrap' }, input, list);
}
