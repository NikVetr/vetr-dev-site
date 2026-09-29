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
// go and find them. The pronunciation line is on too -- it is the reason most people
// open the card -- and IPA is off, because a line of IPA under every phrase is a
// change to the screen a reader did not ask for.
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
 * @property {number} rate    how fast Speak reads, as a multiplier of the voice's own pace
 * @property {boolean} turned the stranger's surfaces set sideways, kept from message to message
 * @property {boolean} polite "excuse me" said before every request, in both languages
 * @property {boolean} siren  Attract attention sounds a siren as well as flashing
 * @property {boolean} askRemove  rearranging asks before it takes a button off a screen
 * @property {boolean} tapSpeaks  a button says its sentence where it is, without opening it
 * @property {boolean} tapAnswers  ...and a question then opens its answers
 * @property {boolean} cellWords  under each button's words, the other language's
 * @property {boolean} cellSay    ...how to say them, in the reader's own letters
 * @property {boolean} cellIpa    ...and in IPA
 * @property {string} usedOver    the window the Most used screen counts over
 * @property {boolean} usedPooled ...and whether it counts every language or this one
 */

/** @type {BoardDisplay} */
export const DEFAULTS = {
  owner: true, speak: true, turn: true, roman: true, ipa: false, rate: 1,
  // Whether the stranger's surfaces -- the sentence, Reply, the answers -- are set
  // sideways. A preference rather than a moment's toggle, so a phone laid on the
  // counter stays turned from one message to the next and into the answer grid.
  turned: false,
  // Whether every request opens with the language's "excuse me". Off by default:
  // some owners want the softening every time and others find it indirect, and the
  // corpus sentences are written to stand on their own.
  polite: false,
  // A siren is loud and cannot be taken back once it has started in a quiet room, so
  // it is the reader's to turn on.
  siren: false,
  // Taking a button off a screen while rearranging asks first, until the reader says
  // it need not: they know by then where to bring one back from.
  askRemove: true,
  // **Speak on tap**, for a listener who cannot look: directions to a driver, one tap
  // each, the grid staying where it is. Off by default, because the full-screen
  // sentence is what most exchanges need, and the bar's own switch turns it on in one tap.
  tapSpeaks: false,
  tapAnswers: false,
  // The other side's words under each button, for the reader who is learning them.
  cellWords: false,
  cellSay: false,
  cellIpa: false,
  usedOver: 'month',
  usedPooled: false,
};

/** The speeds Speak can be set to. Numerals, so no catalogue is involved. */
// Podcast speeds: 2x on a phone voice is faster than 2x on a podcast, so the useful
// stops are between. Nothing below a quarter -- the engines floor there, and 0.125
// sounded exactly like 0.25 on an iPhone.
export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/** The order they are offered in, which is the order they appear on screen. */
export const OPTIONS = /** @type {{id:'owner'|'roman'|'ipa'|'speak'|'turn'|'polite'|'siren'|'askRemove'|'tapSpeaks'|'tapAnswers'|'cellWords'|'cellSay'|'cellIpa', labelKey:string, group:'message'|'buttons'}[]} */ ([
  { id: 'owner', labelKey: 'display.owner', group: 'message' },
  { id: 'roman', labelKey: 'display.roman', group: 'message' },
  { id: 'ipa', labelKey: 'display.ipa', group: 'message' },
  { id: 'speak', labelKey: 'display.speak', group: 'message' },
  { id: 'turn', labelKey: 'display.turn', group: 'message' },
  { id: 'polite', labelKey: 'display.polite', group: 'message' },
  { id: 'siren', labelKey: 'display.siren', group: 'message' },
  { id: 'askRemove', labelKey: 'display.askRemove', group: 'message' },
  { id: 'tapSpeaks', labelKey: 'display.tapSpeaks', group: 'buttons' },
  { id: 'tapAnswers', labelKey: 'display.tapAnswers', group: 'buttons' },
  { id: 'cellWords', labelKey: 'display.cellWords', group: 'buttons' },
  { id: 'cellSay', labelKey: 'display.roman', group: 'buttons' },
  { id: 'cellIpa', labelKey: 'display.ipa', group: 'buttons' },
]);

