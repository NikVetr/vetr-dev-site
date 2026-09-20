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
  deferUpdates, applyUpdateIfIdle,
} from './app.js';
import { loadCorpus, loadLanguage, loadVariants } from '../core/pack.js';
import { axesFor, variantKey } from '../core/speaker.js';
import {
  validateBoard, resolvePhrase, missingPhrases, reduce, openBoard, currentNode,
} from '../core/conversation.js';
import {
  renderGrid, renderMessage, renderReply, renderEntry, clearStage,
} from './conversation-view.js';
import { resolveValue } from '../core/conversation.js';
import { parseAmount, formatDuration, unitName } from '../core/duration.js';
import { openBoardEditor } from './board-editor.js';
import { speech } from './platform/speech.js';
import { keepAwake } from './platform/wake.js';
import { read as readPersonal, placedOn } from './board-store.js';
import { openSpeakerSettings, readProfile, noticeFor } from './speaker-settings.js';
import { applyStatic, loadCatalogue, loadUiLanguage, languageName, t } from './i18n.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

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

async function main() {
  const params = new URLSearchParams(location.search);
  const { languages, coverage } = await loadLanguages();
  const owner = params.get('source') || readerLanguage(languages, coverage);
  const listener = params.get('target') || 'zh-Hans';
  const boardId = params.get('board') || 'spa';

  await loadUiLanguage(owner, loadText);
  applyStatic();

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
  };

  // **Whose voice the outgoing messages are in.** Fetched for whichever of the two
  // languages declares an axis at all — usually neither, and never more than two
  // small files — so that answering the question later needs no round trip and no
  // reload. `variantKey` is recomputed on every change; the tables are not.
  const asked = axesFor(corpus.speakerAxes, [listener, owner]);
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

  $('board-pair').textContent = t('board.pair', {
    target: languageName(listener, corpus.languages[listener]?.exonym_en ?? listener),
    source: languageName(owner, corpus.languages[owner]?.exonym_en ?? owner),
  });

  // **A board serves pairs, not targets.** Resolving a phrase needs a row on both
  // sides, so a board written in Mandarin and English is a board for an English
  // reader. Saying so plainly beats letting `missingPhrases` report that every
  // button is unavailable, which is true and tells the reader nothing.
  if (board.pairs && !board.pairs.includes(`${listener}__${owner}`)) {
    throw new Error(t('board.wrongPair', {
      board: t(board.titleKey), pairs: board.pairs.join(', '),
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

  let state = openBoard(board, params.get('replies') === '1');
  const pair = `${listener}__${owner}`;
  // Hydrated once. The page is authoritative from here; the editor hands back a new
  // value rather than the page asking the disk what was just written.
  let personal = readPersonal();

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

    if (state.view !== 'grid') { $('board-edit').hidden = true; $('board-settings').hidden = true; }
    if (state.view === 'grid') {
      clearStage(stage);
      $('board-up').hidden = state.path.length < 2;
      $('board-edit').hidden = false;
      $('board-settings').hidden = !asked.length;
      $('board-up-label').textContent = t('board.up');
      renderGrid($('board-grid'), node, {
        lang: owner,
        title: node.titleKey ? t(node.titleKey) : undefined,
        label: labelOf,
        available: (button) => (button.kind === 'submenu'
          ? true : Boolean(phraseOf(button))),
        onPick: (button) => {
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
        onSpeak: canSpeak ? () => speech.speakPhrase(phrase) : null,
        speakLabel: t('board.speak'),
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
            phrase: /** @type {any} */ ({
              listener: { text: theirs.t('board.otherAmount'), lang: listener, dir: ctx.listenerDir },
              owner: { text: t('board.otherAmount'), lang: owner, dir: ctx.ownerDir },
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
          if (chosen?.kind === 'entry') { dispatch({ type: 'enter' }); return; }
          dispatch({ type: 'answer', answerId: id, value: chosen?.value });
        },
        onCancel: () => dispatch({ type: 'cancelReply' }),
        closeLabel: theirs.t('board.close'),
        colour: button.colour,
      });
      return;
    }

    if (state.view === 'entry') {
      renderEntry(stage, phrase, {
        onCancel: () => dispatch({ type: 'cancelEntry' }),
        onConfirm: (value) => dispatch({ type: 'confirmEntry', value }),
        // Validated and previewed in one call, so the button's enabled state and the
        // text under it can never disagree about whether the input is an answer.
        check: (raw, unit) => {
          const read = parseAmount(raw, unit);
          return read.ok ? formatDuration(read.duration, listener) : null;
        },
        words: {
          amount: theirs.t('board.amount'),
          unit: theirs.t('board.unit'),
          // From CLDR, not from a catalogue: three more keys in fifty-one languages
          // would each be an invitation to invent a word that already exists.
          minute: unitName('minute', listener) ?? t('board.minutes'),
          hour: unitName('hour', listener) ?? t('board.hours'),
          day: unitName('day', listener) ?? t('board.days'),
          confirm: theirs.t('board.confirm'),
          cancel: theirs.t('board.close'),
          invalid: theirs.t('board.notAnAmount'),
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

  $('board-up').addEventListener('click', () => dispatch({ type: 'up' }));

  // **Owner-only, and reachable from the grid alone.** Never from a message or a
  // reply: the person being spoken to must not find the editor by tapping, and the
  // owner must not open it while holding the phone out to a stranger.
  const editButton = $('board-edit');
  editButton.textContent = t('editor.open');
  editButton.addEventListener('click', () => openBoardEditor({
    at: `${boardId}/${state.path.at(-1)}`,
    pair,
    owner,
    listener,
    listenerDir: ctx.listenerDir,
    state: personal,
    onChange: (next) => { personal = { ...personal, data: next }; paint(); },
  }));

  // **Only where there is something to ask.** Thirty-one of the fifty-three languages
  // declare no axis, and for those pairs this control does not exist at all rather
  // than opening onto an empty form. Owner-only and grid-only, like the editor: a
  // settings screen is not part of a live conversation.
  const settingsButton = $('board-settings');
  if (asked.length) {
    settingsButton.textContent = t('speaker.open');
    settingsButton.addEventListener('click', () => openSpeakerSettings({
      axes: corpus.speakerAxes,
      languages: [listener, owner],
      profile,
      onChange: (next) => { profile = next; voice(); sayStatus(); paint(); },
    }));
  }

  // Escape and the system Back gesture are alternative routes out, not visible
  // controls added to the message. Inside a reply they unwind one view at a time,
  // which `reduce` already decides.
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.view === 'reply') dispatch({ type: 'cancelReply' });
    else if (state.view !== 'grid') dispatch({ type: 'dismiss' });
    else dispatch({ type: 'up' });
  });

  // **A deploy must not take the sentence off the screen.** The default guard is
  // "no dialog is open"; the board adds the case the default cannot see, which is a
  // message the owner is holding out to a stranger. `paint` re-checks, so the update
  // lands the moment they close it.
  deferUpdates(() => state.view === 'grid' && !document.querySelector('dialog[open]'));

  paint();
  registerOffline();
}

main().catch(showFatal);
