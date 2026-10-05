// The conversation page: load a board, resolve its phrases, and run the state
// machine that decides where every tap goes.
//
// Two people share one screen. The owner reads a grid of short labels in their own
// language; the person they are talking to reads one message at a time, very large,
// in theirs. This module owns the `BoardState`, `ui/conversation-view.js` draws it,
// and `core/conversation.js` decides what each action does -- so the navigation is
// unit-tested rather than inferred from the DOM.
//
// **Nothing here typesets.** No `SheetSpec`, no solver, no fontkit: a board is a
// view over language content, and `core/pack.js` is a data-only join. What this page
// downloads is the corpus rows for two languages and a JSON file.

import { resumeSection, wireSiteMenu } from './site-menu.js';
import { aboutSection, askCountry, askDetail, askDiet, readAbout, setDetail } from './about.js';
import {
  loadText, loadLanguages, readerLanguage, registerOffline, showFatal,
  deferUpdates, applyUpdateIfIdle, download, keepBoardOffline, keepOffline, accentFor,
} from './app.js';
import {
  loadCorpus, loadLanguage, loadVariants, loadKeys, fillLanguageSlots,
  loadRespellRules, loadRespellOverrides, loadCountries,
} from '../core/pack.js';
import { createRespeller, guessSounds, nameRespeller } from '../core/respell.js';
import { joinKeys, variantKey } from '../core/speaker.js';
import { lightSwitch } from './theme.js';
import {
  validateBoard, resolvePhrase, missingPhrases, reduce, openBoard, currentNode, DIET, joinSentences, MAX_BUTTONS,
} from '../core/conversation.js';
import {
  renderGrid, renderMessage, renderReply, renderEntry, clearStage, fitMessage, translatorLinks,
  holdable, openRateMenu,
} from './conversation-view.js';
import { resolveValue } from '../core/conversation.js';
import {
  parseAmount, parseClock, parseCount, parsePrice, formatQuantity, unitName, currencySign, supports,
} from '../core/quantity.js';
import { openBoardEditor } from './board-editor.js';
import { openBoardMenu } from './board-menu.js';
import { centreMark, topicMark } from './topic-marks.js';
import {
  readDisplay, writeDisplay, displaySection, readVoice, writeVoice, voiceSection,
} from './board-display.js';
import { speech } from './platform/speech.js';
import { keepAwake } from './platform/wake.js';
import { startBeacon, stopBeacon } from './platform/beacon.js';
import { isNative, notePlace, onBack } from './platform/shell.js';
import {
  read as readPersonal, placedOn, addPhrase, write as writePersonal, setOrder, arranged, removePlacement, showBuiltIn,
} from './board-store.js';
import { arrange } from './arrange.js';
import { find, openSearch, ownButton, reachable } from './board-search.js';
import { travelSection, undrawable } from './travel-check.js';
import { askChoices, askConfirm, askText } from './board-menu.js';
import {
  openSpeakerSettings, readProfile, noticeFor, personalSection,
} from './speaker-settings.js';
import { personalWiring } from './personal-data.js';
import { readUsage, recordUse, ranked, usageSection } from './usage.js';
import { applyStatic, loadCatalogue, loadUiLanguage, languageName, t } from './i18n.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** What the cell that opens each keypad says, in whichever language is reading it. */
/** The two marks of the board's switch for whom its sentences are said to. */
const MARS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
  + '<circle cx="10" cy="14" r="5"/><path d="M13.5 10.5 19 5M14.5 5H19v4.5"/></svg>';
const VENUS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
  + '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/></svg>';

const ENTRY_LABEL = /** @type {Record<string,string>} */ ({
  duration: 'board.otherAmount',
  clock: 'board.atTime',
  count: 'board.otherNumber',
  price: 'board.otherPrice',
});

/** What the keypad says when what has been typed is not a time, a number or a length. */
const ENTRY_INVALID = /** @type {Record<string,string>} */ ({
  duration: 'board.notAnAmount',
  clock: 'board.notATime',
  count: 'board.notANumber',
  price: 'board.notAPrice',
});

/**
 * The currencies a price can be given in, for the listener's keypad: those of the
 * countries that speak the listener's language first, in the registry's order, then
 * every other currency the registry knows, in a menu. Each is its sign and code as the
 * listener writes them -- the code is kept beside the sign, because `$` alone is a
 * dozen currencies -- and in the menu its name too.
 * @param {Awaited<ReturnType<typeof loadCorpus>>} corpus @param {string} listener
 */
function currenciesFor(corpus, listener) {
  const all = [...new Set(Object.values(corpus.regions).map((r) => r.currency).filter(Boolean))].sort();
  const own = [...new Set((corpus.languages[listener]?.regions ?? '').split(';')
    .map((r) => corpus.regions[r]?.currency).filter(Boolean))];
  const named = supports(listener) ? new Intl.DisplayNames([listener], { type: 'currency' }) : null;
  /** @param {string} code */
  const sign = (code) => { const s = currencySign(code, listener) ?? code; return s === code ? code : `${s} ${code}`; };
  return {
    // A listener whose language no country speaks still needs one to start from.
    shown: (own.length ? own : all.slice(0, 1)).map((code) => ({ code, label: sign(code) })),
    more: all.filter((code) => !own.includes(code))
      .map((code) => ({ code, label: named ? `${sign(code)} \u00b7 ${named.of(code)}` : sign(code) })),
  };
}

/**
 * Which grid cell opened the message on screen.
 *
 * Kept so focus can go back to it. Someone using a keyboard or a screen reader who
 * dismisses a message should land on the button they pressed, not at the top of the
 * grid -- and on a board of twelve near-identical cells, landing at the top means
 * counting from the beginning again.
 *
 * The **id**, not the element. Returning to the grid re-renders it, so the node that
 * was clicked has been replaced by the time focus is restored, and focusing a
 * detached element silently does nothing at all.
 */
let openedFrom = /** @type {string|null} */ (null);

/** Where the reader's own contexts are listed, and the board id one opens as. */
const CONTEXTS = 'contexts';
const OWN = 'own:';
/** The context the reader's own presses build: the buttons they use most. */
const MOST_USED = 'most-used';

/** Drop back to the list of conversations, keeping the pair. */
function toPicker() {
  const next = new URLSearchParams(location.search);
  next.delete('board');
  next.delete('screen');
  location.search = next.toString();
}

/**
 * Which conversation this is, asked before any of it.
 *
 * A board is a situation, not a phrasebook: what someone needs to say face down on a
 * massage table and what they need in a taxi have almost nothing in common, and a
 * single grid holding both would be a grid you have to read. So the first screen is
 * the situation, and every board after it is small enough to use without reading.
 *
 * Deliberately cheap. This loads one small JSON file and nothing else -- no corpus,
 * no language packs -- because it is the screen someone lands on and the one they
 * are most likely to hit with no signal.
 * @param {string} owner @param {string} listener
 */
/**
 * Whether this pair can hold this board.
 *
 * **Two lists, not a list of pairs.** `scripts/build_board_index.mjs` works out, per
 * board, which languages have every concept it names -- as a listener, where the
 * concept's `applies_to` scope is checked too, and as an owner, where it is not,
 * because the owner side is only a gloss. The pairs that work are the product, which
 * is how 53 languages describe 2,756 combinations in two short arrays.
 * @param {{listeners:string[], owners:string[]}} board
 * @param {string} listener @param {string} owner
 */
const serves = (board, /** @type {string} */ listener, /** @type {string} */ owner) => (
  board.listeners.includes(listener) && board.owners.includes(owner));


/**
 * Go somewhere else on this board page, by rewriting one query parameter.
 *
 * A full navigation rather than a re-render: the pair decides which corpus rows,
 * which two catalogues and which speaker variants are loaded, and every one of those
 * is read once during `main`. Re-deriving them in place would be a second, quieter
 * copy of the boot sequence.
 * @param {Record<string,string|null>} changes
 */
function goTo(changes) {
  const next = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key); else next.set(key, value);
  }
  location.search = next.toString();
}

/**
 * The codes one side of the pair could take, with the other side held fixed.
 *
 * Restricted to the board in front of the reader when there is one, so switching a
 * language cannot land them on a board that does not serve the pair they just asked
 * for. With no board open it is the union across all of them, which is what the
 * topic list is already showing.
 * @param {{boards:{id:string, listeners:string[], owners:string[]}[]}} index
 * @param {string|null} boardId @param {'listener'|'owner'} side @param {string} fixed
 */
function candidates(index, boardId, side, fixed) {
  /** @type {Set<string>} */ const out = new Set();
  for (const board of index.boards) {
    if (boardId && board.id !== boardId) continue;
    const mine = side === 'listener' ? board.listeners : board.owners;
    const theirs = side === 'listener' ? board.owners : board.listeners;
    if (theirs.includes(fixed)) for (const code of mine) out.add(code);
  }
  return [...out];
}

/**
 * A label's letters each turned a quarter in place, or put back.
 *
 * Turned, the label stays where it is and only its letters turn, to face whoever has
 * turned the phone -- the one reading the grid, whose "up" is the screen's right edge.
 * So the words and their letters are laid out from the right, which for that reader is
 * down the page, and wrap between words as the upright label does; the size comes down
 * only if the turned label would need more height than it had, so the bar and every
 * control in it stay exactly where they were. **Only a script written a character at a
 * time turns** -- Chinese, Japanese kana, Korean Hangul -- because a column of those is a
 * way the language is read. A column of turned Latin letters is not, and an alphabetic or
 * joining label stays a plain line, turned with the phone like everything else.
 * @param {HTMLElement} el  an element holding only text
 * @param {boolean} turned
 */
function turnLetters(el, turned) {
  const text = el.dataset.text ?? el.textContent ?? '';
  el.dataset.text = text;
  el.textContent = text;
  el.style.fontSize = '';
  const box = /** @type {HTMLElement} */ (el.closest('.board-title') ?? el);
  box.style.minBlockSize = '';
  if (!turned || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) return;
  const upright = box.getBoundingClientRect().height;
  // The room is the title's and the spacer's beside it, taken now: the title is sized
  // by its content, so measured after the letters change it only reports itself.
  const spacer = box.parentElement?.querySelector(':scope > .spacer');
  const room = box.getBoundingClientRect().width + (spacer?.getBoundingClientRect().width ?? 0);
  box.style.minBlockSize = `${upright}px`;
  // One child, as the upright text was: the title's button is a flex box, and words as
  // its children would be flex items on one row that never wraps.
  const line = document.createElement('span');
  line.className = 'board-letters';
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  line.append(...text.split(/(\s+)/).filter(Boolean).map((word) => {
    if (/^\s+$/.test(word)) return document.createTextNode(word);
    const group = document.createElement('span');
    group.className = 'board-word';
    for (const { segment } of graphemes.segment(word)) {
      const letter = document.createElement('span');
      letter.className = 'board-letter';
      letter.textContent = segment;
      group.append(letter);
    }
    return group;
  }));
  el.replaceChildren(line);
  for (let size = Number.parseFloat(getComputedStyle(el).fontSize);
    (box.getBoundingClientRect().height > upright + 0.5 || el.scrollWidth > room + 2) && size > 8;
    size *= 0.92) {
    el.style.fontSize = `${size * 0.92}px`;
  }
}

/**
 * Turn an element that already says something into the control that changes it.
 *
 * **Appearance is deliberately untouched.** The title and the pair are statements of
 * what is on screen, and they read correctly as statements; making them look like
 * buttons would add two more things competing with the grid for a glance. So the
 * button inherits everything visual from its parent and brings only a pointer, a
 * role and a focus ring -- which is the accessible minimum for something that acts.
 * @param {string} label @param {string} hint @param {(anchor:HTMLElement)=>void} onOpen
 */
function inlineControl(label, hint, onOpen) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'board-inline-switch';
  button.textContent = label;
  button.title = hint;
  button.setAttribute('aria-haspopup', 'menu');
  button.addEventListener('click', () => onOpen(button));
  return button;
}

/**
 * How the owner would spell the listener's sounds -- the card's `say` column.
 *
 * Built the way `core/sheet.js` builds it and nowhere else: the reader's rule table
 * keyed on their language *and accent* (Spanish respellings are `es-419`), the
 * respeller bound to the listener's whole `ipa` column so it can read off the
 * inventory and the syllable-opening clusters, and a hand-curated sheet first where
 * one exists for the triple. `undefined` for a reader whose language has no table,
 * which is a fact about the data and not a failure -- the line simply does not draw.
 * @param {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @param {string} listener @param {string} owner
 * @param {Record<string,Record<string,string>>} listenerRows
 * @param {(rel: string) => Promise<string>} [load]
 * @returns {Promise<((conceptId:string, ipa:string)=>string)|undefined>}
 */
