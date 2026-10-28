import './styles.css';
import { config } from './config';
import { initDrive } from './drive';
import { authState, onAuthChange, preloadAuth, reconnect, signOut } from './drive/auth';
import { closeLibrary, openLibrary } from './library/library';
import { clear, h } from './ui/dom';
import { errorText, toast } from './ui/feedback';
import { mountShell, type LibraryRef } from './ui/shell';
import { pickRootView, signInView } from './ui/views/setup';

const LIBS_KEY = 'viedex.libraries';
const CURRENT_KEY = 'viedex.current';
const app = document.getElementById('app')!;
let unmount: (() => void) | null = null;

// Demo data is regenerated on every load, so its folder IDs can't be remembered.
const memory = new Map<string, string>();
const store = {
  get(key: string): string | null {
    if (config.demo) return memory.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    if (config.demo) return void memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      toast('This browser blocks storage, so your libraries will not be remembered.', 'error');
    }
  },
};

function libraries(): LibraryRef[] {
  try {
    const list = JSON.parse(store.get(LIBS_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const saveLibraries = (list: LibraryRef[]) => store.set(LIBS_KEY, JSON.stringify(list));

function current(list: LibraryRef[]): LibraryRef | null {
  const id = store.get(CURRENT_KEY);
  return list.find((l) => l.id === id) ?? list[0] ?? null;
}

function addLibrary(lib: LibraryRef) {
  const list = libraries();
  if (!list.some((l) => l.id === lib.id)) saveLibraries([...list, lib]);
  switchTo(lib.id);
}

function switchTo(id: string) {
  store.set(CURRENT_KEY, id);
  history.replaceState(null, '', '#/');
  start();
}

function removeLibrary(id: string) {
  saveLibraries(libraries().filter((l) => l.id !== id));
  if (store.get(CURRENT_KEY) === id) store.set(CURRENT_KEY, '');
  history.replaceState(null, '', '#/');
  start();
}

function start() {
  unmount?.();
  unmount = null;
  closeLibrary();

  if (authState() === 'signed-out') {
    clear(app, signInView());
    return;
  }
  const list = libraries();
  const lib = current(list);
  if (!lib) {
    clear(app, pickRootView(addLibrary));
    return;
  }
  unmount = mountShell(app, { libraries: list, current: lib, switchTo, addLibrary, removeLibrary, signOut });
  openLibrary(lib.id).catch((err) => toast(errorText(err), 'error'));
}

// A banner instead of a surprise popup: renewing the token needs a click.
const banner = h(
  'div',
  { class: 'banner', role: 'alert', hidden: true },
  h('span', null, 'Your Google session expired.'),
  h('button', { class: 'btn btn-primary btn-small', onclick: () => reconnect().catch((err) => toast(errorText(err), 'error')) }, 'Reconnect'),
);
document.body.append(banner);

let lastState = authState();
onAuthChange((s) => {
  banner.hidden = s !== 'expired';
  // Moving between signed-in and expired keeps the current screen.
  const flipped = (s === 'signed-out') !== (lastState === 'signed-out');
  lastState = s;
  if (flipped) start();
});

await initDrive();
if (!config.demo && config.clientId) preloadAuth().catch(() => {});
start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
