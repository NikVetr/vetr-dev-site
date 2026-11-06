// Generated local copies keep the standalone server, offline shell and native app
// self-contained. The site-wide implementation remains in ../../shared/.
import { readFile, writeFile } from 'node:fs/promises';

/** @param {{check?: boolean}} [options] */
export async function syncCollectionNavigation({ check = false } = {}) {
  for (const extension of ['css', 'js']) {
    const source = new URL(`../../shared/tool-nav.${extension}`, import.meta.url);
    const target = new URL(`../ui/collection-nav.${extension}`, import.meta.url);
    const bytes = await readFile(source);
    let current;
    try { current = await readFile(target); }
    catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
    }
    if (current?.equals(bytes)) continue;
    if (check) throw new Error(`ui/collection-nav.${extension} is stale; run npm run shell`);
    await writeFile(target, bytes);
  }
}
