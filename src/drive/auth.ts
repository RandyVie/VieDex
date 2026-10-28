import { config } from '../config';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const SESSION_KEY = 'kb.session';
// Renew a minute early so a request never starts with a token about to expire.
const EARLY_MS = 60_000;

export type AuthState = 'signed-out' | 'signed-in' | 'expired';

export class AuthError extends Error {}

interface Session {
  token: string;
  expiresAt: number;
}

interface Pending {
  promise: Promise<string>;
  resolve: (token: string) => void;
  reject: (err: Error) => void;
}

let session: Session | null = loadSession();
let client: google.accounts.oauth2.TokenClient | null = null;
let gisLoading: Promise<void> | null = null;
let pending: Pending | null = null;
let waiters: Array<(token: string) => void> = [];
let state: AuthState = session ? 'signed-in' : 'signed-out';
const listeners = new Set<(s: AuthState) => void>();

export const authState = () => state;

export function onAuthChange(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(next: AuthState) {
  if (next === state) return;
  state = next;
  listeners.forEach((fn) => fn(next));
}

// sessionStorage, not localStorage: a reload within the hour skips the popup,
// but the token is gone once the tab closes.
function loadSession(): Session | null {
  if (config.demo) return null;
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    return s && s.expiresAt - EARLY_MS > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the session just won't survive a reload.
  }
}

/** Load the GIS script early so a later click can open the popup synchronously. */
export function preloadAuth(): Promise<void> {
  if (config.demo) return Promise.resolve();
  gisLoading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoading = null;
      reject(new AuthError('Could not load Google sign-in.'));
    };
    document.head.append(script);
  }).then(() => {
    client ??= google.accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: config.scope,
      callback: onToken,
      error_callback: (e) => settle(new AuthError(e.message ?? e.type)),
    });
  });
  return gisLoading;
}

function onToken(r: google.accounts.oauth2.TokenResponse) {
  if (r.error) return settle(new AuthError(r.error_description ?? r.error));
  if (!google.accounts.oauth2.hasGrantedAllScopes(r, config.scope)) {
    return settle(new AuthError('Drive access was not granted.'));
  }
  session = { token: r.access_token, expiresAt: Date.now() + r.expires_in * 1000 };
  saveSession(session);
  setState('signed-in');
  settle(null, r.access_token);
}

function settle(err: Error | null, token?: string) {
  const p = pending;
  pending = null;
  if (err) p?.reject(err);
  else if (token) {
    p?.resolve(token);
    const queued = waiters;
    waiters = [];
    queued.forEach((fn) => fn(token));
  }
}

function requestToken(): Promise<string> {
  if (pending) return pending.promise;
  if (!client) return Promise.reject(new AuthError('Sign-in is not ready yet.'));
  let resolve!: (t: string) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  pending = { promise, resolve, reject };
  client.requestAccessToken({ prompt: '' });
  return promise;
}

/** Call from a click handler: the token flow opens a popup. */
export async function signIn(): Promise<void> {
  if (config.demo) {
    session = { token: 'demo', expiresAt: Number.MAX_SAFE_INTEGER };
    setState('signed-in');
    return;
  }
  if (!client) await preloadAuth();
  await requestToken();
}

/** Same as signIn, used when an expired session needs a click to renew. */
export const reconnect = signIn;

export async function getAccessToken(): Promise<string> {
  if (session && session.expiresAt - EARLY_MS > Date.now()) return session.token;
  if (state === 'signed-out') throw new AuthError('Not signed in.');
  try {
    // Without a click the popup is usually blocked, but some browsers allow a silent renew.
    await preloadAuth();
    return await requestToken();
  } catch {
    setState('expired');
    return new Promise((resolve) => waiters.push(resolve));
  }
}

/** Drop a token the API rejected so the next call renews it. */
export function invalidateToken() {
  session = null;
  saveSession(null);
}

export function signOut() {
  if (session && !config.demo && typeof google !== 'undefined') {
    google.accounts.oauth2.revoke(session.token);
  }
  session = null;
  saveSession(null);
  setState('signed-out');
}
