// The owner's own buttons: writing them, fixing them, ordering them, removing them.
//
// **Owner-only, and outside the conversation.** There is no path to this from a
// message or a reply — the person being spoken to must not be able to reach the
// editor by tapping, and the owner should not be able to open it by accident while
// holding the phone out to a stranger. It opens from the grid and nowhere else.
//
// **This app does not translate.** There is no backend and inventing one is out of
// scope, so a reader who types an English sentence gets an empty listener side until
// they fill it in, paste it, or take the handoff to another app. Saying that plainly
// is the whole design of the form: two fields, both required to show the button, and
// a line of text admitting why.
//
// A half-written phrase is still saved, because a reader may be coming back to it,
// and `resolvePhrase` refuses to resolve one — so it can never reach a listener.
//
// **A tree is screens of the reader's own.** A screen is added here like a button and
// opens like the board's submenus; its own buttons are added by opening it and pressing
// the plus there. What is on a screen travels as a file -- saved from one board, loaded
// onto any screen of the same pair, on this device or another.

import {
  write, addPhrase, editPhrase, removePlacement, deletePhrase,
  placementsOf, movePlacement, showBuiltIn, placedOn, screenContents, graftContents,
} from './board-store.js';
import { buildButtons, readButtons } from '../core/personal.js';
import { answerMark } from './conversation-view.js';
import { soundGrid } from './board-menu.js';
import { t } from './i18n.js';
import { dialogHead } from './dialog.js';

/** @param {string} tag @param {Record<string,string>} attrs @param {(Node|string)[]} kids */
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

/**
 * Open the editor over the board.
 *
 * @param {object} config
 * @param {string} config.at          `board/node`, where a new button lands
 * @param {string} config.pair        `target__source`
 * @param {string} config.owner       the owner's language code
 * @param {string} config.listener    the listener's language code
 * @param {'ltr'|'rtl'} config.listenerDir
 * @param {{data:import('./board-store.js').BoardPersonal, damaged:boolean}} config.state
 *   the page's own copy, hydrated once at start-up
 * @param {(next:import('./board-store.js').BoardPersonal)=>void} config.onChange
 *   hand the new state back and repaint; the page is authoritative, not the disk
 * @param {(blob:Blob, name:string)=>void} config.save  hand a file to the reader
 * @param {{id:string, label:string}[]} [config.builtIn]  the board's own buttons on this
 *   screen, each offered with a switch to hide it here
 * @param {{id:string, onGone:()=>void}} [config.context]  the reader's own context this
 *   editor is in, which it can delete from its first screen
 * @param {(add: (picked: {concept:string, answers:string[]}[]) => void) => void} [config.fromBoards]
 *   offer the boards' own sentences to put here, each by reference
 * @param {(phrase: import('./board-store.js').CustomPhrase) => {owner:string, listener:string}} [config.words]
 *   what a button taken from a board says, for its row
 * @param {import('./about.js').Sounds} [config.sounds]  a name built from its sounds, for
 *   the listener's side: a hotel's, a street's, anyone's
 */
