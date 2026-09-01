// The studio's left panel.
//
// The panel owns the spec fields it controls and reports changes as a patch, so
// nothing has to read values back out of the DOM -- which is where a dragged
// margin previously got silently overwritten by the geometry dropdown.
//
// Most choices here are about shape, so they are drawn rather than described. Only
// the genuinely list-shaped ones (paper, language, romanisation) stay as menus.

import { hasContent } from '../core/pack.js';
import { ARRANGEMENTS, arrangementShape } from '../core/solve/arrange.js';
import { flagEmoji, flagsSupported } from './flags.js';
import {
  pageGlyph, facesGlyph, densityGlyph, inkGlyph, paletteGlyph, itemGlyph, cutGlyph,
  typeGlyph, typefaceGlyph, dpiGlyph, segmented, panelField,
} from './glyphs.js';
import { familyFor } from '../render/fonts.js';

const COLUMN_CHOICES = [1, 2, 3, 4, 5, 6];
// 0 selects auto. Faces come in pairs: a double-sided sheet is two of them.
const FACE_CHOICES = [0, 2, 4, 6, 8, 10];
const SCALE_CHOICES = [
  { value: 0, caption: 'Fit' },
  { value: 0.9, caption: 'Small' },
  { value: 1, caption: 'Medium' },
  { value: 1.15, caption: 'Large' },
  { value: 1.3, caption: 'X-large' },
];
const DENSITY_CHOICES = [
  { value: 0, caption: 'Tight' },
  { value: 0.7, caption: 'Normal' },
  { value: 1.6, caption: 'Airy' },
];
const TYPEFACE_CHOICES = /** @type {const} */ ([
  { value: 'sans', caption: 'Sans', stack: 'latin' },
  { value: 'serif', caption: 'Serif', stack: 'latin-serif' },
]);
const DPI_CHOICES = [
  { value: 150, caption: 'Screen' },
  { value: 300, caption: 'Print' },
  { value: 600, caption: 'Photo' },
];
const INK_CHOICES = /** @type {const} */ ([
  { value: 'full', caption: 'Colour' },
  { value: 'low-ink', caption: 'Low ink' },
  { value: 'mono', caption: 'Mono' },
]);
const CUT_CHOICES = /** @type {const} */ ([
  { value: '', caption: 'Whole' },
  { value: 'short-edge', caption: 'Short edge' },
  { value: 'long-edge', caption: 'Long edge' },
]);

const FIELD_LABELS = /** @type {const} */ ({
  script: 'Their script',
  script_alt: 'Other script',
  roman: 'Romanisation',
  ipa: 'IPA',
  gloss: 'Your language',
  respell: 'Say-it-like',
  literal: 'Literal',
});

