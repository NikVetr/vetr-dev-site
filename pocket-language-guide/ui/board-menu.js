// The owner's menu, behind three bars.
//
// Two named buttons in the board's bar cost a whole row on a phone, and the row they
// cost was the one the topic needed. So they live behind an icon — which is worth
// doing only because there are exactly two of them and neither is used mid-
// conversation: a menu that hides something urgent would be a worse trade.
//
// A `<dialog>`, like every other modal here, so Escape closes it, the Android Back
// press closes it before the page sees it, and a waiting service-worker update holds
// off while it is open. All three of those come free from the element and would each
// have to be written by hand for a bare `<div>` pretending to be a popup.

import { dialogHead } from './dialog.js';
import { centreMark, topicMark } from './topic-marks.js';

/** @param {string} tag @param {Record<string,string>} attrs @param {(Node|string)[]} kids */
export function el(tag, attrs = {}, kids = []) {
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
 * Open the menu under the control that asked for it.
 *
 * @param {HTMLElement} anchor  the button pressed, so focus can go back to it
 * @param {{label:string, run:()=>void, current?:boolean, own?:{text:string, lang:string}}[]} items  `current` marks the
 *   one in force, which is drawn as such and takes focus instead of the first
 * @param {{title:string, items:{label:string, run:()=>void, current?:boolean}[]}} [aside]
 *   a second column beside the first, under its own heading
 */
export function openBoardMenu(anchor, items, aside) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'board-menu-panel' }));
  /** @type {SVGSVGElement[]} */ const marks = [];
  /**
   * An item may carry its name in its own language beside the reader's word for it --
   * a language's endonym, so someone handed the phone can find their own -- or, for a
   * context, its mark, at the same end and in the same colour.
   * @param {{label:string, run:()=>void, current?:boolean, own?:{text:string, lang:string},
   *   mark?:{name:string, lang:string}|''}} item
   */
  const entry = (item) => {
    const button = el('button', { type: 'button', class: 'board-menu-item', text: item.label });
    // In its own name as well, even where the two are spelled alike: a column that
    // skips "Hausa" beside "Hausa" reads as a language that has no name of its own.
    if (item.own?.text) {
      button.classList.add('board-menu-item-own');
      button.append(el('span', { class: 'board-menu-own', lang: item.own.lang, text: item.own.text }));
    }
    if (item.mark) {
      const mark = topicMark(item.mark.name, `plg-menu-mark-${marks.length}`, item.mark.lang);
      mark.setAttribute('class', 'board-menu-mark');
      marks.push(mark);
      button.classList.add('board-menu-item-own');
      button.append(mark);
    }
    if (item.current) {
      button.classList.add('board-menu-current');
      button.setAttribute('aria-current', 'true');
    }
    button.addEventListener('click', () => {
      // Closed before the action runs, so the action's own dialog is not opening
      // underneath this one -- two modals in the top layer at once is a stack the
      // reader did not ask for and cannot see out of.
      panel.close();
      item.run();
    });
    return button;
  };
  if (aside) {
    panel.classList.add('board-menu-columns');
    panel.append(
      el('div', { class: 'board-menu-column' }, items.map(entry)),
      el('div', { class: 'board-menu-column' }, [
        el('p', { class: 'board-menu-title', text: aside.title }), ...aside.items.map(entry),
      ]),
    );
  } else {
    panel.append(...items.map(entry));
  }
  document.body.append(panel);
  // The aside opens on the voice in use rather than at the top of five hundred: the
  // current item is brought to the middle of its own column, and the page stays put.
  const column = /** @type {HTMLElement|null} */ (panel.querySelector('.board-menu-column:last-child'));
  const current = /** @type {HTMLElement|null} */ (column?.querySelector('.board-menu-current') ?? null);
  if (column && current) column.scrollTop = current.offsetTop - column.clientHeight / 2 + current.offsetHeight / 2;
  panel.addEventListener('close', () => {
    panel.remove();
    // Back to the button that opened it, for whoever is not using a finger.
    anchor.focus();
  });
  // Clicking the backdrop is the ordinary way out of a menu, and on a `<dialog>` the
  // backdrop is the element itself -- a press that lands on the dialog rather than
  // on one of its children came from outside the panel.
  panel.addEventListener('click', (event) => { if (event.target === panel) panel.close(); });
  panel.showModal();
  // Fitted to their ink once the panel is drawn: a closed dialog's contents measure nothing.
  for (const mark of marks) centreMark(mark);
  // **Against the control that opened it.** The stylesheet's default hangs the panel
  // under the header's own corner, which is right for the menu behind the three
  // bars and wrong for everything else that now opens one -- the speed control at
  // the foot of the screen got its list at the top, a screen away from the thumb
  // that asked. So: above the anchor when it sits in the lower half, below it
  // otherwise, its near edge on the anchor's, kept inside the viewport.
  //
  // **The layout viewport, not `innerWidth`.** A fixed panel is placed in layout
  // coordinates, and so is the anchor's rect; `innerHeight` is the *visual* viewport,
  // which shrinks when a phone is pinch-zoomed -- so the clamp put the list a screen
  // above the button for anyone zoomed in.
  const at = anchor.getBoundingClientRect();
  const me = panel.getBoundingClientRect();
  const view = document.documentElement;
  const gap = 6;
  const above = at.top > view.clientHeight / 2;
  const top = above
    ? Math.max(gap, at.top - gap - me.height)
    : Math.min(view.clientHeight - me.height - gap, at.bottom + gap);
  const start = view.dir === 'rtl' ? at.right - me.width : at.left;
  const left = Math.max(gap, Math.min(view.clientWidth - me.width - gap, start));
  panel.style.margin = '0';
  panel.style.inset = `${Math.round(top)}px auto auto ${Math.round(left)}px`;
  /** @type {HTMLElement|null} */ (panel.querySelector('.board-menu-current') ?? panel.querySelector('button'))?.focus();
  return panel;
}

