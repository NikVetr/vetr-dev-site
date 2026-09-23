// What the message screen shows and how it sounds, as the reader's own choice.
//
// The board draws one sentence for a stranger and, under it, a second line for the
// owner confirming which button they pressed. Everything on that screen has been a
// fixed decision until now, and the fixed decision is wrong for somebody: a reader
// who is learning the language wants the pronunciation on screen, a reader handing
// the phone over wants nothing on it but the sentence, and a reader whose device has
// no usable voice wants the Speak control gone rather than dead.
//
// So they are settings. The three that were always there default to on, because
// turning them on by default is what "always there" means and nobody should have to
// go and find them. The two that are new default to off, because a line of IPA under
// every phrase is a change to the screen a reader did not ask for.
//
// Stored as one record rather than five keys: they are read together on every paint
// and written together from one dialog, and five keys would be five chances for a
// half-applied state after a failed write.

import * as store from './platform/store.js';
import { t } from './i18n.js';

const KEY = 'plg.board-display';

/**
 * @typedef {Object} BoardDisplay
 * @property {boolean} owner  the reader's own wording, under the sentence
 * @property {boolean} speak  the Speak control and the half-speed one beside it
 * @property {boolean} turn   the control that turns the sentence sideways
 * @property {boolean} roman  how to say the sentence, in the reader's own letters
 * @property {boolean} ipa    the same thing in IPA, for a reader who reads it
 */

/** @type {BoardDisplay} */
export const DEFAULTS = {
  owner: true, speak: true, turn: true, roman: false, ipa: false,
};

/** The order they are offered in, which is the order they appear on screen. */
export const OPTIONS = /** @type {{id:keyof BoardDisplay, key:string}[]} */ ([
  { id: 'owner', key: 'display.owner' },
  { id: 'roman', key: 'display.roman' },
  { id: 'ipa', key: 'display.ipa' },
  { id: 'speak', key: 'display.speak' },
  { id: 'turn', key: 'display.turn' },
]);

/**
 * The reader's choices, with the defaults under them.
 *
 * Every field is coerced rather than trusted: this is the reader's own storage and
 * an import or an older build can leave anything in it, and a `truthy` string here
 * would turn an option on that the dialog then shows as off.
 * @returns {BoardDisplay}
 */
export function readDisplay() {
  const raw = store.get(KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const held = JSON.parse(raw);
    const out = { ...DEFAULTS };
    for (const { id } of OPTIONS) if (typeof held?.[id] === 'boolean') out[id] = held[id];
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

/** @param {BoardDisplay} next */
export function writeDisplay(next) {
  store.set(KEY, JSON.stringify(next));
}

/**
 * The settings section, a checkbox each.
 *
 * Checkboxes rather than a row of chips: these are five independent yes/no answers
 * about one screen, which is the control the platform already has and the one a
 * screen reader announces without being told how.
 * @param {BoardDisplay} current
 * @param {(next:BoardDisplay)=>void} onChange
 */
export function displaySection(current, onChange) {
  const held = { ...current };
  const box = document.createElement('section');
  box.className = 'speaker-block';

  const heading = document.createElement('h3');
  heading.className = 'speaker-heading';
  heading.textContent = t('display.heading');
  box.append(heading);

  const lede = document.createElement('p');
  lede.className = 'speaker-why';
  lede.textContent = t('display.lede');
  box.append(lede);

  for (const option of OPTIONS) {
    const row = document.createElement('label');
    row.className = 'display-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = held[option.id];
    input.addEventListener('change', () => {
      held[option.id] = input.checked;
      writeDisplay(held);
      onChange({ ...held });
    });
    const text = document.createElement('span');
    text.textContent = t(option.key);
    row.append(input, text);
    box.append(row);
  }
  return box;
}

/** @param {string} lang */
const voiceKey = (lang) => `plg.voice.${lang}`;

/**
 * The voice this reader picked for this language, or `''` for the automatic one.
 *
 * Per language, because a choice made for one is meaningless for another and a
 * single stored id would follow the reader onto a board that cannot use it.
 * @param {string} lang
 */
export function readVoice(lang) {
  return store.get(voiceKey(lang)) || '';
}

/** @param {string} lang @param {string} id */
export function writeVoice(lang, id) {
  if (id) store.set(voiceKey(lang), id); else store.remove(voiceKey(lang));
}

/**
 * Which voice reads the sentence out.
 *
 * **The automatic pick is a guess and on some systems it is a bad one.** The ranking
 * prefers an on-device voice over one that needs the network, which is right for a
 * traveller with no data -- but a desktop Linux box exposes every espeak variant as
 * a separate voice, eight thousand of them, and the one that wins a tie is whichever
 * sorts first rather than whichever sounds like a person. There is no signal in the
 * platform's list that says "this one is good", so the honest answer is to name the
 * one in use and let the reader change it.
 *
 * A `<select>` rather than a list of radios: it is one choice out of a set that is
 * two entries long on a phone and hundreds long on a laptop, and a native select is
 * the control that stays usable at both ends of that.
 * @param {{lang:string, voices:{id:string,name:string,lang:string}[], current:string,
 *   onChange:(id:string)=>void}} config
 */
export function voiceSection({ lang, voices, current, onChange }) {
  const box = document.createElement('section');
  box.className = 'speaker-block';
  if (!voices.length) return box;

  const label = document.createElement('label');
  label.className = 'display-voice';
  const name = document.createElement('span');
  name.textContent = t('display.voice');
  const select = document.createElement('select');

  const auto = document.createElement('option');
  auto.value = '';
  auto.textContent = t('display.voiceAuto');
  select.append(auto);
  for (const voice of voices) {
    const option = document.createElement('option');
    option.value = voice.id;
    // The platform's own name and tag, unaltered: they are how the reader recognises
    // a voice they have heard elsewhere, and translating them would break that.
    option.textContent = `${voice.name} (${voice.lang})`;
    select.append(option);
  }
  select.value = voices.some((v) => v.id === current) ? current : '';
  select.addEventListener('change', () => {
    writeVoice(lang, select.value);
    onChange(select.value);
  });
  label.append(name, select);
  box.append(label);
  return box;
}
