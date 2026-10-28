// Delete flows shared by document pages, lists and block views.
import { blockById, usedIn } from '../library/derived';
import { BLOCK_LABEL } from '../library/layout';
import { getIndex } from '../library/library';
import { deleteBlock, deleteDocument } from '../library/writes';
import { displayTitle } from '../md/blocks';
import { confirmDialog, errorText, toast } from './feedback';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Ask, then trash the document. Resolves true when it was deleted. */
export async function confirmDeleteDoc(id: string): Promise<boolean> {
  const f = getIndex()?.files[id];
  if (!f) return false;
  const kept = f.blocks.length ? ` Its ${plural(f.blocks.length, 'block')} will be kept in the block collections.` : '';
  if (!(await confirmDialog(`Delete "${f.title}"? The file goes to your Google Drive trash, where you can restore it.${kept}`, 'Delete', true))) return false;
  try {
    await deleteDocument(id);
    toast('Document deleted');
    return true;
  } catch (err) {
    toast(errorText(err), 'error');
    return false;
  }
}

/** Ask, then delete the block, leaving its text behind wherever it appeared. */
export async function confirmDeleteBlock(id: string): Promise<boolean> {
  const b = blockById(id);
  if (!b) return false;
  const home = getIndex()?.files[b.fileId];
  const others = usedIn(id).filter((f) => f !== b.fileId).length;
  const places = (home?.kind === 'document' ? 1 : 0) + others;
  const label = BLOCK_LABEL[b.type].one.toLowerCase();
  const where = places
    ? ` In the ${plural(places, 'document')} where it appears, its text stays as normal text.`
    : ' It is not used in any document.';
  if (!(await confirmDialog(`Delete the ${label} "${displayTitle(b)}"?${where}`, 'Delete', true))) return false;
  try {
    await deleteBlock(id);
    toast(`${BLOCK_LABEL[b.type].one} deleted`);
    return true;
  } catch (err) {
    toast(errorText(err), 'error');
    return false;
  }
}
