// What the reader has told the app about themselves, and the one screen that asks.
//
// The problem this exists for is small and constant: a woman shows a Russian card
// that says `Я заблудился` and it is in a man's voice. A general translator cannot
// help — it has one sentence and no speaker — but this app's phrases are a fixed
// set, so it can ask once, in advance, and then never ask again. `core/speaker.js`
// holds the resolution rules; this holds the storage and the form.
//
// **Only meaningful choices are offered.** The axes come from
// `data/registry/speaker-axes.csv` by way of `axesFor`, so a reader whose languages
// have no first-person agreement sees no question at all — which is 31 of the 53
// languages, and the reason this is a registry rather than a hardcoded "gender"
// dropdown.
//
// **Nothing is inferred and nothing is assumed.** Unset is a real, stored state,
// not a prompt to guess from a name or a locale. It resolves to the wording the
// corpus already ships, which is the masculine in all 22 declared languages — so
// where a pair does inflect and the reader has not answered, `noticeFor` says so
// out loud rather than letting a silent masculine default stand.
//
// Storage is `localStorage`, as everywhere else here: one small object, synchronous,
// and already the thing the native shell's `Preferences` maps onto. A cookie would
// send it to the server on every request, which for a fact about the reader's own
// body is exactly wrong — nothing about this profile ever leaves the device.

import { axesFor, unanswered } from '../core/speaker.js';
import { t } from './i18n.js';

const KEY = 'plg.speaker';

/**
 * The saved profile, or an empty one.
 * @returns {import('../core/speaker.js').SpeakerProfile}
 */
export function readProfile() {
  try {
    const held = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return held && typeof held === 'object' ? held : {};
  } catch {
    // A corrupt value is the same as none: every language's own default, which is
    // what the corpus prints anyway.
    return {};
  }
}

/** @param {import('../core/speaker.js').SpeakerProfile} profile */
export function writeProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

/**
 * What an axis and its values are called, in the reader's language.
 *
 * Catalogue keys rather than anything from the registry: the registry's `notes`
 * column is a grammarian's note in English addressed to whoever maintains the file,
 * and the question here is addressed to a traveller. A key with no entry falls back
 * to the slug, which is ugly and honest — it means a new axis landed without its
 * wording, and inventing a label for it is how you end up asking someone a question
 * nobody wrote.
 * @param {string} axis @param {string} [value]
 */
function words(axis, value) {
  const key = value ? `speaker.${axis}.${value}` : `speaker.${axis}`;
  const said = t(key);
  return said === key ? (value ?? axis) : said;
}

/**
 * The line to show when a pair inflects and the reader has not said which form is
 * theirs, or `null` when there is nothing to say.
 *
 * Deliberately not a modal. Someone who opened the app to show a stranger a sentence
 * should not first have to answer a question about themselves — but they also should
 * not be shown a masculine sentence without being told that is what it is. So: a
 * status line, on the surface where the wording will appear, with the settings a tap
 * away.
 * @param {Record<string, import('../core/speaker.js').SpeakerAxis[]>} axes
 * @param {string[]} languages
 * @param {import('../core/speaker.js').SpeakerProfile} profile
 */
export function noticeFor(axes, languages, profile) {
  const open = unanswered(axesFor(axes, languages), profile);
  if (!open.length) return null;
  return t('speaker.unset', { axes: open.map((a) => words(a.axis)).join(', ') });
}

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
 * Open the settings screen for the axes this reader's languages actually declare.
 *
 * @param {object} config
 * @param {Record<string, import('../core/speaker.js').SpeakerAxis[]>} config.axes
 * @param {string[]} config.languages          the pair, or every language in play
 * @param {import('../core/speaker.js').SpeakerProfile} config.profile
 * @param {(next:import('../core/speaker.js').SpeakerProfile)=>void} config.onChange
 */
export function openSpeakerSettings({ axes, languages, profile, onChange }) {
  const asked = axesFor(axes, languages);
  /** @type {import('../core/speaker.js').SpeakerProfile} */ let held = { ...profile };

  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings' }));
  const commit = () => {
    writeProfile(held);
    onChange({ ...held });
  };

  const fields = asked.map((axis) => {
    const name = `speaker-${axis.axis}`;
    const options = axis.values.map((value) => {
      const input = /** @type {HTMLInputElement} */ (el('input', { type: 'radio', name, value }));
      input.checked = held[axis.axis] === value;
      input.addEventListener('change', () => { held[axis.axis] = value; commit(); });
      return el('label', { class: 'speaker-option' }, [input, words(axis.axis, value)]);
    });
    // Declining is on the form, because it is a state the reader can choose and not
    // only one they can fail out of. Someone who would rather not answer should be
    // able to say so and have the app stop mentioning it — the wording is the one the
    // corpus has always shipped either way, so it costs them nothing. Stored as an
    // empty value rather than by deleting the key, so that "asked and declined" and
    // "never asked" stay different facts: nothing is pre-selected on a form nobody
    // has filled in, which is the whole difference between a default and a choice.
    const none = /** @type {HTMLInputElement} */ (el('input', { type: 'radio', name, value: '' }));
    none.checked = axis.axis in held && !axis.values.includes(held[axis.axis]);
    none.addEventListener('change', () => { held[axis.axis] = ''; commit(); });
    options.push(el('label', { class: 'speaker-option' }, [none, t('speaker.unspecified')]));

    // An axis that landed without its explanation gets no explanation, rather than a
    // paragraph reading `speaker.x.why`. The label falls back to the slug because an
    // ugly label is still a usable question; a raw key as prose is not.
    const why = t(`speaker.${axis.axis}.why`);
    return el('fieldset', { class: 'speaker-axis' }, [
      el('legend', { text: words(axis.axis) }),
      ...(why === `speaker.${axis.axis}.why` ? [] : [el('p', { class: 'speaker-why', text: why })]),
      ...options,
    ]);
  });

  panel.append(
    el('h2', { text: t('speaker.title') }),
    el('p', { class: 'speaker-lede', text: t('speaker.lede') }),
    ...(fields.length ? fields : [el('p', { class: 'speaker-why', text: t('speaker.nothingToAsk') })]),
    el('form', { method: 'dialog' }, [el('button', { text: t('speaker.done') })]),
  );
  document.body.append(panel);
  panel.addEventListener('close', () => panel.remove());
  panel.showModal();
  return panel;
}

/**
 * The cheat sheet's half of the same setting: a button and the line beside it.
 *
 * `null` when neither language declares an axis, so a panel simply leaves the field
 * out rather than showing a control that opens onto an empty form. The wrapper is
 * the caller's — the studio and the quick page each have their own field chrome, and
 * this module stays free of the studio's control library so the conversation board
 * does not have to download it.
 * @param {object} config
 * @param {Record<string, import('../core/speaker.js').SpeakerAxis[]>} config.axes
 * @param {string[]} config.languages
 * @param {import('../core/speaker.js').SpeakerProfile} config.profile
 * @param {(next:import('../core/speaker.js').SpeakerProfile)=>void} config.onChange
 */
export function speakerControl({ axes, languages, profile, onChange }) {
  if (!axesFor(axes, languages).length) return null;
  let held = profile;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chip';
  button.textContent = t('speaker.open');

  const note = document.createElement('p');
  note.className = 'speaker-why';
  const say = () => { note.textContent = noticeFor(axes, languages, held) ?? ''; };
  say();

  button.addEventListener('click', () => openSpeakerSettings({
    axes,
    languages,
    profile: held,
    onChange: (next) => { held = next; say(); onChange(next); },
  }));

  return { button, note };
}