const CUT_NOTES = {
  '': 'Print double-sided. Each sheet is one face on the front, one on the back.',
  'short-edge': 'Cut each sheet down the middle: four double-sided cards. Nothing is rotated.',
  'long-edge': 'Same four cards, with each back pre-rotated so it comes out upright.',
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

  const size = segmented({
    label: 'Card size',
    value: presetOf(),
    options: Object.entries(presets.geometry).map(([id, raw]) => {
      const g = /** @type {any} */ (raw);
      return {
        value: id,
        caption: g.name.split('·')[0].trim().replace('landscape', '').replace('portrait', '').trim(),
        title: g.name,
        glyph: pageGlyph({ pageW: g.pageW, pageH: g.pageH, columns: g.columns }),
      };
    }),
    // A different card is a different sheet: take its margins, gap, columns and
    // natural face count wholesale rather than keeping values tuned for the old
    // shape.
    onChange: (id) => emit({ geometry: { ...presets.geometry[id] } }),
  });

  // --- columns and faces --------------------------------------------------

  const columns = segmented({
    label: 'Columns per face',
    value: spec.geometry.columns,
    options: COLUMN_CHOICES.map((n) => ({
      value: n,
      caption: String(n),
      title: `${n} ${n === 1 ? 'column' : 'columns'}`,
      glyph: pageGlyph({ pageW: spec.geometry.pageW, pageH: spec.geometry.pageH, columns: n }),
    })),
    onChange: (n) => emit({ geometry: { ...spec.geometry, columns: n } }),
  });

  const faces = segmented({
    label: 'Faces',
    value: spec.autoFaces ? 0 : spec.geometry.faces,
    options: FACE_CHOICES.map((n) => ({
      value: n,
      caption: n === 0 ? 'Auto' : String(n),
      title: n === 0
        ? 'As many as the content needs, in pairs'
        : `${n} ${n === 1 ? 'face' : 'faces'}`,
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

  const typeSize = segmented({
    label: 'Type size',
    value: spec.scale,
    options: SCALE_CHOICES.map((choice) => ({
      value: choice.value,
      caption: choice.caption,
      title: choice.value === 0 ? 'Fit the type to the faces you asked for' : `${choice.value}x`,
      glyph: typeGlyph(choice.value),
    })),
    onChange: (value) => emit({ scale: value }),
  });

  const typefaceControl = segmented({
    label: 'Typeface',
    value: spec.typeface,
    options: TYPEFACE_CHOICES.map((choice) => ({
      value: choice.value,
      caption: choice.caption,
      title: choice.caption,
      glyph: typefaceGlyph(`"${familyFor(choice.stack)}", ${choice.value}-serif`),
    })),
    onChange: (value) => emit({ typeface: value }),
  });

  const density = segmented({
    label: 'Spacing between rows',
    value: spec.density,
    options: DENSITY_CHOICES.map((choice, i) => ({
      value: choice.value,
      caption: choice.caption,
      title: `${choice.caption} spacing`,
      glyph: densityGlyph(i),
    })),
    onChange: (value) => emit({ density: value }),
  });

  const arrangement = segmented({
    label: 'How each entry is laid out',
    value: spec.arrangement,
    options: ARRANGEMENTS.map((a) => ({
      value: a.id,
      caption: a.name,
      title: a.name,
      glyph: itemGlyph(arrangementShape(a.id, spec.fieldSet)),
    })),
    onChange: (value) => emit({ arrangement: value }),
  });

  const theme = segmented({
    label: 'Colours',
    value: spec.themeId,
    options: Object.keys(themes).map((id) => ({
      value: id,
      caption: id === 'cvd-safe' ? 'Accessible' : 'Reference',
      title: themes[id]?.name ?? id,
      glyph: paletteGlyph(roles(id)),
    })),
    onChange: (value) => emit({ themeId: value }),
  });

  const ink = segmented({
    label: 'Ink',
    value: spec.inkMode,
    options: INK_CHOICES.map((choice) => ({
      value: choice.value,
      caption: choice.caption,
      title: choice.caption,
      glyph: inkGlyph(choice.value, roles(spec.themeId)),
    })),
    onChange: (value) => emit({ inkMode: value }),
  });

  const dpi = segmented({
    label: 'PNG resolution',
    value: 600,
    options: DPI_CHOICES.map((choice) => ({
      value: choice.value,
      caption: choice.caption,
      title: `${choice.value} dpi`,
      glyph: dpiGlyph(choice.value),
    })),
    onChange: (value) => input.onDpiChange(value),
  });

  // --- cutting ------------------------------------------------------------

  const cutNote = el('p', { class: 'small muted panel-note', text: CUT_NOTES[''] });
  const cutControl = segmented({
    label: 'Cut into cards',
    value: cut,
    options: CUT_CHOICES.map((choice) => ({
      value: choice.value,
      caption: choice.caption,
      title: choice.caption,
      glyph: cutGlyph(choice.value),
    })),
    onChange: (value) => {
      cut = value;
      cutNote.textContent = CUT_NOTES[value];
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
    'paper', 'Paper and printer',
    Object.values(corpus.paper).map((p) => ({ value: p.preset_id, text: p.name })),
    spec.paper.presetId,
    (value) => input.onChange({ paper: paperSpec(corpus, value) }),
  );

  // Only languages with rows on file, not every language the registry lists as
  // planned or drafted: offering a gloss language with no data produced a blank
  // sheet and fifteen 404s, and said nothing about why.
  const source = menu(
    'source', 'Glossed into',
    languages
      .filter((l) => l.bcp47 !== spec.target && hasContent(corpus.coverage, l.bcp47))
      .map((l) => ({ value: l.bcp47, text: `${l.endonym} (${l.exonym_en})` })),
    spec.source,
    (value) => emit({ source: value, accent: `${value}-US` }),
  );

  // Where you are going, which decides the local emergency numbers. Only the
  // countries the target language is actually spoken in are offered.
  const regionCodes = (corpus.languages[spec.target].regions || '').split(';').filter(Boolean);
  const region = regionCodes.length > 1
    ? menu(
      'region', 'Where you are going',
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
    'romanization', 'Romanisation',
    systems.length ? systems.map((v) => ({ value: v, text: v })) : [{ value: '', text: 'none' }],
    spec.romanization,
    (value) => emit({ romanization: value }),
  );
  if (!systems.length) romanization.select.disabled = true;

  // --- which columns appear ----------------------------------------------

  const fieldRow = el('div', { class: 'field-toggles' });
  /** @type {Map<string, HTMLInputElement>} */ const fieldBoxes = new Map();
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
    box.dataset.field = field;
    box.checked = spec.fieldSet.includes(/** @type {any} */ (field));
    box.addEventListener('change', () => {
      const next = new Set(spec.fieldSet);
      if (box.checked) next.add(/** @type {any} */ (field));
      else next.delete(/** @type {any} */ (field));
      // `numeral` is the same source-language cell as the gloss, so it rides along.
      emit({ fieldSet: [.../** @type {any} */ (next), 'numeral'] });
    });
    fieldBoxes.set(field, box);
    fieldRow.append(el('label', { class: 'small' }, [box, document.createTextNode(label)]));
  }

  root.replaceChildren(
    panelField('Card', [size.group]),
    panelField('Columns', [columns.group]),
    panelField('Faces', [faces.group]),
    panelField('Typeface', [typefaceControl.group]),
    panelField('Type size', [typeSize.group]),
    panelField('Entry layout', [arrangement.group]),
    panelField('Row spacing', [density.group]),
    panelField('Colours', [theme.group]),
    panelField('Ink', [ink.group]),
    panelField('Cut into cards', [cutControl.group, cutNote]),
    panelField('PNG resolution', [dpi.group]),
    panelField('Columns shown', [fieldRow]),
    paper.wrap,
    source.wrap,
    romanization.wrap,
    ...(region ? [region.wrap] : []),
  );

  return {
    /**
     * @param {import('../core/types.js').SheetSpec} next
     * @param {number} [resolvedFaces] what auto settled on, for the caption
     */
    sync(next, resolvedFaces) {
      spec = next;
      size.select(presetOf());
      columns.select(next.geometry.columns);
      faces.select(next.autoFaces ? 0 : next.geometry.faces);
      // Auto is only useful if it says what it decided.
      if (autoFacesCaption) {
        autoFacesCaption.textContent = next.autoFaces && resolvedFaces
          ? `Auto · ${resolvedFaces}`
          : 'Auto';
      }
      typefaceControl.select(next.typeface);
      typeSize.select(next.scale);
      density.select(next.density);
      arrangement.select(next.arrangement);
      theme.select(next.themeId);
      ink.select(next.inkMode);
      paper.select.value = next.paper.presetId;
      if (region) region.select.value = next.region;
      source.select.value = next.source;
      romanization.select.value = next.romanization;
      for (const [field, box] of fieldBoxes) {
        box.checked = next.fieldSet.includes(/** @type {any} */ (field));
      }
      // The glyphs for these two depend on other settings, so redraw them.
      redrawGlyphs(columns.group, COLUMN_CHOICES.map(
        (n) => pageGlyph({ pageW: next.geometry.pageW, pageH: next.geometry.pageH, columns: n }),
      ));
      redrawGlyphs(arrangement.group, ARRANGEMENTS.map(
        (a) => itemGlyph(arrangementShape(a.id, next.fieldSet)),
      ));
      redrawGlyphs(ink.group, INK_CHOICES.map((c) => inkGlyph(c.value, roles(next.themeId))));
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

/**
 * @param {Awaited<ReturnType<import('../core/sheet.js').createSheetContext>>['corpus']} corpus
 * @param {string} presetId
 * @returns {import('../core/types.js').PaperSpec}
 */
export function paperSpec(corpus, presetId) {
  const paper = corpus.paper[presetId];
  if (!paper) throw new Error(`no paper preset "${presetId}"`);
  return {
    presetId,
    borderless: paper.borderless === '1',
    oversprayPct: Number(paper.overspray_pct),
    nonprintablePt: Number(paper.nonprintable_pt),
    minRulePt: Number(paper.min_rule_pt),
    minSizeDelta: Number(paper.min_size_delta),
  };
}
