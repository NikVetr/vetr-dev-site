import { nativeLanguagePacks } from './platform/language-packs.js';
import { t } from './i18n.js';
import { el } from './board-menu.js';
import { dialogHead } from './dialog.js';

/** @param {number} bytes */
const sizeOf = (bytes) => new Intl.NumberFormat(document.documentElement.lang || undefined,
  { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1e6);
/** @param {unknown} error */
const message = (error) => error instanceof Error ? error.message : String(error);
/** @param {string} code */
const languageName = (code) => new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' }).of(code) || code;

/** @param {(code:string)=>string} nameOf @param {()=>void} [onSaved] */
export function nativeLanguageSection(nameOf, onSaved) {
  const box = el('div', { class: 'travel-saved native-language-packs' });
  const status = el('p', { class: 'speaker-refused', role: 'status' });
  box.append(el('p', { class: 'speaker-why', text: t('native.packsIntro') }), status);
  (async () => {
    const packs = await nativeLanguagePacks();
    if (!packs) throw new Error('Native language storage is unavailable');
    const codes = Object.keys(packs.manifest.languages).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    const all = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'chip' }));
    const selected = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'chip' }));
    const cancel = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'ghost', text: t('quiz.cancel') }));
    cancel.style.display = 'none';
    const list = el('ul');
    box.append(el('div', { class: 'row' }, [all, selected, cancel]), el('details', {
      class: 'travel-langs', ...(onSaved ? { open: '' } : {}),
    }, [el('summary', { text: t('offline.choose') }), list]));
    /** @type {Map<string,{state:HTMLElement,button:HTMLButtonElement,choice:HTMLInputElement}>} */
    const rows = new Map();
    const chosen = () => codes.filter((code) => rows.get(code)?.choice.checked);
    const costs = async () => {
      const [total, selection] = await Promise.all([packs.downloadBytes(codes), packs.downloadBytes(chosen())]);
      all.textContent = t('offline.saveAll', { size: sizeOf(total) });
      selected.textContent = t('native.saveSelected', { size: sizeOf(selection) });
      selected.disabled = !chosen().length;
    };
    const refresh = async () => {
      for (const [code, saved] of Object.entries(await packs.status())) {
        const row = rows.get(code);
        if (!row) continue;
        row.state.textContent = saved.state === 'bundled' ? t('offline.builtIn')
          : saved.state === 'installed' ? t('offline.saved') + ' · ' + sizeOf(saved.bytes) : sizeOf(saved.bytes);
        row.button.hidden = saved.state === 'bundled';
        row.choice.disabled = saved.state === 'bundled';
        row.button.textContent = t(['installed', 'update'].includes(saved.state) ? 'offline.delete' : 'offline.save');
        row.button.dataset.saved = String(saved.state === 'installed' || saved.state === 'update');
      }
      await costs();
    };
    /** @type {AbortController|null} */ let controller = null;
    box.addEventListener('stop-downloads', () => controller?.abort());
    cancel.addEventListener('click', () => { controller?.abort(); status.textContent = t('native.stopping'); });
    /** @param {string[]} selection @param {boolean} [remove] */
    const run = async (selection, remove = false) => {
      if (controller) return;
      controller = new AbortController();
      const signal = controller.signal;
      for (const input of box.querySelectorAll('button,input')) /** @type {HTMLButtonElement} */ (input).disabled = true;
      cancel.style.display = remove ? 'none' : ''; cancel.disabled = false;
      status.textContent = '';
      try {
        for (const code of selection) {
          if (remove) await packs.remove(code);
          else await packs.install(code, ({ done, total }) => {
            status.textContent = nameOf(code) + ': ' + t('offline.saving', { done: String(done), total: String(total) });
          }, signal);
        }
        status.textContent = t('native.packsChanged');
        if (!remove) onSaved?.();
      } catch (error) { status.textContent = signal.aborted ? t('native.stopped') : message(error); }
      finally {
        controller = null; cancel.style.display = 'none';
        for (const input of box.querySelectorAll('button,input')) /** @type {HTMLButtonElement} */ (input).disabled = false;
        await refresh().catch((error) => { status.textContent = message(error); });
      }
    };
    all.addEventListener('click', () => { void run(codes); });
    selected.addEventListener('click', () => { void run(chosen()); });
    for (const code of codes) {
      const state = el('span', { class: 'travel-lang-state' });
      const choice = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', 'aria-label': nameOf(code) }));
      choice.addEventListener('change', () => { costs().catch((error) => { status.textContent = message(error); }); });
      const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'chip' }));
      button.addEventListener('click', () => { void run([code], button.dataset.saved === 'true'); });
      rows.set(code, { state, button, choice });
      list.append(el('li', { class: 'travel-lang', 'data-language': code }, [
        el('label', { class: 'travel-lang-name' }, [choice, el('span', { text: nameOf(code) })]), state, button,
      ]));
    }
    await refresh();
  })().catch((error) => { status.textContent = message(error); });
  return box;
}

