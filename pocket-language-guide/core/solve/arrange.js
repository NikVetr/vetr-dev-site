// How an item's fields are arranged inside its own box.
//
// The reference sheet uses one shape: target language stacked on the left, your
// language stacked on the right, each hugging its outer edge so the pair frames the
// row. That is the best default, but not the only sensible one -- a single line
// reads faster when the phrases are short, and one field per line is easier to
// follow when they are long -- so the arrangement is a setting rather than a
// property of the theme.
//
// Only per-row templates are rearranged. A reference table is already one line of
// four columns, and its whole point is that every row lines up.

/** @typedef {import('../types.js').FieldId} FieldId */
/** @typedef {import('../types.js').FieldStyle} FieldStyle */

/**
 * Reading order within an item: the target language's own writing first, then its
 * pronunciation, then the reader's language. Fields absent from the sheet are
 * skipped, so turning off romanisation closes the gap rather than leaving one.
 * @type {FieldId[]}
 */
const ORDER = ['script', 'script_alt', 'roman', 'ipa', 'gloss', 'literal', 'respell'];

/** Which side of the item a field belongs to, for the two-column arrangement. */
const TARGET_SIDE = new Set(['script', 'script_alt', 'roman', 'ipa']);

/** @typedef {'mixed'|'two-column'|'one-row'|'stacked'} Arrangement */

/**
 * `mixed` is the default, and it earns a name because the setting was already
 * being disobeyed with no way to say so.
 *
 * A reference table is one line of four columns whose whole point is that its rows
 * line up, so it keeps its own grid whatever is chosen -- a sheet set to "One per
 * line" still prints its number tables as tables, which is right and was silent.
 * `mixed` says that out loud: phrase rows side by side, tables as tables. The three
 * named shapes mean the same thing for phrase rows and differ only in which shape
 * that is.
 *
 * It deliberately does *not* choose per section by measurement. That was tried:
 * picking the shorter of two shapes per section makes the arrangement a function
 * of the type scale, which makes `fits(scale)` non-monotonic and breaks the fit
 * search's binary assumption -- Mandarin went from eight faces to ten and Japanese
 * lost 0.14 of scale.
 * @type {{id:Arrangement, name:string}[]}
 */
export const ARRANGEMENTS = [
  { id: 'mixed', name: 'Mixed' },
  { id: 'two-column', name: 'Side by side' },
  { id: 'one-row', name: 'One line' },
  { id: 'stacked', name: 'One per line' },
];

/**
 * Rewrite a template's field grid for the chosen arrangement.
 *
 * For a per-row template this *owns* the positions: the `row`/`col` in the theme
 * file are only reached when fewer than two of its fields are shown, which is why
 * `entry` can list `script`, `script_alt` and `ipa` in the same cell without them
 * ever overprinting -- three fields on the target side become three rows here, and
 * `cellGrid` drops the ones the sheet is not showing before anything is painted.
 * @param {any} template
 * @param {Arrangement} arrangement
 * @param {Set<string>} shown  the field ids the sheet is displaying
 * @returns {any} a template with the same styling and a new grid
 */
export function arrangeTemplate(template, arrangement, shown) {
  if (template.widthMode !== 'per-row') return template;
  // `mixed` is resolved by the caller, which is the only place that can measure a
  // whole section's rows; reaching here means nothing did, so take the default.
  if (arrangement === 'mixed') arrangement = 'two-column';

  const fields = /** @type {FieldStyle[]} */ (template.fields)
    .filter((f) => shown.has(f.field))
    .slice()
    .sort((a, b) => ORDER.indexOf(a.field) - ORDER.indexOf(b.field));
  if (fields.length < 2) return template;

  if (arrangement === 'one-row') {
    return {
      ...template,
      rows: 1,
      cols: fields.length,
      // A single line has no room to be generous: let each column shrink further
      // than the two-column split would allow.
      minFrac: Math.min(template.minFrac, 0.5 / fields.length),
      maxFrac: 0.6,
      fields: fields.map((f, i) => ({
        ...f,
        row: 0,
        col: i,
        align: i === fields.length - 1 ? 'end' : 'start',
      })),
    };
  }

  if (arrangement === 'stacked') {
    return {
      ...template,
      rows: fields.length,
      cols: 1,
      minFrac: 1,
      maxFrac: 1,
      fields: fields.map((f, i) => ({
        ...f,
        row: i,
        col: 0,
        // The target language leads on the left, the reader's language answers on
        // the right, so the eye still has the two-column pairing to follow.
        align: TARGET_SIDE.has(f.field) ? 'start' : 'end',
      })),
    };
  }

  // Two columns: target side left, reader side right, each stacked in order.
  let leftRow = 0;
  let rightRow = 0;
  return {
    ...template,
    rows: Math.max(
      fields.filter((f) => TARGET_SIDE.has(f.field)).length,
      fields.filter((f) => !TARGET_SIDE.has(f.field)).length,
      1,
    ),
    cols: 2,
    fields: fields.map((f) => {
      const left = TARGET_SIDE.has(f.field);
      return {
        ...f,
        col: left ? 0 : 1,
        row: left ? leftRow++ : rightRow++,
        align: left ? 'start' : 'end',
      };
    }),
  };
}

/**
 * The cell layout of an arrangement, for drawing it as a diagram. Mirrors
 * `arrangeTemplate` without needing a theme.
 * @param {Arrangement} arrangement
 * @param {FieldId[]} shownFields
 */
export function arrangementShape(arrangement, shownFields) {
  const fields = ORDER.filter((f) => shownFields.includes(f));
  if (!fields.length) return { rows: 1, cols: 1, cells: [] };
  const minor = (/** @type {FieldId} */ f) => f === 'roman' || f === 'respell' || f === 'ipa';

  if (arrangement === 'one-row') {
    return {
      rows: 1,
      cols: fields.length,
      cells: fields.map((f, i) => ({
        row: 0, col: i, align: i === fields.length - 1 ? 'end' : 'start', minor: minor(f),
      })),
    };
  }
  if (arrangement === 'stacked') {
    return {
      rows: fields.length,
      cols: 1,
      cells: fields.map((f, i) => ({
        row: i, col: 0, align: TARGET_SIDE.has(f) ? 'start' : 'end', minor: minor(f),
      })),
    };
  }
  let leftRow = 0;
  let rightRow = 0;
  const cells = fields.map((f) => {
    const left = TARGET_SIDE.has(f);
    return {
      row: left ? leftRow++ : rightRow++,
      col: left ? 0 : 1,
      align: left ? 'start' : 'end',
      minor: minor(f),
    };
  });
  return { rows: Math.max(leftRow, rightRow, 1), cols: 2, cells };
}
