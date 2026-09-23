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

import {
  loadText, loadLanguages, readerLanguage, registerOffline, showFatal,
  deferUpdates, applyUpdateIfIdle, download, keepBoardOffline,
} from './app.js';
import {
  loadCorpus, loadLanguage, loadVariants, fillLanguageSlots,
} from '../core/pack.js';
import { variantKey } from '../core/speaker.js';
import {
  validateBoard, resolvePhrase, missingPhrases, reduce, openBoard, currentNode,
} from '../core/conversation.js';
import {
  renderGrid, renderMessage, renderReply, renderEntry, clearStage, fitMessage,
} from './conversation-view.js';
import { resolveValue } from '../core/conversation.js';
import {
  parseAmount, parseClock, parseCount, formatQuantity, unitName,
} from '../core/quantity.js';
import { openBoardEditor } from './board-editor.js';
import { openBoardMenu } from './board-menu.js';
import {
  readDisplay, displaySection, readVoice, voiceSection,
} from './board-display.js';
import { speech } from './platform/speech.js';
import { keepAwake } from './platform/wake.js';
import { startBeacon, stopBeacon } from './platform/beacon.js';
import { onBack } from './platform/shell.js';
import { read as readPersonal, placedOn } from './board-store.js';
import {
  openSpeakerSettings, readProfile, noticeFor, personalSection,
} from './speaker-settings.js';
import { personalWiring } from './personal-data.js';
import { applyStatic, loadCatalogue, loadUiLanguage, languageName, t } from './i18n.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** What the cell that opens each keypad says, in whichever language is reading it. */
const ENTRY_LABEL = /** @type {Record<string,string>} */ ({
  duration: 'board.otherAmount',
  clock: 'board.atTime',
  count: 'board.otherNumber',
});

/** What the keypad says when what has been typed is not a time, a number or a length. */
const ENTRY_INVALID = /** @type {Record<string,string>} */ ({
  duration: 'board.notAnAmount',
  clock: 'board.notATime',
  count: 'board.notANumber',
});

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

