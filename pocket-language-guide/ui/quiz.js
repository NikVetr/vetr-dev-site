// "Help me decide": three questions instead of thirty controls.
//
// The answers set the things a newcomer cannot reasonably guess at -- which
// sections are worth their space, whether romanisation and respelling are useful
// or just noise, and how small the type may get. Everything remains editable
// afterwards; this only picks a starting point.

import { defaultSelection } from '../core/pack.js';

const INTERESTS = [
  { tag: 'transit', label: 'Getting around', hint: 'directions, taxis, trains, signs' },
  { tag: 'food', label: 'Eating and shopping', hint: 'ordering, allergies, prices, paying' },
  { tag: 'lodging', label: 'Hotels and buildings', hint: 'checking in, rooms, Wi-Fi, floors' },
  { tag: 'outdoors', label: 'Hiking and parks', hint: 'trails, shuttles, warnings, weather' },
  { tag: 'social', label: 'Meeting people', hint: 'greetings, introductions, small talk' },
  { tag: 'health', label: 'Health and emergencies', hint: 'pharmacy, doctor, lost items' },
  { tag: 'business', label: 'Work and paperwork', hint: 'receipts, tax refunds, formalities' },
  { tag: 'family', label: 'Travelling with family', hint: 'tickets, attractions, photos' },
];

/**
 * @typedef {Object} QuizAnswers
 * @property {string[]} interests
 * @property {'none'|'some'|'reading'} proficiency
 * @property {'pocket'|'large'} print
 */

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
        el('strong', { text: item.label }),
        el('span', { class: 'small muted', text: ` — ${item.hint}` }),
      ]),
    ]);
  });

  const proficiency = /** @type {HTMLSelectElement} */ (el('select', { id: 'quiz-prof' }));
  proficiency.append(
    new Option('None at all', 'none'),
    new Option('A few phrases', 'some'),
    new Option('I can read some of the script', 'reading'),
  );

  const print = /** @type {HTMLSelectElement} */ (el('select', { id: 'quiz-print' }));
  print.append(
    new Option('As much as fits — pocket sized', 'pocket'),
    new Option('Fewer items, larger type', 'large'),
  );

  dialog.append(
    el('h2', { text: 'Let’s narrow it down' }),
    el('p', { class: 'lede', text: 'Three questions. You can change anything afterwards.' }),
    el('fieldset', {}, [
      el('legend', { text: 'What will you be doing?' }),
      ...boxes,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'quiz-prof' }, [el('span', { text: 'How much of the language do you have?' })]),
      proficiency,
    ]),
    el('div', { class: 'field' }, [
      el('label', { for: 'quiz-print' }, [el('span', { text: 'Print size' })]),
      print,
    ]),
  );

  const cancel = el('button', { type: 'button', text: 'Cancel' });
  const apply = el('button', { type: 'button', class: 'primary', text: 'Build my sheet' });
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

  return {
    ...spec,
    fieldSet: fields,
    // Large print means fewer, bigger items rather than the same content shrunk.
    scale: answers.print === 'large' ? 1.25 : 0,
    selection: answers.interests.length
      ? defaultSelection(corpus, answers.interests)
      : { sections: {}, items: {} },
  };
}
