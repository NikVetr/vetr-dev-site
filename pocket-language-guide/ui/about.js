// The reader's own details, for the buttons that say them.
//
// "My name is {}" is a sentence the corpus has in every language, and what goes in
// the slot is the one thing it cannot know. So it is asked once, the first time the
// button is pressed, kept on this device -- and in a backup, since it is the reader's
// -- and said wherever a button leaves room for it. Nothing here is sent anywhere.

import * as store from './platform/store.js';
import { t } from './i18n.js';
import { askText } from './board-menu.js';

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

/** Set one detail, or clear it with an empty value. @param {string} fact @param {string} value */
export function setDetail(fact, value) {
  const about = readAbout();
  if (value.trim()) about[fact] = value.trim();
  else delete about[fact];
  return writeAbout(about);
}

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
 * @param {string} fact @param {() => void} onChange
 */
export function askDetail(fact, onChange) {
  askText({
    label: t(`about.${fact}`),
    hint: t('about.kept'),
    save: t('editor.save'),
    close: t('gallery.previewClose'),
    autocomplete: fact === 'name' ? 'name' : undefined,
    kind: 'about-ask',
    onSave: (value) => { setDetail(fact, value); onChange(); },
  });
}

/** The settings dialog's section: every detail, each changed where it stands. @param {() => void} onChange */
export function aboutSection(onChange) {
  const box = document.createElement('section');
  box.className = 'speaker-block';
  const heading = document.createElement('h3');
  heading.className = 'speaker-heading';
  heading.textContent = t('about.heading');
  const kept = document.createElement('p');
  kept.className = 'speaker-why';
  kept.textContent = t('about.kept');
  box.append(heading, detailField('name', onChange).label, kept);
  return box;
}