async function respellerFor(corpus, listener, owner, listenerRows, load = loadText) {
  const accent = accentFor(corpus, owner);
  if (!corpus.respellRules.has(`${owner}__${accent}`)) return undefined;
  const [rules, curated] = await Promise.all([
    loadRespellRules(load, owner, accent),
    corpus.respellOverrides.has(`${listener}__${owner}__${accent}`)
      ? loadRespellOverrides(load, listener, owner, accent)
      : /** @type {Record<string,string>} */ ({}),
  ]);
  const respeller = createRespeller({
    rules,
    target: listener,
    targetIpa: Object.values(listenerRows).map((row) => (row.ipa ?? '').trim()).filter(Boolean),
  });
  return (conceptId, ipa) => curated[conceptId] ?? (ipa ? respeller.respell(ipa) : '');
}

/**
 * The settings' way into rearranging the screen behind them: it closes the settings
 * and hands the grid to `arrange`.
 * @param {() => void} start
 */
function arrangeRow(start) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn board-arrange';
  button.textContent = t('board.arrange');
  button.addEventListener('click', () => { button.closest('dialog')?.close(); start(); });
  return button;
}

/**
 * Rearrange the grid now on screen, and keep the order under `at` when Done is pressed --
 * with what was taken off it: a board's own button, or one of the list's own contexts,
 * is switched off there, and one of the reader's is taken off the screen. Asked first,
 * until the reader says it need not be.
 * @param {string} at @param {() => void} redraw
 */
function arrangeGrid(at, redraw) {
  arrange($('board-grid'), {
    bar: /** @type {HTMLElement} */ (document.querySelector('.board-bar')),
    status: $('board-status'),
    done: t('speaker.done'),
    hint: t('board.arrangeHint'),
    bin: t('arrange.bin'),
    onRemove: async (cell) => {
      if (!readDisplay().askRemove) return true;
      const { ok, askAgain } = await askConfirm({
        title: t('arrange.removeTitle', { button: cell.textContent?.trim() ?? '' }),
        body: t(at === CONTEXTS ? 'arrange.removeWhyContexts' : 'arrange.removeWhy'),
        yes: t('arrange.removeYes'), no: t('arrange.removeNo'), again: t('arrange.removeAgain'),
        close: t('gallery.previewClose'),
      });
      if (!askAgain) writeDisplay({ ...readDisplay(), askRemove: false });
      return ok;
    },
    onDone: async (ids, removed) => {
      /** @type {import('./board-store.js').BoardPersonal} */ let data = setOrder(readPersonal().data, at, ids);
      for (const id of removed) {
        const mine = at === CONTEXTS ? (id.startsWith(OWN) ? id.slice(OWN.length) : null) : (data.phrases[id] ? id : null);
        data = mine ? removePlacement(data, mine, at) : showBuiltIn(data, at, id, false);
      }
      await writePersonal(data);
      redraw();
    },
    onCancel: redraw,
  });
}

/**
 * The list's own contexts, a switch each: one taken off while rearranging comes back
 * here, and one never wanted can go without rearranging anything.
 * @param {Map<string, {title: string}>} topics @param {() => void} redraw
 */
function contextsSection(topics, redraw) {
  const box = document.createElement('details');
  box.className = 'speaker-block';
  const summary = document.createElement('summary');
  summary.textContent = t('contexts.shown');
  box.append(summary);
  const hidden = readPersonal().data.hidden?.[CONTEXTS] ?? [];
  for (const [id, { title }] of topics) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !hidden.includes(id);
    input.addEventListener('change', async () => {
      await writePersonal(showBuiltIn(readPersonal().data, CONTEXTS, id, input.checked));
      redraw();
    });
    const label = document.createElement('label');
    label.className = 'speaker-option';
    label.append(input, title);
    box.append(label);
  }
  return box;
}

/**
 * A name's sounds in each side's letters: the owner's, labelling the keys they build
 * it with, and the listener's, writing it to them. Both bound to the owner's IPA,
 * because the name's sounds are the owner's language's.
 * @param {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @param {string} listener @param {string} owner
 * @param {Record<string,Record<string,string>>} ownerRows
 */
async function nameSpellers(corpus, listener, owner, ownerRows) {
  const ownerIpa = Object.values(ownerRows).map((row) => (row.ipa ?? '').trim()).filter(Boolean);
  const spell = async (/** @type {string} */ code) => {
    const accent = accentFor(corpus, code);
    return corpus.respellRules.has(`${code}__${accent}`)
      ? nameRespeller(await loadRespellRules(loadText, code, accent), ownerIpa) : undefined;
  };
  const [spellOwner, spellListener] = await Promise.all([spell(owner), spell(listener)]);
  return spellOwner && spellListener ? { spellOwner, spellListener } : undefined;
}

/** The scripts a typed name is guessed from, by the letters it is typed in. */
const NAME_SCRIPTS = [['Latn', /\p{Script=Latin}/u], ['Cyrl', /\p{Script=Cyrillic}/u], ['Grek', /\p{Script=Greek}/u]];

/**
 * What the name's sounds are built with, for a dialog about to open: its keys, the whole
 * name spoken only where this device has a voice for the listener, and a first guess
 * at a typed name's sounds, read as the owner's language reads its letters.
 * @param {Awaited<ReturnType<typeof nameSpellers>>} spellers
 * @param {string} listener @param {string} voiceId  the reader's chosen voice, or `''`
 * @param {Awaited<ReturnType<typeof loadCorpus>>} corpus @param {string} owner
 * @returns {import('./about.js').Sounds|undefined}
 */
function soundsFor(spellers, listener, voiceId, corpus, owner) {
  return spellers && {
    ...spellers,
    guess: (name) => {
      const script = NAME_SCRIPTS.find(([, test]) => /** @type {RegExp} */ (test).test(name))?.[0]
        ?? corpus.languages[owner].script;
      return guessSounds(name, corpus.nameLetters, owner, /** @type {string} */ (script));
    },
    say: speech.getCapabilities(listener).voices.length ? (text) => {
      speech.speak({ text, locale: listener, voiceId: voiceId || undefined }).catch((error) => console.warn(error));
    } : undefined,
  };
}

/**
 * The diet sentences a pair can say, in the reader's own words, for the checklist.
 * @param {import('../core/conversation.js').ResolveContext} ctx
 */
function dietChoices(ctx) {
  return DIET
    .map((id) => ({ id, said: resolvePhrase({ kind: 'corpus', id }, ctx) }))
    .filter(({ said }) => said)
    .map(({ id, said }) => ({ value: id, label: /** @type {any} */ (said).owner.text }));
}

/** The scripts the languages here are written in, to tell whether two strings share one. */
const SCRIPTS = ['Latin', 'Cyrillic', 'Greek', 'Armenian', 'Georgian', 'Hebrew', 'Arabic', 'Ethiopic',
  'Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam',
  'Thai', 'Lao', 'Khmer', 'Hangul', 'Hiragana', 'Katakana', 'Han']
  .map((name) => ({ name, test: new RegExp(`\\p{Script=${name}}`, 'u') }));
const scriptOf = (/** @type {string} */ text) => SCRIPTS.find((s) => s.test.test(text))?.name ?? '';

/**
 * The reader's details as the listener reads and hears them. A name built from its
 * sounds is said from its IPA, and written in the listener's letters where those are
 * not the letters it was typed in: ニカライ for a Japanese listener, but "Nikolai"
 * still for a German one, whose letters would only spell it worse.
 * @param {Record<string,string>} about @param {((ipa:string) => string)|undefined} spellListener
 * @returns {Record<string,string>}
 */
function detailsFor(about, spellListener) {
  const ipa = about.name_ipa;
  if (!about.name || !ipa || !spellListener) return about;
  const written = spellListener(ipa);
  return {
    ...about,
    'name:ipa': ipa,
    ...(written && scriptOf(written) !== scriptOf(about.name) ? { 'name:listener': written } : {}),
  };
}

/**
 * The Most used section of a Converse settings dialog, wired to the display record that
 * holds its window and scope.
 * @param {string} listener @param {string} owner @param {(code: string) => string} nameOf
 * @param {() => void} redraw  after a change, or a reset
 */
function mostUsedSection(listener, owner, nameOf, redraw) {
  const held = readDisplay();
  return usageSection({
    current: { usedOver: held.usedOver, usedPooled: held.usedPooled },
    onChange: (next) => { writeDisplay({ ...readDisplay(), ...next }); redraw(); },
    language: nameOf(listener),
    lang: listener,
    label: (key, item) => item.said?.[owner] ?? Object.values(item.said ?? {})[0] ?? key,
    onReset: redraw,
  });
}

/**
 * The Most used screen as a board built on the spot, from what the reader has pressed:
 * each item the button it was last pressed on -- copied from its board with that
 * board's answers, or one of the reader's own -- in order of use. Twice a screen's worth
 * is copied, because the page drops what this pair cannot say and what the reader has
 * taken off the screen before it keeps the first twelve.
 * @param {string} listener @param {string} pair
 * @param {import('./board-display.js').BoardDisplay} display
 * @param {{data: import('./board-store.js').BoardPersonal}} personal
 */
async function mostUsedBoard(listener, pair, display, personal) {
  const picked = ranked(readUsage(), display.usedOver, display.usedPooled ? null : listener);
  /** @type {Map<string, any>} */ const boards = new Map();
  /** @type {any[]} */ const buttons = [];
  /** @type {Record<string, any>} */ const replySets = {};
  for (const { key, item } of picked) {
    if (buttons.length >= 2 * MAX_BUTTONS) break;
    const { board: from, node, button: id, phrase } = item.at;
    if (phrase) {
      const p = personal.data.phrases[phrase];
      if (!p || p.pair !== pair || p.screen) continue;
      buttons.push({ ...ownButton(p), id: key, origin: item.at, mine: p.id });
      continue;
    }
    // A board that has since been taken out of the app leaves its presses behind; they
    // are passed over, and said so, rather than stopping the screen from opening.
    if (!boards.has(from)) {
      boards.set(from, await loadText(`data/boards/${from}.json`).then(JSON.parse, (err) => {
        console.warn(`[plg] most used: ${from} is not a board any more:`, err.message);
        return null;
      }));
    }
    const source = boards.get(from);
    const found = source?.nodes[node]?.buttons.find((/** @type {any} */ b) => b.id === id);
    if (!found) continue;
    const set = found.replySetId ? `${from}~${found.replySetId}` : null;
    if (set) replySets[set] = source.replySets[found.replySetId];
    buttons.push({ ...found, id: key, origin: item.at, ...(set ? { replySetId: set } : {}) });
  }
  return {
    schemaVersion: 1, id: MOST_USED, titleKey: 'boards.mostUsed.title', rootNodeId: 'used',
    nodes: { used: { buttons } }, replySets,
  };
}

/**
 * @param {string} owner @param {string} listener
 * @param {{boards:{id:string, titleKey:string, listeners:string[], owners:string[], icon?:string, alert?:true}[]}} index
 * @param {(code: string) => string} nameOf
 */
