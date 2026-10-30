import { driveFetch } from './http';
import { FOLDER_MIME, type ChangePage, type DriveBackend, type DriveChange, type DriveFile } from './types';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,mimeType,parents,modifiedTime,size,trashed,thumbnailLink,webViewLink,properties,folderColorRgb';

// IDs go into query strings; refuse anything that isn't a plain Drive ID.
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error('Invalid Drive ID');
  return id;
}

async function listAll(q: string, extra: Record<string, string> = {}): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      fields: `nextPageToken,files(${FIELDS})`,
      pageSize: '1000',
      spaces: 'drive',
      ...extra,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const body = await (await driveFetch(`${API}/files?${params}`)).json();
    out.push(...body.files);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return out;
}

export const googleDrive: DriveBackend = {
  listChildren(folderId, foldersOnly = false) {
    const q = `'${safeId(folderId)}' in parents and trashed = false` + (foldersOnly ? ` and mimeType = '${FOLDER_MIME}'` : '');
    return listAll(q, { orderBy: 'folder,name' });
  },

  async getMeta(id) {
    return (await driveFetch(`${API}/files/${safeId(id)}?fields=${FIELDS}`)).json();
  },

  async downloadText(id) {
    return (await driveFetch(`${API}/files/${safeId(id)}?alt=media`)).text();
  },

  async downloadBlob(id) {
    return (await driveFetch(`${API}/files/${safeId(id)}?alt=media`)).blob();
  },

  async updateText(id, text, mimeType) {
    const res = await driveFetch(`${UPLOAD}/files/${safeId(id)}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': `${mimeType}; charset=UTF-8` },
      body: text,
    });
    return res.json();
  },

  async createText(parentId, name, text, mimeType) {
    const boundary = `viedex${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name, mimeType, parents: [safeId(parentId)] });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
    const res = await driveFetch(`${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return res.json();
  },

  // Resumable upload: a simple (multipart) upload stops at 5 MB, attachments can be bigger.
  async createBlob(parentId, name, blob) {
    const type = blob.type || 'application/octet-stream';
    const start = await driveFetch(`${UPLOAD}/files?uploadType=resumable&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': type, 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify({ name, parents: [safeId(parentId)] }),
    });
    const session = start.headers.get('Location');
    if (!session) throw new Error('Drive did not start the upload.');
    const res = await driveFetch(session, { method: 'PUT', headers: { 'Content-Type': type }, body: blob });
    return res.json();
  },

  async trash(id) {
    await driveFetch(`${API}/files/${safeId(id)}?fields=id`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
  },

  async createFolder(parentId, name, extra = {}) {
    const res = await driveFetch(`${API}/files?fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [safeId(parentId)], ...extra }),
    });
    return res.json();
  },

  async updateFolder(id, extra) {
    const res = await driveFetch(`${API}/files/${safeId(id)}?fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extra),
    });
    return res.json();
  },

  async startPageToken() {
    return (await (await driveFetch(`${API}/changes/startPageToken`)).json()).startPageToken;
  },

  async listChanges(startToken): Promise<ChangePage> {
    const changes: DriveChange[] = [];
    let pageToken: string = startToken;
    for (;;) {
      const params = new URLSearchParams({
        pageToken,
        pageSize: '1000',
        spaces: 'drive',
        includeRemoved: 'true',
        fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FIELDS}))`,
      });
      const body = await (await driveFetch(`${API}/changes?${params}`)).json();
      changes.push(...body.changes);
      if (body.newStartPageToken) return { changes, newStartPageToken: body.newStartPageToken };
      pageToken = body.nextPageToken;
    }
  },

  listModifiedSince(iso) {
    const stamp = new Date(iso).toISOString();
    return listAll(`modifiedTime > '${stamp}' and trashed = false`);
  },
};
