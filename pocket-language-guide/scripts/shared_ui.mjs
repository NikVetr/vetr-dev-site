// Generated local copies keep the standalone server, offline shell and native app
// self-contained. The site-wide implementation remains in ../../shared/.
import { readFile, writeFile } from 'node:fs/promises';

/** @param {{check?: boolean}} [options] */
export async function syncSharedUI({ check = false } = {}) {
  for (const [name, local] of [['tool-nav', 'collection-nav'], ['light-switch', 'light-switch']]) for (const extension of ['css', 'js']) {
    const source = new URL(`../../shared/${name}.${extension}`, import.meta.url);
    const target = new URL(`../ui/${local}.${extension}`, import.meta.url);
    const bytes = await readFile(source);
    let current;
    try { current = await readFile(target); }
    catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
    }
    if (current?.equals(bytes)) continue;
    if (check) throw new Error(`ui/${local}.${extension} is stale; run npm run shell`);
    await writeFile(target, bytes);
  }
}
