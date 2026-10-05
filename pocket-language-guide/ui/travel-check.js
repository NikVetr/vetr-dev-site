// Before a trip, in the settings: the check, where a pair is on screen -- everything
// that pair needs, loaded from this device and tried the way the boards use it, each
// ticked as it passes, so a file that was never saved, a script this phone cannot draw
// or a missing voice is found at home, not at a ticket counter with no signal -- and
// what is saved on this device for use without a connection, a language at a time or
// all of them, with the way to give the space back.
//
// Inside the settings rather than a dialog of its own: closing a dialog opened from
// the settings closed the settings too, and the check is one of several things a
// reader does before going, not a place to go.

import { el } from './board-menu.js';
import { helpTip } from './dialog.js';
import { t } from './i18n.js';
import { forgetOffline, keepOffline } from './app.js';
import { isNative } from './platform/shell.js';

/**
 * @typedef {{state: 'pass'|'warn'|'fail', detail: string,
 *   action?: {label: string, run: () => Promise<unknown>}}} Outcome
 * @typedef {{label: string, run: () => Promise<Outcome>}} Check
 * @typedef {{files: string[], bytes: number, fonts: string[], fontBytes: number}} Saveable
 */

/** What each outcome is drawn with: a glyph as well as a colour, so neither is alone. */
const GLYPH = { running: '…', pass: '✓', warn: '!', fail: '✕' };

/**
 * Run the checks one after another into `list`, each row marked as it finishes. A
 * check that throws has failed, and its message says why. An outcome with an action
 * offers it as a button, and the checks run again once it is done.
 * @param {HTMLElement} list @param {() => Check[]} checks
 */
async function runChecks(list, checks) {
  list.replaceChildren();
  for (const check of checks()) {
    const mark = el('span', { class: 'travel-check-mark', 'aria-hidden': 'true', text: GLYPH.running });
    const said = el('span', { class: 'visually-hidden', text: t('check.running') });
    const detail = el('p', { class: 'travel-check-detail' });
    const row = el('li', { class: 'travel-check-row travel-check-running' },
      [mark, el('div', {}, [el('p', { class: 'travel-check-label', text: check.label }), detail]), said]);
    list.append(row);
    /** @type {Outcome} */ let outcome;
    try {
      outcome = await check.run();
    } catch (error) {
      outcome = { state: 'fail', detail: error instanceof Error ? error.message : String(error) };
    }
    row.className = `travel-check-row travel-check-${outcome.state}`;
    mark.textContent = GLYPH[outcome.state];
    said.textContent = t(`check.${outcome.state}`);
    detail.textContent = outcome.detail;
    if (outcome.action) {
      const { label, run: act } = outcome.action;
      const button = el('button', { type: 'button', class: 'btn', text: label });
      button.addEventListener('click', async () => { button.setAttribute('disabled', ''); await act(); runChecks(list, checks); });
      row.append(button);
    }
  }
}

/** A size in megabytes, in the interface's own numerals. @param {number} bytes */
const megabytes = (bytes) => new Intl.NumberFormat(document.documentElement.lang || undefined,
  { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 }).format(bytes / 1e6);

/** Whether every one of these is saved here. @param {string[]} urls */
async function allSaved(urls) {
  const found = await Promise.all(urls.map((url) => caches.match(url, { ignoreSearch: true })));
  return found.every(Boolean);
}

/**
 * The settings' Before you travel section.
 *
 * **What is saved, and the choice of what to save.** A pair is kept as it is used, but
 * a reader going somewhere without signal should not have to open every language once
 * to have it; and a phone short of space should be able to let a language go without
 * losing the app. So every language is listed, saved or not, each with the one button
 * that changes that, and the two that do it to all of them. Saving takes a language's
 * rows, and -- unless the reader only wants to talk -- the faces its script is set in
 * on a card, with the Latin ones every card uses. What each costs is said before it
 * is pressed, from `data/offline.json`, which the shell build writes from the disk.
 *
 * The app on a phone carries everything already, so there it says so and offers
 * nothing to save.
 * @param {object} config
 * @param {(code: string) => string} config.nameOf
 * @param {(rel: string) => Promise<string>} config.loadText
 * @param {() => Check[]} [config.checks]  the pair's checks, on a page with a pair
 * @param {string[]} [config.pair]  the pair's two languages, saved first
 * @param {{href: string, label: string}[]} [config.suggestions]  what else to do before going
 */
