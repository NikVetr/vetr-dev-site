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
} from './app.js';
import { loadCorpus, loadLanguage } from '../core/pack.js';
import {
  validateBoard, resolvePhrase, missingPhrases, reduce, openBoard, currentNode,
} from '../core/conversation.js';
import { renderGrid, renderMessage, renderReply, clearStage } from './conversation-view.js';
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
  const ctx = {
    corpus,
    listenerRows,
    ownerRows,
    listener,
    owner,
    listenerDir: dirOf(listener),
    ownerDir: dirOf(owner),
  };

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
  if (gaps.size) {
    $('board-status').textContent = t('board.someMissing', { count: String(gaps.size) });
  }

  let state = openBoard(board, params.get('replies') === '1');

  /** @param {import('../core/conversation.js').BoardButton} button */
  const phraseOf = (button) => (button.phraseRef
    ? resolvePhrase(button.phraseRef, ctx) : null);

  /** @param {import('../core/conversation.js').BoardButton} button */
  const labelOf = (button) => {
    if (button.labelKey) return t(button.labelKey);
    // No short label written, so the owner's own full wording is the label. Better
    // than the concept id, and it is the sentence they are about to show anyway.
    const phrase = phraseOf(button);
    return phrase?.owner.text ?? button.id;
  };

  /** @param {any} action */
  const dispatch = (action) => {
    const next = reduce(state, action);
    if (next === state) return;
    state = next;
    paint();
  };

  function paint() {
    const stage = $('board-stage');
    const node = currentNode(board, state);

    if (state.view === 'grid') {
      clearStage(stage);
      $('board-up').hidden = state.path.length < 2;
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
      });
      return;
    }

    const set = button.replySetId ? board.replySets?.[button.replySetId] : null;
    if (!set) { dispatch({ type: 'dismiss' }); return; }

    if (state.view === 'reply') {
      const answers = set.buttons
        .map((/** @type {any} */ b) => ({ id: b.id, phrase: phraseOf(b) }))
        .filter((/** @type {any} */ a) => a.phrase);
      renderReply(stage, phrase, answers, {
        onAnswer: (id) => dispatch({ type: 'answer', answerId: id }),
        onCancel: () => dispatch({ type: 'cancelReply' }),
        closeLabel: theirs.t('board.close'),
        colour: button.colour,
      });
      return;
    }

    // The answer, read back to the owner. Their language is the big text now, and
    // the listener's the small one -- the presentation reverses, the meaning does
    // not, and neither does whose sentence it is.
    const chosen = set.buttons.find((/** @type {any} */ b) => b.id === state.answerId);
    const answer = chosen && phraseOf(chosen);
    if (!answer) { dispatch({ type: 'dismiss' }); return; }
    renderMessage(stage, {
      ...answer, listener: answer.owner, owner: answer.listener,
    }, {
      onDismiss: () => dispatch({ type: 'dismiss' }),
      onReply: null,
      replyLabel: '',
      incoming: true,
      colour: chosen.colour,
    });
  }

  $('board-up').addEventListener('click', () => dispatch({ type: 'up' }));

  // Escape and the system Back gesture are alternative routes out, not visible
  // controls added to the message. Inside a reply they unwind one view at a time,
  // which `reduce` already decides.
  addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (state.view === 'reply') dispatch({ type: 'cancelReply' });
    else if (state.view !== 'grid') dispatch({ type: 'dismiss' });
    else dispatch({ type: 'up' });
  });

  paint();
  registerOffline();
}

main().catch(showFatal);
