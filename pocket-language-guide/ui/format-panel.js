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
  pageGlyph, facesGlyph, paddingGlyph, PADDING_CHOICES, inkGlyph, paletteGlyph, itemGlyph, cutGlyph,
  customGlyph, numericChoice, fieldGlyph, toggles,
  typeGlyph, typefaceGlyph, dpiGlyph, segmented, panelField,
} from './glyphs.js';
import { familyFor } from '../render/fonts.js';
import { t } from './i18n.js';

const COLUMN_CHOICES = [1, 2, 3, 4, 5, 6];
// 0 selects auto. Faces come in pairs: a double-sided sheet is two of them.
const FACE_CHOICES = [0, 2, 4, 6, 8, 10];
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

const FIELD_LABEL_KEYS = /** @type {const} */ ({
  script: 'field.script',
  script_alt: 'field.script_alt',
  roman: 'field.roman',
  ipa: 'field.ipa',
  gloss: 'field.gloss',
  respell: 'field.respell',
  literal: 'field.literal',
});

/**
 * A number box in inches that reports points, which is what a `Geometry` holds.
 * @param {string} label
 */
function inchBox(label) {
  const box = /** @type {HTMLInputElement} */ (el('input', { type: 'number', class: 'numeric-box' }));
  box.min = '1';
  box.max = '17';
  box.step = '0.1';
  box.setAttribute('aria-label', label);
  return {
    box,
    points: () => Math.round(Number(box.value) * 72 * 100) / 100,
    /** @param {number} points */
    set(points) { box.value = String(Math.round((points / 72) * 100) / 100); },
  };
}

/**
 * The colours a reader can set. The five section roles first, because those are the
 * encoding; ink last, because it is the one that makes a sheet unreadable if it is
 * got wrong, and it should not be the first thing to hand.
 */
