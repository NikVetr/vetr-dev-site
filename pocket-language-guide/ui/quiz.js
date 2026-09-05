// "Help me decide": three questions instead of thirty controls.
//
// The answers set the things a newcomer cannot reasonably guess at -- which
// sections are worth their space, whether romanisation and respelling are useful
// or just noise, and how small the type may get. Everything remains editable
// afterwards; this only picks a starting point.

import { defaultSelection } from '../core/pack.js';
import { t } from './i18n.js';

// Keys rather than words: this is module scope, evaluated before a catalogue is
// loaded, so each option is named where it is built.
const INTERESTS = [
  { tag: 'transit', labelKey: 'quiz.interest.transit', hintKey: 'quiz.interest.transit.hint' },
  { tag: 'food', labelKey: 'quiz.interest.food', hintKey: 'quiz.interest.food.hint' },
  { tag: 'lodging', labelKey: 'quiz.interest.lodging', hintKey: 'quiz.interest.lodging.hint' },
  { tag: 'outdoors', labelKey: 'quiz.interest.outdoors', hintKey: 'quiz.interest.outdoors.hint' },
  { tag: 'social', labelKey: 'quiz.interest.social', hintKey: 'quiz.interest.social.hint' },
  { tag: 'health', labelKey: 'quiz.interest.health', hintKey: 'quiz.interest.health.hint' },
  { tag: 'business', labelKey: 'quiz.interest.business', hintKey: 'quiz.interest.business.hint' },
  { tag: 'family', labelKey: 'quiz.interest.family', hintKey: 'quiz.interest.family.hint' },
];

/**
 * @typedef {Object} QuizAnswers
 * @property {string[]} interests
 * @property {'none'|'some'|'reading'} proficiency
 * @property {'pocket'|'large'} print
 */

/** A head position may hold a bare slot in a spec saved before it became a list.
 * @param {import('../core/types.js').HeadSlot|import('../core/types.js').HeadSlot[]} [held] */
const listOf = (held) => /** @type {import('../core/types.js').HeadSlot[]} */ (
  (Array.isArray(held) ? held : [held]).filter(Boolean));

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
 * Show the quiz. Resolves with the answers, or null if it was dismissed.
 * @returns {Promise<QuizAnswers|null>}
 */
export function openQuiz() {
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'quiz' }));

  const boxes = INTERESTS.map((item) => {
    const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', value: item.tag }));
    box.checked = ['transit', 'food', 'social'].includes(item.tag);
    return el('label', { class: 'quiz-option' }, [
      box,
      el('span', {}, [
        el('strong', { text: t(item.labelKey) }),
        el('span', { class: 'small muted', text: t('quiz.hintAside', { hint: t(item.hintKey) }) }),
      ]),
    ]);
  });

  const proficiency = /** @type {HTMLSelectElement} */ (el('select', { id: 'quiz-prof' }));
  proficiency.append(
    new Option(t('quiz.prof.none'), 'none'),
    new Option(t('quiz.prof.some'), 'some'),
    new Option(t('quiz.prof.reading'), 'reading'),
  );

  const print = /** @type {HTMLSelectElement} */ (el('select', { id: 'quiz-print' }));
  print.append(
    new Option(t('quiz.print.pocket'), 'pocket'),
    new Option(t('quiz.print.large'), 'large'),
  );

  dialog.append(
    el('h2', { text: t('quiz.heading') }),
    el('p', { class: 'lede', text: t('quiz.lede') }),
    el('fieldset', {}, [
      el('legend', { text: t('quiz.doing') }),
      ...boxes,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'quiz-prof' }, [el('span', { text: t('quiz.proficiency') })]),
      proficiency,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'quiz-print' }, [el('span', { text: t('quiz.printSize') })]),
      print,
    ]),
  );

  const cancel = el('button', { type: 'button', text: t('quiz.cancel') });
  const apply = el('button', { type: 'button', class: 'primary', text: t('quiz.build') });
  dialog.append(el('div', { class: 'row', style: 'justify-content:flex-end' }, [cancel, apply]));

  document.body.append(dialog);
  dialog.showModal();

  return new Promise((resolve) => {
    /** @param {QuizAnswers|null} value */
    const done = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => done(null));
    dialog.addEventListener('cancel', () => done(null));
    apply.addEventListener('click', () => done({
      interests: boxes
        .map((label) => /** @type {HTMLInputElement} */ (label.querySelector('input')))
        .filter((box) => box.checked)
        .map((box) => box.value),
      proficiency: /** @type {any} */ (proficiency.value),
      print: /** @type {any} */ (print.value),
    }));
  });
}

/**
 * Turn answers into a spec. Proficiency decides which columns earn their width: a
 * reader who knows the script does not need a respelling, and someone with no
 * script at all needs one more than they need the script itself.
 * @param {import('../core/types.js').SheetSpec} spec
 * @param {Awaited<ReturnType<import('../core/sheet.js').createSheetContext>>['corpus']} corpus
 * @param {QuizAnswers} answers
 * @returns {import('../core/types.js').SheetSpec}
 */
export function applyQuiz(spec, corpus, answers) {
  /** @type {import('../core/types.js').FieldId[]} */
  const fields = ['script', 'gloss', 'numeral'];
  if (answers.proficiency !== 'reading') fields.push('respell');
  if (answers.proficiency !== 'none') fields.push('roman');

  // Whether the card's romanisation carries a mark the reader will read as something
  // else. Four of the twenty-two targets do -- pinyin's tones, Hepburn's macron,
  // IAST's and ALA-LC's macron-and-dots -- and where it happens the mistake is
  // silent: the Vietnamese translator's point is that a reader primed by their own
  // breve `ă` reads pinyin's caron `ǎ` confidently and says the wrong tone. That is
  // worth the band; being merely unfamiliar with the respelling column's devices is
  // not, because those tables were built so that ignoring a device loses information
  // rather than adding error.
  //
  // Measured, which is why the band stays off in the default spec, in
  // `data/presets.json` and in the shipped packs, and is only ticked here: it costs
  // 1.5 lines of the smallest type on the sheet, about 0.05-0.09 of type scale on
  // most pairs, and a whole extra *pair* of faces on `es <- en` -- one more sheet of
  // photo paper per card set. `es` has no romanisation at all, so it never pays this.
  // The respelling key rides along in the same slot when the band is on, and either
  // half stays one click away in the format panel for a reader who wants it anyway.
  const marked = fields.includes('roman')
    && !!corpus.romanLegends[`${spec.target}__${spec.romanization}`];
  // Added to the band rather than replacing it: unlike the field set and the
  // selection, which this deliberately resets, the other slots are things a reader
  // chose deliberately -- and one of them is the local emergency number.
  /** @type {import('../core/types.js').HeadSlot[]} */
  const centre = listOf(spec.head?.center);
  if (!centre.includes('legend')) centre.push('legend');

  return {
    ...spec,
    fieldSet: fields,
    head: marked
      ? {
        ...spec.head,
        at: spec.head?.at && spec.head.at !== 'none' ? spec.head.at : 'bottom',
        center: centre,
      }
      : spec.head,
    // Large print means fewer, bigger items rather than the same content shrunk.
    scale: answers.print === 'large' ? 1.3 : 0,
    selection: answers.interests.length
      ? defaultSelection(corpus, answers.interests)
      : { sections: {}, items: {} },
  };
}
