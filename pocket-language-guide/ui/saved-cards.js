// Saved cards: a studio card kept under a name, to come back to or to send to someone.
//
// The card being worked on is already kept as it changes, one per pair (`ui/io.js`).
// These are the others -- any number, named, for any pair -- and each holds what it
// takes to put the card back: its settings, its finish and resolution, and the
// reader's own terms and corrections for the pair. **Stored as what differs from a
// fresh card** of the same pair, with the paper as its preset's id, because the
// defaults are most of a spec and are already in the code: a saved card is the
// reader's decisions and nothing else. Loading one makes it the pair's current card
// and opens the studio on it, so the studio's own start-up is what reads it back.
//
// A card moved to the recycle bin is deleted for good two weeks later, the next time
// the saved cards are read; until then it can be restored. All of it is kept through
// `ui/platform/store.js`, and goes with Delete everything.

import * as store from './platform/store.js';
import { loadEdits, saveConfig, saveEdits } from './io.js';
import { askConfirm, askText, el } from './board-menu.js';
import { dialogHead, helpTip } from './dialog.js';
import { BIN_MARK } from './arrange.js';
import { number, t, uiLanguage } from './i18n.js';

const KEY = 'plg.cards';
/** How long a card stays in the recycle bin. */
const BIN_MS = 14 * 86_400_000;
/** What an exported card says it is, so an import can tell one from any other file. */
const KIND = 'wanderwart-card';

/**
 * @typedef {Object} SavedCard
 * @property {string} id
 * @property {string} name
 * @property {number} at  when it was saved
 * @property {string} target @property {string} source
 * @property {Record<string, unknown>} spec  the spec fields that differ from a fresh card's
 * @property {{mode:''|'cut'|'fold', flip:'short-edge'|'long-edge'}} finish
 * @property {number} dpi
 * @property {import('../core/pack.js').SheetEdits} [edits]  the reader's own terms and
 *   corrections for the pair, where there are any
 * @property {{sections:number, items:number, faces:number, width:number, height:number}} summary
 *   what the list says about it, as it was when saved: the page size in points
 * @property {number} [binned]  when it went to the recycle bin
 */

/** Every saved card, the recycle bin's past its two weeks gone. @returns {SavedCard[]} */
function readCards() {
  /** @type {SavedCard[]} */ let cards;
  try {
    cards = JSON.parse(store.get(KEY) ?? '[]');
  } catch {
    // A corrupt store is the same as none, as every personal store here treats it.
    return [];
  }
  const kept = cards.filter((card) => !card.binned || Date.now() - card.binned < BIN_MS);
  if (kept.length < cards.length) writeCards(kept).catch(() => {});
  return kept;
}

/** @param {SavedCard[]} cards */
function writeCards(cards) {
  return store.set(KEY, JSON.stringify(cards));
}

/** For Delete everything. */
export function forgetCards() {
  return store.remove(KEY);
}

/** A card with a fresh id, in the list. @param {Omit<SavedCard, 'id'|'binned'>} card */
async function addCard(card) {
  const saved = { ...card, id: `${Date.now().toString(36)}${Math.floor(performance.now()).toString(36)}` };
  await writeCards([...readCards(), saved]);
  return saved;
}

/** @param {string} id @param {Partial<SavedCard>} patch */
function changeCard(id, patch) {
  return writeCards(readCards().map((card) => (card.id === id ? { ...card, ...patch } : card)));
}

/**
 * An exported card read back, or the reasons it is not one. Checked as far as it has
 * to be for the studio to open on it: what names the pair, and that the rest has the
 * shape the studio reads.
 * @param {string} text
 * @returns {{ok: true, card: Omit<SavedCard, 'id'|'binned'>} | {ok: false, problems: string[]}}
 */
export function readExport(text) {
  /** @type {any} */ let file;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, problems: ['not JSON'] };
  }
  if (file?.kind !== KIND || file.version !== 1) return { ok: false, problems: [`not a ${KIND}, version 1`] };
  const card = file.card ?? {};
  const plain = (/** @type {unknown} */ v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const problems = [
    ...['name', 'target', 'source'].filter((k) => typeof card[k] !== 'string' || !card[k]).map((k) => `card.${k}: missing`),
    ...['spec', 'finish', 'summary'].filter((k) => !plain(card[k])).map((k) => `card.${k}: not an object`),
    ...(typeof card.dpi === 'number' ? [] : ['card.dpi: not a number']),
    ...(card.edits === undefined || (plain(card.edits.overrides) && Array.isArray(card.edits.extras))
      ? [] : ['card.edits: not a set of edits']),
  ];
  return problems.length ? { ok: false, problems } : { ok: true, card };
}