const COLOUR_KEYS = [
  { key: 'roles.comm', labelKey: 'colour.comm' },
  { key: 'roles.money', labelKey: 'colour.money' },
  { key: 'roles.move', labelKey: 'colour.move' },
  { key: 'roles.stay', labelKey: 'colour.stay' },
  { key: 'roles.alert', labelKey: 'colour.alert' },
  { key: 'ink', labelKey: 'colour.ink' },
];

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

  const roles = (/** @type {string} */ id) => Object.values(themes[id]?.colors?.roles ?? {});
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
  const cardW = inchBox(t('format.cardWidth'));
  const cardH = inchBox(t('format.cardHeight'));
  const cardCustom = el('div', { class: 'numeric-custom' }, [
    cardW.box, el('span', { class: 'numeric-unit', text: '×' }), cardH.box,
    el('span', { class: 'numeric-unit', text: t('format.inches') }),
  ]);
  const pushCard = () => emit({
    geometry: { ...spec.geometry, pageW: cardW.points(), pageH: cardH.points() },
  });
  cardW.box.addEventListener('change', pushCard);
  cardH.box.addEventListener('change', pushCard);

  const size = segmented({
    label: t('format.cardSize'),
    value: presetOf(),
    options: [
      ...Object.entries(presets.geometry).map(([id, raw]) => {
        const g = /** @type {any} */ (raw);
        return {
          value: id,
          // The name is a dimension for four of the five presets, which needs no
          // translating; the wallet card is a description, and stood out as the one
          // English string in an otherwise translated panel. A preset can therefore
          // name a caption key, and only that one does.
          caption: g.captionKey
            ? t(g.captionKey)
            : g.name.split('·')[0].trim().replace('landscape', '').replace('portrait', '').trim(),
          title: g.name,
          glyph: pageGlyph({ pageW: g.pageW, pageH: g.pageH, columns: g.columns }),
        };
      }),
      // `presetOf()` already returns '' for a page size that matches no preset, so
      // the empty string is what "custom" means everywhere in this panel.
      {
        value: '',
        caption: t('format.custom'),
        title: t('format.cardCustom'),
        glyph: customGlyph(),
      },
    ],
    // A different card is a different sheet: take its margins, gap, columns and
    // natural face count wholesale rather than keeping values tuned for the old
    // shape. Custom keeps the size that is already there and just opens the boxes,
    // so nothing jumps under the reader.
    onChange: (id) => {
      cardCustom.hidden = id !== '';
      if (id) emit({ geometry: { ...presets.geometry[id] } });
    },
  });
  cardCustom.hidden = presetOf() !== '';

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
    min: 2,
    max: 24,
    step: 2,
    // A sheet is printed on both sides, so an odd face count is not a thing.
    snap: (v) => Math.max(2, Math.round(v / 2) * 2),
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
      caption: a.name,
      title: a.name,
      glyph: itemGlyph(arrangementShape(a.id, spec.fieldSet)),
    })),
    onChange: (value) => emit({ arrangement: value }),
  });

  // Colour is how a section is coded on the card, so it is the part of a theme
  // worth handing over -- and the only part that can change without re-measuring
  // anything. The theme underneath still supplies every size, leading and rule.
  const swatches = COLOUR_KEYS.map((entry) => {
    const input = /** @type {HTMLInputElement} */ (el('input', { type: 'color', class: 'swatch' }));
    input.setAttribute('aria-label', t(entry.labelKey));
    input.title = t(entry.labelKey);
    input.addEventListener('input', () => emit({
      themeColors: { ...currentColours(), [entry.key]: input.value },
    }));
    return { ...entry, input };
  });
  const themeCustom = el('div', { class: 'numeric-custom swatches' }, swatches.map((s) => s.input));
  /** Every colour the reader could have changed, defaulted from the base theme. */
  const currentColours = () => {
    /** @type {Record<string,string>} */ const out = {};
    for (const { key, input } of swatches) out[key] = input.value;
    return out;
  };
  const paintSwatches = () => {
    const base = themes[spec.themeId]?.colors ?? {};
    for (const { key, input } of swatches) {
      const fallback = key.startsWith('roles.') ? base.roles?.[key.slice(6)] : base[key];
      input.value = spec.themeColors?.[key] ?? fallback ?? '#000000';
    }
  };

  const theme = segmented({
    label: t('format.colours'),
    value: spec.themeColors ? 'custom' : spec.themeId,
    options: [
      ...Object.keys(themes).map((id) => ({
        value: id,
        caption: id === 'cvd-safe' ? t('format.theme.accessible') : t('format.theme.reference'),
        title: themes[id]?.name ?? id,
        glyph: paletteGlyph(roles(id)),
      })),
      {
        value: 'custom',
        caption: t('format.custom'),
        title: t('format.coloursCustom'),
        glyph: customGlyph(),
      },
    ],
    onChange: (value) => {
      themeCustom.hidden = value !== 'custom';
      // Starting from what is on screen means the first swatch a reader drags moves
      // one colour rather than resetting the other five.
      if (value === 'custom') emit({ themeColors: currentColours() });
      else emit({ themeId: value, themeColors: undefined });
    },
  });
  themeCustom.hidden = !spec.themeColors;
  paintSwatches();

  const ink = segmented({
    label: t('format.ink'),
    value: spec.inkMode,
    options: INK_CHOICES.map((choice) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t(choice.captionKey),
      glyph: inkGlyph(choice.value, roles(spec.themeId)),
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
    (value) => emit({ source: value, accent: `${value}-US` }),
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
    systems.length
      ? systems.map((v) => ({ value: v, text: v }))
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
  const fieldGlyphs = () => Object.keys(FIELD_LABEL_KEYS)
    .map((field) => fieldGlyph(/** @type {any} */ (field), sample));
  const fieldSet = toggles({
    label: t('format.columnsShown'),
    options: Object.entries(FIELD_LABEL_KEYS).map(([field, labelKey], i) => ({
      value: /** @type {import('../core/types.js').FieldId} */ (field),
      caption: t(labelKey),
      title: t(labelKey),
      glyph: fieldGlyphs()[i],
    })),
    values: spec.fieldSet.filter((f) => f !== 'numeral'),
    // `numeral` is the same source-language cell as the gloss, so it rides along.
    onChange: (next) => emit({ fieldSet: [...next, 'numeral'] }),
  });

  root.replaceChildren(
    panelField(t('format.card'), [size.group, cardCustom]),
    panelField(t('format.columns'), [columns.group]),
    panelField(t('format.faces'), [faces.group]),
    panelField(t('format.typeface'), [typefaceControl.group]),
    panelField(t('format.typeSize'), [typeSize.group]),
    panelField(t('format.entryLayout'), [arrangement.group]),
    panelField(t('format.textPadding'), [padding.group]),
    panelField(t('format.colours'), [theme.group, themeCustom]),
    panelField(t('format.ink'), [ink.group]),
    panelField(t('format.cutIntoCards'), [cutControl.group, cutNote]),
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
      size.select(presetOf());
      cardCustom.hidden = presetOf() !== '';
      cardW.set(next.geometry.pageW);
      cardH.set(next.geometry.pageH);
      columns.select(next.geometry.columns);
      faces.select(next.autoFaces ? 0 : next.geometry.faces);
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
      theme.select(next.themeColors ? 'custom' : next.themeId);
      themeCustom.hidden = !next.themeColors;
      paintSwatches();
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
      const palette = next.themeColors
        ? COLOUR_KEYS.filter((c) => c.key.startsWith('roles.'))
          .map((c) => next.themeColors?.[c.key] ?? '')
        : roles(next.themeId);
      redrawGlyphs(ink.group, INK_CHOICES.map((c) => inkGlyph(c.value, palette)));
      redrawGlyphs(theme.group, [
        ...Object.keys(themes).map((id) => paletteGlyph(roles(id))),
        customGlyph(),
      ]);
    },
    cut: () => cut,
  };
}

/** @param {HTMLElement} group @param {SVGElement[]} glyphs */
function redrawGlyphs(group, glyphs) {
  const buttons = [...group.querySelectorAll('.segment')];
  buttons.forEach((button, i) => {
    const old = button.querySelector('svg');
    if (old && glyphs[i]) old.replaceWith(glyphs[i]);
  });
}

