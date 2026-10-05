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
import { pills } from './dialog.js';

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
 * @property {boolean} holdSpeaks  holding a button says its sentence, whatever a tap does
 * @property {boolean} sizedToWords  each row of buttons as tall as its words, at one size of type
 * @property {boolean} evenType  with the buttons all one size, the same size of type on every one
 * @property {boolean} cellWords  under each button's words, the other language's
 * @property {boolean} cellSay    ...how to say them, in the reader's own letters
 * @property {boolean} cellIpa    ...and in IPA
 * @property {boolean} peekOwner   holding the eye shows each button's whole sentence in the reader's words
 * @property {boolean} peekWords   ...the other language's
 * @property {boolean} peekSay     ...how to say it
 * @property {boolean} peekIpa     ...its IPA
 * @property {boolean} peekAnswers ...and, on a question, the answers the stranger can give, in the reader's words
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
  // Holding a button says it where it is while a tap still opens it: a check of how a
  // sentence sounds, or one quick word, without leaving the grid. Off by default, since
  // a hold on a button the reader has filled in is how it is cleared.
  holdSpeaks: false,
  // The buttons all one size, each label as large as its own fits, is the board as it
  // was drawn: a grid that never moves. One size of type, or buttons sized to their
  // words, is a reader's choice to trade that for evenness.
  sizedToWords: false,
  evenType: false,
  // The other side's words under each button, for the reader who is learning them.
  cellWords: false,
  cellSay: false,
  cellIpa: false,
  // What holding the bar's eye shows on every button: what it will say, and what can
  // come back, at a glance and only while held.
  peekOwner: true,
  peekWords: true,
  peekSay: true,
  peekIpa: false,
  peekAnswers: true,
  usedOver: 'month',
  usedPooled: false,
};

/** The speeds Speak can be set to. Numerals, so no catalogue is involved. */
// Podcast speeds: 2x on a phone voice is faster than 2x on a podcast, so the useful
// stops are between. Nothing below a quarter -- the engines floor there, and 0.125
// sounded exactly like 0.25 on an iPhone.
export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * The order they are offered in, which is the order they appear on screen, in four
 * groups: what the message screen shows, how the buttons behave, the lines a button
 * carries under its words, and what holding the eye shows. The first, third and
 * fourth are parts of a screen, each a short name in a grid of tiles; the second are
 * behaviours, each a sentence.
 */
export const OPTIONS = /** @type {{id:'owner'|'roman'|'ipa'|'speak'|'turn'|'polite'|'siren'|'askRemove'|'tapSpeaks'|'tapAnswers'|'holdSpeaks'|'sizedToWords'|'evenType'|'cellWords'|'cellSay'|'cellIpa'|'peekOwner'|'peekWords'|'peekSay'|'peekIpa'|'peekAnswers', labelKey:string, group:'screen'|'size'|'buttons'|'cells'|'peek'}[]} */ ([
  { id: 'owner', labelKey: 'display.ownerShort', group: 'screen' },
  { id: 'roman', labelKey: 'display.romanShort', group: 'screen' },
  { id: 'ipa', labelKey: 'display.ipaShort', group: 'screen' },
  { id: 'speak', labelKey: 'display.speakShort', group: 'screen' },
  { id: 'turn', labelKey: 'display.turnShort', group: 'screen' },
  { id: 'sizedToWords', labelKey: 'display.buttonSize', group: 'size' },
  { id: 'evenType', labelKey: 'display.evenType', group: 'buttons' },
  { id: 'tapSpeaks', labelKey: 'display.tapSpeaks', group: 'buttons' },
  { id: 'tapAnswers', labelKey: 'display.tapAnswers', group: 'buttons' },
  { id: 'holdSpeaks', labelKey: 'display.holdSpeaks', group: 'buttons' },
  { id: 'polite', labelKey: 'display.polite', group: 'buttons' },
  { id: 'siren', labelKey: 'display.siren', group: 'buttons' },
  { id: 'askRemove', labelKey: 'display.askRemove', group: 'buttons' },
  { id: 'cellWords', labelKey: 'display.wordsShort', group: 'cells' },
  { id: 'cellSay', labelKey: 'display.romanShort', group: 'cells' },
  { id: 'cellIpa', labelKey: 'display.ipaShort', group: 'cells' },
  { id: 'peekOwner', labelKey: 'display.peekOwnerShort', group: 'peek' },
  { id: 'peekWords', labelKey: 'display.wordsShort', group: 'peek' },
  { id: 'peekSay', labelKey: 'display.romanShort', group: 'peek' },
  { id: 'peekIpa', labelKey: 'display.ipaShort', group: 'peek' },
  { id: 'peekAnswers', labelKey: 'display.answersShort', group: 'peek' },
]);

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
 * The message screen in miniature, drawn under its tiles: the sentence in its frame,
 * then the reader's lines and the controls, each part there only while its tile is
 * ticked. Nothing on it does anything; it is there so a reader can see what a tile
 * changes before they go and open a sentence to find out.
 */
function cartoon() {
  const box = document.createElement('div');
  box.className = 'display-cartoon';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = '<div class="cartoon-frame"><i class="cartoon-big"></i><i class="cartoon-big cartoon-big-end"></i>'
    + '<b class="cartoon-reply"></b></div><div class="cartoon-foot"><div class="cartoon-lines">'
    + '<i data-part="owner"></i><i data-part="roman"></i><i data-part="ipa"></i></div>'
    + '<span class="cartoon-control" data-part="speak">\u25B6</span><span class="cartoon-control" data-part="turn">\u21BB</span></div>';
  return {
    box,
    /** @param {BoardDisplay} held */
    paint: (held) => {
      for (const part of /** @type {NodeListOf<HTMLElement>} */ (box.querySelectorAll('[data-part]'))) {
        part.hidden = !held[/** @type {keyof BoardDisplay} */ (part.dataset.part)];
      }
    },
  };
}