export function travelSection({ nameOf, loadText, checks, pair, suggestions = [] }) {
  const help = checks ? helpTip(t('check.intro'), t('offline.tip')) : helpTip(t('offline.tip'));
  const box = el('fieldset', { class: 'speaker-block travel-block' },
    [el('legend', {}, [t('check.title'), help.button]), help.tip]);
  if (checks) {
    const list = el('ol', { class: 'travel-check-list' });
    const run = el('button', { type: 'button', class: 'btn', text: t('check.open') });
    run.addEventListener('click', () => { runChecks(list, checks); });
    box.append(run, list);
  }
  if (suggestions.length) {
    box.append(el('p', { class: 'travel-suggest-name', text: t('check.suggest') }),
      el('ul', { class: 'travel-suggest' }, suggestions.map(({ href, label }) => el('li', {}, [el('a', { href, text: label })]))));
  }
  if (isNative()) {
    box.append(el('p', { class: 'speaker-why', text: t('check.bundled') }));
    return box;
  }
  if (!navigator.serviceWorker?.controller) {
    box.append(el('p', { class: 'speaker-why', text: t('check.noWorker') }));
    return box;
  }
  const saved = el('div', { class: 'travel-saved' });
  box.append(saved);
  Promise.all([loadText('data/offline.json'), loadText('data/shell.json')])
    .then(([index, shell]) => drawSaved(saved, JSON.parse(index), new Set(JSON.parse(shell).files), nameOf, pair))
    .catch((err) => { saved.replaceChildren(el('p', { class: 'speaker-refused', text: String(err.message) })); });
  return box;
}

/**
 * What is saved, the buttons that change it, and a row per language.
 *
 * A language is saved when everything chosen for it is here: its rows, and with the
 * faces box ticked its script's faces. What a row says a save costs is what is still
 * missing of its own. The Latin faces every card is set in are shared by all of them,
 * so their size is said once, beside the box, rather than added to every row -- a
 * French row read four megabytes when its rows are a sixth of one.
 *
 * The pair the app opens with comes inside it, in the shell, and a delete cannot take
 * it away -- so a language whose chosen parts are all in the shell is said to be part
 * of the app, with no button, rather than offered a Delete that does nothing.
 * @param {HTMLElement} box
 * @param {{common: {fonts: string[], fontBytes: number}, languages: Record<string, Saveable>}} index
 * @param {Set<string>} builtIn  the shell's files
 * @param {(code: string) => string} nameOf @param {string[]} [pair]
 */
