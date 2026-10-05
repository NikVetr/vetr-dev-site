// The reader's own details, for the buttons that say them.
//
// "My name is {}" is a sentence the corpus has in every language, and what goes in
// the slot is the one thing it cannot know. So it is asked once, the first time the
// button is pressed, kept on this device -- and in a backup, since it is the reader's
// -- and said wherever a button leaves room for it. Nothing here is sent anywhere.

import * as store from './platform/store.js';
import { t } from './i18n.js';
import { askChoices, askSelect, askText, soundGrid } from './board-menu.js';
import { helpTip } from './dialog.js';
import { DIET } from '../core/conversation.js';
import { parseTable } from '../core/csv.js';

const KEY = 'plg.about';

/** The details the reader has given, by `DETAILS` key. @returns {Record<string,string>} */
export function readAbout() {
  const raw = store.get(KEY);
  return raw ? JSON.parse(raw) : {};
}

/** @param {Record<string,string>} about */
export function writeAbout(about) {
  return store.set(KEY, JSON.stringify(about));
}

/**
 * Set one detail, or clear it with an empty value -- and with it the sounds it was
 * built from, which describe that name and no other.
 * @param {string} fact @param {string} value
 */
export function setDetail(fact, value) {
  const about = readAbout();
  if (value.trim()) about[fact] = value.trim();
  else { delete about[fact]; delete about[`${fact}_ipa`]; }
  return writeAbout(about);
}

/**
 * What the name's sounds are built with, from the page that knows both languages.
 * @typedef {{spellOwner:(ipa:string)=>string, spellListener:(ipa:string)=>string, say?:(text:string)=>void,
 *   guess?:(name:string)=>string}} Sounds  `guess` reads a typed name's letters as sounds, for a start
 */

/**
 * The text field for one detail, labelled -- committing as it changes when given
 * `onChange`, as everything in the settings dialog does.
 * @param {string} fact @param {() => void} [onChange]
 */
function detailField(fact, onChange) {
  const label = document.createElement('label');
  label.className = 'about-field';
  const name = document.createElement('span');
  name.textContent = t(`about.${fact}`);
  const input = document.createElement('input');
  input.type = 'text';
  input.value = readAbout()[fact] ?? '';
  if (fact === 'name') input.autocomplete = 'name';
  if (onChange) input.addEventListener('change', () => { setDetail(fact, input.value); onChange(); });
  label.append(name, input);
  return { label, input };
}

/**
 * Ask for one detail in a dialog of its own: what the first press of a button that
 * says it opens, so the reader is asked for exactly the thing they reached for.
 *
 * A name can also be built from its sounds, folded away under the field until it is
 * wanted: a listener who reads another script then sees it in their own letters.
 * @param {string} fact @param {() => void} onChange @param {Sounds} [sounds]
 */
export function askDetail(fact, onChange, sounds) {
  const about = readAbout();
  const grid = fact === 'name' && sounds ? soundGrid({
    ipa: about.name_ipa ?? '', ...sounds, speakLabel: t('board.speak'), deleteLabel: t('editor.delete'),
  }) : null;
  // **A guess from the letters, while the reader has not built the name themselves**:
  // the tiles start from how the name's letters are usually read and follow the field
  // as it is typed, so a listener sees 尼古拉 rather than "Nikolai" without anyone
  // learning a keyboard of sounds first -- and once a tile is touched, the reader's own
  // work stands and the guess stops following.
  const hint = document.createElement('p');
  hint.className = 'speaker-why';
  hint.textContent = t('about.soundsHint');
  const guess = (/** @type {string} */ name) => {
    if (!grid || !sounds?.guess || grid.touched()) return;
    const guessed = sounds.guess(name);
    grid.fill(guessed);
    if (guessed) hint.textContent = t('about.soundsGuess');
  };
  if (grid && !about.name_ipa && about.name) guess(about.name);
  let more;
  if (grid) {
    more = document.createElement('details');
    more.className = 'about-sounds';
    // Open: folded, the keyboard was not found at all.
    more.open = true;
    const summary = document.createElement('summary');
    summary.textContent = t('about.sounds');
    more.append(summary, hint, grid.element);
  }
  askText({
    label: t(`about.${fact}`),
    hint: t('about.kept'),
    value: about[fact] ?? '',
    save: t('editor.save'),
    close: t('gallery.previewClose'),
    autocomplete: fact === 'name' ? 'name' : undefined,
    kind: 'about-ask',
    more,
    onInput: fact === 'name' && !about.name_ipa ? guess : undefined,
    onSave: (value) => {
      setDetail(fact, value);
      if (grid && value) setDetail(`${fact}_ipa`, grid.value());
      onChange();
    },
  });
}