/**
 * A dialog holding one small form -- a header naming what is asked, the field, and
 * Save -- that hands the answer on only when Save (or Enter) is pressed: closing it any
 * other way, its cross, Escape, a press outside it, is changing one's mind.
 * @param {{kind:string, title:string, close:string, save:string, body:Node[], onSubmit:() => void,
 *   focus?:HTMLElement}} config
 */
function formDialog({ kind, title, close, save, body, onSubmit, focus }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: `speaker-settings ${kind}`, 'aria-label': title }));
  const form = el('form', {}, [...body, el('button', { class: 'btn primary form-save', text: save })]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit();
    panel.close();
  });
  panel.append(dialogHead({ title, close, onClose: () => panel.close() }), form);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
  focus?.focus();
}

/** @param {string|undefined} hint */
const hintLine = (hint) => (hint ? [el('p', { class: 'speaker-why', text: hint })] : []);

/**
 * A yes-or-no question in a dialog of its own, with -- where `again` is given -- a box
 * for not being asked it again. Closing it any other way is a no, and the safe answer
 * has the focus.
 * @param {{title: string, body: string, yes: string, no: string, again?: string, close: string}} config
 * @returns {Promise<{ok: boolean, askAgain: boolean}>}
 */
export function askConfirm({ title, body, yes, no, again, close }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings confirm-ask', 'aria-label': title }));
  const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
  const accept = el('button', { type: 'button', class: 'btn primary', text: yes });
  const keep = el('button', { type: 'button', class: 'btn', text: no });
  panel.append(dialogHead({ title, close, onClose: () => panel.close() }), el('p', { class: 'speaker-why', text: body }),
    ...(again ? [el('label', { class: 'speaker-option' }, [box, again])] : []),
    el('div', { class: 'confirm-actions' }, [keep, accept]));
  document.body.append(panel);
  panel.showModal();
  keep.focus();
  let ok = false;
  accept.addEventListener('click', () => { ok = true; panel.close(); });
  keep.addEventListener('click', () => panel.close());
  return new Promise((resolve) => {
    panel.addEventListener('close', () => { panel.remove(); resolve({ ok, askAgain: !box.checked }); });
  });
}

/**
 * Ask for one line of text in a dialog of its own, and hand it back on Save.
 * @param {object} config
 * @param {string} config.label  what the field is: the dialog's title
 * @param {string} config.save   the button's word
 * @param {string} config.close  the cross's accessible name
 * @param {(value:string) => void} config.onSave  given the text, trimmed
 * @param {string} [config.value]  what is in the field to begin with
 * @param {string} [config.hint]   a line under the field
 * @param {string} [config.autocomplete]
 * @param {string} [config.kind]   a class for the dialog, for tests and styles
 * @param {HTMLElement} [config.more]  more of the form, above Save
 */
export function askText({ label, save, close, onSave, value = '', hint, autocomplete, kind = '', more }) {
  const input = /** @type {HTMLInputElement} */ (el('input', { type: 'text' }));
  input.value = value;
  if (autocomplete) input.setAttribute('autocomplete', autocomplete);
  input.setAttribute('aria-label', label);
  formDialog({
    kind, title: label, close, save, focus: input,
    body: [el('label', { class: 'about-field' }, [input]), ...hintLine(hint), ...(more ? [more] : [])],
    onSubmit: () => onSave(input.value.trim()),
  });
}