async function showPicker(owner, listener, index, nameOf) {
  /** @type {[string, {title:string, icon?:string, alert?:true}][]} */ const served = [];
  for (const board of index.boards) {
    if (!serves(board, listener, owner)) continue;
    served.push([board.id, { title: t(board.titleKey), icon: board.icon, alert: board.alert }]);
  }
  // **Most used, near the top**: the buttons the reader keeps reaching for, gathered from
  // every context, so the next time they are one tap away. After the emergency context,
  // which the list keeps across its top; moved or taken off the list like any other.
  // A pair with no board to press has nothing to gather either.
  if (served.length) served.splice(served[0][1].alert ? 1 : 0, 0, [MOST_USED, { title: t('boards.mostUsed.title'), icon: 'most-used' }]);
  const topics = new Map(served);
  $('board-title').textContent = t('board.pickTopic');
  $('board-title').title = t('board.pickTopic');
  document.title = t('board.docTitle');
  /** @type {Promise<Awaited<ReturnType<typeof pairContext>>>|undefined} */ let pairing;
  // **The same settings as a context's**, less what only a context has -- rearranging its
  // screen -- and with what only the list has: which contexts are on it, and their order.
  // The pair's sentences are read when the bars are pressed rather than with the list,
  // which is the screen a reader lands on and the one most likely opened with no signal.
  wireSiteMenu(() => {
    (async () => {
      const ctx = await (pairing ??= pairContext(listener, owner));
      const { corpus } = ctx;
      const [spellers, countries] = await Promise.all([
        nameSpellers(corpus, listener, owner, ctx.ownerRows),
        corpus.countries.has(owner) && corpus.countries.has(listener) ? loadCountries(loadText, owner) : null,
      ]);
      const nothing = () => {};
      openSpeakerSettings({
        axes: corpus.speakerAxes,
        languages: [listener, owner],
        profile: readProfile(),
        onChange: nothing,
        extra: [arrangeRow(() => arrangeGrid(CONTEXTS, drawTopics)),
          contextsSection(topics, () => drawTopics()),
          aboutSection(nothing, dietChoices(ctx), soundsFor(spellers, listener, readVoice(listener), corpus, owner),
            countries ? () => askCountry(countries, owner, nothing) : undefined),
          displaySection(readDisplay(), nothing,
            { canSpeak: speech.getCapabilities(listener).voices.length > 0, language: nameOf(listener) }),
          mostUsedSection(listener, owner, nameOf, nothing),
          voiceSection({ lang: listener, voices: speech.getCapabilities(listener).voices, current: readVoice(listener), onChange: nothing }),
          ...resumeSection(),
          travelFor(listener, owner, index, nameOf),
          // An import can bring contexts of the reader's own, so the list is drawn again.
          personalSection(personalWiring({ save: download, onChanged: () => drawTopics() }))],
      });
    })().catch(showFatal);
  });
  // **The context list has a parent too**, and it is the card this was opened from.
  // Without this the only way off the first screen of Converse was the browser's own
  // Back, which a reader who arrived from the app's own link does not think of as
  // available -- and which does not exist at all in the native shell.
  const out = $('board-up');
  out.hidden = false;
  out.setAttribute('aria-label', t('board.toGallery'));
  out.title = t('board.toGallery');
  out.addEventListener('click', () => { location.href = './'; });
  const searching = wireSearch({
    owner,
    // The corpus only when the search is opened: this list is the screen a reader
    // lands on, and the one most likely to be opened with no signal.
    entries: async () => searchEntries(await (pairing ??= pairContext(listener, owner)), index, {}),
    // A screen or a context found is a place to go; a sentence keeps the search behind it.
    pick: (found, query) => visit(found, found.button.kind === 'submenu' ? '' : query),
    back: () => drawTopics(),
  });
  onBack(searching.close, './');
  if (!topics.size) $('board-status').textContent = t('board.noBoards');
  // **Contexts of the reader's own** after the board's, made with the plus in the bar, as
  // a board's own buttons are: a hotel's check-in, a clinic, whatever the shipped
  // contexts do not cover. Each is a screen of theirs kept for this pair, opened as a
  // board of the buttons they put on it.
  const pair = `${listener}__${owner}`;
  const make = $('board-add-bar');
  make.hidden = false;
  make.setAttribute('aria-label', t('board.addContext'));
  make.title = t('board.addContext');
  make.addEventListener('click', () => askText({
    label: t('board.contextName'),
    save: t('editor.save'),
    close: t('gallery.previewClose'),
    kind: 'context-ask',
    onSave: async (label) => {
      if (!label) return;
      const made = addPhrase(readPersonal().data, { label, owner: '', listener: '', pair, screen: true }, CONTEXTS);
      await writePersonal(made.data);
      goTo({ board: `${OWN}${made.id}`, screen: null });
    },
  }));
  function drawTopics() {
  const personal = readPersonal();
  const mine = placedOn(personal.data, CONTEXTS, pair).filter((p) => p.screen);
  const off = personal.data.hidden?.[CONTEXTS] ?? [];
  /** @type {import('../core/conversation.js').BoardButton[]} */
  // In the reader's order where they have dragged one.
  const buttons = arranged([
    ...[...topics].filter(([id]) => !off.includes(id))
      .map(([id, { icon, alert }]) => ({ id, kind: /** @type {const} */ ('submenu'), icon, alert })),
    ...mine.map((p) => ({ id: `${OWN}${p.id}`, kind: /** @type {const} */ ('submenu'), own: /** @type {const} */ (true) })),
  ], /** @type {import('./board-store.js').BoardPersonal} */ (personal.data).order?.[CONTEXTS]);
  // Every button here goes deeper, so the dash that says so on a mixed grid has
  // nothing to contrast with and is just twelve dashed boxes. They stay submenus --
  // that is what they do -- and the stylesheet drops the marking for this one grid.
  $('board-grid').classList.add('board-grid-topics');
  renderGrid($('board-grid'), { buttons }, {
    lang: owner,
    label: (button) => topics.get(button.id)?.title
      ?? /** @type {{label: string}} */ (mine.find((p) => `${OWN}${p.id}` === button.id)).label,
    available: () => true,
    onPick: (button) => goTo({ board: button.id, screen: null }),
  });
  // The emergency topic across the top when an odd count would leave a gap at the foot.
  if (buttons.length % 2) $('board-grid').querySelector('.board-cell-alert')?.classList.add('board-cell-wide');
  }
  drawTopics();
  // **Turned with the boards.** A phone laid on the counter for a conversation is still
  // laid there when the reader backs out to choose another, so the list turns too, and
  // can be turned from here.
  let display = readDisplay();
  const turn = $('board-turn-bar');
  turn.hidden = false;
  turn.setAttribute('aria-label', t('board.turn'));
  turn.title = t('board.turn');
  const paintTurn = () => {
    turn.setAttribute('aria-pressed', String(display.turned));
    document.querySelector('.board-main')?.classList.toggle('board-main-turned', display.turned);
    turnLetters($('board-title'), display.turned);
  };
  paintTurn();
  turn.addEventListener('click', () => {
    display = { ...display, turned: !display.turned };
    writeDisplay(display);
    paintTurn();
  });
  registerOffline();
}

/**
 * Everything `resolvePhrase` reads for a pair: the corpus and only the rows two
 * languages need, their language slots filled, and the respeller.
 * @param {string} listener @param {string} owner
 * @param {(rel: string) => Promise<string>} [load]
 */
async function pairContext(listener, owner, load = loadText) {
  // `loadCorpus` reads the registries and the concept bank; `loadLanguage` reads one
  // pack. Both come from `core/pack.js`, which is a 44KB data-only module --
  // statically imported, because making it lazy would buy nothing and a board cannot
  // start without it.
  const corpus = await loadCorpus(load);
  const [listenerRows, ownerRows] = await Promise.all([
    loadLanguage(load, listener, corpus.groups),
    loadLanguage(load, owner, corpus.groups),
  ]);
  // **Seven concepts name a language, and the name comes from the pair.** The sheet
  // has always filled these; the board never did, so `do-you-speak-english` would
  // have shown a stranger the literal string `{source}`. They are exactly the phrases
  // a board wants -- "I do not speak Chinese", "please write it down" -- so the fix is
  // to fill them here too rather than to keep them off every board.
  const slots = { target: listener, source: owner };
  fillLanguageSlots(listenerRows, {
    ...slots, locale: listener, names: corpus.languageNames[listener],
  });
  fillLanguageSlots(ownerRows, { ...slots, locale: owner, names: corpus.languageNames[owner] });
  // Direction is a fact about a *script*, not about a language, which is why it
  // takes two lookups: the registry says Urdu is written in Arabic script, and
  // `scripts.csv` says Arabic script runs right to left.
  const dirOf = (/** @type {string} */ code) => /** @type {'ltr'|'rtl'} */ (
    corpus.scripts[corpus.languages[code]?.script]?.direction === 'rtl' ? 'rtl' : 'ltr');
  return {
    corpus,
    listenerRows,
    ownerRows,
    listener,
    owner,
    listenerDir: dirOf(listener),
    ownerDir: dirOf(owner),
    respell: await respellerFor(corpus, listener, owner, listenerRows, load),
    // The words of the reader's sentences that carry them, for the buttons' labels.
    ownerKeys: corpus.coverage.emphasis?.includes(owner) ? await loadKeys(load, owner) : {},
  };
}

/**
 * What a button says in the reader's language: its short label where it has one, the
 * reader's own label for a button of theirs, and otherwise the sentence itself --
 * or null, where this pair cannot say it.
 * @param {import('../core/conversation.js').BoardButton} button
 * @param {import('../core/conversation.js').ResolveContext} ctx
 * @param {Record<string, import('./board-store.js').CustomPhrase>} phrases
 */
function wording(button, ctx, phrases) {
  if (button.labelKey) return t(button.labelKey);
  const own = phrases[button.id];
  if (own?.label) return own.label;
  if (button.phraseRef?.kind === 'custom') return own?.owner || null;
  return button.phraseRef ? resolvePhrase(button.phraseRef, ctx)?.owner.text ?? null : null;
}

/**
 * The pre-travel checks for a pair, fresh for each run. Every file is loaded the way a
 * board loads it and noted, so the last check can ask whether each one is kept on the
 * device -- which a load alone cannot tell while there is a connection.
 * @param {string} listener @param {string} owner
 * @param {{boards:{id:string, listeners:string[], owners:string[]}[]}} index
 * @param {(code: string) => string} nameOf
 * @returns {import('./travel-check.js').Check[]}
 */
function travelChecks(listener, owner, index, nameOf) {
  /** @type {Set<string>} */ const used = new Set();
  const load = (/** @type {string} */ rel) => { used.add(rel); return loadText(rel); };
  /** @type {(Awaited<ReturnType<typeof pairContext>> & import('../core/conversation.js').ResolveContext)|undefined} */ let pairing;
  /** @type {import('../core/conversation.js').ResolvedPhrase[]} */ let said = [];
  const loaded = () => {
    if (!pairing) throw new Error(t('check.notTried'));
    return pairing;
  };
  const count = (/** @type {number} */ n) => String(n);
  return [
    {
      label: t('check.phrases', { listener: nameOf(listener), owner: nameOf(owner) }),
      run: async () => {
        pairing = await pairContext(listener, owner, load);
        const { corpus } = pairing;
        await Promise.all([
          loadCatalogue(listener, load), loadCatalogue(owner, load),
          ...[listener, owner].filter((code) => corpus.speakerAxes[code]?.length || corpus.listenerAxes[code]?.length)
            .map((code) => loadVariants(load, code)),
        ]);
        // The country names, given to the sentences that say one as a board gives them.
        if (corpus.countries.has(owner) && corpus.countries.has(listener)) {
          const [mine, theirs] = await Promise.all([loadCountries(load, owner), loadCountries(load, listener)]);
          pairing.choices = { country: { owner: mine, listener: theirs } };
        }
        return { state: 'pass', detail: t('check.phrasesDetail', { count: count(Object.keys(pairing.listenerRows).length) }) };
      },
    },
    {
      label: t('check.contexts'),
      run: async () => {
        const ctx = loaded();
        const boards = await Promise.all(index.boards.filter((b) => serves(b, listener, owner))
          .map(async (b) => JSON.parse(await load(`data/boards/${b.id}.json`))));
        const broken = boards.flatMap((b) => validateBoard(b).map((problem) => `${b.id}: ${problem}`));
        if (broken.length) throw new Error(broken.join('; '));
        const gaps = boards.reduce((n, b) => n + missingPhrases(b, ctx).length, 0);
        said = boards.flatMap((b) => Object.values(b.nodes).flatMap((node) => node.buttons))
          .filter((b) => b.kind === 'message' && b.phraseRef)
          .map((b) => resolvePhrase(b.phraseRef, ctx))
          .filter((p) => p !== null)
          // One waiting for the reader's own detail is not a sentence yet.
          .filter((p) => !p.unfilled);
        const words = { contexts: count(boards.length), buttons: count(said.length), gaps: count(gaps) };
        return gaps ? { state: 'warn', detail: t('check.contextsGaps', words) }
          : { state: 'pass', detail: t('check.contextsDetail', words) };
      },
    },
    {
      label: t('check.writing', { language: nameOf(listener) }),
      run: async () => {
        loaded();
        const chars = [...new Set(said.map((p) => p.listener.text).join(''))].filter((c) => /[\p{L}\p{N}]/u.test(c));
        const font = `32px ${getComputedStyle(document.body).fontFamily}`;
        await document.fonts.load(font, chars.join(''));
        const missing = undrawable(chars, font);
        return missing.length
          ? { state: 'fail', detail: t('check.writingMissing', { count: count(missing.length), letters: missing.slice(0, 8).join(' ') }) }
          : { state: 'pass', detail: t('check.writingDetail', { count: count(chars.length) }) };
      },
    },
    {
      label: t('check.sayIt'),
      run: async () => {
        loaded();
        const bare = said.filter((p) => !p.listener.ipa && !p.listener.say).length;
        const words = { count: count(said.length - bare), total: count(said.length) };
        return bare ? { state: 'warn', detail: t('check.sayItGaps', words) } : { state: 'pass', detail: t('check.sayItDetail', words) };
      },
    },
    {
      label: t('check.voice', { language: nameOf(listener) }),
      run: async () => {
        // A browser can list its voices a moment after it is first asked.
        for (let i = 0; i < 10 && speech.getCapabilities(listener).reason === 'loading'; i += 1) {
          await new Promise((resolve) => { setTimeout(resolve, 150); });
        }
        const { voices, offline } = speech.getCapabilities(listener);
        if (!voices.length) return { state: 'warn', detail: t('check.voiceNone') };
        if (offline === 'local') return { state: 'pass', detail: t('check.voiceHere') };
        return { state: 'warn', detail: t(offline === 'remote' ? 'check.voiceOnline' : 'check.voiceUnknown') };
      },
    },
    {
      label: t('check.saved'),
      run: async () => {
        if (isNative()) return { state: 'pass', detail: t('check.bundled') };
        if (!navigator.serviceWorker?.controller) return { state: 'fail', detail: t('check.noWorker') };
        /** @type {string[]} */ const missing = [];
        for (const url of used) if (!(await caches.match(url, { ignoreSearch: true }))) missing.push(url);
        return missing.length
          ? { state: 'fail', detail: t('check.unsaved', { count: count(missing.length) }),
            action: { label: t('check.saveNow'), run: () => keepOffline(missing) } }
          : { state: 'pass', detail: t('check.savedDetail', { count: count(used.size) }) };
      },
    },
  ];
}