/** @type {Promise<void>|null} */ let setup = null;
/** Native first launch offers bulk storage; dismissing keeps on-demand downloads. */
export function nativeLanguageSetup() {
  setup ??= (async () => {
    const packs = await nativeLanguagePacks();
    if (!packs) return;
    const prefs = /** @type {any} */ (globalThis).Capacitor.Plugins.Preferences;
    const key = 'wanderwart.language-setup.v1';
    if ((await prefs.get({ key })).value) return;
    await new Promise((resolve, reject) => {
      const dialog = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings native-language-setup' }));
      const defer = el('button', { type: 'button', class: 'ghost', text: t('native.later') });
      defer.addEventListener('click', () => dialog.close());
      dialog.append(dialogHead({ title: t('native.setupTitle'), close: t('gallery.previewClose'), onClose: () => dialog.close() }),
        defer, nativeLanguageSection(languageName, () => dialog.close()));
      dialog.addEventListener('close', () => {
        dialog.querySelector('.native-language-packs')?.dispatchEvent(new Event('stop-downloads'));
        dialog.remove();
        prefs.set({ key, value: 'done' }).then(() => resolve(undefined), reject);
      }, { once: true });
      document.body.append(dialog); dialog.showModal();
    });
  })();
  return setup;
}

/** @type {Map<string,Promise<void>>} */ const pending = new Map();
let downloads = Promise.resolve();
let cancelGeneration = 0;
/** Missing languages start downloading automatically; failure leaves Retry/Cancel. @param {string} code */
export function requestLanguageDownload(code) {
  const active = pending.get(code);
  if (active) return active;
  const generation = cancelGeneration;
  const request = downloads.then(async () => {
    await nativeLanguageSetup();
    if (generation !== cancelGeneration) throw new Error(t('native.stopped'));
    const packs = await nativeLanguagePacks();
    if (!packs) throw new Error('Native language storage is unavailable');
    const name = languageName(code);
    const dialog = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings native-download' }));
    const status = el('p', { role: 'status', class: 'speaker-refused' });
    const retry = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'primary', text: t('native.retry') }));
    const cancel = el('button', { type: 'button', class: 'ghost', text: t('quiz.cancel') });
    dialog.append(dialogHead({ title: t('native.packTitle', { language: name }), close: t('gallery.previewClose'), onClose: () => dialog.close() }), status, el('div', { class: 'row' }, [retry, cancel]));
    await new Promise((resolve, reject) => {
      let finished = false;
      let controller = new AbortController();
      dialog.addEventListener('close', () => {
        dialog.remove();
        if (!finished) { cancelGeneration += 1; controller.abort(); reject(new Error(t('native.stopped'))); }
      });
      cancel.addEventListener('click', () => dialog.close());
      const run = async () => {
        controller = new AbortController(); retry.disabled = true; retry.style.display = 'none';
        status.textContent = t('offline.saving', { done: '0', total: '1' });
        try {
          await packs.install(code, ({ done, total }) => {
            status.textContent = t('offline.saving', { done: String(done), total: String(total) });
          }, controller.signal);
          finished = true; resolve(undefined); dialog.close();
        } catch (error) { status.textContent = message(error); }
        finally { retry.disabled = false; retry.style.display = ''; }
      };
      retry.addEventListener('click', () => { void run(); });
      document.body.append(dialog); dialog.showModal(); void run();
    });
  });
  pending.set(code, request); downloads = request.catch(() => {});
  request.finally(() => pending.delete(code)).catch(() => {});
  return request;
}

