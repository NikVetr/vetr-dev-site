// RFC 4180 CSV. The repo's other CSV-ish helper (agendamatic/js/bulk-edit.js)
// uses backslash escapes rather than quoting, so it is not reusable here.

/**
 * @param {string} text
 * @returns {string[][]} rows of raw cells, NFC-normalised, BOM stripped
 */
export function parseRows(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  /** @type {string[][]} */ const rows = [];
  /** @type {string[]} */ let row = [];
  let cell = '';
  let quoted = false;
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === '') { quoted = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\n' || c === '\r') {
      row.push(cell); rows.push(row); row = []; cell = '';
      i += c === '\r' && src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.normalize('NFC')));
}

/**
 * Parse into objects keyed by the header row. Blank lines are skipped; a row
 * with the wrong cell count is an error rather than a silent partial record.
 * @param {string} text
 * @param {string} [label] file name, for error messages
 * @returns {Record<string,string>[]}
 */
export function parseTable(text, label = 'csv') {
  const rows = parseRows(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r, n) => {
    if (r.length !== header.length) {
      throw new Error(`${label}: row ${n + 2} has ${r.length} cells, expected ${header.length}`);
    }
    /** @type {Record<string,string>} */ const obj = {};
    header.forEach((h, k) => { obj[h] = r[k]; });
    return obj;
  });
}

// A leading =, +, - or @ makes spreadsheets treat the cell as a formula, so we
// prefix an apostrophe on export. Import strips it back off.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** @param {string} value */
function encodeCell(value) {
  const v = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** @param {string} value */
export function stripFormulaGuard(value) {
  return value.startsWith("'") && FORMULA_LEAD.test(value.slice(1)) ? value.slice(1) : value;
}

/**
 * @param {string[]} header
 * @param {Record<string,string>[]} records
 * @param {{bom?:boolean}} [opts] BOM makes Excel read UTF-8 correctly
 */
export function serialize(header, records, opts = {}) {
  const lines = [header.map(encodeCell).join(',')];
  for (const rec of records) lines.push(header.map((h) => encodeCell(rec[h] ?? '')).join(','));
  return (opts.bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}
