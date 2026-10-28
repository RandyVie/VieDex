import { config } from '../../config';
import { picker, type DriveFile } from '../../drive';
import { signIn } from '../../drive/auth';
import { clear, h, icon } from '../dom';
import { errorText, toast } from '../feedback';
import { loading } from '../components';

const brand = () => h('div', { class: 'setup-brand' }, h('img', { src: './icons/icon.svg', alt: '', width: 40, height: 40 }), h('span', null, 'VieDex'));

export function signInView(): HTMLElement {
  if (!config.clientId && !config.demo) {
    return h(
      'main',
      { class: 'setup' },
      brand(),
      h('h1', null, 'Almost ready'),
      h('p', null, 'Add your Google OAuth client ID to ', h('code', null, '.env.local'), ' and restart the dev server:'),
      h('pre', null, 'VITE_GOOGLE_CLIENT_ID=1234-abcd.apps.googleusercontent.com'),
      h('p', { class: 'muted' }, 'The README walks through creating one. To look around first, run ', h('code', null, 'npm run demo'), '.'),
    );
  }
  const button = h('button', { class: 'btn btn-primary btn-lg' }, config.demo ? 'Open demo library' : 'Sign in with Google');
  const note = config.demo
    ? h('p', { class: 'muted' }, 'Demo mode. Data lives in memory and resets on reload.')
    : h('p', { class: 'muted' }, 'Google will warn that the app is unverified. That is expected for a private app in testing mode.');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await signIn();
    } catch (err) {
      toast(errorText(err), 'error');
      button.disabled = false;
    }
  });
  return h(
    'main',
    { class: 'setup' },
    brand(),
    h('h1', null, 'Your books, documents and notes, kept in Google Drive.'),
    h('p', null, 'Each library is a folder in your Drive. Edit there or here, both stay in sync.'),
    button,
    note,
  );
}

function folderIdFromInput(raw: string): string | null {
  const s = raw.trim();
  const fromUrl = /\/folders\/([A-Za-z0-9_-]+)/.exec(s)?.[1] ?? /[?&]id=([A-Za-z0-9_-]+)/.exec(s)?.[1];
  if (fromUrl) return fromUrl;
  return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : null;
}

/** Browse My Drive to choose a folder for a library. */
export function pickRootView(onPick: (folder: { id: string; name: string }) => void, embedded = false): HTMLElement {
  const trail: Array<{ id: string; name: string }> = [{ id: 'root', name: 'My Drive' }];
  const list = h('div', { class: 'picker-list' });
  const crumbs = h('div', { class: 'crumbs' });
  const current = () => trail[trail.length - 1];
  const useBtn = h('button', { class: 'btn btn-primary' });

  async function show() {
    clear(
      crumbs,
      trail.map((t, i) => [
        i > 0 && h('span', { class: 'crumb-sep' }, '/'),
        h('button', { class: 'linklike', onclick: () => (trail.splice(i + 1), show()) }, t.name),
      ]),
    );
    useBtn.textContent = current().id === 'root' ? 'Pick a folder below' : `Use "${current().name}"`;
    useBtn.disabled = current().id === 'root';
    clear(list, loading('Loading folders'));
    try {
      const folders: DriveFile[] = await picker.listFolders(current().id);
      clear(
        list,
        folders.length
          ? folders.map((f) =>
              h('button', { class: 'picker-row', onclick: () => (trail.push({ id: f.id, name: f.name }), show()) }, icon('folder'), h('span', null, f.name), icon('chevron')),
            )
          : h('p', { class: 'muted picker-empty' }, 'No folders here.'),
      );
    } catch (err) {
      clear(list, h('p', { class: 'error' }, errorText(err)));
    }
  }

  useBtn.addEventListener('click', () => onPick(current()));

  const newName = h('input', { class: 'input', placeholder: 'New folder name', value: 'My library' });
  const create = h('button', { class: 'btn' }, icon('plus'), 'Create here');
  create.addEventListener('click', async () => {
    const name = newName.value.trim();
    if (!name) return;
    create.disabled = true;
    try {
      const f = await picker.createFolder(current().id, name);
      trail.push({ id: f.id, name: f.name });
      await show();
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      create.disabled = false;
    }
  });

  const pasted = h('input', { class: 'input', placeholder: 'Or paste a Drive folder link' });
  const openPasted = h('button', { class: 'btn' }, 'Open');
  openPasted.addEventListener('click', async () => {
    const id = folderIdFromInput(pasted.value);
    if (!id) return toast('That does not look like a folder link.', 'error');
    try {
      const f = await picker.getFolder(id);
      trail.splice(1, trail.length, { id: f.id, name: f.name });
      await show();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  });

  show();
  return h(
    'main',
    { class: embedded ? 'setup setup-wide setup-embedded' : 'setup setup-wide' },
    !embedded && brand(),
    h('h1', null, embedded ? 'Add a library' : 'Choose a folder for your first library'),
    h('p', null, 'A library is one Drive folder. Its top-level folders become books. VieDex never reads or writes outside the library you have open.'),
    h('div', { class: 'picker' }, crumbs, list, h('div', { class: 'picker-actions' }, h('div', { class: 'inline' }, newName, create), useBtn)),
    h('div', { class: 'inline' }, pasted, openPasted),
  );
}
