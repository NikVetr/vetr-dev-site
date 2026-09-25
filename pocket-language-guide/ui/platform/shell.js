// The native shell, where there is one.
//
// Two things the web gives for free and an app does not: a Back gesture that means
// something, and a way to hand text to another application. Both are behind this
// seam so the pages stay identical in a browser and in a WebView — there is no
// second build of this app, only a `Capacitor` global that is either there or not.
//
// **Back is the one that has to be got right.** Android's system Back is not a
// browser Back: in a WebView it fires an event, and if nobody handles it the app
// exits. So a reader holding a full-screen sentence out to a stranger, who presses
// Back meaning "close this", would close the whole application instead. Handlers
// return whether they consumed the press, and only an unconsumed one is allowed to
// leave — which is also why an open `<dialog>` is handled here rather than by each
// page, since every modal in this app is one.

/** Whether this is running inside the native shell rather than a browser tab. */
export function isNative() {
  return Boolean(/** @type {any} */ (globalThis).Capacitor?.isNativePlatform?.());
}

/** @type {(() => boolean)|null} the page's own handler, if it registered one */
let consume = null;

/**
 * Handle the system Back press before the app is allowed to exit.
 *
 * `handler` returns true when it dealt with the press. On the web this registers
 * nothing at all: a browser tab already has Back, and taking it over would break
 * the history a reader expects.
 * @param {() => boolean} handler
 */
export function onBack(handler) {
  consume = handler;
  const app = /** @type {any} */ (globalThis).Capacitor?.Plugins?.App;
  if (!isNative() || !app?.addListener) return;
  app.addListener('backButton', (/** @type {{canGoBack:boolean}} */ event) => {
    // A modal first, always, and without asking the page: every one in this app is a
    // `<dialog>`, and a Back press with a form open means "close the form".
    const open = /** @type {HTMLDialogElement|null} */ (document.querySelector('dialog[open]'));
    if (open) { open.close(); return; }
    if (consume?.()) return;
    // Nothing left to unwind here. Go back a page if there is one, and otherwise
    // let the shell exit -- which is what a reader at the first screen means.
    if (event.canGoBack) { history.back(); return; }
    app.exitApp?.();
  });
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
