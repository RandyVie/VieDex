import type { DriveFile } from '../drive';

const TEXT_EXT = new Set(
  'md markdown txt text csv js mjs cjs ts tsx jsx css scss sass less html htm json py rb go rs java kt swift c h cpp hpp cs php sh zsh bash fish sql yml yaml toml xml lua r dart vue svelte'.split(' '),
);

export const extOf = (name: string) => (/\.([^./]+)$/.exec(name)?.[1] ?? '').toLowerCase();
export const stripExt = (name: string) => name.replace(/\.[^./]+$/, '') || name;

export const isImage = (f: Pick<DriveFile, 'mimeType'>) => f.mimeType.startsWith('image/');
export const isMarkdown = (f: Pick<DriveFile, 'name' | 'mimeType'>) =>
  ['md', 'markdown'].includes(extOf(f.name)) || f.mimeType === 'text/markdown';
export const isHtml = (f: Pick<DriveFile, 'name' | 'mimeType'>) =>
  ['html', 'htm'].includes(extOf(f.name)) || f.mimeType === 'text/html';

export function isTextLike(f: Pick<DriveFile, 'name' | 'mimeType'>): boolean {
  if (f.mimeType.startsWith('application/vnd.google-apps')) return false;
  return f.mimeType.startsWith('text/') || f.mimeType === 'application/json' || TEXT_EXT.has(extOf(f.name));
}