/** Drop back to the list of conversations, keeping the pair. */
function toPicker() {
  const next = new URLSearchParams(location.search);
  next.delete('board');
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
 * @param {string} owner @param {string} listener
 * @param {{boards:{id:string, titleKey:string, listeners:string[], owners:string[]}[]}} index
 */
async function showPicker(owner, listener, index) {
  /** @type {Map<string,string>} */ const titles = new Map();
  for (const board of index.boards) {
    if (serves(board, listener, owner)) titles.set(board.id, t(board.titleKey));
  }
  $('board-title').textContent = t('board.pickTopic');
  $('board-title').title = t('board.pickTopic');
  document.title = t('board.docTitle');
  // **The context list has a parent too**, and it is the card this was opened from.
  // Without this the only way off the first screen of Converse was the browser's own
  // Back, which a reader who arrived from the app's own link does not think of as
  // available -- and which does not exist at all in the native shell.
  const out = $('board-up');
  out.hidden = false;
  out.setAttribute('aria-label', t('board.toGallery'));
  out.title = t('board.toGallery');
  out.addEventListener('click', () => { location.href = './'; });
  if (!titles.size) {
    $('board-status').textContent = t('board.noBoards');
    $('board-grid').removeAttribute('aria-busy');
    return;
  }
  // Every button here goes deeper, so the dash that says so on a mixed grid has
  // nothing to contrast with and is just twelve dashed boxes. They stay submenus --
  // that is what they do -- and the stylesheet drops the marking for this one grid.
  $('board-grid').classList.add('board-grid-topics');
  renderGrid($('board-grid'), { buttons: [...titles.keys()].map((id) => ({ id, kind: 'submenu' })) }, {
    lang: owner,
    label: (button) => titles.get(button.id) ?? button.id,
    available: () => true,
    onPick: (button) => {
      const next = new URLSearchParams(location.search);
      next.set('board', button.id);
      location.search = next.toString();
    },
  });
  registerOffline();
}

async function main() {
  const params = new URLSearchParams(location.search);
  const { languages, coverage } = await loadLanguages();
  const owner = params.get('source') || readerLanguage(languages, coverage);
  const listener = params.get('target') || 'zh-Hans';
  const boardId = params.get('board');

  await loadUiLanguage(owner, loadText);
  applyStatic();

  // The pair, before either branch: it is the same statement of who is about to be
  // shown what, whether or not a board has been chosen yet.
  const named = Object.fromEntries(languages.map((l) => [l.bcp47, l]));
  /** @param {string} code */
  const nameOf = (code) => languageName(code, named[code]?.exonym_en ?? code);
  /** @type {{boards:{id:string, titleKey:string, listeners:string[], owners:string[]}[]}} */
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
      const options = candidates(index, boardId, side, side === 'owner' ? listener : owner)
        .filter((c) => c !== code)
        .map((c) => ({ code: c, label: nameOf(c) }))
        .sort((a, b) => a.label.localeCompare(b.label));
      openBoardMenu(button, options.map((option) => ({
        label: option.label,
        run: () => goTo({ [side === 'owner' ? 'source' : 'target']: option.code }),
      })));
    }));
  }

  if (!boardId) { await showPicker(owner, listener, index); return; }

  const board = JSON.parse(await loadText(`data/boards/${boardId}.json`));
  const problems = validateBoard(board);
  // A malformed board is a loud failure, not a page that half works: it is authored
  // data, and the person who sees this is the one who can fix it.
  if (problems.length) throw new Error(`data/boards/${boardId}.json: ${problems.join('; ')}`);

  // The corpus, and only the rows two languages need. `loadCorpus` reads the
  // registries and the concept bank; `loadLanguage` reads one pack. Both come from
  // `core/pack.js`, which is a 44KB data-only module -- statically imported, because
  // making it lazy would buy nothing and this page cannot start without it.
  const corpus = await loadCorpus(loadText);
  const [listenerRows, ownerRows] = await Promise.all([
    loadLanguage(loadText, listener, corpus.groups),
    loadLanguage(loadText, owner, corpus.groups),
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

  // **The listener's own catalogue, read without becoming the interface language.**
  // `loadUiLanguage` above set the owner's; calling it again for the listener would
  // change the owner's persisted preference and flip the document's direction, which
  // is exactly what a Reply control must not do.
  const theirs = await loadCatalogue(listener, loadText);

  // Direction is a fact about a *script*, not about a language, which is why it
  // takes two lookups: the registry says Urdu is written in Arabic script, and
  // `scripts.csv` says Arabic script runs right to left.
  const dirOf = (/** @type {string} */ code) => /** @type {'ltr'|'rtl'} */ (
    corpus.scripts[corpus.languages[code]?.script]?.direction === 'rtl' ? 'rtl' : 'ltr');
  /** @type {import('../core/conversation.js').ResolveContext} */
  const ctx = {
    corpus,
    listenerRows,
    ownerRows,
    listener,
    owner,
    listenerDir: dirOf(listener),
    ownerDir: dirOf(owner),
    // The first system the registry lists for this language is the one its pack
    // fills, and the one the sheet prints by default.
    listenerRoman: (named[listener]?.romanizations ?? '').split(',')[0].trim(),
  };

  // What the message screen carries, which is the reader's own choice. Re-read
  // rather than captured when it changes, so the dialog's checkbox and the screen
  // behind it cannot disagree.
  let display = readDisplay();
  // Which voice reads the listener's sentence, when the reader has opinions.
  let chosenVoice = readVoice(listener);

  // **Whose voice the outgoing messages are in.** Fetched for whichever of the two
  // languages declares an axis at all — usually neither, and never more than two
  // small files — so that answering the question later needs no round trip and no
  // reload. `variantKey` is recomputed on every change; the tables are not.
  const variants = Object.fromEntries(await Promise.all(
    [listener, owner]
      .filter((code) => corpus.speakerAxes[code]?.length)
      .map(async (code) => [code, await loadVariants(loadText, code)]),
  ));
  let profile = readProfile();
  const voice = () => {
    for (const [code, side] of /** @type {const} */ ([[listener, 'listenerVoice'], [owner, 'ownerVoice']])) {
      const table = variants[code];
      ctx[side] = table
        ? { key: variantKey(corpus.speakerAxes[code] ?? [], profile), variants: table }
        : undefined;
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
  if (!listed || !serves(listed, listener, owner)) {
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
  const sayStatus = () => {
    $('board-status').textContent = [
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
    .map((b) => ({ id: b.id, label: t(b.titleKey) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  $('board-title').replaceChildren(
    inlineControl(t(board.titleKey), t('board.switchTopic'), (button) => {
      openBoardMenu(button, [
        ...others.map((o) => ({ label: o.label, run: () => goTo({ board: o.id }) })),
        { label: t('board.allTopics'), run: () => goTo({ board: null }) },
      ]);
    }),
  );
  $('board-title').title = t(board.titleKey);
  document.title = `${t(board.titleKey)} \u2014 ${t('nav.brand')}`;

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
    ctx.custom = Object.fromEntries(mine.map((p) => [p.id, { owner: p.owner, listener: p.listener }]));
    return {
      ...node,
      buttons: [
        ...node.buttons,
        ...mine.map((p) => /** @type {import('../core/conversation.js').BoardButton} */ ({
          id: p.id, kind: 'message', colour: 'stay',
          phraseRef: { kind: 'custom', id: p.id },
        })),
      ],
    };
  };

  /**
   * @param {import('../core/conversation.js').BoardButton} button
   * @param {boolean} [incoming] true when the *listener* is the one who taps it
   */
  const phraseOf = (button, incoming) => (button.phraseRef
    ? resolvePhrase(button.phraseRef, ctx, incoming) : null);

  /** @param {import('../core/conversation.js').BoardButton} button */
  const labelOf = (button) => {
    if (button.labelKey) return t(button.labelKey);
    // No short label written, so the owner's own full wording is the label. Better
    // than the concept id, and it is the sentence they are about to show anyway.
    const phrase = phraseOf(button);
    // A phrase the reader wrote carries its own short label; theirs wins, because
    // they chose it for this button.
    const own = personal.data.phrases[button.id];
    if (own?.label) return own.label;
    return phrase?.owner.text ?? button.id;
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

  function paint() {
    const stage = $('board-stage');
    const node = withOwn(currentNode(board, state));
    // Held for exactly as long as a sentence is being read by someone else. A
    // stranger reading an unfamiliar script off a phone held at arm's length will
    // often take longer than the display timeout, and the screen going dark means
    // starting the exchange over.
    keepAwake(state.view !== 'grid');
    // A waiting deploy installs here, between things, and nowhere else.
    applyUpdateIfIdle();

    if (state.view !== 'grid') $('board-menu').hidden = true;
    if (state.view === 'grid') {
      clearStage(stage);
      // At the root the parent is the topic list, not a node -- so the control stays
      // rather than vanishing, and says where it goes. Somewhere to go back *to* is
      // the difference between one board and the whole app.
      // The arrow says "out of here" wherever you are: up a submenu, or back to the
      // context list from a board's root. Its accessible name says which.
      const atRoot = state.path.length < 2;
      $('board-up').hidden = false;
      $('board-menu').hidden = false;
      $('board-up').setAttribute('aria-label', atRoot ? t('board.allTopics') : t('board.up'));
      renderGrid($('board-grid'), node, {
        lang: owner,
        title: node.titleKey ? t(node.titleKey) : undefined,
        label: labelOf,
        // A submenu and a beacon are always available: neither is a phrase, so
        // neither can be missing from the corpus.
        available: (button) => (button.kind === 'submenu' || button.kind === 'beacon'
          ? true : Boolean(phraseOf(button))),
        onPick: (button) => {
          // **Not a state change, and deliberately not part of the board's own
          // machine.** A beacon is not something being said -- there is no message,
          // no reply, nothing to return from -- so it takes over the screen and hands
          // it straight back. Leaving `state` alone means the grid is exactly where
          // it was when the beacon stops, which is what someone who has just been
          // found needs.
          if (button.kind === 'beacon') {
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
              label: button.beacon === 'sos'
                ? theirs.t('beacon.sos')
                : (help?.text || theirs.t('beacon.help')),
              lang: listener,
              dir: ctx.listenerDir,
              dismiss: t('beacon.dismiss'),
              fit: fitMessage,
              // The screen is the signal, so it must not sleep while one is running
              // -- and the lock goes back to following the message view afterwards.
              onStop: () => keepAwake(state.view !== 'grid'),
            });
            keepAwake(true);
            return;
          }
          openedFrom = button.id;
          dispatch({
            type: 'open', buttonId: button.id, kind: button.kind, nodeId: button.nodeId,
          });
        },
      });
      // Back to the cell that opened the message, for whoever is not using a finger.
      // Looked up after the render, against the node that now exists.
      if (openedFrom) {
        /** @type {HTMLElement|null} */ ($('board-grid')
          .querySelector(`[data-button="${CSS.escape(openedFrom)}"]`))?.focus();
        openedFrom = null;
      }
      return;
    }

    const button = node.buttons.find((b) => b.id === state.buttonId);
    const phrase = button && phraseOf(button);
    if (!phrase) { dispatch({ type: 'dismiss' }); return; }

    if (state.view === 'message') {
      const set = button.replySetId ? board.replySets?.[button.replySetId] : null;
      renderMessage(stage, phrase, {
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
          ? (/** @type {'normal'|'slow'} */ rate) => speech.speakPhrase(phrase, {
            rate, voiceId: chosenVoice || undefined,
          })
          : null,
        show: display,
        speakLabel: t('board.speak'),
        slowLabel: t('board.slow'),
        speakError: (/** @type {string} */ reason) => {
          const said = t(`speech.${reason}`);
          // An unfamiliar reason is still a failure worth reporting; a bare key is
          // not what to report it with.
          return said === `speech.${reason}` ? t('speech.synthesis-failed') : said;
        },
      });
      return;
    }

    const set = button.replySetId ? board.replySets?.[button.replySetId] : null;
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
        onCancel: () => dispatch({ type: 'cancelEntry' }),
        onConfirm: (value) => dispatch({ type: 'confirmEntry', value }),
        // Validated, parsed and previewed in one call, so the button's enabled state,
        // the text under it and the value that is confirmed cannot disagree about
        // what was typed.
        check: (raw, unit) => {
          const read = kind === 'clock' ? parseClock(raw)
            : kind === 'count' ? parseCount(raw)
              : parseAmount(raw, unit);
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
          confirm: theirs.t('board.confirm'),
          cancel: theirs.t('board.close'),
          invalid: theirs.t(ENTRY_INVALID[kind] ?? 'board.notAnAmount'),
        },
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
  }

  $('board-up').addEventListener('click', () => {
    if (state.view === 'grid' && state.path.length < 2) { toPicker(); return; }
    dispatch({ type: 'up' });
  });

  // **One owner-only control, opening a menu.** It was two buttons reading `Settings`
  // and `Edit buttons`, which on a phone wrapped the bar onto a second line -- and
  // the topic, which is the thing worth reading, had to share the first one. Three
  // bars is the icon every phone already means "menu" by, so the row fits and the
  // topic gets the space.
  //
  // Owner-only and grid-only, like the editor it holds: the person being spoken to
  // must not find the editor by tapping, and the owner must not open it while
  // holding the phone out to a stranger.
  const menuButton = $('board-menu');
  menuButton.setAttribute('aria-label', t('board.menu'));
  menuButton.title = t('board.menu');

  const openSettings = () => openSpeakerSettings({
    axes: corpus.speakerAxes,
    languages: [listener, owner],
    profile,
    onChange: (next) => { profile = next; voice(); sayStatus(); paint(); },
    extra: [displaySection(display, (next) => { display = next; paint(); }),
      voiceSection({
        lang: listener,
        voices: speech.getCapabilities(listener).voices,
        current: chosenVoice,
        onChange: (id) => { chosenVoice = id; },
      }),
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

  const openEditor = () => openBoardEditor({
    at: `${boardId}/${state.path.at(-1)}`,
    pair,
    owner,
    listener,
    listenerDir: ctx.listenerDir,
    state: personal,
    onChange: (next) => { personal = { ...personal, data: next }; paint(); },
  });

  menuButton.addEventListener('click', () => openBoardMenu(menuButton, [
    { label: t('editor.open'), run: openEditor },
    { label: t('settings.open'), run: openSettings },
  ]));

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
    if (state.view !== 'grid') { dispatch({ type: 'dismiss' }); return true; }
    if (state.path.length > 1) { dispatch({ type: 'up' }); return true; }
    return false;
  };

  addEventListener('keydown', (event) => { if (event.key === 'Escape') unwind(); });
  // **Android Back is not browser Back.** Unhandled, it closes the application --
  // so a reader holding a sentence out to a stranger who presses it meaning "close
  // this" would quit the app instead. At a board's root it is unconsumed on purpose:
  // the page behind is the topic list, which is where Back should go.
  onBack(unwind);

  // **A deploy must not take the sentence off the screen.** The default guard is
  // "no dialog is open"; the board adds the case the default cannot see, which is a
  // message the owner is holding out to a stranger. `paint` re-checks, so the update
  // lands the moment they close it.
  deferUpdates(() => state.view === 'grid' && !document.querySelector('dialog[open]'));

  paint();
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
