// "Help me decide": a starting point for the card, with optional personal phrases.
//
// The answers set the things a newcomer cannot reasonably guess at -- which
// sections are worth their space, whether romanisation and respelling are useful
// or just noise, and how small the type may get. Everything remains editable
// afterwards; this only picks a starting point.

import { defaultSelection } from '../core/pack.js';
import { headBands } from '../core/solve/index.js';
import { t } from './i18n.js';
import { dialogHead } from './dialog.js';
import { readAbout } from './about.js';
import { MODEL_LINKS, personalPrompt, responseCsv } from './quiz-personal.js';

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
 * @property {'one'|'few'|'any'} [carry]
 * @property {'basics'|'broad'} [breadth]
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
 * @param {{spec:import('../core/types.js').SheetSpec, corpus:any,
 *   previewCsv:(text:string)=>{updated:number,added:number,problems:string[]},
 *   applyCsv:(text:string,answers:QuizAnswers)=>Promise<unknown>}} [context]
 * @returns {Promise<QuizAnswers|null>}
 */
export function openQuiz(context) {
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
  /** @param {string} id @param {string} label @param {string[]} choices */
  const choice = (id, label, choices) => {
    const select = /** @type {HTMLSelectElement} */ (el('select', { id }));
    select.append(...choices.map((value) => new Option(t(`quiz.${value}`), value)));
    return { select, field: el('div', { class: 'field' }, [el('label', { for: id, text: t(label) }), select]) };
  };
  const carry = choice('quiz-carry', 'quiz.carry', ['any', 'few', 'one']);
  const breadth = choice('quiz-breadth', 'quiz.breadth', ['broad', 'basics']);
  /** @returns {QuizAnswers} */
  const answers = () => ({
    interests: boxes.map((label) => /** @type {HTMLInputElement} */ (label.querySelector('input')))
      .filter((box) => box.checked).map((box) => box.value),
    proficiency: /** @type {QuizAnswers['proficiency']} */ (proficiency.value),
    print: /** @type {QuizAnswers['print']} */ (print.value),
    carry: /** @type {QuizAnswers['carry']} */ (carry.select.value),
    breadth: /** @type {QuizAnswers['breadth']} */ (breadth.select.value),
  });

  dialog.setAttribute('aria-label', t('quiz.heading'));
  dialog.append(
    dialogHead({ title: t('quiz.heading'), close: t('gallery.previewClose'), onClose: () => cancel.click() }),
    el('p', { class: 'lede', text: t('quiz.intro') }),
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
    carry.field, breadth.field,
  );
  if (context) dialog.append(personalWorkflow(context, answers));

  const cancel = el('button', { type: 'button', text: t('quiz.cancel') });
  const apply = el('button', { type: 'button', class: 'primary', text: t('quiz.build') });
  dialog.append(el('div', { class: 'row', style: 'justify-content:flex-end' }, [cancel, apply]));

  return new Promise((resolve) => {
    /** @type {QuizAnswers|null} */ let result = null;
    // Backdrop, Escape and Android Back all close the same dialog. Resolve there,
    // not only from buttons, so every dismissal also releases its DOM and promise.
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(result);
    }, { once: true });
    cancel.addEventListener('click', () => dialog.close());
    apply.addEventListener('click', () => { result = answers(); dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** @param {NonNullable<Parameters<typeof openQuiz>[0]>} context
 * @param {()=>QuizAnswers} answers */
function personalWorkflow(context, answers) {
  const box = el('details', { class: 'quiz-personal' });
  box.append(el('summary', { text: t('quiz.personal') }), el('p', { class: 'small muted', text: t('quiz.personalHint') }));
  const saved = readAbout();
  /** @type {Record<string,HTMLInputElement>} */ const fields = {};
  for (const key of ['name', 'country', 'profession', 'school']) {
    const input = /** @type {HTMLInputElement} */ (el('input', { id: `quiz-${key}`, type: 'text', placeholder: t('quiz.optional') }));
    // Countries in the shared profile are registry codes; leave them unambiguous.
    input.value = saved[key] ?? '';
    if (key === 'name') input.autocomplete = 'name';
    fields[key] = input;
    box.append(el('div', { class: 'field' }, [el('label', { for: input.id, text: t(`quiz.${key}`) }), input]));
  }
  const generate = el('button', { type: 'button', class: 'btn', text: t('quiz.makePrompt') });
  const prompt = /** @type {HTMLTextAreaElement} */ (el('textarea', { id: 'quiz-prompt', rows: '10', readonly: '', 'aria-label': t('quiz.prompt') }));
  const copy = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'btn', text: t('quiz.copyPrompt') }));
  copy.disabled = true;
  const handoff = el('div', { class: 'quiz-handoff' }, [prompt, el('div', { class: 'row' }, [copy,
    ...MODEL_LINKS.map(({ name, href }) => el('a', { class: 'btn', text: name, href, target: '_blank', rel: 'noopener noreferrer' })),
  ]), el('p', { class: 'small muted', text: t('quiz.externalHint') })]);
  handoff.hidden = true;
  const status = el('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  generate.addEventListener('click', () => {
    const selected = answers();
    prompt.value = personalPrompt({
      target: context.spec.target, source: context.spec.source, sections: context.corpus.sections,
      personal: Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
      interests: selected.interests, proficiency: selected.proficiency,
      carry: selected.carry ?? 'any', breadth: selected.breadth ?? 'broad', speaker: context.spec.speaker,
    });
    handoff.hidden = false;
    copy.disabled = false;
    status.textContent = '';
  });
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(prompt.value); status.textContent = t('quiz.copied'); }
    catch { prompt.focus(); prompt.select(); status.textContent = t('quiz.copyFailed'); }
  });
  const response = /** @type {HTMLTextAreaElement} */ (el('textarea', { id: 'quiz-response', rows: '7', placeholder: t('quiz.pasteResponse'), 'aria-label': t('quiz.pasteResponse') }));
  const review = el('button', { type: 'button', class: 'btn', text: t('quiz.reviewResponse') });
  const add = /** @type {HTMLButtonElement} */ (el('button', { type: 'button', class: 'primary', text: t('quiz.importResponse') }));
  add.disabled = true;
  let reviewed = '';
  response.addEventListener('input', () => { reviewed = ''; add.disabled = true; status.textContent = ''; });
  review.addEventListener('click', () => {
    add.disabled = true;
    reviewed = '';
    try {
      const csv = responseCsv(response.value);
      const result = context.previewCsv(csv);
      if (result.problems.length) throw new Error(result.problems.join('\n'));
      status.textContent = t('quiz.responsePreview', { updated: String(result.updated), added: String(result.added) });
      reviewed = csv;
      add.disabled = !(result.updated + result.added);
    } catch (error) { status.textContent = t('quiz.responseError', { error: String(/** @type {Error} */ (error).message) }); }
  });
  add.addEventListener('click', async () => {
    if (!reviewed) return;
    add.disabled = true;
    try {
      await context.applyCsv(reviewed, answers());
      reviewed = '';
      status.textContent = t('quiz.responseImported');
      // The callback applies questionnaire settings before the imported rows. Do
      // not return answers again and overwrite the imported inclusion choices.
      /** @type {HTMLDialogElement} */ (box.closest('dialog')).close();
    } catch (error) {
      status.textContent = t('quiz.responseError', { error: String(/** @type {Error} */ (error).message) });
      add.disabled = false;
    }
  });
  box.append(generate, handoff, el('label', { for: response.id, text: t('quiz.pasteResponse') }), response,
    el('div', { class: 'row' }, [review, add]), status);
  return box;
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
  //
  // The **foot**, because a header and a footer are now independent fields rather
  // than one `at` and this is furniture the reader did not ask for: putting it at the
  // bottom leaves the header, where a folio or the pair usually goes, alone. A spec
  // saved in the old shape is migrated on the way past, so an `at: 'bottom'` band's
  // slots are kept and an `at: 'top'` one is left where the reader put it.
  const bands = headBands(spec);
  const target = bands.top && !bands.bottom ? 'head' : 'foot';
  /** @type {import('../core/types.js').HeadSlot[]} */
  const centre = listOf((target === 'head' ? bands.top : bands.bottom)?.center);
  if (!centre.includes('legend')) centre.push('legend');
  /** @type {import('../core/types.js').HeadBand} */
  const band = {
    span: 'full',
    ...(target === 'head' ? bands.top : bands.bottom),
    center: centre,
  };

  return {
    ...spec,
    fieldSet: fields,
    head: marked && target === 'head' ? band : (bands.top ?? undefined),
    foot: marked && target === 'foot' ? band : (bands.bottom ?? undefined),
    // Large print means fewer, bigger items rather than the same content shrunk.
    scale: answers.print === 'large' ? 1.3 : 0,
    priority: answers.breadth === 'basics' ? 0.65 : 0,
    ...(answers.carry && answers.carry !== 'any' ? {
      autoFaces: false,
      geometry: { ...spec.geometry, faces: spec.geometry.screen ? 1 : answers.carry === 'one' ? 2 : 4 },
    } : { autoFaces: true }),
    selection: answers.interests.length
      ? defaultSelection(corpus, answers.interests)
      : { sections: {}, items: {} },
  };
}