/**
 * The settings section: save the card in front of you under a name, or open the list.
 * @param {object} config
 * @param {() => Omit<SavedCard, 'id'|'name'|'at'|'binned'>} config.snapshot  the card as it stands
 * @param {string} config.name  a name to offer, which the reader can change
 * @param {(target: string, source: string) => string} config.pairName  "Chinese to English"
 * @param {(code: string) => boolean} config.known  a language this app has, for an import
 * @param {(blob: Blob, name: string) => void} config.save  hand a file to the reader
 */
export function savedCardsSection({ snapshot, name, pairName, known, save }) {
  const status = el('p', { class: 'speaker-why', role: 'status' });
  const keep = el('button', { type: 'button', class: 'chip', text: t('cards.save') });
  keep.addEventListener('click', () => askText({
    label: t('cards.name'),
    save: t('cards.nameSave'),
    close: t('gallery.previewClose'),
    value: name,
    kind: 'cards-name',
    onSave: async (named) => {
      const card = await addCard({ ...snapshot(), name: named || name, at: Date.now() });
      status.textContent = t('cards.saved', { name: card.name });
    },
  }));
  const open = el('button', { type: 'button', class: 'chip', text: t('cards.open') });
  open.addEventListener('click', () => openSavedCards({ pairName, known, save }));
  const help = helpTip(t('cards.lede'));
  return el('fieldset', { class: 'speaker-block saved-cards-block' }, [
    el('legend', {}, [t('cards.heading'), help.button]), help.tip,
    el('div', { class: 'speaker-actions' }, [keep, open]), status,
  ]);
}

/**
 * The list, in a dialog of its own: every saved card with what it is, to load, export
 * or bin, and the recycle bin behind a button at its foot.
 * @param {{pairName: (target: string, source: string) => string, known: (code: string) => boolean,
 *   save: (blob: Blob, name: string) => void}} config
 */