/**
 * The settings' Before you travel for the pair on screen: its check, its two languages
 * saved first, and the cards worth making before going, opened set up for this pair.
 * @param {string} listener @param {string} owner
 * @param {{boards:{id:string, listeners:string[], owners:string[]}[]}} index
 * @param {(code: string) => string} nameOf
 */
function travelFor(listener, owner, index, nameOf) {
  const pair = `target=${encodeURIComponent(listener)}&source=${encodeURIComponent(owner)}`;
  return travelSection({
    nameOf,
    loadText,
    pair: [listener, owner],
    checks: () => travelChecks(listener, owner, index, nameOf),
    suggestions: [
      { href: `customize.html?${pair}&geometry=phone-1col`, label: t('check.lockScreen') },
      { href: `customize.html?${pair}`, label: t('check.pocketCard') },
    ],
  });
}

/** @typedef {import('./board-search.js').Reached & {label: string}} Findable */

/**
 * Everything the search can find for this pair: each context, and every button on
 * every screen of every one -- the boards' and the reader's own -- that the pair can
 * say, in the reader's words. A sentence on two screens is found once, on the first.
 * @param {import('../core/conversation.js').ResolveContext} ctx
 * @param {{boards:{id:string, titleKey:string, listeners:string[], owners:string[], icon?:string, alert?:true}[]}} index
 * @param {Record<string, any>} loaded  boards already in memory, by id
 * @returns {Promise<Findable[]>}
 */
async function searchEntries(ctx, index, loaded) {
  const data = readPersonal().data;
  const pair = `${ctx.listener}__${ctx.owner}`;
  const off = data.hidden?.[CONTEXTS] ?? [];
  const served = index.boards.filter((b) => serves(b, ctx.listener, ctx.owner) && !off.includes(b.id));
  const boards = await Promise.all(served.map(async (b) => loaded[b.id]
    ?? JSON.parse(await loadText(`data/boards/${b.id}.json`))));
  const mine = placedOn(data, CONTEXTS, pair).filter((p) => p.screen);
  /** @type {Findable[]} */
  const contexts = [
    ...served.map((b) => ({ board: b.id, path: [], label: t(b.titleKey),
      button: /** @type {import('../core/conversation.js').BoardButton} */ ({ id: b.id, kind: 'submenu', icon: b.icon, alert: b.alert }) })),
    ...mine.map((p) => ({ board: `${OWN}${p.id}`, path: [], label: p.label,
      button: /** @type {import('../core/conversation.js').BoardButton} */ ({ id: `${OWN}${p.id}`, kind: 'submenu', own: true }) })),
  ];
  const sayable = (/** @type {import('../core/conversation.js').BoardButton} */ b) => (
    b.kind === 'submenu' || b.kind === 'beacon'
    || (b.kind === 'message' && Boolean(b.phraseRef?.kind === 'custom'
      ? data.phrases[b.phraseRef.id] : b.phraseRef && resolvePhrase(b.phraseRef, ctx))));
  const seen = new Set();
  /** @type {Findable[]} */ const buttons = [];
  for (const f of reachable([...boards, ...mine.map((p) => ({ id: `${OWN}${p.id}`, rootNodeId: p.id, nodes: {} }))], data, pair)) {
    const said = f.button.kind === 'message' ? `${f.button.phraseRef?.kind}:${f.button.phraseRef?.id}` : `${f.board}/${f.button.id}`;
    const label = sayable(f.button) && !seen.has(said) ? wording(f.button, ctx, data.phrases) : null;
    if (!label) continue;
    seen.add(said);
    buttons.push({ ...f, label });
  }
  return [...contexts, ...buttons];
}

/** A found button, where it is: its context, its screen, and pressed there -- except a
 * beacon, which is not started for anyone who has not pressed the beacon itself -- with
 * the search it was found by, open again behind it.
 * @param {Findable} found @param {string} [query] */
const visit = (found, query = '') => goTo({
  board: found.board,
  screen: found.path.slice(1).join('/') || null,
  open: found.path.length && found.button.kind !== 'beacon' ? found.button.id : null,
  q: query.trim() || null,
});

/** How many found buttons are drawn at once; past this the reader is asked to type more. */
const FOUND_MAX = 48;

/**
 * The header's search, on the context list and on every board: typing finds buttons on
 * all of this pair's contexts, marked where they match, and pressing one goes there.
 * **The search stays open behind the press**, so closing the message it made comes back
 * to the results, as typed, rather than to the board under them; `query` reopens one
 * carried here from another board.
 * @param {{owner: string, entries: () => Promise<Findable[]>,
 *   pick: (found: Findable, query: string) => void, back: () => void, query?: string}} config
 *   `back` draws the screen the search was opened over
 * @returns {{close: () => boolean, again: () => boolean}} `close` closes an open search and
 *   says whether one was open; `again` draws its results back over the grid, if there are any
 */
function wireSearch({ owner, entries, pick, back, query: reopen = '' }) {
  const open = $('board-search');
  open.hidden = false;
  open.setAttribute('aria-label', t('search.open'));
  open.title = t('search.open');
  const grid = $('board-grid');
  const status = $('board-status');
  /** @type {null | (() => void)} */ let close = null;
  let said = '';
  /** @type {Findable[]} */ let all = [];
  let query = '';
  /** @param {(Findable & {at: [number, number]})[]} found */
  const show = (found) => {
    const byId = new Map(found.slice(0, FOUND_MAX).map((f, i) => [`found-${i}`, f]));
    const of = (/** @type {{id:string}} */ b) => /** @type {Findable & {at: [number, number]}} */ (byId.get(b.id));
    grid.classList.remove('board-grid-topics');
    grid.classList.add('board-grid-results');
    renderGrid(grid, { buttons: [...byId].map(([id, f]) => ({ ...f.button, id })) }, {
      lang: owner,
      label: (b) => of(b).label,
      mark: (b) => of(b).at,
      available: () => true,
      onPick: (b) => pick(of(b), query),
    });
    status.textContent = !found.length ? t('search.none')
      : found.length > FOUND_MAX ? t('search.more', { shown: String(FOUND_MAX), count: String(found.length) }) : '';
  };
  const restore = () => {
    grid.classList.remove('board-grid-results');
    status.textContent = said;
    back();
  };
  /** @param {string} [value] */
  const start = async (value = '') => {
    all = await entries();
    said = status.textContent ?? '';
    close = openSearch({
      bar: /** @type {HTMLElement} */ (open.closest('.board-header')),
      lang: owner,
      placeholder: t('search.open'),
      closeLabel: t('search.close'),
      value,
      onQuery: (typed) => { query = typed; if (typed.trim()) show(find(all, typed, owner)); else restore(); },
      onClose: () => { close = null; query = ''; restore(); open.focus(); },
    });
  };
  open.addEventListener('click', () => start());
  if (reopen) start(reopen);
  return {
    close: () => {
      if (!close) return false;
      close();
      return true;
    },
    again: () => {
      if (!close || !query.trim()) return false;
      show(find(all, query, owner));
      return true;
    },
  };
}

