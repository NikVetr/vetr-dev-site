// Add your own term without leaving the page.
//
// The CSV round trip exists for bulk work and for handing the sheet to a model,
// but wanting one more phrase -- your hotel's name, a dish you cannot eat -- should
// not require exporting a file and importing it back. This writes the same
// `edits.extras` entry that an import would, so the two paths agree.

import { languageName, t } from './i18n.js';

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
 * A readable, stable id in the same shape the corpus uses.
 * @param {string} sectionId @param {string} gloss @param {Set<string>} taken
 */
function makeId(sectionId, gloss, taken) {
  const slug = gloss.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    || 'term';
  let id = `${sectionId}.${slug}`;
  let n = 2;
  while (taken.has(id)) {
    id = `${sectionId}.${slug}-${n}`;
    n += 1;
  }
  return id;
}

/**
 * @typedef {Object} AddTermInput
 * @property {HTMLElement} root
 * @property {Awaited<ReturnType<import('../core/sheet.js').createSheetContext>>['corpus']} corpus
 * @property {()=>import('../core/types.js').SheetSpec} spec
 * @property {()=>import('../core/pack.js').SheetEdits} edits
 * @property {(entry:import('../core/pack.js').SheetEdits['extras'][number])=>void} onAdd
 * @property {Record<string,string>} [sectionTitles] section names in the source
 *   language, so the picker matches the sheet and the content tree
 */

/** @param {AddTermInput} input */
export function createAddTerm(input) {
  const details = /** @type {HTMLDetailsElement} */ (el('details', { class: 'add-term' }));
  details.append(el('summary', { text: t('addTerm.summary') }));

  const section = /** @type {HTMLSelectElement} */ (el('select', { id: 'add-section' }));
  for (const s of input.corpus.sections) {
    section.append(new Option(input.sectionTitles?.[s.section_id] || s.title_en, s.section_id));
  }

  const spec = input.spec();
  const fields = /** @type {const} */ ([
    {
      key: 'script',
      // `languageName`, not the registry's English exonym: every other insert in the
      // panel goes through it, so this dialog was the one place a Spanish interface
      // said "En Chinese (Simplified)" while the tree beside it said "chino
      // simplificado".
      label: t('addTerm.inLanguage', {
        language: languageName(spec.target, input.corpus.languages[spec.target].exonym_en),
      }),
      lang: spec.target,
    },
    { key: 'roman', label: t('addTerm.optional', { label: t('field.roman') }), lang: '' },
    {
      key: 'gloss',
      label: t('addTerm.inLanguage', {
        language: languageName(spec.source, input.corpus.languages[spec.source].exonym_en),
      }),
      lang: spec.source,
    },
    { key: 'respell', label: t('addTerm.optional', { label: t('field.respell') }), lang: '' },
  ]);

  /** @type {Record<string, HTMLInputElement>} */ const inputs = {};
  const rows = fields.map((field) => {
    const box = /** @type {HTMLInputElement} */ (el('input', { type: 'text', id: `add-${field.key}` }));
    if (field.lang) box.lang = field.lang;
    inputs[field.key] = box;
    return el('div', { class: 'field' }, [
      el('label', { for: `add-${field.key}` }, [el('span', { text: field.label })]),
      box,
    ]);
  });

  const error = el('p', { class: 'small', style: 'color:var(--alert);margin:0' });
  error.hidden = true;
  const submit = el('button', { type: 'button', class: 'primary', text: t('addTerm.add') });

  submit.addEventListener('click', () => {
    const values = {
      script: inputs.script.value.trim(),
      roman: inputs.roman.value.trim(),
      gloss: inputs.gloss.value.trim(),
      respell: inputs.respell.value.trim(),
    };
    // Both sides are required: a row with only one is not a translation.
    if (!values.script || !values.gloss) {
      error.hidden = false;
      error.textContent = t('addTerm.bothNeeded');
      return;
    }
    error.hidden = true;

    const taken = new Set([
      ...Object.keys(input.corpus.concepts),
      ...input.edits().extras.map((e) => e.conceptId),
    ]);
    input.onAdd({
      conceptId: makeId(section.value, values.gloss, taken),
      sectionId: section.value,
      template: 'entry',
      // Yours, so it outranks the corpus when the solver has to choose.
      weight: 1,
      values,
    });
    for (const box of Object.values(inputs)) box.value = '';
    details.open = false;
  });

  details.append(
    el('div', { class: 'field' }, [
      el('label', { for: 'add-section' }, [el('span', { text: t('addTerm.section') })]),
      section,
    ]),
    ...rows,
    error,
    el('div', { class: 'row' }, [submit]),
  );
  input.root.append(details);

  return {
    /** Keep the field labels honest when the language pair changes. */
    sync() {
      const next = input.spec();
      const labels = details.querySelectorAll('.field label span');
      labels[1].textContent = t('addTerm.inLanguage', {
        language: languageName(next.target, input.corpus.languages[next.target].exonym_en),
      });
      labels[3].textContent = t('addTerm.inLanguage', {
        language: languageName(next.source, input.corpus.languages[next.source].exonym_en),
      });
      inputs.script.lang = next.target;
      inputs.gloss.lang = next.source;
    },
  };
}
