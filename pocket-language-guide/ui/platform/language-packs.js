// Native language downloads are pinned to the inventory shipped with this app.
// Only a complete, verified pack is committed; shared fonts are content-addressed.
import { isNative } from './shell.js';

const TRUSTED_BASE = /^https:\/\/raw\.githubusercontent\.com\/NikVetr\/vetr-dev-site\/[a-f0-9]{40}\/pocket-language-guide\/$/;
const DIRECTORY = 'wanderwart-language-packs';
const KEY = 'wanderwart.language-packs.v1';
const HASH = /^[a-f0-9]{64}$/;
const PATH = /^data\/(?:lang\/[\w-]+\/[\w.-]+\.csv|(?:countries|emphasis)\/[\w-]+\.csv|fonts\/[\w.-]+\.(?:ttf|woff2))$/;
/** @typedef {{path:string, sha256:string, bytes:number}} File */
/** @typedef {{schemaVersion:number,version:string,baseUrl:string,starter:string[],bundled:string[],languages:Record<string,{files:File[],fonts:File[]}>}} Manifest */
/** @typedef {{version:string,hashes:string[]}} Installed */
/** @typedef {{filesystem:any,preferences:any,download:(url:string)=>Promise<Uint8Array>,hash:(bytes:Uint8Array)=>Promise<string>|string}} Dependencies */
/** @param {unknown} error */
const missing = (error) => /** @type {{code?:string}} */ (error)?.code === 'OS-PLUG-FILE-0008';
/** @param {string} hash */
const pathOf = (hash) => `${DIRECTORY}/${hash}`;
/** @param {string} data */
const decode = (data) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
/** @param {Uint8Array} bytes */
function encode(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** @param {Manifest} manifest @param {Dependencies} dependencies */
export async function createLanguagePacks(manifest, { filesystem: fs, preferences, download, hash }) {
  if (manifest.schemaVersion !== 1 || !TRUSTED_BASE.test(manifest.baseUrl) || !HASH.test(manifest.version)) {
    throw new Error('Unsupported native language inventory');
  }
  const bundled = new Set(manifest.bundled);
  const starter = new Set(manifest.starter);
  /** @type {Map<string,File>} */ const byPath = new Map();
  /** @type {Map<string,string[]>} */ const owners = new Map();
  /** @type {Record<string,File[]>} */ const packs = {};
  for (const [code, pack] of Object.entries(manifest.languages)) {
    if (!/^[\w-]+$/.test(code)) throw new Error(`Invalid language: ${code}`);
    const unique = new Map();
    for (const file of [...pack.files, ...pack.fonts]) {
      if (!PATH.test(file.path) || !HASH.test(file.sha256) || !Number.isSafeInteger(file.bytes) || file.bytes < 0) {
        throw new Error(`Invalid native language file: ${file.path}`);
      }
      const other = byPath.get(file.path);
      if (other && (other.sha256 !== file.sha256 || other.bytes !== file.bytes)) throw new Error(`Conflicting file: ${file.path}`);
      byPath.set(file.path, file);
      owners.set(file.path, [...(owners.get(file.path) ?? []), code]);
      if (!bundled.has(file.path)) unique.set(file.sha256, file);
    }
    packs[code] = [...unique.values()];
  }
  if ([...bundled].some((path) => !byPath.has(path)) || [...starter].some((code) => !packs[code] || packs[code].length)) {
    throw new Error('Starter language inventory is incomplete');
  }
  const saved = (await preferences.get({ key: KEY })).value;
  const record = saved === null || saved === undefined ? { schemaVersion: 1, languages: {} } : JSON.parse(saved);
  if (record.schemaVersion !== 1 || !record.languages || typeof record.languages !== 'object' || Array.isArray(record.languages)) {
    throw new Error('Invalid installed language record');
  }
  /** @type {Record<string,Installed>} */ let installed = record.languages;
  for (const [code, pack] of Object.entries(installed)) {
    if (!/^[\w-]+$/.test(code) || !pack || !HASH.test(pack.version) || !Array.isArray(pack.hashes) || pack.hashes.some((h) => !HASH.test(h))) {
      throw new Error('Invalid installed language record');
    }
  }
  let pending = Promise.resolve();
  /** @template T @param {()=>Promise<T>} action */
  const mutate = (action) => {
    const work = pending.then(action);
    pending = work.then(() => {}, () => {});
    return work;
  };
  /** @param {string} code */
  const required = (code) => {
    if (!Object.hasOwn(packs, code)) throw new Error(`Unknown language: ${code}`);
    return packs[code];
  };
  /** @param {string} code */
  const current = (code) => Boolean(installed[code]) && required(code).every((f) => installed[code].hashes.includes(f.sha256));
  /** @param {string} code @param {string} message */
  const needsPack = (code, message) => Object.assign(new Error(message), { code: 'NATIVE_PACK_REQUIRED', language: code });
  /** @param {File} file @param {Uint8Array} bytes */
  const verify = async (file, bytes) => {
    if (bytes.length !== file.bytes || await hash(bytes) !== file.sha256) {
      throw new Error(`Language file does not match this app version: ${file.path}. Update the app or retry the download.`);
    }
  };
  /** @param {File} file */
  const read = async (file) => {
    const { data } = await fs.readFile({ path: pathOf(file.sha256), directory: 'DATA' });
    if (typeof data !== 'string') throw new Error(`Invalid native file response: ${file.path}`);
    const bytes = decode(data);
    await verify(file, bytes);
    return bytes;
  };
  /** @param {Record<string,Installed>} next */
  const commit = async (next) => {
    await preferences.set({ key: KEY, value: JSON.stringify({ schemaVersion: 1, languages: next }) });
    installed = next;
  };
  // A failed write can leave an uncommitted blob. A later operation can reclaim it
  // without guessing at paths or touching anything outside our own directory.
  const collect = async () => {
    const keep = new Set(Object.values(installed).flatMap((pack) => pack.hashes));
    let listing;
    try { listing = await fs.readdir({ path: DIRECTORY, directory: 'DATA' }); }
    catch (error) { if (missing(error)) return; throw error; }
    for (const file of listing.files) {
      if (file.type !== 'file' || !HASH.test(file.name) || keep.has(file.name)) continue;
      try { await fs.deleteFile({ path: pathOf(file.name), directory: 'DATA' }); }
      catch (error) { if (!missing(error)) throw error; }
    }
  };
  return {
    manifest,
    /** Incremental storage, counting shared blobs only once. @param {string[]} codes */
    async downloadBytes(codes) {
      await pending;
      const files = new Map(codes.flatMap((code) => required(code)).map((file) => [file.sha256, file]));
      const saved = new Set(Object.values(installed).flatMap((pack) => pack.hashes));
      let bytes = 0;
      for (const file of files.values()) {
        if (!saved.has(file.sha256)) { bytes += file.bytes; continue; }
        try {
          const info = await fs.stat({ path: pathOf(file.sha256), directory: 'DATA' });
          if (info.type === 'file' && info.size === file.bytes) continue;
        } catch (error) { if (!missing(error)) throw error; }
        bytes += file.bytes;
      }
      return bytes;
    },
    /** @param {string} rel @returns {Promise<Uint8Array|null>} */
    async readBytes(rel) {
      await pending;
      const requested = /^data\/(?:lang\/([\w-]+)\/|(?:countries|emphasis)\/([\w-]+)\.csv$)/.exec(rel);
      const language = requested?.[1] ?? requested?.[2];
      if (language && Object.hasOwn(packs, language) && !starter.has(language) && !current(language)) {
        throw needsPack(language, `Download the ${language} language pack before opening ${rel}`);
      }
      const file = byPath.get(rel);
      if (!file || bundled.has(rel)) return null;
      const available = owners.get(rel)?.find((code) => current(code));
      const needed = language ?? owners.get(rel)?.[0] ?? '';
      if (!available) {
        throw needsPack(needed, `Download the ${needed} language pack before opening ${rel}`);
      }
      // A missing or corrupt installed file is not a legitimate absent corpus row.
      // In particular, never attach HTTP 404, which the corpus loader may ignore.
      try { return await read(file); }
      catch (error) { throw needsPack(available, `Re-download the language pack for ${rel}: ${error instanceof Error ? error.message : String(error)}`); }
    },
    async status() {
      await pending;
      /** @type {Map<string,Promise<{size:number,type:string}>>} */ const stats = new Map();
      /** @type {Record<string,{state:'bundled'|'installed'|'missing'|'update',bytes:number}>} */ const result = {};
      for (const [code, files] of Object.entries(packs)) {
        let state = /** @type {'bundled'|'installed'|'missing'|'update'} */ (starter.has(code) ? 'bundled' : !installed[code] ? 'missing' : current(code) ? 'installed' : 'update');
        if (state === 'installed') {
          for (const file of files) {
            try {
              const metadata = stats.get(file.sha256) ?? fs.stat({ path: pathOf(file.sha256), directory: 'DATA' });
              stats.set(file.sha256, metadata);
              const info = await metadata;
              if (info.size !== file.bytes || info.type !== 'file') { state = 'update'; break; }
            } catch (error) { if (!missing(error)) throw error; state = 'update'; break; }
          }
        }
        result[code] = { state, bytes: files.reduce((total, file) => total + file.bytes, 0) };
      }
      return result;
    },
    /** @param {string} code @param {(progress:{done:number,total:number,path:string})=>void} [onProgress] @param {AbortSignal} [signal] */
    install(code, onProgress, signal) {
      return mutate(async () => {
        signal?.throwIfAborted();
        const files = required(code);
        if (starter.has(code)) return;
        let committed = false;
        try {
          for (const [i, file] of files.entries()) {
            signal?.throwIfAborted();
            let usable = false;
            try {
              const { data } = await fs.readFile({ path: pathOf(file.sha256), directory: 'DATA' });
              const bytes = decode(data);
              usable = bytes.length === file.bytes && await hash(bytes) === file.sha256;
            } catch (error) { if (!missing(error)) throw error; }
            if (!usable) {
              const bytes = await download(`${manifest.baseUrl}${file.path}`);
              signal?.throwIfAborted();
              await verify(file, bytes);
              await fs.writeFile({ path: pathOf(file.sha256), directory: 'DATA', recursive: true, data: encode(bytes) });
              await read(file);
            }
            onProgress?.({ done: i + 1, total: files.length, path: file.path });
          }
          signal?.throwIfAborted();
          await commit({ ...installed, [code]: { version: manifest.version, hashes: files.map((f) => f.sha256) } });
          committed = true;
          await collect();
        } catch (error) {
          if (committed) throw new Error(`Language installed, but old files could not be removed: ${String(error)}`);
          try { await collect(); }
          catch (cleanup) { throw new Error(`Language download failed: ${String(error)}; temporary cleanup failed: ${String(cleanup)}`); }
          throw error;
        }
      });
    },
    /** @param {string} code */
    remove(code) {
      return mutate(async () => {
        required(code);
        if (starter.has(code)) throw new Error('Starter languages are part of the app and cannot be deleted');
        // Keep the record until deletion succeeds, so a refused deletion can be retried.
        const keep = new Set(Object.entries(installed).filter(([other]) => other !== code).flatMap(([, pack]) => pack.hashes));
        for (const digest of installed[code]?.hashes ?? []) {
          if (keep.has(digest)) continue;
          try { await fs.deleteFile({ path: pathOf(digest), directory: 'DATA' }); }
          catch (error) { if (!missing(error)) throw error; }
        }
        const next = { ...installed };
        delete next[code];
        await commit(next);
        await collect();
      });
    },
  };
}

/** @type {ReturnType<typeof createLanguagePacks>|null} */ let native = null;
export function nativeLanguagePacks() {
  if (!isNative()) return Promise.resolve(null);
  native ??= (async () => {
    const cap = /** @type {any} */ (globalThis).Capacitor;
    const { Filesystem: filesystem, Preferences: preferences, CapacitorHttp: http } = cap.Plugins;
    if (!filesystem || !preferences || !http) throw new Error('Native language downloads are unavailable');
    const response = await fetch('data/native-packs.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Native language inventory: HTTP ${response.status}`);
    const { sha256 } = await import('../../vendor/sha256.esm.js');
    return createLanguagePacks(await response.json(), {
      filesystem, preferences,
      hash: (bytes) => Array.from(sha256(bytes), (b) => b.toString(16).padStart(2, '0')).join(''),
      download: async (url) => {
        const answer = await http.request({ url, method: 'GET', responseType: 'arraybuffer', disableRedirects: true,
          connectTimeout: 30000, readTimeout: 60000 });
        if (answer.status !== 200 || answer.url !== url || typeof answer.data !== 'string') {
          throw new Error(`Language download refused: ${url} (HTTP ${answer.status})`);
        }
        return decode(answer.data);
      },
    });
  })();
  return native;
}