/** The lines a button can carry under its words. */
const CELL_LINES = new Set(['cellWords', 'cellSay', 'cellIpa']);

/** The windows the Most used screen can count over, as `ui/usage.js` defines them. */
const USED_OVER = ['week', 'month', 'year', 'all'];

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
    if (typeof held?.turned === 'boolean') out.turned = held.turned;
    if (RATES.includes(held?.rate)) out.rate = held.rate;
    if (USED_OVER.includes(held?.usedOver)) out.usedOver = held.usedOver;
    if (typeof held?.usedPooled === 'boolean') out.usedPooled = held.usedPooled;
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
 * The settings section, a checkbox each, in two groups: what the message screen shows,
 * and how the buttons behave and what they carry.
 *
 * Checkboxes rather than a row of chips: these are independent yes/no answers, which
 * is the control the platform already has and the one a screen reader announces
 * without being told how.
 * @param {BoardDisplay} current
 * @param {(next:BoardDisplay)=>void} onChange
 * @param {{canSpeak:boolean, language:string}} [voice]  the listener's voice on this
 *   device, where a board knows it: speaking on tap needs one
 */
export function displaySection(current, onChange, voice) {
  const held = { ...current };
  const box = document.createElement('section');
  box.className = 'speaker-block';
  /** @type {Partial<Record<keyof BoardDisplay, HTMLInputElement>>} */ const inputs = {};
  /** @param {string} key */
  const heading = (key) => {
    const h = document.createElement('h3');
    h.className = 'speaker-heading';
    h.textContent = t(key);
    return h;
  };
  /** Only while speaking on tap is on can a question open its answers from it. */
  const follow = () => {
    const answers = inputs.tapAnswers;
    if (!answers) return;
    answers.disabled = !held.tapSpeaks;
    answers.closest('label')?.classList.toggle('display-option-off', !held.tapSpeaks);
  };

  for (const group of /** @type {const} */ (['message', 'buttons'])) {
    box.append(heading(group === 'message' ? 'display.heading' : 'display.buttonsHeading'));
    for (const option of OPTIONS.filter((o) => o.group === group)) {
      // The three lines a button can carry are introduced once, rather than each
      // label saying "under each button".
      if (option.id === 'cellWords') {
        const caption = document.createElement('p');
        caption.className = 'speaker-why display-caption';
        caption.textContent = t('display.cellsCaption');
        box.append(caption);
      }
      const row = document.createElement('label');
      row.className = 'display-option';
      if (option.id === 'tapAnswers') row.classList.add('display-option-sub');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = held[option.id];
      inputs[option.id] = input;
      // The lines under the buttons share their words with the message screen's own
      // lines, so their names carry the caption too: two checkboxes both called "How to
      // say it, in IPA" would be one question twice to a screen reader.
      if (CELL_LINES.has(option.id)) {
        row.classList.add('display-option-cell');
        input.setAttribute('aria-label', `${t('display.cellsCaption')} ${t(option.labelKey)}`);
      }
      // Merged into what is stored rather than written from this dialog's copy: the
      // Most used section writes the same record, and neither may undo the other.
      input.addEventListener('change', () => {
        held[option.id] = input.checked;
        const next = { ...readDisplay(), [option.id]: input.checked };
        writeDisplay(next);
        follow();
        onChange(next);
      });
      const text = document.createElement('span');
      text.textContent = t(option.labelKey);
      row.append(input, text);
      box.append(row);
      // A wink for one country, from the device's own locale rather than a question
      // nobody was asked: a Canadian phone with the softening off is told, once, that
      // it might want it on.
      if (option.id === 'polite' && /-CA$/i.test(navigator.language ?? '')) {
        const hint = document.createElement('p');
        hint.className = 'speaker-why display-hint';
        hint.textContent = t('display.politeCanada');
        hint.hidden = held.polite;
        input.addEventListener('change', () => { hint.hidden = input.checked; });
        box.append(hint);
      }
      // Said where it applies, not left to a tap that silently opens the sentence.
      if (option.id === 'tapSpeaks' && voice && !voice.canSpeak) {
        const hint = document.createElement('p');
        hint.className = 'speaker-why display-hint';
        hint.textContent = t('display.tapNoVoice', { language: voice.language });
        box.append(hint);
      }
    }
  }
  follow();
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