/**
 * Ask which of several things apply, as checkboxes in a dialog of their own, and hand
 * back the ones ticked on Save.
 * A long list comes in `groups`, each folded under its heading, rather than `options`.
 * @param {object} config
 * @param {string} config.label  what is being asked, above the boxes
 * @param {{value:string, label:string}[]} [config.options]
 * @param {{label:string, options:{value:string, label:string}[]}[]} [config.groups]
 * @param {string[]} config.chosen  ticked to begin with
 * @param {string} config.save  @param {string} config.close
 * @param {(values:string[]) => void} config.onSave
 * @param {string} [config.hint]  @param {string} [config.kind]
 */
export function askChoices({ label, options = [], groups, chosen, save, close, onSave, hint, kind = '' }) {
  /** @type {HTMLInputElement[]} */ const boxes = [];
  const rows = (/** @type {{value:string, label:string}[]} */ list) => list.map((option) => {
    const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', value: option.value }));
    box.checked = chosen.includes(option.value);
    boxes.push(box);
    return el('label', { class: 'speaker-option' }, [box, option.label]);
  });
  const held = groups
    ? groups.map((g) => el('details', { class: 'speaker-group' }, [el('summary', { text: g.label }), ...rows(g.options)]))
    : rows(options);
  formDialog({
    kind, title: label, close, save, focus: groups ? undefined : boxes[0],
    body: [el('fieldset', { class: 'speaker-block' }, [el('legend', { class: 'visually-hidden', text: label }), ...held]),
      ...hintLine(hint)],
    onSubmit: () => onSave(boxes.filter((b) => b.checked).map((b) => b.value)),
  });
}

/**
 * Ask for one of a long list, in a dialog of its own: a native select, which a phone
 * draws as its own scrolling picker and a keyboard can type its way down.
 * @param {object} config
 * @param {string} config.label  @param {{value:string, label:string}[]} config.options
 * @param {string} [config.value]  chosen to begin with
 * @param {string} config.save  @param {string} config.close
 * @param {(value:string) => void} config.onSave
 * @param {string} [config.hint]  @param {string} [config.kind]
 */
export function askSelect({ label, options, value = '', save, close, onSave, hint, kind = '' }) {
  const select = /** @type {HTMLSelectElement} */ (el('select'));
  select.append(...options.map((o) => new Option(o.label, o.value, false, o.value === value)));
  select.setAttribute('aria-label', label);
  formDialog({
    kind, title: label, close, save, focus: select,
    body: [el('label', { class: 'about-field' }, [select]), ...hintLine(hint)],
    onSubmit: () => onSave(select.value),
  });
}

/** The sounds a name is built from: most names' sounds in most languages, not IPA's whole chart,
 * each plain sound before the ones some languages' letters write the same way. */
const SOUNDS = ['p', 'b', 't', 'd', 'k', 'ɡ', 'm', 'n', 'ŋ', 'f', 'v', 's', 'z', 'ʃ', 'ʒ', 'h', 'x',
  'tʃ', 'dʒ', 'ts', 'l', 'r', 'ɾ', 'j', 'w', 'θ', 'ð',
  'i', 'ɪ', 'e', 'ɛ', 'a', 'ɑ', 'o', 'ɔ', 'u', 'ʊ', 'ə', 'y', 'ø', 'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ'];
const VOWEL = /^[iɪeɛaɑɔoʊuəyø]/u;
/** Longest first, so a kept name splits back into the keys it was built from. */
const LONGEST = [...SOUNDS].sort((a, b) => b.length - a.length);

/** @param {string} ipa */
function soundsOf(ipa) {
  /** @type {string[]} */ const sounds = [];
  for (let i = 0; i < ipa.length;) {
    const sound = LONGEST.find((s) => ipa.startsWith(s, i)) ?? ipa[i];
    sounds.push(sound);
    i += sound.length;
  }
  return sounds;
}

/** A sound as a key says it: in a syllable, since a lone consonant spells as nothing. */
const sampleOf = (/** @type {string} */ sound) => (VOWEL.test(sound) ? sound : sound === 'ŋ' ? `a${sound}` : `${sound}a`);

