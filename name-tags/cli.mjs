#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--out dir]
//   node cli.mjs < request.json
// Writes one SVG per sheet and prints the result JSON, each sheet's SVG text
// replaced by the path it was written to. As in the R version's CLI, files may
// be given by path, read relative to the request file (or the current
// directory for stdin): "names_file" (.txt, or .csv with name and optional
// logo columns), "tray" as a tray JSON file, and "logo.file" (.svg, .png or
// .jpg). Sheets go to --out, else output.dir, else the current directory.
// Errors go to stderr as {"error": {...}} JSON: exit 1 for an invalid request,
// 2 for a usage problem or an unreadable file. See api.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { NameTagsError, parseNamesCsv, parseNamesText, submit, TRAY_PRESETS } from './core/index.js';

const USAGE = 'usage: node cli.mjs [request.json | -] [--out dir]; reads the request from stdin when no file is given';

/** @param {string} code @param {string} message @param {number} exitCode @returns {never} */
function fail(code, message, exitCode) {
  process.stderr.write(`${JSON.stringify({ error: { code, message, issues: [] } })}\n`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
let outDir = null;
const outFlag = args.indexOf('--out');
if (outFlag !== -1) {
  outDir = args[outFlag + 1];
  if (!outDir) fail('usage', `--out needs a directory; ${USAGE}`, 2);
  args.splice(outFlag, 2);
}
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('usage', USAGE, 2);
const input = args[0] ?? '-';
if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);
const base = input === '-' ? '.' : dirname(input);

/** @param {string | 0} path a path, or 0 for stdin @param {string} what @param {BufferEncoding} [encoding] */
function read(path, what, encoding) {
  try {
    const file = path === 0 ? 0 : resolve(base, path);
    return encoding ? readFileSync(file, encoding) : readFileSync(file);
  } catch (error) {
    return fail('unreadable_input', `cannot read ${what}${path === 0 ? '' : ` ${resolve(base, path)}`}: ${/** @type {Error} */ (error).message}`, 2);
  }
}

/** A logo file as the data: URL the core takes. @param {string} path */
function logoUrl(path) {
  if (path.startsWith('data:')) return path;
  const ext = extname(path).toLowerCase();
  const type = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[ext];
  if (!type) fail('unreadable_input', `unsupported logo format "${ext}" (use .svg, .png or .jpg): ${path}`, 2);
  return `data:${type};base64,${Buffer.from(read(path, 'the logo')).toString('base64')}`;
}

/** @type {any} */
let request;
try {
  request = JSON.parse(String(read(input === '-' ? 0 : resolve(input), input === '-' ? 'stdin' : 'the request', 'utf8')));
} catch (error) {
  fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
}

if (request && typeof request === 'object' && !Array.isArray(request)) {
  if (typeof request.names_file === 'string') {
    const file = request.names_file;
    if (request.names !== undefined) fail('usage', 'give either names or names_file, not both', 2);
    const text = String(read(file, 'the names file', 'utf8'));
    if (extname(file).toLowerCase() === '.csv') {
      const rows = parseNamesCsv(text);
      if (typeof rows === 'string') fail('unreadable_input', `${file}: ${rows}`, 2);
      request.names = rows.map((r) => (r.logo ? { name: r.name, logo: logoUrl(r.logo) } : r.name));
    } else {
      request.names = parseNamesText(text);
    }
    delete request.names_file;
    // as the R CLI: the sheets are named after the names file
    request.output = { prefix: basename(file, extname(file)).replace(/_names$/, ''), ...request.output };
  }
  if (typeof request.tray === 'string' && !Object.hasOwn(TRAY_PRESETS, request.tray) && /\.json$/i.test(request.tray)) {
    try {
      request.tray = JSON.parse(String(read(request.tray, 'the tray file', 'utf8')));
    } catch (error) {
      fail('invalid_json', `the tray file is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
    }
  }
  if (request.logo && typeof request.logo.file === 'string') request.logo = { ...request.logo, file: logoUrl(request.logo.file) };
  if (Array.isArray(request.names)) {
    request.names = request.names.map((/** @type {any} */ n) => (n && typeof n.logo === 'string' ? { ...n, logo: logoUrl(n.logo) } : n));
  }
}

try {
  const result = submit(request);
  const dir = outDir ? resolve(outDir) : resolve(base, request.output?.dir ?? '.');
  mkdirSync(dir, { recursive: true });
  const sheets = result.sheets.map(({ svg, ...sheet }) => {
    const path = join(dir, sheet.file);
    writeFileSync(path, svg);
    const rel = relative(process.cwd(), path);
    return { ...sheet, path: rel.startsWith('..') ? path : rel };
  });
  process.stdout.write(`${JSON.stringify({ ...result, sheets })}\n`);
} catch (error) {
  if (!(error instanceof NameTagsError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
