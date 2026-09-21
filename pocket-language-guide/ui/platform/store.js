// Where personal things are kept, and why it is not simply `localStorage`.
//
// Everything this app knows about its reader is local: the phrases they wrote, the
// edits they made to a card, which languages they read, how they speak. There is no
// account and no server, which is the point — and it means losing the store is
// losing their work with no way to get it back.
//
// On the web `localStorage` is the right answer and this is a thin pass-through.
// Inside the native shell it is not: **a WKWebView's `localStorage` is evictable.**
// iOS may clear it when the device is short of space, and the user never asked for
// that. Capacitor's `Preferences` writes to `UserDefaults` / `SharedPreferences`,
// which is where a native app is expected to keep small durable values.
//
// The awkward part is that `Preferences` is asynchronous and every caller here reads
// synchronously — `readProfile()` returns a profile, `read()` returns the boards.
// Rewriting all of them to be async would be a large change for a platform detail,
// so instead the native store is **hydrated once at start-up into memory**, reads are
// served from that mirror, and writes go to the mirror immediately and to
// `Preferences` behind them. `ready()` is what a page awaits before it reads.
//
// The web path is unchanged and unconditional, so the behaviour this app has always
// had is the behaviour it still has.

/** Every key this app owns. Namespaced, so nothing else on the origin is touched. */
const PREFIX = 'plg.';

/** @type {Map<string,string>|null} the native mirror; null on the web */
let mirror = null;
/** @type {{get:Function, set:Function, remove:Function, keys:Function}|null} */
let prefs = null;
/** @type {Promise<void>|null} */ let hydrating = null;

/** The Capacitor Preferences plugin, or null off-device. */
function plugin() {
  const cap = /** @type {any} */ (globalThis).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.Preferences ?? null;
}

/**
 * Load the native store into memory, once.
 *
 * Resolves immediately on the web. Safe to call from every page: the second caller
 * gets the first one's promise rather than a second read.
 */
export function ready() {
  if (hydrating) return hydrating;
  prefs = plugin();
  if (!prefs) { hydrating = Promise.resolve(); return hydrating; }
  hydrating = (async () => {
    const held = new Map();
    const { keys } = await prefs.keys();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      const { value } = await prefs.get({ key });
      if (value !== null && value !== undefined) held.set(key, value);
    }
    // **Migration, and only in this direction.** A build that ran before this module
    // existed wrote to `localStorage`; the same install now reads `Preferences`. Copy
    // anything the native store does not already have, and *never* the other way —
    // the native store is authoritative once it holds a key, so a stale web copy
    // cannot overwrite an edit made after the upgrade.
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX) || held.has(key)) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      held.set(key, value);
      // Written through, not moved: the source copy stays until the destination is
      // known good, which on the next launch it will be, because it hydrates first.
      prefs.set({ key, value }).catch(() => {});
    }
    mirror = held;
  })();
  return hydrating;
}

/** @param {string} key @returns {string|null} */
export function get(key) {
  if (mirror) return mirror.get(key) ?? null;
  return localStorage.getItem(key);
}

/**
 * @param {string} key @param {string} value
 * @throws the way `localStorage` does when the quota is gone -- callers report it
 */
export function set(key, value) {
  if (mirror) {
    mirror.set(key, value);
    // Behind the mirror, so a caller never waits on a disk write to draw. A rejection
    // is not swallowed silently: the reader has already been told the value is saved,
    // so the console is the only place left to say otherwise.
    prefs?.set({ key, value }).catch(
      (/** @type {Error} */ err) => console.warn('[plg] native save failed:', err.message),
    );
    return;
  }
  localStorage.setItem(key, value);
}

/** @param {string} key */
export function remove(key) {
  if (mirror) {
    mirror.delete(key);
    prefs?.remove({ key }).catch(() => {});
    return;
  }
  localStorage.removeItem(key);
}
