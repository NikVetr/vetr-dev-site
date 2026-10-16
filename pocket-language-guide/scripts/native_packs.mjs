// Inventory pinned into the application: a download must match these exact bytes,
// rather than adopting whichever corpus happens to be on the website later.
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

export const STARTER_LANGUAGES = ['en', 'zh-Hans'];
const ASSET_PATHS = ['data/lang', 'data/fonts', 'data/countries', 'data/emphasis'];

/** Code can change independently; downloaded bytes must belong to a real asset
 * commit that can be published without changing this application's inventory.
 * @param {string} root */
export function nativeAssetSource(root) {
  const sourceCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', ...ASSET_PATHS],
    { cwd: root, encoding: 'utf8' }).trim();
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error('could not identify the native language assets commit');
  const diff = spawnSync('git', ['diff', '--quiet', sourceCommit, '--', ...ASSET_PATHS], { cwd: root });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...ASSET_PATHS],
    { cwd: root, encoding: 'utf8' }).trim();
  if (diff.status !== 0 || untracked) {
    throw new Error('native language assets have uncommitted changes; commit the managed language/font files '
      + 'and publish that asset commit before distributing the app');
  }
  return { sourceCommit, baseUrl: `https://raw.githubusercontent.com/NikVetr/vetr-dev-site/${sourceCommit}/pocket-language-guide/` };
}

/** Reuse the web offline inventory, which already maps languages to all font styles
 * and both formats. Missing/stale inventory is a build error, never a smaller pack.
 * @param {string} root */
export async function nativePackManifest(root) {
  const source = nativeAssetSource(root);
  const offline = JSON.parse(await readFile(join(root, 'data/offline.json'), 'utf8'));
  /** @type {Map<string, Promise<{path:string,sha256:string,bytes:number}>>} */
  const files = new Map();
  /** @param {string} path */
  const entry = (path) => {
    if (!/^data\/(?:lang\/[\w-]+\/[\w.-]+\.csv|(?:countries|emphasis)\/[\w-]+\.csv|fonts\/[\w.-]+\.(?:ttf|woff2))$/.test(path)) {
      throw new Error(`unsafe native pack path: ${path}`);
    }
    if (!files.has(path)) files.set(path, readFile(join(root, path)).then((bytes) => ({
      path, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    })));
    return /** @type {Promise<{path:string,sha256:string,bytes:number}>} */ (files.get(path));
  };
  /** @type {Record<string,{files:{path:string,sha256:string,bytes:number}[],fonts:{path:string,sha256:string,bytes:number}[]}>} */
  const languages = {};
  for (const [code, language] of Object.entries(offline.languages)) {
    const expected = (await readdir(join(root, 'data/lang', code))).filter((name) => name.endsWith('.csv'))
      .map((name) => `data/lang/${code}/${name}`);
    if (expected.some((path) => !language.files.includes(path))) {
      throw new Error(`offline inventory for ${code} is stale; run npm run shell`);
    }
    languages[code] = {
      files: await Promise.all([...new Set(language.files)].sort().map(entry)),
      fonts: await Promise.all([...new Set([...offline.common.fonts, ...language.fonts])].sort().map(entry)),
    };
  }
  const bundled = [...new Set(STARTER_LANGUAGES.flatMap((code) => {
    if (!languages[code]) throw new Error(`starter language ${code} is missing`);
    return [...languages[code].files, ...languages[code].fonts].map(({ path }) => path);
  }))].sort();
  const inventory = { schemaVersion: 1, ...source, starter: STARTER_LANGUAGES, bundled, languages };
  const version = createHash('sha256').update(JSON.stringify(inventory)).digest('hex');
  return { ...inventory, version };
}