function openSavedCards({ pairName, known, save }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings saved-cards', 'aria-label': t('cards.heading') }));
  const head = dialogHead({ title: t('cards.heading'), close: t('gallery.previewClose'), onClose: () => panel.close() });
  const body = el('div', { class: 'saved-cards-body' });
  panel.append(head, body);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
  const date = (/** @type {number} */ at) => new Intl.DateTimeFormat(uiLanguage(), { dateStyle: 'medium' }).format(at);

  /** One card's name and what it is. @param {SavedCard} card @param {string} when */
  const facts = (card, when) => [
    el('span', { class: 'saved-card-name', text: card.name }),
    el('span', { class: 'small', text: pairName(card.target, card.source) }),
    el('span', { class: 'small muted', text: t('cards.facts', {
      sections: card.summary.sections, items: card.summary.items, faces: card.summary.faces,
      width: number(card.summary.width / 72, 1), height: number(card.summary.height / 72, 1),
    }) }),
    el('span', { class: 'small muted', text: when }),
  ];
  /** A button that is a bin, named for what it does. @param {string} label */
  const binButton = (label) => {
    const button = el('button', { type: 'button', class: 'saved-card-bin', 'aria-label': label, title: label });
    button.innerHTML = BIN_MARK;
    return button;
  };

  /** @param {string} [note]  what the last action did, said in the list's status line */
  function list(note = '') {
    const cards = readCards();
    const shown = cards.filter((card) => !card.binned).sort((a, b) => b.at - a.at);
    const status = el('p', { class: 'speaker-why', role: 'status', text: note });
    // A real file input, as the backup's is: every phone and screen reader knows it.
    const file = /** @type {HTMLInputElement} */ (
      el('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden' }));
    const importing = el('button', { type: 'button', class: 'chip', text: t('cards.import') });
    importing.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const got = readExport(await chosen.text());
      const strange = got.ok ? [got.card.target, got.card.source].filter((code) => !known(code)) : [];
      if (!got.ok || strange.length) {
        // The sentence is translated; the reasons under it name keys out of the file.
        status.replaceChildren(t('cards.refused'), ' ', el('span', {
          lang: 'en', dir: 'ltr', text: got.ok ? `unknown language: ${strange.join(', ')}` : got.problems.join('; '),
        }));
        status.classList.add('speaker-refused');
        return;
      }
      const card = await addCard({ ...got.card, at: Date.now() });
      list(t('cards.imported', { name: card.name }));
    });
    const binned = cards.filter((card) => card.binned).length;
    const toBin = el('button', { type: 'button', class: 'chip saved-cards-to-bin' });
    toBin.innerHTML = BIN_MARK;
    toBin.append(t('cards.bin', { count: binned }));
    toBin.addEventListener('click', () => bin());
    body.replaceChildren(
      el('div', { class: 'speaker-actions' }, [importing, file]), status,
      shown.length
        ? el('ul', { class: 'saved-card-list' }, shown.map((card) => {
          const load = el('button', { type: 'button', class: 'btn primary', text: t('cards.load') });
          load.addEventListener('click', () => loadCard(card, pairName));
          const exporting = el('button', { type: 'button', class: 'btn', text: t('cards.export') });
          exporting.addEventListener('click', () => {
            const { id, binned: _, ...rest } = card;
            save(new Blob([JSON.stringify({ kind: KIND, version: 1, card: rest }, null, 2)], { type: 'application/json' }),
              `${card.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'card'}.json`);
          });
          const away = binButton(t('cards.toBin', { name: card.name }));
          away.addEventListener('click', async () => { await changeCard(card.id, { binned: Date.now() }); list(); });
          return el('li', { class: 'saved-card' }, [
            el('div', { class: 'saved-card-facts' }, facts(card, t('cards.savedOn', { date: date(card.at) }))),
            el('div', { class: 'saved-card-do' }, [load, exporting, away]),
          ]);
        }))
        : el('p', { class: 'speaker-why', text: t('cards.none') }),
      el('div', { class: 'saved-cards-foot' }, [toBin]),
    );
  }

  function bin() {
    const binned = readCards().filter((card) => card.binned)
      .sort((a, b) => /** @type {number} */ (b.binned) - /** @type {number} */ (a.binned));
    const back = el('button', { type: 'button', class: 'chip', text: t('cards.back') });
    back.addEventListener('click', () => list());
    const all = el('button', { type: 'button', class: 'chip', text: t('cards.deleteAll') });
    all.addEventListener('click', async () => {
      const { ok } = await askConfirm({
        title: t('cards.deleteAllTitle'), body: t('cards.deleteAllBody'),
        yes: t('cards.deleteAllYes'), no: t('cards.deleteAllNo'), close: t('gallery.previewClose'),
      });
      if (!ok) return;
      await writeCards(readCards().filter((card) => !card.binned));
      bin();
    });
    body.replaceChildren(
      el('h3', { class: 'saved-cards-bin-title', text: t('cards.binTitle') }),
      el('p', { class: 'speaker-why', text: t('cards.binLede') }),
      el('div', { class: 'speaker-actions' }, [back, ...(binned.length ? [all] : [])]),
      binned.length
        ? el('ul', { class: 'saved-card-list' }, binned.map((card) => {
          const restore = el('button', { type: 'button', class: 'btn', text: t('cards.restore') });
          restore.addEventListener('click', async () => { await changeCard(card.id, { binned: undefined }); bin(); });
          const gone = binButton(t('cards.delete', { name: card.name }));
          gone.addEventListener('click', async () => {
            await writeCards(readCards().filter((other) => other.id !== card.id));
            bin();
          });
          return el('li', { class: 'saved-card' }, [
            el('div', { class: 'saved-card-facts' }, facts(card,
              t('cards.goes', { date: date(/** @type {number} */ (card.binned) + BIN_MS) }))),
            el('div', { class: 'saved-card-do' }, [restore, gone]),
          ]);
        }))
        : el('p', { class: 'speaker-why', text: t('cards.binEmpty') }),
    );
  }

  list();
}

/**
 * Make a saved card its pair's current card, and open the studio on it.
 *
 * The card's own terms and corrections replace the pair's, so where the pair has some of
 * its own that the card does not carry, the reader is asked first: that is the one part
 * of loading a card that could lose something that is not saved anywhere else.
 * @param {SavedCard} card @param {(target: string, source: string) => string} pairName
 */
async function loadCard(card, pairName) {
  const edits = card.edits ?? { overrides: {}, extras: [] };
  const held = loadEdits(card.target, card.source);
  const own = held.extras.length || Object.keys(held.overrides).length;
  if (own && JSON.stringify(held) !== JSON.stringify(edits)) {
    const { ok } = await askConfirm({
      title: t('cards.replaceTitle'), body: t('cards.replaceBody', { pair: pairName(card.target, card.source) }),
      yes: t('cards.replaceYes'), no: t('quiz.cancel'), close: t('gallery.previewClose'),
    });
    if (!ok) return;
  }
  await Promise.all([
    saveConfig(card.target, card.source, {
      spec: /** @type {any} */ (card.spec), finish: card.finish, dpi: card.dpi,
    }),
    saveEdits(card.target, card.source, edits),
  ]);
  location.href = `customize.html?target=${encodeURIComponent(card.target)}&source=${encodeURIComponent(card.source)}`;
}