async function main() {
  const params = new URLSearchParams(location.search);
  const { languages, coverage } = await loadLanguages();
  const owner = params.get('source') || readerLanguage(languages, coverage);
  const listener = params.get('target') || 'zh-Hans';
  const boardId = params.get('board');
  notePlace({ target: listener, source: owner, ...(boardId ? { board: boardId } : {}) });

  await loadUiLanguage(owner, loadText);
  applyStatic();

  // The pair, before either branch: it is the same statement of who is about to be
  // shown what, whether or not a board has been chosen yet.
  const named = Object.fromEntries(languages.map((l) => [l.bcp47, l]));
  /** @param {string} code */
  const nameOf = (code) => languageName(code, named[code]?.exonym_en ?? code);
  /** @type {{boards:{id:string, titleKey:string, listeners:string[], owners:string[], icon?:string}[]}} */
  const index = JSON.parse(await loadText('data/boards/index.json'));

  // **The pair is the switcher for the pair.** Both names were already on screen
  // saying exactly which two languages are loaded, and the only way to change either
  // was to go back to the gallery and start again -- two navigations away from a
  // fact the reader is looking straight at.
  //
  // `t` is asked for the sentence with two control characters standing in for the
  // names, because the order is the catalogue's business (Urdu writes
  // `{source} <- {target}`) and splitting the rendered string on the sentinels is the
  // only way to find the halves without re-implementing the substitution here.
  // Control characters rather than words: `isolate` in `ui/i18n.js` wraps an insert
  // in FSI/PDI only when it contains a letter, so these two pass through clean.
  const pairLine = $('board-pair');
  pairLine.replaceChildren();
  for (const piece of t('board.pair', { source: '\u0001', target: '\u0002' })
    .split(/([\u0001\u0002])/)) {
    if (piece !== '\u0001' && piece !== '\u0002') {
      if (piece) pairLine.append(document.createTextNode(piece));
      continue;
    }
    const side = piece === '\u0001' ? 'owner' : 'listener';
    const code = side === 'owner' ? owner : listener;
    pairLine.append(inlineControl(nameOf(code), t('board.switchLanguage'), (button) => {
      const indexed = index.boards.some((b) => b.id === boardId) ? boardId : null;
      const options = candidates(index, indexed, side, side === 'owner' ? listener : owner)
        .filter((c) => c !== code)
        .map((c) => ({ code: c, label: nameOf(c) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      // Each also in its own name, for a phone handed to someone whose language the
      // reader does not know: they cannot find it spelled in the reader's language.
      openBoardMenu(button, options.map((option) => ({
        label: option.label,
        own: { text: named[option.code]?.endonym || named[option.code]?.endonym_roman || '', lang: option.code },
        run: () => goTo({ [side === 'owner' ? 'source' : 'target']: option.code }),
      })));
    }));
  }

  if (!boardId) { await showPicker(owner, listener, index, nameOf); return; }

  // **A context of the reader's own** opens as a board built here: one node, the screen
  // they named, holding what they placed on it -- the path their screens inside a board
  // already take. Deleted since it was last open, the list is where to be.
  const own = boardId.startsWith(OWN) ? readPersonal().data.phrases[boardId.slice(OWN.length)] : null;
  if (boardId.startsWith(OWN) && !own?.screen) { goTo({ board: null, screen: null }); return; }
  const board = own
    ? { schemaVersion: 1, id: boardId, titleKey: '', rootNodeId: own.id, nodes: { [own.id]: { buttons: [] } } }
    : boardId === MOST_USED
      ? await mostUsedBoard(listener, `${listener}__${owner}`, readDisplay(), readPersonal())
      : JSON.parse(await loadText(`data/boards/${boardId}.json`));
  const title = own ? own.label : t(board.titleKey);
  // Built here from the reader's own presses rather than authored, like a context of
  // their own, so there is no file to hold to the board format.
  const problems = own || boardId === MOST_USED ? [] : validateBoard(board);
  // A malformed board is a loud failure, not a page that half works: it is authored
  // data, and the person who sees this is the one who can fix it.
  if (problems.length) throw new Error(`data/boards/${boardId}.json: ${problems.join('; ')}`);

  const pairing = await pairContext(listener, owner);
  const { corpus, listenerRows, ownerRows } = pairing;
  /** @type {import('../core/conversation.js').ResolveContext} */
  const ctx = pairing;

  // **The listener's own catalogue, read without becoming the interface language.**
  // `loadUiLanguage` above set the owner's; calling it again for the listener would
  // change the owner's persisted preference and flip the document's direction, which
  // is exactly what a Reply control must not do.
  const theirs = await loadCatalogue(listener, loadText);

  // Each side's word for every country, where both languages have them: the owner
  // chooses from theirs and the listener is told in theirs.
  // Asked for only where this board says it: the settings offer the detail on a board
  // with a button that uses it, not on every one.
  const saysCountry = Object.values(board.nodes).some((n) => n.buttons.some(
    (/** @type {import('../core/conversation.js').BoardButton} */ b) => b.phraseRef
      && 'fill' in b.phraseRef && b.phraseRef.fill === 'country'));
  const worded = saysCountry && corpus.countries.has(owner) && corpus.countries.has(listener);
  if (worded) {
    const [mine, theirs] = await Promise.all([loadCountries(loadText, owner), loadCountries(loadText, listener)]);
    ctx.choices = { country: { owner: mine, listener: theirs } };
  }
  const askFrom = worded
    ? () => askCountry(/** @type {NonNullable<typeof ctx.choices>} */ (ctx.choices).country.owner, owner, detailsChanged)
    : undefined;
  const spellers = await nameSpellers(corpus, listener, owner, ownerRows);
  ctx.details = detailsFor(readAbout(), spellers?.spellListener);
  /** Re-read the reader's details after they change, and redraw with them. */
  const detailsChanged = () => { ctx.details = detailsFor(readAbout(), spellers?.spellListener); paint(); };
  /** @param {import('../core/conversation.js').BoardButton} button */
  const fillOf = (button) => (button.phraseRef?.kind === 'diet' ? 'diet'
    : button.phraseRef && 'fill' in button.phraseRef ? button.phraseRef.fill : undefined);

  // What the message screen carries, which is the reader's own choice. Re-read
  // rather than captured when it changes, so the dialog's checkbox and the screen
  // behind it cannot disagree.
  let display = readDisplay();
  // Which voice reads the listener's sentence, when the reader has opinions.
  let chosenVoice = readVoice(listener);
  const sounds = () => soundsFor(spellers, listener, chosenVoice, corpus, owner);

  // **Whose voice the outgoing messages are in.** Fetched for whichever of the two
  // languages declares an axis at all — usually neither, and never more than two
  // small files — so that answering the question later needs no round trip and no
  // reload. `variantKey` is recomputed on every change; the tables are not.
  const variants = Object.fromEntries(await Promise.all(
    [listener, owner]
      .filter((code) => corpus.speakerAxes[code]?.length || corpus.listenerAxes[code]?.length)
      .map(async (code) => [code, await loadVariants(loadText, code)]),
  ));
  let profile = readProfile();
  // Which of the listener's language's axes about whom it is said to -- a man or a woman,
  // a stranger or a friend -- it declares, each drawn as a switch only where it does.
  const listenerAxis = (/** @type {string} */ name) => corpus.listenerAxes[listener]?.find((a) => a.axis === name);
  const voice = () => {
    // **To whom, as well as by whom**, on the listener's side only: the reader's own
    // gloss is not said to anyone. Neutral and polite unless the reader has the
    // switches on; `variantKey` leaves out a value it is not given.
    const to = variantKey(corpus.listenerAxes[listener] ?? [], {
      listener_gender: display.addressSwitch ? display.addressee : '',
      register: display.registerSwitch ? display.register : '',
    });
    for (const [code, side] of /** @type {const} */ ([[listener, 'listenerVoice'], [owner, 'ownerVoice']])) {
      const table = variants[code];
      const by = variantKey(corpus.speakerAxes[code] ?? [], profile);
      ctx[side] = table ? { key: side === 'listenerVoice' ? joinKeys(by, to) : by, variants: table } : undefined;
    }
  };
  voice();

  // **Whether anything can say this language, asked once and re-asked if the list
  // fills in later.** Browsers often return an empty voice list on first call and
  // populate it afterwards, so a Speak control that was absent at first paint has to
  // be able to appear. Nothing here makes a sound, and nothing waits on it: the text
  // is drawn whatever this returns.
  let canSpeak = speech.getCapabilities(listener).voices.length > 0;
  speech.onVoicesChanged(() => {
    const now = speech.getCapabilities(listener).voices.length > 0;
    if (now !== canSpeak) { canSpeak = now; paint(); }
  });

  // **A board serves pairs, not targets.** Resolving a phrase needs a row on both
  // sides, so a board written in Mandarin and English is a board for an English
  // reader. Saying so plainly beats letting `missingPhrases` report that every
  // button is unavailable, which is true and tells the reader nothing.
  const listed = JSON.parse(await loadText('data/boards/index.json'))
    .boards.find((/** @type {any} */ b) => b.id === boardId);
  // Most used is made of buttons this pair was pressing, from boards that serve it.
  if (!own && boardId !== MOST_USED && (!listed || !serves(listed, listener, owner))) {
    // Naming the side that is short, rather than listing the pairs it does serve:
    // that list used to be one pair and is now most of a fifty-three-language
    // registry, which tells a reader nothing they can act on.
    throw new Error(t('board.wrongPair', {
      board: t(board.titleKey),
      language: languageName(
        listed && listed.owners.includes(owner) ? listener : owner,
        named[listed && listed.owners.includes(owner) ? listener : owner]?.exonym_en ?? '',
      ),
    }));
  }

  // **Checked before the board opens, not when a button is pressed.** A reader who
  // taps a cell and gets nothing has been told about the gap at the worst possible
  // moment; the cells the corpus cannot supply are drawn unavailable from the start,
  // and the grid never rearranges to hide them.
  const gaps = new Set(missingPhrases(board, ctx));

  /**
   * The two things worth saying under the grid, and neither is an error.
   *
   * The second is the one that matters here: where a language does inflect for who
   * is speaking and the reader has not said, the board is showing the masculine
   * form, and it says so rather than letting a silent default stand. A line of text,
   * not a modal — somebody who opened this to show a stranger a sentence should not
   * first have to answer a question about themselves.
   */
  /** Whether Most used has nothing yet, for the status line. */
  let usedEmpty = false;
  const sayStatus = () => {
    $('board-status').textContent = [
      usedEmpty ? t('mostUsed.empty') : '',
      gaps.size ? t('board.someMissing', { count: String(gaps.size) }) : '',
      noticeFor(corpus.speakerAxes, [listener, owner], profile) ?? '',
    ].filter(Boolean).join(' ');
  };
  sayStatus();

  // The title is `nowrap` and ellipsises at enlarged text rather than costing the
  // grid a row, so the full name goes in `title` too -- and it is on the context grid
  // in full either way, which is where a reader who cannot read it here will look.
  // **The title of the context is the way to a different context.** It already
  // names the one you are in; the alternative was the up-arrow back to the topic
  // list and then a second tap, which is two navigations to change one thing.
  const others = index.boards
    .filter((b) => b.id !== boardId && serves(b, listener, owner))
    .map((b) => ({ id: b.id, label: t(b.titleKey), icon: b.icon }))
    .sort((a, b) => a.label.localeCompare(b.label));
  // After the name, the context's own mark -- the watermark its cell carries on the
  // list, small and solid enough to read -- and each context's mark in the menu.
  const icon = boardId === MOST_USED ? 'most-used' : listed?.icon;
  const titleMark = icon ? topicMark(icon, 'plg-title-mark', owner) : null;
  titleMark?.setAttribute('class', 'board-title-mark');
  $('board-title').replaceChildren(
    inlineControl(title, t('board.switchTopic'), (button) => {
      openBoardMenu(button, [
        ...others.map((o) => ({
          label: o.label, mark: o.icon && { name: o.icon, lang: owner }, run: () => goTo({ board: o.id, screen: null }),
        })),
        { label: t('board.allTopics'), run: () => goTo({ board: null, screen: null }) },
      ]);
    }),
    ...(titleMark ? [titleMark] : []),
  );
  if (titleMark) centreMark(titleMark);
  $('board-title').title = title;
  document.title = `${title} \u2014 ${t('nav.brand')}`;

  // **Replies are on unless a session says otherwise.** They were behind `?replies=1`
  // while the reply screen was being built, and the effect was that the "can be
  // answered" tint and its ↩ mark meant nothing: those cells behaved exactly like
  // every other one, because the Reply control they promise never appeared. A
  // question shown to a stranger with no way for them to answer it is the board
  // failing at the thing it is for.
  let state = openBoard(board, params.get('replies') !== '0');
  const pair = `${listener}__${owner}`;
  // Hydrated once. The page is authoritative from here; the editor hands back a new
  // value rather than the page asking the disk what was just written.
  let personal = readPersonal();
  // **The screen the reader was on**, from the address: changing a language reloads
  // the page, and it came back at the board's first screen. Each step must still be a
  // screen of this board, or of the reader's own, to be followed.
  const deeper = (params.get('screen') ?? '').split('/')
    .filter((id) => board.nodes[id] || personal.data.phrases[id]?.screen);
  if (deeper.length) state = { ...state, path: [state.path[0], ...deeper] };
  /** The reply sets the reader's own questions carry, rebuilt with the screen by `withOwn`.
   * @type {Record<string, {buttons: import('../core/conversation.js').BoardButton[]}>} */
  let ownSets = {};
  // Which screens a placement may name. Only this board's, because that is what is
  // loaded -- a package for another board is not refused, it simply has nothing here
  // to check against, which is the plain-backup case.
  /** @type {Record<string, Set<string>>} */
  const knownScreens = { [boardId]: new Set(Object.keys(board.nodes)) };

  /**
   * The node as the reader has it: the author's buttons, then their own.
   *
   * Appended rather than mixed in, and never sorted -- the author's arrangement is
   * the one a reader has learned, and their own additions go where they put them.
   * `custom` phrases carry their text, so `resolvePhrase` reads them out of the
   * store rather than the corpus.
   * @param {import('../core/conversation.js').BoardNode} node
   */
  const withOwn = (node) => {
    const mine = placedOn(personal.data, `${boardId}/${state.path.at(-1)}`, pair);
    // On Most used the reader's own phrases arrive as copies of the button they were
    // pressed as, and need their words and answers like the ones placed on a screen.
    const copied = /** @type {typeof mine} */ (node.buttons.filter((b) => b.mine)
      .map((b) => personal.data.phrases[/** @type {string} */ (b.mine)]).filter(Boolean));
    /** @type {Record<string, {owner:string, listener:string}>} */
    const custom = Object.fromEntries([...mine, ...copied].map((p) => [p.id, { owner: p.owner, listener: p.listener }]));
    // **A phrase of the reader's own with answers is a question** like the board's:
    // its answers become a reply set of their own, each resolved from the store as the
    // phrase itself is, and "none of these" after them -- so a stranger whose answer is
    // not there can still say so, and be offered a translator.
    ownSets = {};
    for (const p of [...mine, ...copied]) {
      // A button taken from a board brings the answers it had there, from the corpus.
      if (p.concept) {
        if (!p.answers?.length) continue;
        ownSets[`own/${p.id}`] = {
          buttons: p.answers.map((id) => ({ id, kind: /** @type {const} */ ('message'), phraseRef: { kind: /** @type {const} */ ('corpus'), id } })),
        };
        continue;
      }
      const replies = (p.replies ?? []).filter((r) => r.owner && r.listener);
      if (!replies.length) continue;
      ownSets[`own/${p.id}`] = {
        buttons: /** @type {import('../core/conversation.js').BoardButton[]} */ ([
          ...replies.map((r, i) => {
            custom[`${p.id}/${i}`] = r;
            return { id: `${p.id}/${i}`, kind: 'message', phraseRef: { kind: 'custom', id: `${p.id}/${i}` } };
          }),
          { id: 'none-of-these', kind: 'message', phraseRef: { kind: 'corpus', id: 'board-answers.none-of-these' } },
        ]),
      };
    }
    ctx.custom = custom;
    const held = /** @type {import('./board-store.js').BoardPersonal} */ (personal.data);
    const at = `${boardId}/${state.path.at(-1)}`;
    const hidden = held.hidden?.[at] ?? [];
    // In the order the reader dragged this screen into, where they have.
    const buttons = arranged([
      ...node.buttons.filter((b) => !hidden.includes(b.id))
        .map((b) => (b.mine && ownSets[`own/${b.mine}`] ? { ...b, replySetId: `own/${b.mine}` } : b)),
      // A screen of the reader's own opens like the board's submenus do; its id is
      // the node the path moves to, and what is on it is placed under that id. A
      // button taken from a board says its concept, as it did there.
      ...mine.map((p) => ({ ...ownButton(p), ...(ownSets[`own/${p.id}`] ? { replySetId: `own/${p.id}` } : {}) })),
    ], held.order?.[at]);
    // Most used keeps a screen's worth of what this pair can say, after the reader's
    // own arrangement and whatever they took off it.
    return {
      ...node,
      buttons: boardId === MOST_USED
        ? buttons.filter((b) => b.kind === 'beacon' || phraseOf(b)).slice(0, MAX_BUTTONS) : buttons,
    };
  };

  /**
   * The node the path is on: the board's own, or a screen the reader made, which the
   * board file does not have and the personal store does. A screen deleted from under
   * the path is an empty node rather than a crash, and Up leaves it.
   * @returns {import('../core/conversation.js').BoardNode}
   */
  const nodeHere = () => currentNode(board, state)
    ?? { title: personal.data.phrases[/** @type {string} */ (state.path.at(-1))]?.label ?? '', buttons: [] };

  /**
   * @param {import('../core/conversation.js').BoardButton} button
   * @param {boolean} [incoming] true when the *listener* is the one who taps it
   */
  const phraseOf = (button, incoming) => (button.phraseRef
    ? resolvePhrase(button.phraseRef, ctx, incoming) : null);

  /**
   * The lines a button carries under its own words, as the settings ask: the other
   * side's words, then how to say the listener's sentence in the reader's letters and in
   * IPA. `other` is the side the button is not labelled in -- the listener's on the
   * reader's grid, the reader's on the listener's answers.
   * @param {{text:string, lang:string, dir?:string}} other
   * @param {{say?:string, ipa?:string}} spoken  the listener's side, whose sound it is
   * @returns {import('./conversation-view.js').SubLine[]}
   */
  const linesOf = (other, spoken, show = { words: display.cellWords, say: display.cellSay, ipa: display.cellIpa }) => (
    /** @type {import('./conversation-view.js').SubLine[]} */ ([
      show.words && { text: other.text, lang: other.lang, dir: other.dir, kind: 'words' },
      show.say && spoken.say && { text: spoken.say, lang: owner, kind: 'say' },
      show.ipa && spoken.ipa && { text: `/${spoken.ipa}/`, lang: 'und-fonipa', dir: 'ltr', kind: 'ipa' },
    ].filter(Boolean)));


  /**
   * The phrase with the language's "excuse me" in front of it, on both sides.
   *
   * The excuse row's text is one reviewed sentence and the request another; they
   * are joined the way two sentences are, with a stop from the excuse's own script
   * when it does not carry one. Nothing is inflected and nothing is lowercased,
   * because both are language-specific and this must hold in fifty-one.
   * @param {import('../core/conversation.js').ResolvedPhrase} phrase
   */
  const politely = (phrase) => {
    const excuse = resolvePhrase({ kind: 'corpus', id: 'social-basics.excuse-me-sorry' }, ctx);
    if (!excuse) return phrase;
    return {
      ...phrase,
      listener: {
        ...phrase.listener,
        text: joinSentences(excuse.listener.text, phrase.listener.text),
        say: [excuse.listener.say, phrase.listener.say].filter(Boolean).join(' \u00b7 '),
        ipa: [excuse.listener.ipa, phrase.listener.ipa].filter(Boolean).join(' | '),
      },
      owner: { ...phrase.owner, text: joinSentences(excuse.owner.text, phrase.owner.text) },
    };
  };

  /** @param {import('../core/conversation.js').BoardButton} button */
  const labelOf = (button) => (button.add ? t('editor.open')
    : wording(button, ctx, personal.data.phrases) ?? button.id);
  /**
   * The words of a button's label to set in bold, and their colour where the reader
   * asked for colour: the owner's key words for a sentence the boards supply, the
   * reader's own for one of theirs -- only those the label as drawn contains, since a
   * short label or a variant's wording may not.
   * @param {import('../core/conversation.js').BoardButton} button
   */
  const keysOf = (button) => {
    const said = labelOf(button);
    const own = personal.data.phrases[button.id];
    const concept = button.phraseRef?.kind === 'corpus' ? button.phraseRef.id : own?.concept;
    const words = ((concept ? pairing.ownerKeys[concept] : own?.keys) ?? []).filter((/** @type {string} */ w) => said.includes(w));
    if (!words.length) return null;
    return { words, tone: display.colourKeys && concept ? corpus.keyTones[concept] : undefined };
  };

  /**
   * What the reader is told when the voice fails, in their language. An unfamiliar
   * reason is still a failure worth reporting; a bare key is not what to report it with.
   * @param {string} reason
   */
  const speechTrouble = (reason) => {
    const said = t(`speech.${reason}`);
    return said === `speech.${reason}` ? t('speech.synthesis-failed') : said;
  };

  /** @param {any} action */
  const dispatch = (action) => {
    const next = reduce(state, action);
    if (next === state) return;
    // **Silence before anything else.** Never queue the next sentence behind the
    // last: "stronger" arriving after "stop" is the worst thing this could do.
    speech.stop();
    state = next;
    paint();
  };

  /**
   * What a press said, for the Most used screen: the concept (with the detail it fills),
   * the reader's own phrase, the diet line, or the beacon.
   * @param {import('../core/conversation.js').BoardButton} button
   */
  const usageKey = (button) => {
    if (button.kind === 'beacon') return `beacon:${button.beacon}`;
    const ref = button.phraseRef;
    if (!ref) return null;
    if (ref.kind === 'corpus') return `c:${ref.id}${'fill' in ref && ref.fill ? `:${ref.fill}` : ''}`;
    return ref.kind === 'custom' ? `own:${ref.id}` : ref.kind;
  };
  /** Count a press, against the button it was made on -- or, on Most used, the one copied.
   * @param {import('../core/conversation.js').BoardButton} button */
  const countPress = (button) => {
    const key = usageKey(button);
    if (!key) return;
    const at = button.origin ?? {
      board: boardId, node: /** @type {string} */ (state.path.at(-1)), button: button.id,
      ...(personal.data.phrases[button.id] ? { phrase: button.id } : {}),
    };
    recordUse(key, at, listener, { [owner]: labelOf(button) })
      .catch((err) => console.warn('[plg] a press was not counted:', err.message));
  };

  /**
   * Speak on tap: the button says its sentence where it is and the grid stays, for a
   * listener who cannot look at the screen -- a driver given one direction a tap. The
   * button shows it is speaking, with a ring and a speaker, until the sentence ends;
   * the next tap cuts in rather than waiting. A question then opens its answers, where
   * the reader asked for that.
   * @param {import('../core/conversation.js').BoardButton} button
   */
  /** Which tap is speaking, so one that was cut off does not end the next one's signs. */
  let speaking = 0;
  /**
   * @param {import('../core/conversation.js').BoardButton} button
   * @param {boolean} [opens]  a question opens its answers once said, where the settings ask;
   *   a hold only says it
   */
  const sayOnTap = (button, opens = true) => {
    const phrase = phraseOf(button);
    if (!phrase) return;
    const shown = display.polite && boardId !== 'emergency' && !phrase.custom ? politely(phrase) : phrase;
    const answers = opens && Boolean(button.replySetId && display.tapAnswers && state.replies);
    if (answers) {
      openedFrom = button.id;
      dispatch({ type: 'open', buttonId: button.id, kind: button.kind, nodeId: button.nodeId });
      dispatch({ type: 'reply' });
    } else {
      speech.stop();
    }
    const grid = $('board-grid');
    for (const lit of grid.querySelectorAll('.board-cell-speaking')) lit.classList.remove('board-cell-speaking');
    const cell = answers ? null : grid.querySelector(`[data-button="${CSS.escape(button.id)}"]`);
    cell?.classList.add('board-cell-speaking');
    // **And the switch pulses while it speaks**: a phone on mute says nothing, and the
    // owner, eyes on the road with the driver, should see that it is speaking anyway.
    const token = ++speaking;
    tapButton.classList.add('board-tap-speaking');
    const done = () => {
      cell?.classList.remove('board-cell-speaking');
      if (token === speaking) tapButton.classList.remove('board-tap-speaking');
    };
    speech.speakPhrase(shown, { rate: display.rate, voiceId: chosenVoice || undefined }).then(done, (err) => {
      done();
      $('board-status').textContent = speechTrouble(err?.reason ?? 'synthesis-failed');
    });
  };

  /**
   * What pressing a button on the grid does -- or pressing it in the search's results,
   * which is the same press made from somewhere else.
   * @param {import('../core/conversation.js').BoardButton} button
   */
  const pickButton = (button) => {
    if (button.add) { openEditor(); return; }
    // Not given yet: the first press asks for the detail rather than showing a
    // sentence with a hole in it.
    const unfilled = phraseOf(button)?.unfilled;
    if (unfilled === 'diet') { askDiet(dietChoices(ctx), detailsChanged); return; }
    if (unfilled === 'country') { askFrom?.(); return; }
    if (unfilled) { askDetail(unfilled, detailsChanged, sounds()); return; }
    // **Not a state change, and deliberately not part of the board's own
    // machine.** A beacon is not something being said -- there is no message,
    // no reply, nothing to return from -- so it takes over the screen and hands
    // it straight back. Leaving `state` alone means the grid is exactly where
    // it was when the beacon stops, which is what someone who has just been
    // found needs.
    if (button.kind === 'beacon') {
      countPress(button);
      speech.stop();
      // **The word on it is the stranger's, not the reader's.** A beacon exists
      // to be read by whoever is walking past, so the one thing on this screen
      // that must not be in the reader's language is the word itself. The
      // corpus already carries it -- reviewed, in the native script, for every
      // pack that can be a listener -- so this is the same phrase the `Help`
      // cell says, shown at the size of the display instead of spoken.
      // `beacon.dismiss` stays the reader's, because it is the reader who has
      // to know how to stop it.
      const help = ctx.listenerRows['emergency-medical.help'];
      startBeacon({
        mode: button.beacon === 'sos' ? 'sos' : 'attention',
        siren: display.siren,
        switches: {
          siren: t('beacon.siren'), torch: t('beacon.torch'),
          lights: t('boards.emergency.lights'), noTorch: t('beacon.noTorch'),
        },
        label: button.beacon === 'sos'
          ? theirs.t('beacon.sos')
          : (help?.text || theirs.t('beacon.help')),
        lang: listener,
        dir: ctx.listenerDir,
        dismiss: t('beacon.dismiss'),
        fit: fitMessage,
        // The screen is the signal, so it must not sleep while one is running
        // -- and the lock goes back to following the message view afterwards.
        onStop: holdAwake,
      });
      keepAwake(true);
      return;
    }
    if (button.kind !== 'submenu') countPress(button);
    if (button.kind !== 'submenu' && display.tapSpeaks && canSpeak) { sayOnTap(button); return; }
    openedFrom = button.id;
    dispatch({
      type: 'open', buttonId: button.id, kind: button.kind, nodeId: button.nodeId,
    });
  };

  /**
   * The screen stays on while a sentence is being read by someone else -- a stranger
   * reading an unfamiliar script off a phone held at arm's length will often take
   * longer than the display timeout, and the screen going dark means starting the
   * exchange over -- and while taps speak, between one direction to a driver and the
   * next, so the phone is not locked again each time it is wanted.
   */
  function holdAwake() {
    keepAwake(state.view !== 'grid' || (display.tapSpeaks && canSpeak));
  }

  /** The header's search, once it is wired; a press made from it leaves it open. */
  let searching = { close: () => false, again: () => false };
  /** Whether the bar's eye is held, and every button shows what the peek settings name. */
  let peeking = false;

  /**
   * A question's answers in the reader's words, for the eye: what the stranger can say
   * back, read the way the answer grid reads each kind.
   * @param {import('../core/conversation.js').BoardButton} button
   */
  const answersOf = (button) => {
    const set = button.replySetId ? board.replySets?.[button.replySetId] ?? ownSets[button.replySetId] : null;
    // "None of these" ends every set, so it says nothing about this one.
    return (set?.buttons ?? []).filter((/** @type {any} */ b) => b.phraseRef?.id !== 'board-answers.none-of-these')
      .map((/** @type {any} */ b) => (b.kind === 'value' ? resolveValue(b.value, ctx)?.owner.text
      : b.kind === 'entry' ? t(ENTRY_LABEL[b.entry] ?? 'board.otherAmount') : phraseOf(b, true)?.owner.text))
      .filter(Boolean).join(' \u00b7 ');
  };

  function paint() {
    const stage = $('board-stage');
    const shown = withOwn(nodeHere());
    // **An empty screen offers its first button** -- a context the reader has just
    // made, or one whose buttons are all switched off -- as the dashed plus the list of
    // contexts ends in, opening the editor the bar's plus opens. Most used is filled by
    // pressing buttons elsewhere, so it says that instead.
    const node = shown.buttons.length || boardId === MOST_USED ? shown
      : { ...shown, buttons: [{ id: 'add-button', kind: /** @type {const} */ ('submenu'), add: /** @type {const} */ (true) }] };
    usedEmpty = boardId === MOST_USED && !shown.buttons.length;
    sayStatus();
    holdAwake();
    // A waiting deploy installs here, between things, and nowhere else.
    applyUpdateIfIdle();

    if (state.view !== 'grid') {
      for (const id of ['site-menu', 'board-turn-bar', 'board-add-bar', 'board-search', 'board-tap-bar', 'board-peek-bar', 'board-addressee', 'board-register']) $(id).hidden = true;
    }
    // Turned is for the whole tree, not one screen of it: the owner's grid turns
    // with the sentence and the answers, so a phone laid on the counter reads one
    // way from the first tap to the last -- and the bar under it turns with it, so
    // its arrow points back and its topic reads the same way as the buttons.
    document.querySelector('.board-main')?.classList.toggle('board-main-turned', display.turned);
    // A search left open behind a message is the owner's; the stranger reading the
    // message does not see it.
    document.querySelector('.board-header')?.classList.toggle('board-header-quiet', state.view !== 'grid');
    turnLetters(/** @type {HTMLElement} */ ($('board-title').firstElementChild ?? $('board-title')), display.turned);
    if (state.view === 'grid') {
      clearStage(stage);
      // Kept in the address, where a language switch, a reload and the app's own
      // resume all find it.
      const screen = state.path.slice(1).join('/');
      const here = new URL(location.href);
      if (screen) here.searchParams.set('screen', screen); else here.searchParams.delete('screen');
      if (here.href !== location.href) history.replaceState(history.state, '', here);
      notePlace({ target: listener, source: owner, ...(boardId ? { board: boardId } : {}), ...(screen ? { screen } : {}) });
      // At the root the parent is the topic list, not a node -- so the control stays
      // rather than vanishing, and says where it goes. Somewhere to go back *to* is
      // the difference between one board and the whole app.
      // The arrow says "out of here" wherever you are: up a submenu, or back to the
      // context list from a board's root. Its accessible name says which.
      const atRoot = state.path.length < 2;
      for (const id of ['board-up', 'site-menu', 'board-turn-bar', 'board-add-bar', 'board-search', 'board-peek-bar']) $(id).hidden = false;
      // Nothing is made on Most used; it is what the other screens' presses make.
      if (boardId === MOST_USED) $('board-add-bar').hidden = true;
      paintTap();
      paintAddressee();
      $('board-up').setAttribute('aria-label', atRoot ? t('board.allTopics') : t('board.up'));
      $('board-grid').classList.toggle('board-grid-words', display.sizedToWords);
      $('board-grid').classList.toggle('board-grid-even', display.evenType);
      renderGrid($('board-grid'), node, {
        lang: owner,
        title: node.titleKey ? t(node.titleKey) : node.title,
        label: labelOf,
        // A submenu and a beacon are always available: neither is a phrase, so
        // neither can be missing from the corpus.
        available: (button) => (button.kind === 'submenu' || button.kind === 'beacon'
          ? true : Boolean(phraseOf(button))),
        detail: (button) => {
          const fill = fillOf(button);
          return fill ? (ctx.details?.[fill] ? 'set' : 'unset') : null;
        },
        onHold: (button) => { setDetail(/** @type {string} */ (fillOf(button)), ''); detailsChanged(); },
        onHoldSay: display.holdSpeaks && canSpeak ? (button) => { countPress(button); sayOnTap(button, false); } : undefined,
        onPick: pickButton,
        keys: display.boldKeys ? keysOf : undefined,
        sub: (peeking || display.cellWords || display.cellSay || display.cellIpa) ? (button) => {
          const phrase = button.kind === 'message' ? phraseOf(button) : null;
          if (!phrase) return [];
          if (!peeking) return linesOf(phrase.listener, phrase.listener);
          // Held, the eye's lines instead: the reader's whole sentence where the label
          // is a short form of it, the other side's, and what can come back.
          const answers = display.peekAnswers ? answersOf(button) : '';
          return [
            ...(display.peekOwner && phrase.owner.text !== labelOf(button)
              ? [{ text: phrase.owner.text, lang: owner, dir: ctx.ownerDir, kind: /** @type {const} */ ('own') }] : []),
            ...linesOf(phrase.listener, phrase.listener, { words: display.peekWords, say: display.peekSay, ipa: display.peekIpa }),
            ...(answers ? [{ text: answers, lang: owner, dir: ctx.ownerDir, kind: /** @type {const} */ ('answers') }] : []),
          ];
        } : undefined,
      });
      // Back to the cell that opened the message, for whoever is not using a finger.
      // Looked up after the render, against the node that now exists.
      if (openedFrom) {
        /** @type {HTMLElement|null} */ ($('board-grid')
          .querySelector(`[data-button="${CSS.escape(openedFrom)}"]`))?.focus();
        openedFrom = null;
      }
      // A search left open behind a message draws its results back over the board.
      searching.again();
      return;
    }

    const button = node.buttons.find((b) => b.id === state.buttonId);
    const phrase = button && phraseOf(button);
    if (!phrase) { dispatch({ type: 'dismiss' }); return; }

    if (state.view === 'message') {
      const set = button.replySetId ? board.replySets?.[button.replySetId] ?? ownSets[button.replySetId] : null;
      // **"Excuse me" first, when the owner wants it.** Both sides of the message
      // open with the corpus's own "excuse me" row for their language -- one
      // reviewed sentence in front of another, never a template -- except on the
      // emergency board, where nobody softens "call an ambulance".
      const shown = display.polite && boardId !== 'emergency' && !phrase.custom ? politely(phrase) : phrase;
      renderMessage(stage, shown, {
        onDismiss: () => dispatch({ type: 'dismiss' }),
        // Offered only where the session allows replies *and* this message has
        // answers to offer. There is no reply screen after every statement.
        onReply: state.replies && set ? () => dispatch({ type: 'reply' }) : null,
        replyLabel: theirs.t('board.reply'),
        colour: button.colour,
        // The owner presses this one, so it is labelled in their language -- unlike
        // Reply, which the listener presses.
        // The promise is handed on rather than swallowed: the button's presence is a
        // claim that this device can read the sentence out, made before anything is
        // tried, so an engine that then refuses has to say so instead of leaving the
        // owner tapping a dead control while somebody waits.
        onSpeak: canSpeak && display.speak
          ? () => speech.speakPhrase(shown, { rate: display.rate, voiceId: chosenVoice || undefined })
          : null,
        rate: display.rate,
        onRate: (r) => { display = { ...display, rate: r }; writeDisplay(display); paint(); },
        voices: speech.getCapabilities(listener).voices,
        voiceId: chosenVoice,
        onVoice: (id) => { chosenVoice = id; writeVoice(listener, id); paint(); },
        voiceLabel: t('display.voice'),
        voiceAutoLabel: t('display.voiceAuto'),
        turned: display.turned,
        onTurn: (v) => { display = { ...display, turned: v }; writeDisplay(display); paintTurn(); },
        show: display,
        speakLabel: t('board.speak'),
        rateLabel: t('board.rate'),
        speakError: speechTrouble,
      });
      return;
    }

    const set = button.replySetId ? board.replySets?.[button.replySetId] ?? ownSets[button.replySetId] : null;
    if (!set) { dispatch({ type: 'dismiss' }); return; }

    if (state.view === 'reply') {
      // Three kinds of answer on one grid: a phrase from the corpus, a quantity
      // formatted from a number, and the one that opens a keypad. All three are
      // drawn the same way, because to the person tapping they are the same act.
      const answers = set.buttons.map((/** @type {any} */ b) => {
        if (b.kind === 'value') return { id: b.id, phrase: resolveValue(b.value, ctx) };
        if (b.kind === 'entry') {
          return {
            id: b.id,
            entry: true,
            // Three keypads means three cells, and a set may carry two of them --
            // `board.otherAmount` on both would be two identical tiles opening
            // different keyboards.
            phrase: /** @type {any} */ ({
              listener: { text: theirs.t(ENTRY_LABEL[b.entry] ?? 'board.otherAmount'), lang: listener, dir: ctx.listenerDir },
              owner: { text: t(ENTRY_LABEL[b.entry] ?? 'board.otherAmount'), lang: owner, dir: ctx.ownerDir },
            }),
          };
        }
        // **The listener's own sentence, so the owner's profile must not touch it.**
        // `resolvePhrase` refuses to vary an incoming phrase at all; supplied replies
        // are written naturally neutral in both languages instead.
        return { id: b.id, phrase: phraseOf(b, true) };
      }).filter((/** @type {any} */ a) => a.phrase);

      renderReply(stage, phrase, answers, {
        onAnswer: (id) => {
          const chosen = set.buttons.find((/** @type {any} */ b) => b.id === id);
          if (chosen?.kind === 'entry') { dispatch({ type: 'enter', answerId: id }); return; }
          dispatch({ type: 'answer', answerId: id, value: chosen?.value });
        },
        onCancel: () => dispatch({ type: 'cancelReply' }),
        closeLabel: theirs.t('board.close'),
        colour: button.colour,
        turned: display.turned,
        // An answer carries the other side too: what it means in the reader's words.
        sub: (display.cellWords || display.cellSay || display.cellIpa)
          ? (answer) => linesOf(answer.owner, answer.listener) : undefined,
      });
      return;
    }

    if (state.view === 'entry') {
      // Which keypad, from the button that opened it. `duration` is the default and
      // the only one boards had until the tree audits found that a clock time and a
      // bare number were unsayable -- which is why a board asked "what time does it
      // open?" and its answer space contained no time at all.
      const kind = set.buttons
        .find((/** @type {any} */ b) => b.id === state.answerId)?.entry ?? 'duration';
      renderEntry(stage, phrase, {
        kind,
        turned: display.turned,
        onCancel: () => dispatch({ type: 'cancelEntry' }),
        onConfirm: (value) => dispatch({ type: 'confirmEntry', value }),
        // Validated, parsed and previewed in one call, so the button's enabled state,
        // the text under it and the value that is confirmed cannot disagree about
        // what was typed.
        check: (raw, choice) => {
          const read = kind === 'clock' ? parseClock(raw)
            : kind === 'count' ? parseCount(raw)
              : kind === 'price' ? parsePrice(raw, choice)
                : parseAmount(raw, /** @type {'minute'|'hour'|'day'} */ (choice));
          if (!read.ok) return null;
          const said = formatQuantity(read.value, listener);
          return said ? { value: read.value, said } : null;
        },
        words: {
          amount: theirs.t('board.amount'),
          time: theirs.t('board.time'),
          number: theirs.t('board.number'),
          unit: theirs.t('board.unit'),
          // From CLDR, not from a catalogue: three more keys in fifty-one languages
          // would each be an invitation to invent a word that already exists. The
          // catalogue is only the floor under a locale `Intl` has no units for --
          // and it is the listener's catalogue, because this is their screen.
          minute: unitName('minute', listener) ?? theirs.t('board.minutes'),
          hour: unitName('hour', listener) ?? theirs.t('board.hours'),
          day: unitName('day', listener) ?? theirs.t('board.days'),
          currency: theirs.t('board.currency'),
          moreCurrencies: theirs.t('board.moreCurrencies'),
          confirm: theirs.t('board.confirm'),
          cancel: theirs.t('board.close'),
          invalid: theirs.t(ENTRY_INVALID[kind] ?? 'board.notAnAmount'),
        },
        currencies: kind === 'price' ? currenciesFor(corpus, listener) : undefined,
        colour: button.colour,
      });
      return;
    }

    // The answer, read back to the owner. Their language is the big text now, and
    // the listener's the small one -- the presentation reverses, the meaning does
    // not, and neither does whose sentence it is.
    // A quantity beats a named answer: it is what the keypad produced, and it has no
    // button behind it to look up.
    const chosen = set.buttons.find((/** @type {any} */ b) => b.id === state.answerId);
    const answer = state.answerValue
      ? resolveValue(state.answerValue, ctx)
      : (chosen && phraseOf(chosen, true));
    if (!answer) { dispatch({ type: 'dismiss' }); return; }
    renderMessage(stage, {
      ...answer, listener: answer.owner, owner: answer.listener,
    }, {
      onDismiss: () => dispatch({ type: 'dismiss' }),
      onReply: null,
      replyLabel: '',
      incoming: true,
      colour: chosen?.colour ?? button.colour,
    });
    // **The door to the fuller translator, opened.** "None of these" is the stranger
    // saying the board has no answer for them; the next thing they need is a
    // translator from their language into the owner's, and a link is cheaper than a
    // hunt through the phone. In the reader's own language, because it is their hand
    // on the phone now.
    if (answer.id === 'board-answers.none-of-these') {
      stage.append(translatorLinks(listener, owner, theirs.t));
    }
  }

  $('board-up').addEventListener('click', () => {
    if (state.view === 'grid' && state.path.length < 2) { toPicker(); return; }
    dispatch({ type: 'up' });
  });

  // **Turn, from the bar.** The same choice the message's own control makes, set
  // before a message is shown: a phone laid on the counter is turned for the whole
  // conversation, answers included, not one sentence at a time.
  // **Speak on tap, one tap away**: the setting has a switch in the bar as well, because
  // the moment it is wanted -- a driver who cannot look -- is not a moment for a dialog.
  // Drawn only where this device can speak the listener's language.
  const tapButton = $('board-tap-bar');
  tapButton.setAttribute('aria-label', t('board.tapSpeaks'));
  tapButton.title = t('board.tapSpeaks');
  function paintTap() {
    tapButton.setAttribute('aria-pressed', String(display.tapSpeaks));
    tapButton.hidden = !canSpeak || state.view !== 'grid';
  }
  // **Held, it opens how the voice reads** -- the speeds and voices the message screen's
  // speed control offers -- since the reader who has just turned taps to speech is the one
  // who will want it slower, and has no message screen to set it from.
  const tapHeld = holdable(tapButton, () => openRateMenu(tapButton, {
    rate: display.rate,
    onRate: (r) => { display = { ...display, rate: r }; writeDisplay(display); },
    voices: speech.getCapabilities(listener).voices,
    voiceId: chosenVoice,
    onVoice: (id) => { chosenVoice = id; writeVoice(listener, id); },
    voiceLabel: t('display.voice'),
    voiceAutoLabel: t('display.voiceAuto'),
  }));
  tapButton.addEventListener('click', () => {
    if (tapHeld()) return;
    display = { ...display, tapSpeaks: !display.tapSpeaks };
    writeDisplay(display);
    paintTap();
    holdAwake();
  });

  // **To a man or to a woman**, where the listener's language words a request
  // differently and the reader has asked for the switch: a light switch with Mars and
  // Venus for its sun and moon, set for whoever is in front of them, in the bar where
  // the moment it changes -- a new person at the counter -- is not a moment for a dialog.
  const addressee = lightSwitch({
    label: t('board.addressee'),
    dark: () => display.addressee === 'feminine',
    flip: () => {
      display = { ...display, addressee: display.addressee === 'feminine' ? 'masculine' : 'feminine' };
      writeDisplay(display);
      voice();
      paint();
    },
    marks: [MARS, VENUS],
  });
  addressee.button.id = 'board-addressee';
  // **Polite or familiar**, the same kind of switch, its two ends the language's own
  // words for the two -- `Sie` and `du`, `vous` and `tu` -- from the registry.
  const registerAxis = listenerAxis('register');
  /** One end of the register switch: the language's own word for it. @param {string} value */
  const word = (value) => {
    const span = document.createElement('span');
    span.className = 'switch-word';
    span.lang = listener;
    span.textContent = registerAxis?.labels[value] ?? value;
    return span.outerHTML;
  };
  const register = lightSwitch({
    label: t('board.register'),
    dark: () => display.register === 'familiar',
    flip: () => {
      display = { ...display, register: display.register === 'familiar' ? 'polite' : 'familiar' };
      writeDisplay(display);
      voice();
      paint();
    },
    marks: [word('polite'), word('familiar')],
  });
  register.button.id = 'board-register';
  $('board-peek-bar').before(addressee.button, register.button);
  function paintAddressee() {
    addressee.button.hidden = !(display.addressSwitch && listenerAxis('listener_gender')) || state.view !== 'grid';
    addressee.show();
    register.button.hidden = !(display.registerSwitch && registerAxis) || state.view !== 'grid';
    register.show();
  }

  // **The eye: held, every button shows what it will say** -- the reader's whole
  // sentence, the other side's, how to say it, and on a question the answers the
  // stranger can give -- and let go, the grid is as it was. What it shows is a setting.
  // Held by pointer or by key, so a reader at a keyboard can peek too.
  const peekButton = $('board-peek-bar');
  peekButton.setAttribute('aria-label', t('board.peek'));
  peekButton.title = t('board.peek');
  /** @param {boolean} on */
  const peek = (on) => {
    if (peeking === on) return;
    peeking = on;
    peekButton.setAttribute('aria-pressed', String(on));
    paint();
  };
  peekButton.addEventListener('pointerdown', (event) => { event.preventDefault(); peek(true); });
  for (const end of ['pointerup', 'pointerleave', 'pointercancel']) peekButton.addEventListener(end, () => peek(false));
  peekButton.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); peek(true); }
  });
  peekButton.addEventListener('keyup', () => peek(false));
  peekButton.addEventListener('contextmenu', (event) => event.preventDefault());

  const turnButton = $('board-turn-bar');
  turnButton.setAttribute('aria-label', t('board.turn'));
  turnButton.title = t('board.turn');
  const paintTurn = () => turnButton.setAttribute('aria-pressed', String(display.turned));
  paintTurn();
  turnButton.addEventListener('click', () => {
    display = { ...display, turned: !display.turned };
    writeDisplay(display);
    paintTurn();
    // The grid under the bar turns at once, not on the next navigation.
    paint();
  });

  const openSettings = () => openSpeakerSettings({
    axes: corpus.speakerAxes,
    languages: [listener, owner],
    profile,
    onChange: (next) => { profile = next; voice(); sayStatus(); paint(); },
    extra: [arrangeRow(() => arrangeGrid(`${boardId}/${state.path.at(-1)}`, () => { personal = readPersonal(); paint(); })),
      aboutSection(detailsChanged, dietChoices(ctx), sounds(), askFrom),
      displaySection(display, (next) => { display = next; voice(); paint(); }, { canSpeak, language: nameOf(listener) }),
      // Most used is built from these choices when it opens, so on that screen a change
      // is a fresh build; anywhere else it only has to be remembered.
      mostUsedSection(listener, owner, nameOf, () => {
        display = readDisplay();
        if (boardId === MOST_USED) location.reload();
      }),
      voiceSection({
        lang: listener,
        voices: speech.getCapabilities(listener).voices,
        current: chosenVoice,
        onChange: (id) => { chosenVoice = id; },
      }),
      ...resumeSection(),
      travelFor(listener, owner, index, nameOf),
      personalSection(personalWiring({
      save: download,
      // **What this build can actually show**, so an import naming a screen that is
      // not here is refused rather than reported as a success with the phrases
      // parked where nobody can reach them.
      boards: knownScreens,
      onChanged: () => {
        personal = readPersonal();
        profile = readProfile();
        voice();
        sayStatus();
        paint();
        },
      }))],
  });

  /**
   * Every board's sentences this pair can say, by board, for the editor to put on a
   * screen by reference -- a context of the reader's own made of the boards' buttons --
   * each with the answers it has on its board. A sentence on two boards is offered once.
   * @param {(picked: {concept:string, answers:string[]}[]) => void} add
   */
  const fromBoards = async (add) => {
    /** @type {Map<string, {concept:string, answers:string[]}>} */ const found = new Map();
    /** @type {{label:string, options:{value:string, label:string}[]}[]} */ const groups = [];
    for (const entry of index.boards.filter((b) => serves(b, listener, owner))) {
      const source = entry.id === boardId ? board : JSON.parse(await loadText(`data/boards/${entry.id}.json`));
      /** @type {{value:string, label:string}[]} */ const options = [];
      for (const node of Object.values(source.nodes)) {
        for (const button of /** @type {import('../core/conversation.js').BoardButton[]} */ (node.buttons)) {
          const ref = button.phraseRef;
          if (button.kind !== 'message' || ref?.kind !== 'corpus' || 'fill' in ref || found.has(ref.id)) continue;
          const said = resolvePhrase(ref, ctx);
          if (!said) continue;
          const answers = (source.replySets?.[button.replySetId ?? '']?.buttons ?? [])
            .filter((/** @type {any} */ a) => a.kind === 'message' && a.phraseRef?.kind === 'corpus')
            .map((/** @type {any} */ a) => a.phraseRef.id);
          found.set(ref.id, { concept: ref.id, answers });
          options.push({ value: ref.id, label: said.owner.text });
        }
      }
      if (options.length) groups.push({ label: t(entry.titleKey), options });
    }
    askChoices({
      label: t('editor.fromBoards'), groups, chosen: [], save: t('editor.save'),
      close: t('gallery.previewClose'), kind: 'from-boards',
      onSave: (ids) => add(ids.map((id) => /** @type {{concept:string, answers:string[]}} */ (found.get(id)))),
    });
  };

  const openEditor = () => openBoardEditor({
    at: `${boardId}/${state.path.at(-1)}`,
    // The board's own buttons on this screen, so the reader can switch them off.
    builtIn: nodeHere().buttons
      .filter((b) => b.kind !== 'beacon')
      .map((b) => ({ id: b.id, label: labelOf(b) })),
    pair,
    owner,
    listener,
    listenerDir: ctx.listenerDir,
    state: personal,
    save: download,
    onChange: (next) => { personal = { ...personal, data: next }; paint(); },
    // In a context of the reader's own, its editor is also where it is deleted.
    context: own ? { id: own.id, onGone: () => goTo({ board: null, screen: null }) } : undefined,
    fromBoards,
    sounds: sounds(),
    words: (phrase) => {
      const said = resolvePhrase({ kind: 'corpus', id: /** @type {string} */ (phrase.concept) }, ctx);
      return { owner: said?.owner.text ?? '', listener: said?.listener.text ?? '' };
    },
  });

  // Found on this board, the press is made here; on another, that board opens to it,
  // with the search open behind the press. The address forgets the search once read.
  const carried = params.get('q') ?? '';
  if (carried) {
    const here = new URL(location.href);
    here.searchParams.delete('q');
    history.replaceState(history.state, '', here);
  }
  searching = wireSearch({
    owner,
    entries: () => searchEntries(ctx, index, { [boardId]: board }),
    query: carried,
    pick: (found, query) => {
      // A screen found is a place to go, and the search ends there; a sentence or a
      // beacon is said and the search waits behind it.
      const place = found.button.kind === 'submenu';
      if (found.board !== boardId || !found.path.length) { visit(found, place ? '' : query); return; }
      if (place) searching.close();
      state = { ...state, view: 'grid', path: found.path };
      if (found.button.kind === 'beacon') paint();
      else pickButton(found.button);
    },
    back: () => paint(),
  });

  // **Settings is the header's bars and the plus is the editor**: two controls for two
  // things, rather than one control opening a menu of the two -- and one door to
  // Settings, not a second in the bar that opened the same dialog. Both are owner-only
  // and grid-only: the person being spoken to must not find the editor by tapping, and
  // the owner must not open it while holding the phone out to a stranger.
  wireSiteMenu(openSettings);
  const addButton = $('board-add-bar');
  addButton.setAttribute('aria-label', t('editor.open'));
  addButton.title = t('editor.open');
  addButton.addEventListener('click', openEditor);

  /**
   * One step back out of wherever we are, and whether there was one to take.
   *
   * Escape and Android's system Back are the same question asked two ways, so they
   * are answered once. Neither is a visible control added to the message -- the
   * design has no Back button there, and packaging the app is not permission to add
   * one. `false` means this page has nothing left to unwind, which on Android is
   * what lets the press reach the shell and leave the board.
   */
  const unwind = () => {
    // A beacon first: it is over the whole screen, so it is what "back" means while
    // one is running, and it is not part of the board's own state.
    if (document.querySelector('.beacon')) { stopBeacon(); return true; }
    if (state.view === 'reply') { dispatch({ type: 'cancelReply' }); return true; }
    // Out of a message first and then the search behind it: the message came from the
    // results, and closing it is the way back to them.
    if (state.view !== 'grid') { dispatch({ type: 'dismiss' }); return true; }
    if (searching.close()) return true;
    if (state.path.length > 1) { dispatch({ type: 'up' }); return true; }
    return false;
  };

  // An open dialog takes its own Escape; the screen behind it stays where it is.
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) unwind();
  });
  // **Android Back is not browser Back.** Unhandled, it closes the application --
  // so a reader holding a sentence out to a stranger who presses it meaning "close
  // this" would quit the app instead. At a board's root it is unconsumed on purpose:
  // the page behind is the topic list, which is where Back should go.
  const contexts = new URLSearchParams(location.search);
  contexts.delete('board');
  onBack(unwind, `conversation.html?${contexts}`);

  // **A deploy must not take the sentence off the screen.** The default guard is
  // "no dialog is open"; the board adds the case the default cannot see, which is a
  // message the owner is holding out to a stranger. `paint` re-checks, so the update
  // lands the moment they close it.
  deferUpdates(() => state.view === 'grid' && !document.querySelector('dialog[open]'));

  paint();
  // **A button found by the search on another board**, pressed as it would have been
  // on its own screen -- once: the address forgets it, so a reload does not press it again.
  const opening = params.get('open');
  if (opening) {
    const here = new URL(location.href);
    here.searchParams.delete('open');
    history.replaceState(history.state, '', here);
    const button = withOwn(nodeHere()).buttons.find((b) => b.id === opening);
    if (button) pickButton(button);
  }
  registerOffline();
  // **This pair now opens without a connection.** The shell ships the concept bank
  // and one pair's rows and no more, which is right -- fifty-one languages of rows is
  // seven megabytes nobody should download before asking for anything -- but it meant
  // that offline, converse worked in Mandarin and nowhere else. Opening a board is
  // the honest moment to fix that: there is a connection right now, this is the pair
  // that matters, and this screen is the one written for the case where the signal is
  // gone. Nothing waits on it and nothing reports it: the board is already drawn, and
  // a reader can do nothing about a cache write that failed.
  keepBoardOffline({
    groups: corpus.groups,
    target: listener,
    source: owner,
    // The keys of the table this page already built, so the list is the files that
    // were really fetched rather than a guess at which languages have one.
    variants: Object.keys(variants),
    countries: worded ? [listener, owner] : [],
    keys: corpus.coverage.emphasis?.includes(owner) ? [owner] : [],
  }).catch(() => {});
}

main().catch((err) => {
  // **The board has to get out of the way of its own error.** `showFatal` prepends a
  // box to `<body>`, which on every other page is a column that grows -- but this
  // body is a `100dvh` flex column, so the box became a fourth row and squeezed the
  // header, the grid and the controls into what was left. The reader got a
  // short board under a message, which reads as the board being broken in some new
  // way rather than as the board having failed to load.
  //
  // This is also the diagnostic. A board that cannot load its rows is a blank grid
  // to look at, and the one thing worth knowing -- which file, and what the server
  // said -- is in the message that was being squeezed off the screen.
  for (const part of ['.board-main', '.board-header']) document.querySelector(part)?.remove();
  document.body.classList.remove('board-body');
  showFatal(err);
});
