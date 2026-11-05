#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg fill.svg] [--background black]
//   node cli.mjs < request.json
// In a request read here, "image" may also be the path of a PNG file, relative
// to the request file (or to the working directory for stdin). Prints the
// result JSON on stdout. Errors go to stderr as {"error": {...}} JSON: exit 1
// for an invalid request, 2 for a usage problem. See api.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TextInImageError, renderSvg, submit } from './core/index.js';
import { parseColor } from './core/request.js';
import { decodePng } from './decode-png.mjs';

const USAGE = 'usage: node cli.mjs [request.json | -] [--svg fill.svg] [--background colour]; reads the request from stdin when no file is given';

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
/** @param {string} flag */
const option = (flag) => {
  const at = args.indexOf(flag);
  if (at === -1) return null;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) fail('usage', `${flag} needs a value; ${USAGE}`, 2);
  args.splice(at, 2);
  return value;
};
const svgPath = option('--svg');
const background = option('--background') ?? 'black';
if (!parseColor(background)) fail('usage', `--background must be a colour written #rrggbb or #rgb, or "black" or "white"; ${USAGE}`, 2);
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('usage', USAGE, 2);
const input = args[0] ?? '-';
if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);

let text = '';
try {
  text = readFileSync(input === '-' ? 0 : input, 'utf8');
} catch (error) {
  fail('unreadable_input', `cannot read ${input === '-' ? 'stdin' : input}: ${/** @type {Error} */ (error).message}`, 2);
}

/** @type {any} */
let request;
try {
  request = JSON.parse(text);
} catch (error) {
  fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
}

try {
  if (typeof request?.image === 'string') request = { ...request, image: readImage(request.image) };
  const result = submit(request);
  if (svgPath) writeFileSync(svgPath, renderSvg(result, { background }));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof TextInImageError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}

/** @param {string} path */
function readImage(path) {
  const file = resolve(input === '-' ? '.' : dirname(input), path);
  /** @param {string} message @returns {never} */
  const unreadable = (message) => {
    const issue = { code: 'unreadable_image', path: 'image', message: `${file}: ${message}` };
    throw new TextInImageError('invalid_request', `Invalid request: image: ${issue.message}`, [issue]);
  };
  /** @type {Buffer} */
  let bytes = Buffer.alloc(0);
  try {
    bytes = readFileSync(file);
  } catch (error) {
    unreadable(`cannot read the file (${/** @type {Error} */ (error).message})`);
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) unreadable('is a JPEG; the command line reads PNG only, so convert it to PNG first (the web page reads JPEG)');
  try {
    return decodePng(bytes);
  } catch (error) {
    return unreadable(/** @type {Error} */ (error).message);
  }
}
