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
  /**
   * An item may carry its name in its own language beside the reader's word for it --
   * a language's endonym, so someone handed the phone can find their own.
   * @param {{label:string, run:()=>void, current?:boolean, own?:{text:string, lang:string}}} item
   */
  const entry = (item) => {
    const button = el('button', { type: 'button', class: 'board-menu-item', text: item.label });
    if (item.own && item.own.text !== item.label) {
      button.append(el('span', { class: 'board-menu-own', lang: item.own.lang, text: item.own.text }));
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
 * A dialog holding one small form -- the corner control, what is asked, and Save --
 * that hands the answer on only when Save (or Enter) is pressed: closing it any other
 * way, its corner, Escape, a press outside it, is changing one's mind.
 * @param {{kind:string, close:string, save:string, body:Node[], onSubmit:() => void, focus?:HTMLElement}} config
 */
function formDialog({ kind, close, save, body, onSubmit, focus }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: `speaker-settings ${kind}` }));
  const corner = el('button', { type: 'button', class: 'speaker-close', 'aria-label': close });
  corner.addEventListener('click', () => panel.close());
  const form = el('form', {}, [...body, el('button', { class: 'btn primary form-save', text: save })]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit();
    panel.close();
  });
  panel.append(corner, form);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
  focus?.focus();
}

/** @param {string|undefined} hint */
const hintLine = (hint) => (hint ? [el('p', { class: 'speaker-why', text: hint })] : []);

/**
 * Ask for one line of text in a dialog of its own, and hand it back on Save.
 * @param {object} config
 * @param {string} config.label  what the field is, above it
 * @param {string} config.save   the button's word
 * @param {string} config.close  the corner control's accessible name
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
  formDialog({
    kind, close, save, focus: input,
    body: [el('label', { class: 'about-field' }, [el('span', { text: label }), input]), ...hintLine(hint),
      ...(more ? [more] : [])],
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
    kind, close, save, focus: groups ? undefined : boxes[0],
    body: [el('fieldset', { class: 'speaker-block' }, [el('legend', { text: label }), ...held]), ...hintLine(hint)],
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
  formDialog({
    kind, close, save, focus: select,
    body: [el('label', { class: 'about-field' }, [el('span', { text: label }), select]), ...hintLine(hint)],
    onSubmit: () => onSave(select.value),
  });
}

/** The sounds a name is built from: most names' sounds in most languages, not IPA's whole chart. */
const SOUNDS = ['p', 'b', 't', 'd', 'k', 'ɡ', 'm', 'n', 'ŋ', 'f', 'v', 's', 'z', 'ʃ', 'ʒ', 'x', 'h',
  'tʃ', 'dʒ', 'ts', 'l', 'r', 'ɾ', 'j', 'w', 'θ', 'ð',
  'i', 'ɪ', 'e', 'ɛ', 'a', 'ɑ', 'ɔ', 'o', 'ʊ', 'u', 'ə', 'y', 'ø', 'aɪ', 'aʊ', 'eɪ', 'oʊ', 'ɔɪ'];
const VOWEL = /^[iɪeɛaɑɔoʊuəyø]/u;
/** Longest first, so a kept name splits back into the keys it was built from. */
const LONGEST = [...SOUNDS].sort((a, b) => b.length - a.length);

/**
 * A name built from its sounds, for a listener who reads another script.
 *
 * A key per sound, labelled in the owner's own letters -- the sound in a syllable,
 * since a lone consonant spells as nothing -- with the IPA under it. The sounds so far
 * sit above; one picked out is replaced by the next key or deleted. Under them, the
 * name as the listener will read it, and every key and the whole name are said in the
 * listener's voice: what the owner hears is what the listener's phone will say.
 * @param {object} config
 * @param {string} config.ipa  the sounds so far
 * @param {(ipa:string) => string} config.spellOwner  @param {(ipa:string) => string} config.spellListener
 * @param {(text:string) => void} [config.say]  the listener's voice, where this device has one
 * @param {string} config.speakLabel  @param {string} config.deleteLabel
 * @returns {{element: HTMLElement, value: () => string}}
 */
export function soundGrid({ ipa, spellOwner, spellListener, say, speakLabel, deleteLabel }) {
  /** @type {string[]} */ const sounds = [];
  for (let i = 0; i < ipa.length;) {
    const sound = LONGEST.find((s) => ipa.startsWith(s, i)) ?? ipa[i];
    sounds.push(sound);
    i += sound.length;
  }
  let picked = -1;
  const built = el('div', { class: 'sound-built' });
  const heard = el('span', { class: 'sound-heard' });
  const speak = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'btn', text: speakLabel }));
  speak.hidden = !say;
  speak.addEventListener('click', () => say?.(heard.textContent ?? ''));
  const erase = el('button', { type: 'button', class: 'btn sound-delete', 'aria-label': deleteLabel, text: '\u232b' });
  const draw = () => {
    built.replaceChildren(...sounds.map((sound, k) => {
      const chip = el('button', { type: 'button', class: 'sound-chip', text: sound, 'aria-pressed': String(k === picked) });
      chip.addEventListener('click', () => { picked = picked === k ? -1 : k; draw(); });
      return chip;
    }), erase);
    heard.textContent = spellListener(sounds.join(''));
    speak.disabled = !sounds.length;
  };
  erase.addEventListener('click', () => {
    sounds.splice(picked >= 0 ? picked : sounds.length - 1, 1);
    picked = -1;
    draw();
  });
  const keys = SOUNDS.map((sound) => {
    const sample = VOWEL.test(sound) ? sound : sound === 'ŋ' ? `a${sound}` : `${sound}a`;
    const key = el('button', { type: 'button', class: 'sound-key' },
      [el('span', { text: spellOwner(sample) || sound }), el('small', { text: sound })]);
    key.addEventListener('click', () => {
      if (picked >= 0) sounds[picked] = sound;
      else sounds.push(sound);
      picked = -1;
      draw();
      say?.(spellListener(sample));
    });
    return key;
  });
  draw();
  const element = el('div', { class: 'sound-builder' }, [
    built, el('p', { class: 'sound-line' }, [heard, speak]), el('div', { class: 'sound-keys' }, keys)]);
  return { element, value: () => sounds.join('') };
}