/**
 * The diet sentences in the reader's own words, read from their food rows: what a
 * page with no board loaded offers as the diet's choices.
 * @param {(rel:string) => Promise<string>} loadText @param {string} reader
 * @returns {Promise<{value:string, label:string}[]>}
 */
export async function dietOptions(loadText, reader) {
  const file = `data/lang/${reader}/food.csv`;
  const said = new Map(parseTable(await loadText(file), file).map((row) => [row.concept_id, row.text]));
  return DIET.filter((id) => said.get(id)).map((id) => ({ value: id, label: /** @type {string} */ (said.get(id)) }));
}

/**
 * Ask what the reader eats and does not, from the sentences this pair can say: the
 * first press of the diet button opens this, and so does the settings section.
 * @param {{value:string, label:string}[]} options  the `DIET` sentences, in the reader's words
 * @param {() => void} onChange
 */
export function askDiet(options, onChange) {
  askChoices({
    label: t('about.diet'),
    hint: t('about.dietHint'),
    options,
    chosen: (readAbout().diet ?? '').split(',').filter(Boolean),
    save: t('editor.save'),
    close: t('gallery.previewClose'),
    kind: 'about-diet',
    onSave: (values) => { setDetail('diet', values.join(',')); onChange(); },
  });
}

/**
 * Ask where the reader is from, in their own language's words: the continents first,
 * then every country as their language sorts it.
 * @param {Map<string, import('../core/conversation.js').Choice>} names  @param {string} lang
 * @param {() => void} onChange
 */
export function askCountry(names, lang, onChange) {
  const collator = new Intl.Collator(lang);
  const options = [...names].map(([value, choice]) => ({ value, label: choice.name }));
  const continent = (/** @type {{value:string}} */ o) => /^\d/.test(o.value);
  askSelect({
    label: t('about.country'),
    options: [{ value: '', label: '' }, ...options.filter(continent),
      ...options.filter((o) => !continent(o)).sort((a, b) => collator.compare(a.label, b.label))],
    value: readAbout().country ?? '',
    hint: t('about.kept'),
    save: t('editor.save'),
    close: t('gallery.previewClose'),
    kind: 'about-country',
    onSave: (value) => { setDetail('country', value); onChange(); },
  });
}

/**
 * The settings dialog's section: every detail, each changed where it stands.
 * @param {() => void} onChange
 * @param {{value:string, label:string}[]} [diet]  the diet choices, where a board can say them
 * @param {Sounds} [sounds]  where a board can build the name from its sounds
 * @param {() => void} [askFrom]  where the pair can say which country
 */
export function aboutSection(onChange, diet, sounds, askFrom) {
  const box = document.createElement('fieldset');
  box.className = 'speaker-block';
  const legend = document.createElement('legend');
  const kept = helpTip(t('about.kept'));
  legend.append(t('about.heading'), kept.button);
  box.append(legend, kept.tip, detailField('name', onChange).label);
  if (sounds) {
    const build = document.createElement('button');
    build.type = 'button';
    build.className = 'chip';
    build.textContent = t('about.sounds');
    build.addEventListener('click', () => askDetail('name', onChange, sounds));
    box.append(build);
  }
  if (askFrom) {
    const from = document.createElement('button');
    from.type = 'button';
    from.className = 'chip';
    from.textContent = t('about.country');
    from.addEventListener('click', askFrom);
    box.append(from);
  }
  if (diet?.length) {
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'chip';
    choose.textContent = t('about.diet');
    choose.addEventListener('click', () => askDiet(diet, onChange));
    box.append(choose);
  }
  return box;
}