/**
 * The keys one owner is offered: a key per spelling in their own letters. Sounds those
 * letters write alike -- /h/ and /x/ are both "ha" to an English reader, /e/, /ɛ/ and
 * /ə/ all "e" to a German one -- are one key, and it is the plain one, listed first:
 * the owner who presses "e" for Peter means /e/, however often German says /ə/.
 * @param {(ipa:string) => string} spellOwner
 */
function keysFor(spellOwner) {
  /** @type {Map<string, string>} */ const byLabel = new Map();
  for (const sound of SOUNDS) {
    const label = spellOwner(sampleOf(sound)) || sound;
    if (!byLabel.has(label)) byLabel.set(label, sound);
  }
  return [...byLabel].map(([label, sound]) => ({ label, sound }));
}

/**
 * A name built from its sounds, for a listener who reads another script.
 *
 * A key per sound, labelled in the owner's own letters with the IPA under it. The
 * sounds so far sit above as tiles; one picked out is replaced by the next key or
 * deleted. Under them, the name as the listener will read it and as the owner's own
 * letters say it, then Speak and Delete on a row of their own. Every key and the whole
 * name are said in the listener's voice: what the owner hears is what the listener's
 * phone will say.
 * @param {object} config
 * @param {string} config.ipa  the sounds so far
 * @param {(ipa:string) => string} config.spellOwner  @param {(ipa:string) => string} config.spellListener
 * @param {(text:string) => void} [config.say]  the listener's voice, where this device has one
 * @param {string} config.speakLabel  @param {string} config.deleteLabel
 * @returns {{element: HTMLElement, value: () => string}}
 */
export function soundGrid({ ipa, spellOwner, spellListener, say, speakLabel, deleteLabel }) {
  const sounds = soundsOf(ipa);
  let picked = -1;
  const built = el('div', { class: 'sound-built' });
  const heard = el('span', { class: 'sound-heard' });
  const reading = el('span', { class: 'sound-reading' });
  const speak = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'btn sound-speak', text: speakLabel }));
  speak.hidden = !say;
  speak.addEventListener('click', () => say?.(heard.textContent ?? ''));
  const erase = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'btn sound-delete', 'aria-label': deleteLabel, title: deleteLabel, text: '\u232b' }));
  const draw = () => {
    built.replaceChildren(...sounds.map((sound, k) => {
      const chip = el('button', { type: 'button', class: 'sound-chip', text: sound, 'aria-pressed': String(k === picked) });
      chip.addEventListener('click', () => { picked = picked === k ? -1 : k; draw(); });
      return chip;
    }));
    heard.textContent = spellListener(sounds.join(''));
    reading.textContent = spellOwner(sounds.join(''));
    speak.disabled = !sounds.length;
    erase.disabled = !sounds.length;
  };
  erase.addEventListener('click', () => {
    sounds.splice(picked >= 0 ? picked : sounds.length - 1, 1);
    picked = -1;
    draw();
  });
  const key = (/** @type {{label:string, sound:string}} */ { label, sound }) => {
    const button = el('button', { type: 'button', class: 'sound-key' }, [el('span', { text: label }), el('small', { text: sound })]);
    button.addEventListener('click', () => {
      if (picked >= 0) sounds[picked] = sound;
      else sounds.push(sound);
      picked = -1;
      draw();
      say?.(spellListener(sampleOf(sound)));
    });
    return button;
  };
  draw();
  const keys = keysFor(spellOwner);
  // The sounds so far and the name they spell stay in view while the keys scroll under
  // them; the vowels are a block of their own, set apart and tinted.
  const element = el('div', { class: 'sound-builder' }, [
    el('div', { class: 'sound-head' }, [built, el('p', { class: 'sound-line' }, [heard, reading]),
      el('div', { class: 'sound-actions' }, [speak, erase])]),
    el('div', { class: 'sound-keys' }, keys.filter((k) => !VOWEL.test(k.sound)).map(key)),
    el('div', { class: 'sound-keys sound-vowels' }, keys.filter((k) => VOWEL.test(k.sound)).map(key)),
  ]);
  // A label wider than its key -- German's "tscha" -- is set smaller rather than broken.
  new ResizeObserver(() => {
    const labels = /** @type {HTMLElement[]} */ ([...element.querySelectorAll('.sound-key > span')]);
    for (const label of labels) label.style.fontSize = '';
    const fits = labels.map((label) => (/** @type {HTMLElement} */ (label.parentElement).clientWidth - 4) / label.offsetWidth);
    labels.forEach((label, k) => { if (fits[k] < 1) label.style.fontSize = `${fits[k]}em`; });
  }).observe(element);
  return { element, value: () => sounds.join('') };
}
