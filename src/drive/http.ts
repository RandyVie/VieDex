import { getAccessToken, invalidateToken } from './auth';

export class DriveError extends Error {
  constructor(
    public status: number,
    message: string,
    public reason?: string,
  ) {
    super(message);
  }
}

// Drive's per-user quota is generous, but a full rebuild can fire hundreds of requests.
const MAX_IN_FLIGHT = 4;
const MAX_RETRIES = 5;
let inFlight = 0;
const queue: Array<() => void> = [];

async function acquire() {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => queue.push(r));
  inFlight++;
}

function release() {
  inFlight--;
  queue.shift()?.();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readError(res: Response): Promise<{ message: string; reason?: string }> {
  try {
    const body = await res.json();
    return { message: body?.error?.message ?? res.statusText, reason: body?.error?.errors?.[0]?.reason };
  } catch {
    return { message: res.statusText };
  }
}

export async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  await acquire();
  try {
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await getAccessToken()}`);
      const res = await fetch(url, { ...init, headers });
      if (res.ok) return res;

      if (res.status === 401 && !renewed) {
        renewed = true;
        invalidateToken();
        continue;
      }
      const { message, reason } = await readError(res);
      const rateLimited = res.status === 403 && /rateLimit/i.test(reason ?? '');
      if ((res.status === 429 || res.status >= 500 || rateLimited) && attempt < MAX_RETRIES) {
        await sleep(2 ** attempt * 500 + Math.random() * 250);
        continue;
      }
      throw new DriveError(res.status, message, reason);
    }
  } finally {
    release();
  }
}