/**
 * The settings' three sections about the board: what the message screen shows, as a
 * grid of tiles over a small drawing of that screen; how the buttons behave, a
 * checkbox each, with the lines a button can carry as tiles again; and what holding
 * the eye shows, tiles too.
 *
 * Checkboxes throughout, the tiles included: these are independent yes/no answers,
 * which is the control the platform already has and the one a screen reader announces
 * without being told how. A tile is the checkbox and its short name, outlined, and
 * filled while ticked -- the tick and the fill, two cues rather than one.
 * @param {BoardDisplay} current
 * @param {(next:BoardDisplay)=>void} onChange
 * @param {{canSpeak:boolean, language:string}} [voice]  the listener's voice on this
 *   device, where a board knows it: speaking on tap needs one
 */
export function displaySection(current, onChange, voice) {
  const held = { ...current };
  /** @type {Partial<Record<keyof BoardDisplay, HTMLInputElement>>} */ const inputs = {};
  const drawing = cartoon();
  /** One framed section under its legend. @param {string} key @param {Node[]} body */
  const section = (key, body) => {
    const box = document.createElement('fieldset');
    box.className = 'speaker-block';
    const legend = document.createElement('legend');
    legend.textContent = t(key);
    box.append(legend, ...body);
    return box;
  };
  /** A follow-on setting is out of play while the one it depends on says so. */
  const follow = () => {
    for (const [id, off] of /** @type {const} */ ([['tapAnswers', !held.tapSpeaks], ['evenType', held.sizedToWords]])) {
      const input = /** @type {HTMLInputElement} */ (inputs[id]);
      input.disabled = off;
      input.closest('label')?.classList.toggle('display-option-off', off);
    }
  };
  /** Write one setting and tell everyone. @param {keyof BoardDisplay} id @param {boolean} on */
  const set = (id, on) => {
    held[id] = /** @type {never} */ (on);
    // Merged into what is stored rather than written from this dialog's copy: the
    // Most used section writes the same record, and neither may undo the other.
    const next = { ...readDisplay(), [id]: on };
    writeDisplay(next);
    follow();
    drawing.paint(held);
    onChange(next);
  };
  /** @param {typeof OPTIONS[number]} option @param {string} [context]  what the name means without its heading */
  const checkbox = (option, context) => {
    const row = document.createElement('label');
    row.className = option.group === 'buttons' ? 'display-option' : 'display-tile';
    if (option.id === 'tapAnswers') row.classList.add('display-option-sub');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = held[option.id];
    inputs[option.id] = input;
    // The tiles under a button and under the eye share their short names with the
    // message screen's, so their accessible names carry the heading too: two checkboxes
    // both called "IPA" would be one question twice to a screen reader.
    if (context) input.setAttribute('aria-label', `${context} ${t(option.labelKey)}`);
    input.addEventListener('change', () => set(option.id, input.checked));
    const text = document.createElement('span');
    text.textContent = t(option.labelKey);
    row.append(input, text);
    return row;
  };
  /** @param {'screen'|'cells'|'peek'} group @param {string} [context] */
  const tiles = (group, context) => {
    const grid = document.createElement('div');
    grid.className = 'display-tiles';
    grid.append(...OPTIONS.filter((o) => o.group === group).map((o) => checkbox(o, context)));
    return grid;
  };

  /** @type {Node[]} */ const buttons = [pills({
    name: 'display-size',
    label: t('display.buttonSize'),
    options: [{ value: 'equal', label: t('display.sizeEqual') }, { value: 'words', label: t('display.sizeWords') }],
    value: held.sizedToWords ? 'words' : 'equal',
    onChange: (value) => set('sizedToWords', value === 'words'),
  })];
  for (const option of OPTIONS.filter((o) => o.group === 'buttons')) {
    const row = checkbox(option);
    buttons.push(row);
    // A wink for one country, from the device's own locale rather than a question
    // nobody was asked: a Canadian phone with the softening off is told, once, that
    // it might want it on.
    if (option.id === 'polite' && /-CA$/i.test(navigator.language ?? '')) {
      const hint = document.createElement('p');
      hint.className = 'speaker-why display-hint';
      hint.textContent = t('display.politeCanada');
      hint.hidden = held.polite;
      row.querySelector('input')?.addEventListener('change', (event) => {
        hint.hidden = /** @type {HTMLInputElement} */ (event.target).checked;
      });
      buttons.push(hint);
    }
    // Said where it applies, not left to a tap that silently opens the sentence.
    if (option.id === 'tapSpeaks' && voice && !voice.canSpeak) {
      const hint = document.createElement('p');
      hint.className = 'speaker-why display-hint';
      hint.textContent = t('display.tapNoVoice', { language: voice.language });
      buttons.push(hint);
    }
  }
  const caption = document.createElement('p');
  caption.className = 'speaker-why display-caption';
  caption.textContent = t('display.cellsCaption');
  const all = document.createElement('div');
  all.className = 'display-sections';
  all.append(
    section('display.heading', [tiles('screen'), drawing.box]),
    section('display.buttonsHeading', [...buttons, caption, tiles('cells', t('display.cellsCaption'))]),
    section('display.peekHeading', [tiles('peek', t('display.peekHeading'))]),
  );
  follow();
  drawing.paint(held);
  return all;
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
