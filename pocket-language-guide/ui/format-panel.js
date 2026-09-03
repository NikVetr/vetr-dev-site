// The studio's left panel.
//
// The panel owns the spec fields it controls and reports changes as a patch, so
// nothing has to read values back out of the DOM -- which is where a dragged
// margin previously got silently overwritten by the geometry dropdown.
//
// Most choices here are about shape, so they are drawn rather than described. Only
// the genuinely list-shaped ones (paper, language, romanisation) stay as menus.

import { hasContent, paperSpec } from '../core/pack.js';
import { ARRANGEMENTS, arrangementShape } from '../core/solve/arrange.js';
import { flagEmoji, flagsSupported } from './flags.js';
import {
  pageGlyph, facesGlyph, paddingGlyph, PADDING_CHOICES, inkGlyph,
  itemGlyph, cutGlyph, priorityOptions,
  customGlyph, numericChoice, fieldGlyph, toggles, cardSizeControl, paletteControl,
  redrawGlyphs, relabelGlyphs, reserveControl, phoneControl, splitGlyph,
  typeGlyph, typefaceGlyph, dpiGlyph, segmented, panelField,
} from './glyphs.js';
import { familyFor } from '../render/fonts.js';
import { languageName, t } from './i18n.js';

const COLUMN_CHOICES = [1, 2, 3, 4, 5, 6];
// 0 selects auto. Faces come in pairs, because a double-sided sheet is two of them
// -- except for one, which is a single side: a phone screen, or a card printed on
// one side and not cut.
const FACE_CHOICES = [0, 1, 2, 4, 6, 8, 10];
// These tables are module scope, evaluated before a catalogue exists, so they
// carry message keys and the words are looked up where each option is built.
const SCALE_CHOICES = [
  { value: 0, captionKey: 'format.scale.fit' },
  { value: 0.9, captionKey: 'format.scale.small' },
  { value: 1, captionKey: 'format.scale.medium' },
  { value: 1.15, captionKey: 'format.scale.large' },
  { value: 1.3, captionKey: 'format.scale.xlarge' },
];
const TYPEFACE_CHOICES = /** @type {const} */ ([
  { value: 'sans', captionKey: 'format.typeface.sans', stack: 'latin' },
  { value: 'serif', captionKey: 'format.typeface.serif', stack: 'latin-serif' },
]);
const DPI_CHOICES = [
  { value: 150, captionKey: 'format.dpi.screen' },
  { value: 300, captionKey: 'format.dpi.print' },
  { value: 600, captionKey: 'format.dpi.photo' },
];
const INK_CHOICES = /** @type {const} */ ([
  { value: 'full', captionKey: 'format.ink.full' },
  { value: 'low-ink', captionKey: 'format.ink.lowInk' },
  { value: 'mono', captionKey: 'format.ink.mono' },
]);
const CUT_CHOICES = /** @type {const} */ ([
  { value: '', captionKey: 'format.cut.whole' },
  { value: 'short-edge', captionKey: 'format.cut.shortEdge' },
  { value: 'long-edge', captionKey: 'format.cut.longEdge' },
]);

/** The order the column toggles appear in, target side first. */
const FIELD_ORDER = /** @type {const} */ ([
  'script', 'script_alt', 'roman', 'ipa', 'gloss', 'respell', 'literal',
]);

/**
 * The columns this pair could actually fill, in order.
 *
 * Two of the seven are structural rather than empty: a target with no alternate
 * script and a target with no romanisation system can *never* fill those columns,
 * and their toggles were drawing an empty dashed rule -- which reads as "this is
 * broken" rather than "your language has one script". The dashes stay for a column
 * that is applicable and merely unfilled, which is the honest signal they were
 * added for.
 * @param {import('../core/types.js').SheetSpec} spec
 * @param {PanelInput['corpus']} corpus
 */
function fieldsFor(spec, corpus) {
  const target = corpus.languages[spec.target];
  return FIELD_ORDER.filter((field) => {
    if (field === 'script_alt') return Boolean(target.script_alt);
    if (field === 'roman') return Boolean((target.romanizations || '').trim());
    return true;
  });
}