export function openBoardEditor({ at, pair, owner, listener, listenerDir, state: held, onChange, save: deliver, builtIn = [], context, fromBoards, words, sounds }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'board-editor' }));
  // **Handed in, not read here.** Re-reading storage on every repaint meant the
  // board asked the disk what the reader had just typed while the write was still
  // queued -- so a new button did not appear until a reload. The page holds one
  // copy, hydrated at start-up; this edits it and hands it back. Which is also
  // section 5.3's rule that a late read must not overwrite a fresh edit.
  let state = held;

  /** Save, repaint, and say so if the disk refused. */
  const commit = async (/** @type {import('./board-store.js').BoardPersonal} */ next) => {
    state = { data: next, damaged: state.damaged };
    paint();
    onChange(next);
    try {
      await write(next);
      status.textContent = '';
    } catch (err) {
      // The reader believes they have saved. They have not.
      status.textContent = /** @type {Error} */ (err).message;
      status.classList.add('board-editor-error');
    }
  };

  const status = el('p', { class: 'board-editor-status', role: 'status' });
  const board = at.split('/')[0];

  /** A labelled input. @param {string} key @param {HTMLElement} input */
  const field = (key, input) => el('label', { class: 'board-editor-field' },
    [el('span', { class: 'small muted', text: t(key) }), input]);

  /**
   * A screen's name: the one field a screen has. Adding one puts it on this screen;
   * its own buttons are added by opening it on the board and pressing the plus there.
   * @param {import('./board-store.js').CustomPhrase} [existing]
   */
  const screenForm = (existing) => {
    const name = /** @type {HTMLInputElement} */ (el('input', { type: 'text', maxlength: '40' }));
    if (existing) name.value = existing.label;
    const add = el('button', { type: 'button', text: t(existing ? 'editor.save' : 'editor.addScreen') });
    add.addEventListener('click', async () => {
      const label = name.value.trim();
      if (!label) return;
      await commit(existing ? editPhrase(state.data, existing.id, { label })
        : addPhrase(state.data, { label, owner: '', listener: '', pair, screen: true }, at).data);
      draw();
    });
    return el('div', { class: 'board-editor-form board-editor-screen' },
      [field('editor.screenName', name), el('div', { class: 'row' }, [add])]);
  };

  /** Save what is on this screen as a file, or load a file's buttons onto it. */
  const transfer = () => {
    const out = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'ghost', text: t('editor.exportButtons') }));
    out.disabled = !placedOn(state.data, at, pair).length;
    out.addEventListener('click', () => deliver(
      new Blob([JSON.stringify(buildButtons(pair, screenContents(state.data, at, pair)), null, 2)], { type: 'application/json' }),
      `phraselet-buttons-${pair}.json`,
    ));
    const file = /** @type {HTMLInputElement} */ (el('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden' }));
    const load = el('button', { type: 'button', class: 'ghost', text: t('editor.importButtons') });
    load.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      const got = readButtons(await chosen.text(), pair);
      file.value = '';
      if (!got.ok) {
        // The sentence is the reader's; the diagnostics name keys out of the file and
        // stay English, tagged as such so a right-to-left interface does not reorder them.
        status.replaceChildren(t('personal.refused'), ' ', el('span', { lang: 'en', dir: 'ltr', text: got.problems.join('; ') }));
        status.classList.add('board-editor-error');
        return;
      }
      await commit(graftContents(state.data, got.data, at));
      status.classList.remove('board-editor-error');
      status.textContent = t('editor.imported', { count: String(Object.keys(got.data.phrases).length) });
      draw();
    });
    return el('div', { class: 'row board-editor-transfer' }, [out, load, file]);
  };

  /**
   * The form. Two complete sentences and a short label, and it does not pretend the
   * second one can be produced from the first.
   * @param {import('./board-store.js').CustomPhrase} [existing]
   */
  const form = (existing) => {
    const label = el('input', { type: 'text', maxlength: '40' });
    const own = el('input', { type: 'text' });
    const theirs = el('input', { type: 'text', lang: listener, dir: listenerDir });
    if (existing) {
      /** @type {HTMLInputElement} */ (label).value = existing.label;
      /** @type {HTMLInputElement} */ (own).value = existing.owner;
      /** @type {HTMLInputElement} */ (theirs).value = existing.listener;
    }

    // **The preview is the exact text that will be shown**, not an approximation of
    // it: §5.2 asks for that because a reader who previewed one thing and showed a
    // stranger another has been misled by their own app.
    const preview = el('p', { class: 'board-editor-preview', lang: listener, dir: listenerDir });
    const sync = () => {
      preview.textContent = /** @type {HTMLInputElement} */ (theirs).value
        || t('editor.noListenerText');
      preview.classList.toggle('board-editor-preview-empty',
        !(/** @type {HTMLInputElement} */ (theirs).value));
    };
    theirs.addEventListener('input', sync);
    sync();

    // **A proper name in the listener's letters**, built from its sounds as the reader's
    // own name is: this app does not translate, but a hotel's or a street's name is
    // sounds, and those it can write in any script.
    const spelled = sounds ? (() => {
      const grid = soundGrid({ ipa: '', ...sounds, speakLabel: t('board.speak'), deleteLabel: t('editor.delete') });
      const put = el('button', { type: 'button', class: 'ghost', text: t('editor.insertSounds') });
      put.addEventListener('click', () => {
        const field = /** @type {HTMLInputElement} */ (theirs);
        const word = sounds.spellListener(grid.value());
        if (!word) return;
        const at = field.selectionStart ?? field.value.length;
        field.value = `${field.value.slice(0, at)}${word}${field.value.slice(field.selectionEnd ?? at)}`;
        sync();
      });
      return el('details', { class: 'about-sounds' }, [el('summary', { text: t('editor.byItsSounds') }), grid.element, put]);
    })() : null;

    // **What the stranger might answer, one at a time.** Each answer is a pair of
    // sentences like the button's own, indented under it with a minus to take it away;
    // none is shown until the plus asks for one, so the form a reader meets is still
    // three boxes. A button with answers is a question they can reply to by tapping.
    const answers = el('ol', { class: 'board-editor-answers' });
    const answerRow = (/** @type {{owner:string, listener:string}} */ held = { owner: '', listener: '' }) => {
      const said = /** @type {HTMLInputElement} */ (el('input', { type: 'text', lang: listener, dir: listenerDir }));
      const meant = /** @type {HTMLInputElement} */ (el('input', { type: 'text' }));
      said.value = held.listener;
      meant.value = held.owner;
      const drop = el('button', {
        type: 'button', class: 'ghost board-editor-minus', text: '\u2212',
        'aria-label': t('editor.removeAnswer'), title: t('editor.removeAnswer'),
      });
      const item = el('li', { class: 'board-editor-answer' },
        [el('div', { class: 'board-editor-answer-fields' },
          [field('editor.answerListener', said), field('editor.answerOwner', meant)]), drop]);
      drop.addEventListener('click', () => item.remove());
      answers.append(item);
      return said;
    };
    for (const reply of existing?.replies ?? []) answerRow(reply);
    const addAnswer = el('button', {
      type: 'button', class: 'ghost board-editor-add-answer',
      'aria-label': t('editor.addAnswer'), title: t('editor.addAnswer'),
    }, [el('span', { text: '+', 'aria-hidden': 'true' }), answerMark()]);
    addAnswer.addEventListener('click', () => answerRow().focus());

    const save = el('button', { type: 'button', class: 'primary', text: t('editor.save') });
    save.addEventListener('click', async () => {
      const replies = [...answers.querySelectorAll('.board-editor-answer')].map((item) => {
        const [said, meant] = /** @type {HTMLInputElement[]} */ ([...item.querySelectorAll('input')]);
        return { owner: meant.value.trim(), listener: said.value.trim() };
      }).filter((r) => r.owner || r.listener);
      const values = {
        label: /** @type {HTMLInputElement} */ (label).value.trim(),
        owner: /** @type {HTMLInputElement} */ (own).value.trim(),
        listener: /** @type {HTMLInputElement} */ (theirs).value.trim(),
        pair,
        replies: replies.length ? replies : undefined,
      };
      if (!values.label && !values.owner) return;
      if (existing) {
        // Editing the wording invalidates any clip recorded against the old words.
        // §6.4: a stale clip must never play against new text.
        await commit(editPhrase(state.data, existing.id, values));
      } else {
        await commit(addPhrase(state.data, values, at).data);
      }
      draw();
    });

    return el('div', { class: 'board-editor-form' }, [
      field('editor.label', label),
      field('editor.owner', own),
      field('editor.listener', theirs),
      ...(spelled ? [spelled] : []),
      // Said once, plainly, where someone is about to wonder why the third box is
      // empty. Not an apology: it is the reason the box exists.
      el('p', { class: 'small muted', text: t('editor.noTranslation') }),
      el('div', { class: 'board-editor-previewed' },
        [el('span', { class: 'small muted', text: t('editor.preview') }), preview]),
      answers,
      el('div', { class: 'row' }, [addAnswer, el('span', { class: 'spacer' }), save]),
    ]);
  };

  /** One placed button, with the four things that can be done to it. */
  const row = (/** @type {import('./board-store.js').CustomPhrase} */ phrase,
    /** @type {number} */ i, /** @type {number} */ total) => {
    const move = (/** @type {-1|1} */ by, /** @type {string} */ glyph,
      /** @type {boolean} */ disabled) => {
      const b = el('button', { type: 'button', class: 'ghost', text: glyph });
      /** @type {HTMLButtonElement} */ (b).disabled = disabled;
      b.setAttribute('aria-label', t(by < 0 ? 'editor.moveUp' : 'editor.moveDown'));
      b.addEventListener('click', () => {
        commit(movePlacement(state.data, at, phrase.id, by));
        draw();
      });
      return b;
    };

    const off = el('button', { type: 'button', class: 'ghost', text: t('editor.removeHere') });
    off.addEventListener('click', () => {
      commit(removePlacement(state.data, phrase.id, at));
      draw();
    });

    // What a screen holds, so deleting one says what goes with it.
    const holds = phrase.screen ? (state.data.placements[`${board}/${phrase.id}`] ?? []).length : 0;
    const gone = el('button', { type: 'button', class: 'ghost', text: t('editor.delete') });
    gone.addEventListener('click', () => {
      // **A phrase may be on more than one board, and deleting it takes all of
      // them.** Saying how many is the difference between a delete and a surprise.
      const where = placementsOf(state.data, phrase.id);
      const ask = phrase.screen ? t('editor.confirmDeleteScreen', { count: String(holds) })
        : where.length > 1 ? t('editor.confirmDeleteMany', { count: String(where.length) })
          : t('editor.confirmDelete');
      // eslint-disable-next-line no-alert
      if (!confirm(ask)) return;
      commit(deletePhrase(state.data, phrase.id));
      draw();
    });

    const edit = el('button', { type: 'button', class: 'ghost', text: t('editor.edit') });
    edit.addEventListener('click', () => {
      body.replaceChildren(phrase.screen ? screenForm(phrase) : form(phrase));
    });
    // A button taken from a board says what the corpus says: there is nothing of the
    // reader's to edit, only to move or take off.
    const said = phrase.concept && words ? words(phrase) : phrase;

    return el('li', { class: 'board-editor-row' }, [
      el('div', { class: 'board-editor-said' }, [
        el('strong', { text: phrase.label || said.owner }),
        el('span', { class: 'small muted', text: phrase.screen ? t('editor.screenHolds', { count: String(holds) })
          : said.listener || t('editor.noListenerText') }),
      ]),
      // A screen is not taken off one screen and left somewhere else: what is on it
      // would have nowhere to be drawn. It is moved, renamed or deleted.
      el('div', { class: 'row' }, [move(-1, '↑', i === 0), move(1, '↓', i === total - 1),
        ...(phrase.concept ? [] : [edit]), ...(phrase.screen ? [] : [off]), gone]),
    ]);
  };

  const body = el('div', { class: 'board-editor-body' });

  /**
   * The board's own buttons, each with a switch. Off is a preference kept on this
   * device; the button stays in the board and comes back with one tap.
   */
  const shipped = () => {
    if (!builtIn.length) return [];
    const hidden = state.data.hidden?.[at] ?? [];
    return [
      el('h3', { class: 'board-editor-sub', text: t('editor.builtIn') }),
      // Its own classes, not the reader's list's: the two are different things, and a
      // test that counts the reader's rows must not count these.
      el('ul', { class: 'board-editor-shipped' }, builtIn.map((/** @type {{id:string, label:string}} */ b) => {
        const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
        box.checked = !hidden.includes(b.id);
        box.addEventListener('change', () => { commit(showBuiltIn(state.data, at, b.id, box.checked)); });
        return el('li', { class: 'board-editor-switch-row' },
          [el('label', { class: 'board-editor-switch' }, [box, el('span', { text: b.label })])]);
      })),
      el('h3', { class: 'board-editor-sub', text: t('editor.title') }),
    ];
  };

  /**
   * The boards' own sentences, to put on this screen by reference: a context of the
   * reader's own can be made of the boards' buttons, their own, or both.
   */
  const taken = () => {
    const button = el('button', { type: 'button', class: 'ghost', text: t('editor.fromBoards') });
    button.addEventListener('click', () => fromBoards?.(async (picked) => {
      let next = state.data;
      for (const { concept, answers } of picked) {
        next = addPhrase(next, { label: '', owner: '', listener: '', pair, concept, answers }, at).data;
      }
      await commit(next);
      draw();
    }));
    return el('div', { class: 'row board-editor-transfer' }, [button]);
  };

  /** Delete the context this is, with everything on it, and leave it. */
  const deleteContext = () => {
    const button = el('button', { type: 'button', class: 'ghost board-editor-delete', text: t('board.deleteContext') });
    button.addEventListener('click', async () => {
      if (!context) return;
      const holds = (state.data.placements[at] ?? []).length;
      if (!confirm(t('editor.confirmDeleteScreen', { count: String(holds) }))) return;
      await commit(deletePhrase(state.data, context.id));
      panel.close();
      context.onGone();
    });
    return el('div', { class: 'board-editor-transfer' }, [button]);
  };

  function draw() {
    const placed = (state.data.placements[at] ?? [])
      .map((/** @type {string} */ id) => state.data.phrases[id])
      .filter((/** @type {import('./board-store.js').CustomPhrase} */ p) => p && p.pair === pair);
    body.replaceChildren(
      ...shipped(),
      placed.length
        ? el('ul', { class: 'board-editor-list' },
          placed.map((/** @type {import('./board-store.js').CustomPhrase} */ p,
            /** @type {number} */ i) => row(p, i, placed.length)))
        : el('p', { class: 'small muted', text: t('editor.none') }),
      form(),
      screenForm(),
      ...(fromBoards ? [taken()] : []),
      transfer(),
      ...(context && at.endsWith(`/${context.id}`) ? [deleteContext()] : []),
    );
  }

  function paint() {
    if (state.damaged) {
      // Never overwritten silently: the reader is told, and the record is still on
      // disk for them to export or recover.
      status.textContent = t('editor.damaged');
      status.classList.add('board-editor-error');
    }
  }

  panel.setAttribute('aria-label', t('editor.open'));
  panel.append(
    dialogHead({ title: t('editor.open'), close: t('gallery.previewClose'), onClose: () => panel.close() }),
    status, body,
  );
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  draw();
  paint();
  panel.showModal();
  /** @type {HTMLElement|null} */ (panel.querySelector('input'))?.focus();
  return panel;
}