async function drawSaved(box, index, builtIn, nameOf, pair) {
  const codes = Object.keys(index.languages).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const used = el('p', { class: 'speaker-why' });
  const status = el('p', { class: 'speaker-why', role: 'status' });
  const fonts = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
  fonts.checked = true;
  const sharedCost = el('span', { class: 'travel-lang-state' });
  /** The parts a save of `code` takes, each with what it weighs. @param {string} code */
  const parts = (code) => [
    { files: index.languages[code].files, bytes: index.languages[code].bytes },
    ...(fonts.checked ? [{ files: index.languages[code].fonts, bytes: index.languages[code].fontBytes }] : []),
  ];
  /** What saving `code` still costs past the shared faces, nothing when it is saved. @param {string} code */
  const missing = async (code) => {
    const have = await Promise.all(parts(code).map((part) => allSaved(part.files)));
    return parts(code).reduce((n, part, i) => n + (have[i] ? 0 : part.bytes), 0);
  };
  /** @type {Map<string, {row: HTMLElement, state: HTMLElement, button: HTMLButtonElement}>} */
  const rows = new Map();
  const all = el('button', { type: 'button', class: 'chip' });
  const refresh = async () => {
    const shared = fonts.checked && !(await allSaved(index.common.fonts)) ? index.common.fontBytes : 0;
    sharedCost.textContent = shared ? `+${megabytes(shared)}` : '';
    const owed = await Promise.all(codes.map(missing));
    for (const [i, code] of codes.entries()) {
      const { state, button } = /** @type {NonNullable<ReturnType<typeof rows.get>>} */ (rows.get(code));
      const inApp = parts(code).every((part) => part.files.every((file) => builtIn.has(file)));
      state.textContent = owed[i] ? megabytes(owed[i]) : `✓ ${t(inApp ? 'offline.builtIn' : 'offline.saved')}`;
      button.textContent = t(owed[i] ? 'offline.save' : 'offline.delete');
      button.dataset.saved = String(!owed[i]);
      button.hidden = !owed[i] && inApp;
    }
    all.textContent = t('offline.saveAll', { size: megabytes(owed.reduce((n, b) => n + b, shared)) });
    const estimate = await navigator.storage?.estimate?.();
    used.textContent = estimate?.usage ? t('offline.used', { size: megabytes(estimate.usage) }) : '';
  };
  /** Save these, one language at a time so a long save can be followed. @param {string[]} chosen */
  const save = async (chosen) => {
    /** @type {string[]} */ const failed = [];
    for (const [i, code] of chosen.entries()) {
      status.textContent = t('offline.saving', { done: String(i), total: String(chosen.length) });
      const files = parts(code).flatMap((part) => part.files);
      failed.push(...(await keepOffline(fonts.checked ? [...files, ...index.common.fonts] : files, true)).failed);
    }
    status.textContent = failed.length ? t('offline.partly', { count: String(failed.length) }) : '';
    await refresh();
  };
  /** Run `act` with `button` out of service until it is done. @param {Element} button @param {() => Promise<void>} act */
  const busy = async (button, act) => {
    button.setAttribute('disabled', '');
    try { await act(); } finally { button.removeAttribute('disabled'); }
  };

  for (const code of codes) {
    const state = el('span', { class: 'travel-lang-state' });
    const button = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'chip' }));
    // Deleting takes the language's own faces with it, never the Latin ones others share.
    button.addEventListener('click', () => busy(button, async () => {
      if (button.dataset.saved !== 'true') { await save([code]); return; }
      await forgetOffline([...index.languages[code].files, ...index.languages[code].fonts]);
      await refresh();
    }));
    const row = el('li', { class: 'travel-lang' }, [el('span', { class: 'travel-lang-name', text: nameOf(code) }), state, button]);
    rows.set(code, { row, state, button });
  }
  all.addEventListener('click', () => busy(all, () => save(codes)));
  const clear = el('button', { type: 'button', class: 'chip', text: t('offline.clear') });
  clear.addEventListener('click', () => busy(clear, async () => {
    if (!globalThis.confirm(t('offline.clearAsk'))) return;
    await forgetOffline(null);
    status.textContent = t('offline.cleared');
    await refresh();
  }));
  /** @type {Element[]} */ const actions = [all, clear];
  if (pair) {
    const both = el('button', { type: 'button', class: 'chip',
      text: t('offline.savePair', { listener: nameOf(pair[0]), owner: nameOf(pair[1]) }) });
    both.addEventListener('click', () => busy(both, () => save(pair)));
    actions.unshift(both);
  }
  fonts.addEventListener('change', () => { refresh(); });
  box.replaceChildren(used, el('div', { class: 'speaker-actions' }, actions), status, el('details', { class: 'travel-langs' }, [
    el('summary', { text: t('offline.choose') }),
    el('label', { class: 'display-option' }, [fonts, el('span', { text: t('offline.fonts') }), sharedCost]),
    el('ul', {}, [...rows.values()].map((r) => r.row)),
  ]));
  await refresh();
}

/**
 * The characters this device has no glyph for in `font`. Each is drawn alone and
 * compared with a character no font has, whose drawing is the device's missing-glyph
 * box: a letter drawn exactly as that box is not a letter here. Letters and digits
 * only -- a mark or a joiner alone draws as nearly nothing whether it is supported
 * or not.
 * @param {string[]} chars  @param {string} font  a canvas font, as `32px system-ui`
 */
export function undrawable(chars, font) {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  g.font = font;
  g.textBaseline = 'middle';
  const draw = (/** @type {string} */ c) => {
    g.clearRect(0, 0, 48, 48);
    g.fillText(c, 8, 24);
    return g.getImageData(0, 0, 48, 48).data;
  };
  const box = draw('\u{10FFFD}');
  return chars.filter((c) => draw(c).every((v, i) => v === box[i]));
}