/**
 * What each column is called, in terms of the pair actually selected.
 *
 * These read "Their script", "Other script" and "Your language" -- the setting
 * describing its own schema rather than describing the card in front of you. Every
 * name is already on hand: the two languages' own, the alternate script's from
 * `scripts.csv`, and the romanisation system's, so the control can say
 * "Japanese / Hepburn / English" instead. Three columns keep a generic caption
 * because no name exists for them -- `ipa` is `ipa` in every language, and
 * "Say-it-like" and "Literal" describe a treatment rather than a language -- but
 * their tooltips name the language whose reader they are for.
 * @param {import('../core/types.js').SheetSpec} spec
 * @param {PanelInput['corpus']} corpus
 * @returns {Record<string, {caption:string, title:string}>}
 */
function fieldLabels(spec, corpus) {
  const target = languageName(spec.target, corpus.languages[spec.target].exonym_en);
  const source = languageName(spec.source, corpus.languages[spec.source].exonym_en);
  const altIso = corpus.languages[spec.target].script_alt;
  const alt = altIso ? corpus.scripts[altIso]?.name ?? altIso : t('field.script_alt');
  const system = spec.romanization ? t(`roman.${spec.romanization}`) : t('field.roman');
  return {
    script: { caption: target, title: t('field.title.script', { language: target }) },
    script_alt: { caption: alt, title: t('field.title.script_alt', { script: alt }) },
    roman: { caption: system, title: t('field.title.roman', { system, language: target }) },
    ipa: { caption: t('field.ipa'), title: t('field.title.ipa') },
    gloss: { caption: source, title: t('field.title.gloss', { language: source }) },
    respell: { caption: t('field.respell'), title: t('field.title.respell', { language: source }) },
    literal: { caption: t('field.literal'), title: t('field.title.literal', { language: source }) },
  };
}

const CUT_NOTE_KEYS = {
  '': 'cut.hint.whole',
  'short-edge': 'cut.hint.shortEdge',
  'long-edge': 'cut.hint.longEdge',
};

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
 * The sample the column toggles draw, values plus the face each side is set in.
 * @param {Partial<Record<string,string>>} values
 * @param {import('../core/types.js').SheetSpec} [spec]
 * @param {PanelInput['corpus']} [corpus]
 * @returns {import('./glyphs.js').FieldSample}
 */
function fieldSample(values, spec, corpus) {
  const stackOf = (/** @type {string} */ code) => {
    const lang = corpus && code ? corpus.languages[code] : null;
    return lang && corpus ? familyFor(corpus.scripts[lang.script].font_stack) : 'inherit';
  };
  return {
    values,
    targetFamily: stackOf(spec?.target ?? ''),
    sourceFamily: stackOf(spec?.source ?? ''),
    latinFamily: familyFor('latin'),
  };
}

/**
 * One real entry from the current pair, for the column toggles to draw.
 *
 * Chosen rather than named outright, so a pack that renames a concept cannot
 * silently lose the sample. The glyph gives each stack about 40pt, so the row that
 * reads best there is a short one -- but shortness alone picked a *numeral*, which
 * fills three columns and illustrates none of them. So the score prefers the row
 * that fills the most columns first and only then the shortest, which lands on a
 * greeting in every language checked.
 *
 * @param {Record<string,Record<string,string>>} targetRows
 * @param {Record<string,Record<string,string>>} sourceRows
 * @param {Record<string,string>} respell
 * @param {import('../core/types.js').SheetSpec} spec
 * @returns {Partial<Record<string,string>>}
 */
function sampleValues(targetRows, sourceRows, respell, spec) {
  /** @type {Partial<Record<string,string>>} */ let best = {};
  let bestScore = -Infinity;
  for (const [id, target] of Object.entries(targetRows).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const source = sourceRows[id];
    const text = (target.text ?? '').trim();
    const gloss = (source?.text ?? '').trim();
    // A slot is drawn as a rule on the sheet, so a row with one is a poor picture
    // of a column.
    if (!text || !gloss || text.includes('{}') || gloss.includes('{}')) continue;
    const values = {
      script: text,
      script_alt: (target.text_alt ?? '').trim(),
      roman: (target[`romanization_${spec.romanization}`] ?? '').trim(),
      ipa: (target.ipa ?? '').trim(),
      gloss,
      literal: (target.literal ?? '').trim(),
      respell: (respell[id] ?? '').trim(),
    };
    const longest = Math.max(...Object.values(values).map((v) => v.length));
    if (longest > 18) continue;
    const score = Object.values(values).filter(Boolean).length * 100 - longest;
    if (score <= bestScore) continue;
    bestScore = score;
    best = values;
  }
  return best;
}

