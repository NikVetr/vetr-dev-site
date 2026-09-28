// The native shell, where there is one.
//
// Three things the web gives for free and an app does not: a Back gesture that
// means something, a way to hand text to another application, and a return to where
// the reader was -- a browser restores its tabs, an app starts at its first page.
// All three are behind this seam so the pages stay identical in a browser and in a
// WebView — there is no second build of this app, only a `Capacitor` global that is
// either there or not.
//
// **Back is the one that has to be got right.** Android's system Back is not a
// browser Back: in a WebView it fires an event, and if nobody handles it the app
// exits. So a reader holding a full-screen sentence out to a stranger, who presses
// Back meaning "close this", would close the whole application instead. Handlers
// return whether they consumed the press, and only an unconsumed one is allowed to
// leave — which is also why an open `<dialog>` is handled here rather than by each
// page, since every modal in this app is one.

import * as store from './store.js';

/** Whether this is running inside the native shell rather than a browser tab. */
export function isNative() {
  return Boolean(/** @type {any} */ (globalThis).Capacitor?.isNativePlatform?.());
}

/** @type {(() => boolean)|null} the page's own handler, if it registered one */
let consume = null;

/**
 * Handle the system Back press before the app is allowed to exit.
 *
 * `handler` returns true when it dealt with the press. `up` is the screen above this
 * one, for when there is no page behind it to go back to -- which is not only the
 * first screen: Chromium skips a history entry that a page made without a gesture, so
 * the screens a relaunch opened (below) are behind nothing, as far as Back can tell.
 * Without `up`, an unhandled press there did nothing at all. On the web this registers
 * nothing: a browser tab already has Back, and taking it over would break the history
 * a reader expects.
 * @param {() => boolean} handler @param {string} [up]  a page URL
 */
export function onBack(handler, up) {
  consume = handler;
  const app = /** @type {any} */ (globalThis).Capacitor?.Plugins?.App;
  if (!isNative() || !app?.addListener) return;
  app.addListener('backButton', (/** @type {{canGoBack:boolean}} */ event) => {
    // A modal first, always, and without asking the page: every one in this app is a
    // `<dialog>`, and a Back press with a form open means "close the form".
    const open = /** @type {HTMLDialogElement|null} */ (document.querySelector('dialog[open]'));
    if (open) { open.close(); return; }
    if (consume?.()) return;
    // Nothing left to unwind here. Go back a page if there is one, else up a screen,
    // and at the top let the shell exit -- which is what a reader there means.
    if (event.canGoBack) { history.back(); return; }
    if (up) { location.replace(up); return; }
    app.exitApp?.();
  });
}

/** How far a relaunch returns, shallowest first: every language, a pair's contexts, the last context. */
export const RESUME_DEPTHS = /** @type {const} */ (['start', 'topics', 'board']);
/** @typedef {typeof RESUME_DEPTHS[number]} ResumeDepth */
const RESUME_KEY = 'plg.resume';
const PLACE_KEY = 'plg.place';
/** Lives as long as the WebView, so only a launch resumes: Back to the languages stays there. */
const LAUNCHED = 'plg.launched';

/** How deep a relaunch goes: the reader's choice, else the context list. @returns {ResumeDepth} */
export function readResume() {
  const held = store.get(RESUME_KEY);
  return RESUME_DEPTHS.find((depth) => depth === held) ?? 'topics';
}

/** @param {ResumeDepth} depth */
export function writeResume(depth) {
  store.set(RESUME_KEY, depth);
}

/**
 * Remember which screen the reader is on, for the next launch.
 * @param {{target:string, source:string, board?:string, screen?:string}|null} place  null for every language
 */
export function notePlace(place) {
  if (isNative()) store.set(PLACE_KEY, JSON.stringify(place));
}

/**
 * On a fresh launch, go back to where the reader was, as deep as they allow.
 *
 * Straight there, in place of this page. A history rebuilt a screen at a time would
 * not help: Chromium skips entries a page made without a gesture, so Android's Back
 * could not reach them anyway. Back from a restored screen goes up instead (`onBack`).
 * Returns whether the page is leaving, in which case it should draw nothing.
 */
export function resumeLaunch() {
  if (!isNative() || sessionStorage.getItem(LAUNCHED)) return false;
  sessionStorage.setItem(LAUNCHED, '1');
  const place = JSON.parse(store.get(PLACE_KEY) ?? 'null');
  const depth = RESUME_DEPTHS.indexOf(readResume());
  if (!place || depth === 0) return false;
  const params = new URLSearchParams({ target: place.target, source: place.source });
  if (place.board && depth === 2) {
    params.set('board', place.board);
    if (place.screen) params.set('screen', place.screen);
  }
  location.replace(`conversation.html?${params}`);
  return true;
}

/**
 * Hand one sentence to another application, one way.
 *
 * **One way, and only what the reader asked for.** No result comes back, nothing is
 * captured, and nothing else in their store travels with it: the argument is the
 * single string on screen. On the web this is the Web Share sheet where the browser
 * has one; inside the shell it is the native share sheet. `false` means the platform
 * offered nothing, which is a real answer and the caller must show something else --
 * a Copy button is the usual one.
 * @param {string} text  the sentence, and nothing but the sentence
 * @param {string} [title]
 * @returns {Promise<boolean>} whether a sheet was actually opened
 */
export async function handOff(text, title) {
  const share = /** @type {any} */ (globalThis).Capacitor?.Plugins?.Share;
  try {
    if (isNative() && share?.share) {
      await share.share({ text, title, dialogTitle: title });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ text, title });
      return true;
    }
  } catch (err) {
    // A cancelled sheet is not a failure and must not start a fallback: the reader
    // closed it on purpose. Anything else is a platform that could not do it.
    if (/** @type {Error} */ (err)?.name === 'AbortError') return true;
    return false;
  }
  return false;
}

/**
 * Deliver a file the reader asked for -- a PDF, a PNG, a zip, a backup -- on a
 * device, where an `<a download>` click in a WebView may do nothing at all.
 *
 * The bytes are written to the app's own cache directory through the Filesystem
 * plugin and the resulting URI handed to the share sheet, which is where a native
 * app "saves a file": the reader picks Files, a drive, a mail, or another app. The
 * cache directory because the file is theirs the moment they have taken it and the
 * system may reclaim the copy afterwards. `false` means this is not a device, or
 * the plugins are not here, and the caller falls back to the browser download.
 *
 * A dismissed sheet is `true`: the reader chose not to take it, which is not a
 * failure and must not start a second delivery.
 * @param {Blob} blob @param {string} name
 * @returns {Promise<boolean>}
 */
export async function deliver(blob, name) {
  const plugins = /** @type {any} */ (globalThis).Capacitor?.Plugins;
  if (!isNative() || !plugins?.Filesystem?.writeFile || !plugins?.Share?.share) return false;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let data = '';
  // Base64 in chunks: one call over the whole buffer overflows the argument list
  // on a multi-megabyte PDF.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    data += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  try {
    const { uri } = await plugins.Filesystem.writeFile({
      path: name, data: btoa(data), directory: 'CACHE', recursive: true,
    });
    await plugins.Share.share({ url: uri, title: name, dialogTitle: name });
    return true;
  } catch (err) {
    if (/** @type {Error} */ (err)?.name === 'AbortError' || /cancel/i.test(String(/** @type {Error} */ (err)?.message))) return true;
    return false;
  }
}
