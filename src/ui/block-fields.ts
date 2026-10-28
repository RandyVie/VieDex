// Editing fields per block type, so nobody has to type fences, URLs on their own
// line or `![[file]]` by hand. Each returns the block content as Markdown.
import { mediaByName } from '../library/derived';
import { firstUrl, mediaRefs, type BlockType } from '../md/blocks';
import { clear, h, icon } from './dom';
import { mediaImage } from './media';
import { pickMedia } from './pickers';
import { richField } from './rich';

export interface Fields {
  el: HTMLElement;
  value(): string;
  focus(): void;
}

const FENCE_RE = /^```([\w+-]*)[ \t]*\n([\s\S]*?)\n?```[ \t]*$/;
const MEDIA_LINE_RE = /^\s*!\[\[[^\]^][^\]]*\]\]\s*$/;

/** A textarea that grows with its content instead of scrolling. */
export function autoGrow(area: HTMLTextAreaElement): HTMLTextAreaElement {
  const fit = () => {
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 2}px`;
  };
  area.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return area;
}

function area(value: string, placeholder: string, cls = 'field-area') {
  const a = autoGrow(h('textarea', { class: cls, placeholder, rows: 2, spellcheck: 'true' }));
  a.value = value;
  return a;
}

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  note: 'Write a note: a thought, a quote, a source.',
  list: '- First item\n- Second item',
};

export function blockFields(type: BlockType, content: string, onChange: () => void): Fields {
  if (type === 'image') {
    let name = mediaRefs(content)[0] ?? '';
    const caption = textField(
      content
        .split('\n')
        .filter((l) => !MEDIA_LINE_RE.test(l))
        .join('\n')
        .trim(),
      'Caption (optional)',
      onChange,
    );
    const preview = h('div', { class: 'field-image' });
    const choose = async () => {
      const picked = await pickMedia();
      if (!picked) return;
      name = picked;
      show();
      onChange();
    };
    const show = () => {
      const id = name ? mediaByName(name) : null;
      clear(
        preview,
        id
          ? [mediaImage(id, name, 900), h('button', { class: 'btn btn-small field-image-change', type: 'button', onclick: choose }, icon('image'), 'Change image')]
          : h('button', { class: 'field-image-empty', type: 'button', onclick: choose }, icon('image'), name ? `Missing: ${name}. Choose another image` : 'Choose an image'),
      );
    };
    show();
    return {
      el: h('div', { class: 'fields' }, preview, caption.el),
      value: () => [name && `![[${name}]]`, caption.value().trim()].filter(Boolean).join('\n'),
      focus: () => caption.focus(),
    };
  }

  if (type === 'code') {
    const m = FENCE_RE.exec(content.trim());
    const lang = h('input', { class: 'field-lang', placeholder: 'language', value: m ? m[1] : '', 'aria-label': 'Language' });
    const code = area(m ? m[2] : content, 'Paste or write code', 'field-area field-code');
    code.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      e.preventDefault();
      code.setRangeText('  ', code.selectionStart, code.selectionEnd, 'end');
      onChange();
    });
    [lang, code].forEach((el) => el.addEventListener('input', onChange));
    return {
      el: h('div', { class: 'fields' }, lang, code),
      value: () => `\`\`\`${lang.value.trim()}\n${code.value.replace(/\n+$/, '')}\n\`\`\``,
      focus: () => code.focus(),
    };
  }

  if (type === 'link') {
    // Only split when the URL sits on its own line; otherwise keep the text as written.
    const lines = content.split('\n');
    const url0 = firstUrl(content);
    const at = url0 ? lines.findIndex((l) => l.trim() === url0) : -1;
    if (at >= 0 || !content.trim()) {
      const url = h('input', { class: 'field-url', type: 'url', placeholder: 'https://', value: url0 ?? '', 'aria-label': 'URL' });
      const note = textField(lines.filter((_, i) => i !== at).join('\n').trim(), 'Why this link matters (optional)', onChange);
      url.addEventListener('input', onChange);
      return {
        el: h('div', { class: 'fields' }, url, note.el),
        value: () => [url.value.trim(), note.value().trim()].filter(Boolean).join('\n'),
        focus: () => url.focus(),
      };
    }
  }

  const text = textField(content, PLACEHOLDER[type] ?? 'Write here', onChange);
  return { el: h('div', { class: 'fields' }, text.el), value: () => text.value().replace(/\s+$/, ''), focus: () => text.focus() };
}

/** Live formatted text when the content allows it, otherwise a plain text field. */
function textField(value: string, placeholder: string, onChange: () => void): { el: HTMLElement; value(): string; focus(): void } {
  const rich = richField(value, placeholder, onChange, 'field-rich');
  if (rich) return rich;
  const a = area(value, placeholder);
  a.addEventListener('input', onChange);
  return { el: a, value: () => a.value, focus: () => a.focus() };
}
