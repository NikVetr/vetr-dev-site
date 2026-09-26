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

import {
  write, addPhrase, editPhrase, removePlacement, deletePhrase,
  placementsOf, movePlacement, showBuiltIn,
} from './board-store.js';
import { t } from './i18n.js';

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
 * @param {{id:string, label:string}[]} [config.builtIn]  the board's own buttons on this
 *   screen, each offered with a switch to hide it here
 *   hand the new state back and repaint; the page is authoritative, not the disk
 */
export function openBoardEditor({ at, pair, owner, listener, listenerDir, state: held, onChange, builtIn = [] }) {
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

    const field = (/** @type {string} */ key, /** @type {HTMLElement} */ input) => el(
      'label', { class: 'board-editor-field' },
      [el('span', { class: 'small muted', text: t(key) }), input],
    );

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

    const save = el('button', { type: 'button', class: 'primary', text: t('editor.save') });
    save.addEventListener('click', async () => {
      const values = {
        label: /** @type {HTMLInputElement} */ (label).value.trim(),
        owner: /** @type {HTMLInputElement} */ (own).value.trim(),
        listener: /** @type {HTMLInputElement} */ (theirs).value.trim(),
        pair,
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
      // Said once, plainly, where someone is about to wonder why the third box is
      // empty. Not an apology: it is the reason the box exists.
      el('p', { class: 'small muted', text: t('editor.noTranslation') }),
      el('div', { class: 'board-editor-previewed' },
        [el('span', { class: 'small muted', text: t('editor.preview') }), preview]),
      el('div', { class: 'row' }, [save]),
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

    const gone = el('button', { type: 'button', class: 'ghost', text: t('editor.delete') });
    gone.addEventListener('click', () => {
      // **A phrase may be on more than one board, and deleting it takes all of
      // them.** Saying how many is the difference between a delete and a surprise.
      const where = placementsOf(state.data, phrase.id);
      const ask = where.length > 1
        ? t('editor.confirmDeleteMany', { count: String(where.length) })
        : t('editor.confirmDelete');
      // eslint-disable-next-line no-alert
      if (!confirm(ask)) return;
      commit(deletePhrase(state.data, phrase.id));
      draw();
    });

    const edit = el('button', { type: 'button', class: 'ghost', text: t('editor.edit') });
    edit.addEventListener('click', () => {
      body.replaceChildren(form(phrase));
    });

    return el('li', { class: 'board-editor-row' }, [
      el('div', { class: 'board-editor-said' }, [
        el('strong', { text: phrase.label || phrase.owner }),
        el('span', { class: 'small muted', text: phrase.listener || t('editor.noListenerText') }),
      ]),
      el('div', { class: 'row' }, [move(-1, '↑', i === 0), move(1, '↓', i === total - 1),
        edit, off, gone]),
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

  const close = el('button', { type: 'button', class: 'board-editor-close', text: '×' });
  close.setAttribute('aria-label', t('quiz.cancel'));
  close.addEventListener('click', () => panel.close());

  panel.append(
    el('div', { class: 'board-editor-head' },
      [el('h2', { text: t('editor.open') }), close]),
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