/**
 * @typedef {Object} PanelInput
 * @property {HTMLElement} root
 * @property {import('../core/types.js').SheetSpec} spec
 * @property {any} presets
 * @property {Awaited<ReturnType<import('../core/sheet.js').createSheetContext>>['corpus']} corpus
 * @property {Record<string,string>[]} languages
 * @property {Record<string,any>} themes            id -> theme, for palette swatches
 * @property {(patch:Partial<import('../core/types.js').SheetSpec>)=>void} onChange
 * @property {(flip:''|'short-edge'|'long-edge')=>void} onCutChange
 * @property {(dpi:number)=>void} onDpiChange
 */

/**
 * Build the panel. Returns a `sync` to call after each solve, so changes made
 * elsewhere -- a warning's fix button, the quiz, a dragged margin -- show up here.
 * @param {PanelInput} input
 */
export function createFormatPanel(input) {
  const { root, presets, corpus, languages, themes } = input;
  let spec = input.spec;
  let cut = /** @type {''|'short-edge'|'long-edge'} */ ('');

  /** Which geometry preset the current page size corresponds to, if any. */
  const presetOf = () => Object.entries(presets.geometry).find(
    ([, g]) => /** @type {any} */ (g).pageW === spec.geometry.pageW
      && /** @type {any} */ (g).pageH === spec.geometry.pageH,
  )?.[0] ?? '';

  /** @param {Partial<import('../core/types.js').SheetSpec>} patch */
  const emit = (patch) => {
    spec = { ...spec, ...patch };
    input.onChange(patch);
  };

  // --- card size ----------------------------------------------------------

  // Two boxes rather than one slider, because a card is a width *and* a height and
  // neither is a function of the other. Inches, to match the presets' own labels.
  const size = cardSizeControl({
    geometry: presets.geometry,
    value: spec.geometry,
    onChange: emit,
  });

  // --- columns and faces --------------------------------------------------

  const columns = numericChoice({
    label: t('format.columnsPerFace'),
    value: spec.geometry.columns,
    min: 1,
    max: 12,
    step: 1,
    snap: Math.round,
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: COLUMN_CHOICES.map((n) => ({
      value: n,
      caption: String(n),
      title: t('format.columnsTitle', { count: n }),
      glyph: pageGlyph({ pageW: spec.geometry.pageW, pageH: spec.geometry.pageH, columns: n }),
    })),
    onChange: (n) => emit({ geometry: { ...spec.geometry, columns: n } }),
  });

  const faces = numericChoice({
    label: t('format.faces'),
    value: spec.autoFaces ? 0 : spec.geometry.faces,
    min: 1,
    max: 24,
    step: 2,
    // A sheet is printed on both sides, so pairs are the step. One is the exception
    // rather than an odd number: a single face is one side, which is what a phone
    // screen is and what an uncut card can be.
    snap: (v) => (v < 2 ? 1 : Math.round(v / 2) * 2),
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: FACE_CHOICES.map((n) => ({
      value: n,
      caption: n === 0 ? t('format.faces.auto') : String(n),
      title: n === 0
        ? t('format.autoFaces')
        : t('format.facesTitle', { count: n }),
      glyph: facesGlyph(n),
    })),
    // Auto keeps whatever count is there as its starting point, so switching to it
    // does not throw away the card's natural pairing.
    onChange: (n) => emit(n === 0
      ? { autoFaces: true }
      : { autoFaces: false, geometry: { ...spec.geometry, faces: n } }),
  });
  const autoFacesCaption = /** @type {HTMLElement|null} */ (
    faces.group.querySelector('.segment .segment-caption')
  );

  // How much of the corpus to keep, by importance. It sits with the card and the
  // face count because it answers the same question they do -- how much material
  // there is against how much room -- and it is the only one of the three that can
  // make a phone screen's single face work: the top step is exactly the set that
  // fits one.
  const priority = numericChoice({
    label: t('format.priority'),
    value: spec.priority,
    min: 0,
    max: 1,
    step: 0.01,
    snap: (v) => Math.round(v * 100) / 100,
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: priorityOptions(corpus.concepts),
    onChange: (value) => emit({ priority: value }),
  });

  // --- spacing, arrangement, colour ---------------------------------------

  const typeSize = numericChoice({
    label: t('format.typeSize'),
    value: spec.scale,
    min: 0.4,
    max: 1.8,
    step: 0.05,
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: SCALE_CHOICES.map((choice) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: choice.value === 0 ? t('format.fitTitle') : t('format.scaleTitle', { scale: choice.value }),
      glyph: typeGlyph(choice.value),
    })),
    onChange: (value) => emit({ scale: value }),
  });

  const typefaceControl = segmented({
    label: t('format.typeface'),
    value: spec.typeface,
    options: TYPEFACE_CHOICES.map((choice) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t(choice.captionKey),
      glyph: typefaceGlyph(`"${familyFor(choice.stack)}", ${choice.value}-serif`),
    })),
    onChange: (value) => emit({ typeface: value }),
  });

  const padding = numericChoice({
    label: t('format.breathingRoom'),
    value: spec.padding,
    min: 0,
    max: 4,
    step: 0.1,
    unit: 'pt',
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: PADDING_CHOICES.map((choice, i) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t('format.paddingTitle', { padding: t(choice.captionKey) }),
      glyph: paddingGlyph(i),
    })),
    onChange: (value) => emit({ padding: value }),
  });

  const arrangement = segmented({
    label: t('format.entryLayoutLong'),
    value: spec.arrangement,
    options: ARRANGEMENTS.map((a) => ({
      value: a.id,
      // From the catalogue rather than `ARRANGEMENTS[].name`, which is English in
      // a source file the solver owns and cannot be translated.
      caption: t(`format.arrangement.${a.id}`),
      title: t(`format.arrangementTitle.${a.id}`),
      glyph: itemGlyph(arrangementShape(a.id, spec.fieldSet)),
    })),
    onChange: (value) => emit({ arrangement: value }),
  });

  // Where the divider between an entry's two halves sits. `Per row` is the
  // default and is the reference sheet's own behaviour: it lets a long phrase
  // borrow width from a short gloss, which is worth 5-23% of type size at the same
  // face count and is why the hand-built Japanese sheet fits on four faces rather
  // than six. `Even` solves it once for a whole section so the rows line up, and
  // pays for that in paper.
  const split = segmented({
    label: t('format.splitLong'),
    value: spec.split ?? 'adaptive',
    options: /** @type {const} */ (['consistent', 'adaptive']).map((id) => ({
      value: id,
      caption: t(`format.split.${id}`),
      title: t(`format.splitTitle.${id}`),
      glyph: splitGlyph(id === 'consistent'),
    })),
    onChange: (value) => emit({ split: value }),
  });

  const theme = paletteControl({
    themes,
    themeId: spec.themeId,
    themeColors: spec.themeColors,
    onChange: emit,
  });

  const ink = segmented({
    label: t('format.ink'),
    value: spec.inkMode,
    options: INK_CHOICES.map((choice) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t(choice.captionKey),
      glyph: inkGlyph(choice.value, theme.colours()),
    })),
    onChange: (value) => emit({ inkMode: value }),
  });

  const dpi = numericChoice({
    label: t('format.pngResolution'),
    value: 600,
    min: 72,
    max: 1200,
    step: 6,
    unit: 'dpi',
    snap: Math.round,
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: DPI_CHOICES.map((choice) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t('format.dpiTitle', { dpi: choice.value }),
      glyph: dpiGlyph(choice.value),
    })),
    onChange: (value) => input.onDpiChange(value),
  });

  // --- cutting ------------------------------------------------------------

  const cutNote = el('p', { class: 'small muted panel-note', text: t(CUT_NOTE_KEYS['']) });
  const cutControl = segmented({
    label: t('format.cutIntoCards'),
    value: cut,
    options: CUT_CHOICES.map((choice) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t(choice.captionKey),
      glyph: cutGlyph(choice.value),
    })),
    onChange: (value) => {
      cut = value;
      cutNote.textContent = t(CUT_NOTE_KEYS[value]);
      input.onCutChange(value);
    },
  });
  const cutField = panelField(t('format.cutIntoCards'), [cutControl.group, cutNote]);

  // The mirror image of the cut control: meaningless off a screen, where the cut is
  // meaningless on one. A phone's operating system draws its clock over the top of
  // the wallpaper and its shortcuts over the bottom, so a sheet meant to be a lock
  // screen has to keep those bands clear -- and there is no point offering that for
  // a card that will be printed.
  // Which phone, once "Phone screen" is chosen. Gated with the clock band, because
  // both exist only for a screen.
  const phone = phoneControl({ geometry: presets.geometry, value: spec.geometry, onChange: emit });
  const phoneField = panelField(t('format.phone'), [phone.group]);

  const reserve = reserveControl({ value: spec.geometry, onChange: emit });
  const reserveField = panelField(t('format.reserve'), [reserve.group, reserve.custom]);

  /**
   * A cut needs two things the phone card has not got: paper, and a back to print
   * on. Offering it there would offer an operation with no meaning -- and
   * `splitCards` would throw on the odd face count besides, which is the same fact
   * arriving as a crash. So the whole field goes away rather than being greyed, and
   * any cut already chosen is dropped: `sync` runs before the canvas redraws, so
   * `cut()` is already empty by the time anything asks.
   * @param {number} faceCount  as resolved, since auto is what usually decides it
   */
  const setCuttable = (faceCount) => {
    // From the geometry itself, not from which preset it still matches, which is
    // how `ui/sheet-options.js` has always read it. `cardSizeControl` carries
    // `screen` through a custom size, so adjusting the phone card's dimensions by
    // a few points kept the flag and lost the control that depends on it -- the
    // clock band vanished from the one aspect ratio it exists for.
    const screen = Boolean(spec.geometry.screen);
    const cuttable = !screen && faceCount % 2 === 0;
    cutField.hidden = !cuttable;
    reserveField.hidden = !screen;
    phoneField.hidden = !screen;
    if (cuttable || !cut) return;
    cut = '';
    cutControl.select('');
    cutNote.textContent = t(CUT_NOTE_KEYS['']);
  };
  setCuttable(spec.geometry.faces);

  // --- the list-shaped choices -------------------------------------------

  /**
   * @param {string} id @param {string} label
   * @param {{value:string, text:string}[]} options
   * @param {string} value @param {(v:string)=>void} onChange
   */
  function menu(id, label, options, value, onChange) {
    const select = /** @type {HTMLSelectElement} */ (el('select', { id }));
    for (const option of options) select.append(new Option(option.text, option.value));
    select.value = value;
    select.addEventListener('change', () => onChange(select.value));
    const wrap = el('div', { class: 'field' }, [
      el('label', { for: id }, [el('span', { text: label })]),
      select,
    ]);
    return { wrap, select };
  }

  const paper = menu(
    'paper', t('format.paper'),
    Object.values(corpus.paper).map((p) => ({ value: p.preset_id, text: p.name })),
    spec.paper.presetId,
    (value) => input.onChange({ paper: paperSpec(corpus, value) }),
  );

  // Only languages with rows on file, not every language the registry lists as
  // planned or drafted: offering a gloss language with no data produced a blank
  // sheet and fifteen 404s, and said nothing about why.
  const source = menu(
    'source', t('format.glossedInto'),
    languages
      .filter((l) => l.bcp47 !== spec.target && hasContent(corpus.coverage, l.bcp47))
      .map((l) => ({
        value: l.bcp47,
        text: t('gallery.pickerOption', { endonym: l.endonym, exonym: l.exonym_en }),
      })),
    spec.source,
    (value) => emit({ source: value, accent: corpus.languages[value].default_accent }),
  );

  // Where you are going, which decides the local emergency numbers. Only the
  // countries the target language is actually spoken in are offered.
  const regionCodes = (corpus.languages[spec.target].regions || '').split(';').filter(Boolean);
  const region = regionCodes.length > 1
    ? menu(
      'region', t('format.region'),
      regionCodes.map((code) => ({
        value: code,
        text: `${flagsSupported() ? `${flagEmoji(code)} ` : ''}${corpus.regions[code]?.name_en ?? code}`,
      })),
      spec.region,
      (value) => emit({ region: value }),
    )
    : null;

  const systems = (corpus.languages[spec.target].romanizations || '').split(';').filter(Boolean);
  const romanization = menu(
    'romanization', t('format.romanisation'),
    // `pinyin`, `rr`, `ala-lc` are the slugs the registry keys on, not names a
    // reader has ever seen. The menu named them anyway.
    systems.length
      ? systems.map((v) => ({ value: v, text: t(`roman.${v}`) }))
      : [{ value: '', text: t('format.romanisation.none') }],
    spec.romanization,
    (value) => emit({ romanization: value }),
  );
  if (!systems.length) romanization.select.disabled = true;

  // --- which columns appear ----------------------------------------------

  // A column of bare checkboxes was the one control here that named a thing instead
  // of drawing it, which is odd for a setting about where text lands. Each glyph is
  // the entry itself with that field's own text in it, taken from a real row of the
  // pair being edited -- so choosing whether to print romanisation shows you
  // `xiexie` in the face it will be set in, and a column the corpus has nothing for
  // shows an empty rule instead.
  /** @type {import('./glyphs.js').FieldSample} */
  let sample = fieldSample({});
  const shownFields = fieldsFor(spec, corpus);
  const fieldGlyphs = () => shownFields.map((field) => fieldGlyph(field, sample));
  const fieldCaptions = (/** @type {import('../core/types.js').SheetSpec} */ at) => {
    const labels = fieldLabels(at, corpus);
    return shownFields.map((field) => labels[field]);
  };
  const fieldSet = toggles({
    label: t('format.columnsShown'),
    options: shownFields.map((field, i) => ({
      value: /** @type {import('../core/types.js').FieldId} */ (field),
      ...fieldCaptions(spec)[i],
      glyph: fieldGlyphs()[i],
    })),
    values: spec.fieldSet.filter((f) => f !== 'numeral'),
    // `numeral` is the same source-language cell as the gloss, so it rides along.
    onChange: (next) => emit({ fieldSet: [...next, 'numeral'] }),
  });

  root.replaceChildren(
    panelField(t('format.card'), [size.group, size.custom]),
    phoneField,
    panelField(t('format.columns'), [columns.group]),
    panelField(t('format.faces'), [faces.group]),
    panelField(t('format.priority'), [priority.group]),
    panelField(t('format.typeface'), [typefaceControl.group]),
    panelField(t('format.typeSize'), [typeSize.group]),
    panelField(t('format.entryLayout'), [arrangement.group]),
    panelField(t('format.split'), [split.group]),
    panelField(t('format.textPadding'), [padding.group]),
    panelField(t('format.colours'), [theme.group, theme.custom]),
    panelField(t('format.ink'), [ink.group]),
    cutField,
    reserveField,
    panelField(t('format.pngResolution'), [dpi.group]),
    panelField(t('format.columnsShown'), [fieldSet.group]),
    paper.wrap,
    source.wrap,
    romanization.wrap,
    ...(region ? [region.wrap] : []),
  );

  return {
    /**
     * @param {import('../core/types.js').SheetSpec} next
     * @param {number} [resolvedFaces] what auto settled on, for the caption
     * @param {{targetRows:Record<string,Record<string,string>>,
     *          sourceRows:Record<string,Record<string,string>>,
     *          respell:Record<string,string>}} [rows] the pair's own cells, so the
     *   column toggles can draw the words they control rather than a shape
     */
    sync(next, resolvedFaces, rows) {
      spec = next;
      if (rows) {
        sample = fieldSample(
          sampleValues(rows.targetRows, rows.sourceRows, rows.respell, next), next, corpus,
        );
      }
      size.sync(next.geometry);
      reserve.sync(next.geometry);
      phone.sync(next.geometry);
      columns.select(next.geometry.columns);
      faces.select(next.autoFaces ? 0 : next.geometry.faces);
      priority.select(next.priority);
      setCuttable(resolvedFaces ?? next.geometry.faces);
      // Auto is only useful if it says what it decided.
      if (autoFacesCaption) {
        autoFacesCaption.textContent = next.autoFaces && resolvedFaces
          ? t('format.faces.autoResolved', { faces: resolvedFaces })
          : t('format.faces.auto');
      }
      typefaceControl.select(next.typeface);
      typeSize.select(next.scale);
      padding.select(next.padding);
      arrangement.select(next.arrangement);
      split.select(next.split ?? 'adaptive');
      theme.sync(next);
      ink.select(next.inkMode);
      paper.select.value = next.paper.presetId;
      if (region) region.select.value = next.region;
      source.select.value = next.source;
      romanization.select.value = next.romanization;
      fieldSet.select(next.fieldSet.filter((f) => f !== 'numeral'));
      // The glyphs for these two depend on other settings, so redraw them.
      redrawGlyphs(columns.group, COLUMN_CHOICES.map(
        (n) => pageGlyph({ pageW: next.geometry.pageW, pageH: next.geometry.pageH, columns: n }),
      ));
      redrawGlyphs(arrangement.group, ARRANGEMENTS.map(
        (a) => itemGlyph(arrangementShape(a.id, next.fieldSet)),
      ));
      redrawGlyphs(fieldSet.group, fieldGlyphs());
      // The captions name the two languages and the romanisation system, all three
      // of which are settings in this same panel.
      relabelGlyphs(fieldSet.group, fieldCaptions(next));
      redrawGlyphs(ink.group, INK_CHOICES.map((c) => inkGlyph(c.value, theme.colours())));
    },
    cut: () => cut,
  };
}

