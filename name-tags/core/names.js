// Names and their lines (R's names.R): a tag holds one or two lines, split
// after the first word or at an explicit "|"; a one-word name is one line.
// Top lines with descenders (y q p g j) sit badly over the bottom line, so
// those names are set in capitals (and later in small caps).

/** R's toupper: character by character, leaving letters with no single-character capital (ß) alone. @param {string} s */
export function toUpper(s) {
  return [...s].map((c) => {
    const u = c.toUpperCase();
    return [...u].length === 1 ? u : c;
  }).join('');
}

/** R's tolower, character by character. @param {string} s */
export function toLower(s) {
  return [...s].map((c) => {
    const l = c.toLowerCase();
    return [...l].length === 1 ? l : c;
  }).join('');
}

/**
 * The lines of a name, or an error message.
 * @param {string} name
 * @returns {string[] | string}
 */
export function splitNameLines(name) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.includes('|')) {
    const lines = clean.split('|').map((l) => l.trim());
    if (clean.endsWith('|')) lines.pop(); // R's strsplit drops one trailing empty piece
    if (lines.length !== 2 || lines.some((l) => l === '')) return `use exactly one "|" between two non-empty lines: ${JSON.stringify(name)}`;
    return lines;
  }
  const words = clean.split(' ');
  return words.length === 1 ? words : [words[0], words.slice(1).join(' ')];
}

/** @param {string} text */
export const hasDescender = (text) => /[yqpgj]/.test(text);

/** @param {string[]} lines */
export const applyCapsRule = (lines) => (hasDescender(lines[0]) ? lines.map(toUpper) : lines);

/**
 * Names from a text file's contents: one per line, trimmed, blank lines skipped.
 * @param {string} text
 */
export function parseNamesText(text) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
}

/**
 * Names (and optional per-name logo references) from CSV text with a `name`
 * column and an optional `logo` column, as R's read.csv reads them.
 * @param {string} text
 * @returns {{ name: string, logo: string | null }[] | string} rows, or an error message
 */
export function parseNamesCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return 'the CSV is empty';
  const header = rows[0].map((h) => h.trim());
  const ni = header.indexOf('name');
  if (ni < 0) return 'the CSV needs a "name" column';
  const li = header.indexOf('logo');
  return rows.slice(1)
    .map((r) => ({ name: (r[ni] ?? '').trim(), logo: li >= 0 && (r[li] ?? '').trim() !== '' ? r[li].trim() : null }))
    .filter((r) => r.name !== '');
}

/** RFC 4180 fields: commas, double quotes doubled inside quoted fields. @param {string} text */
function parseCsv(text) {
  /** @type {string[][]} */
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}
