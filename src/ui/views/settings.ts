import { config } from '../../config';
import { getIndex, lastSync, rebuild, refresh } from '../../library/library';
import { formatTime, h, icon } from '../dom';
import { confirmDialog, errorText, toast } from '../feedback';
import { colorField, rememberColor } from '../colors';
import type { LibraryRef, ShellHost } from '../shell';
import { ACCENT_RECENT_KEY, DEFAULT_ACCENT, loadAccent, saveAccent } from '../theme';
import type { View } from './view';

const ACCENT_SUGGESTED = [DEFAULT_ACCENT, '#ffcf5c', '#ff8f6b', '#ff6b9a', '#c49bff', '#8ab4ff', '#5ce0c6', '#e8e9eb'];

function appearance(): HTMLElement {
  const box = h('div', { class: 'card appearance' });
  const build = () => {
    const field = colorField(loadAccent(), {
      recentKey: ACCENT_RECENT_KEY,
      suggested: ACCENT_SUGGESTED,
      onChange: saveAccent,
      onPick: (c) => rememberColor(c, ACCENT_RECENT_KEY),
    });
    const reset = h('button', { class: 'btn btn-small' }, 'Reset to green');
    reset.addEventListener('click', () => {
      saveAccent(DEFAULT_ACCENT);
      build();
    });
    box.replaceChildren(field.el, h('div', { class: 'inline' }, reset));
  };
  build();
  return box;
}

export function settingsView(host: ShellHost): View {
  const index = getIndex();
  const action = (label: string, run: () => Promise<void>, cls = 'btn') => {
    const b = h('button', { class: cls }, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await run();
      } catch (err) {
        toast(errorText(err), 'error');
      } finally {
        b.disabled = false;
      }
    });
    return b;
  };
  const row = (label: string, value: string) => h('div', { class: 'kv' }, h('dt', null, label), h('dd', null, value));
  const libRow = (lib: LibraryRef) =>
    h(
      'div',
      { class: 'kv' },
      h('dt', null, lib.name, lib.id === host.current.id && h('span', { class: 'pill' }, 'open')),
      h(
        'dd',
        { class: 'inline' },
        lib.id !== host.current.id && action('Open', async () => host.switchTo(lib.id), 'btn btn-small'),
        action(
          'Remove',
          async () => {
            if (await confirmDialog(`Remove "${lib.name}" from VieDex? The folder and its files stay in Drive.`, 'Remove', true)) host.removeLibrary(lib.id);
          },
          'btn btn-small',
        ),
      ),
    );

  return {
    live: true,
    el: h(
      'section',
      { class: 'view view-narrow' },
      h('header', { class: 'view-head' }, h('h1', null, 'Settings')),
      h('h2', { class: 'section-title' }, 'Libraries'),
      h('p', { class: 'muted' }, 'Each library is one folder in your Drive. Libraries never link to each other.'),
      h('dl', { class: 'card' }, host.libraries.map(libRow)),
      h('div', { class: 'inline spaced' }, h('a', { class: 'btn', href: '#/add-library' }, icon('plus'), 'Add library')),
      h('h2', { class: 'section-title' }, 'Appearance'),
      h('p', { class: 'muted' }, 'The accent color for buttons, active items and highlights. Saved on this device.'),
      appearance(),
      h('h2', { class: 'section-title' }, 'This library'),
      h(
        'dl',
        { class: 'card' },
        row('Documents', String(index ? Object.values(index.files).filter((f) => f.kind === 'document').length : 0)),
        row('Blocks', String(index ? Object.values(index.files).reduce((n, f) => n + f.blocks.length, 0) : 0)),
        row('Last sync', formatTime(lastSync())),
        row('Mode', config.demo ? 'Demo (in memory)' : 'Google Drive'),
      ),
      h('p', { class: 'muted' }, 'Refresh picks up what changed in Drive. Rebuild reads every file again, use it if something looks off.'),
      h('div', { class: 'inline' }, action('Refresh now', refresh), action('Rebuild index', rebuild)),
      h('h2', { class: 'section-title' }, 'Account'),
      h(
        'div',
        { class: 'inline' },
        action('Sign out', async () => {
          if (await confirmDialog('Sign out of VieDex on this device?', 'Sign out')) host.signOut();
        }),
      ),
    ),
  };
}
