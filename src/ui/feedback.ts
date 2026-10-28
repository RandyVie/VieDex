import { h } from './dom';

let toastBox: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'error' = 'info') {
  toastBox ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: `toast toast-${kind}` }, message);
  toastBox.append(el);
  setTimeout(() => el.classList.add('is-leaving'), kind === 'error' ? 5000 : 2500);
  setTimeout(() => el.remove(), kind === 'error' ? 5400 : 2900);
}

export function confirmDialog(message: string, okLabel = 'Continue', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    // Resolve on click, not on the close event, which can arrive late in a background tab.
    const done = (ok: boolean) => {
      if (!settled) resolve(ok);
      settled = true;
      dialog.close();
    };
    const dialog = h(
      'dialog',
      { class: 'dialog' },
      h('p', null, message),
      h(
        'div',
        { class: 'dialog-actions' },
        h('button', { class: 'btn', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: danger ? 'btn btn-danger' : 'btn btn-primary', onclick: () => done(true) }, okLabel),
      ),
    );
    dialog.addEventListener('close', () => {
      if (!settled) resolve(false);
      settled = true;
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
