import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Hash names and contents, in stable order; timestamps never establish freshness.
 * @param {string} root @param {string[]} paths */
async function digest(root, paths) {
  const hash = createHash('sha256');
  /** @param {string} path */
  async function visit(path) {
    hash.update(`${path}\0`);
    let entries;
    try { entries = await readdir(join(root, path), { withFileTypes: true }); }
    catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOTDIR') throw error;
      hash.update(await readFile(join(root, path)));
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) await visit(`${path}/${entry.name}`);
  }
  for (const path of paths.sort()) await visit(path);
  return hash.digest('hex');
}

/** Every render dependency, with language rows scoped to the pair that uses them.
 * @param {string[]} languages @param {string} [root] */
export async function prerenderInputs(languages, root = '.') {
  const common = await digest(root, [
    'core', 'render', 'vendor', 'scripts/spec.mjs',
    'scripts/prerender_packs.mjs', 'scripts/prerender_inputs.mjs', 'scripts/local_page.mjs',
    'data/concepts', 'data/fonts', 'data/registry', 'data/themes', 'data/respell',
    'data/coverage.json', 'data/presets.json', 'data/icons.json',
  ]);
  // The renderer loads the vendored font/PDF code above. Playwright is its only
  // npm dependency; native packaging and development-server updates cannot change
  // a preview and must not invalidate the entire matrix.
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const tooling = JSON.stringify(['@playwright/test', 'playwright', 'playwright-core'].map((name) => {
    const entry = lock.packages[`node_modules/${name}`];
    if (!entry) throw new Error(`render dependency missing from package-lock.json: ${name}`);
    return [name, entry.version, entry.integrity];
  }));
  const rows = new Map(await Promise.all(languages.map(async (code) => (
    /** @type {[string, string]} */ ([code, await digest(root, [`data/lang/${code}`])])))));
  return (/** @type {string} */ target, /** @type {string} */ source) => createHash('sha256')
    .update(`${common}\0${tooling}\0${target}\0${rows.get(target)}\0${source}\0${rows.get(source)}`).digest('hex');
}
