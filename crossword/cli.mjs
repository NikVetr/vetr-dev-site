#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg dir]
//   node cli.mjs < request.json
// Prints the result JSON on stdout. A request may give its target picture as a PNG
// file, "target": {"png": "heart.png"}, read relative to the request file (or the
// current directory for stdin). Errors go to stderr as {"error": {...}} JSON: exit 1
// for an invalid request or a search that failed, 2 for a usage problem. See api.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CrosswordError, renderPuzzleSvg, renderSvg, submit } from './core/index.js';
import { decodePng } from '../shared/decode-png.mjs';

const USAGE = 'usage: node cli.mjs [request.json | -] [--svg dir]; reads the request from stdin when no file is given';

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
let svgDir = null;
const svgFlag = args.indexOf('--svg');
if (svgFlag !== -1) {
  svgDir = args[svgFlag + 1];
  if (!svgDir) fail('usage', `--svg needs a directory; ${USAGE}`, 2);
  args.splice(svgFlag, 2);
}
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

// A PNG target is decoded here and passed on as RGBA pixels, which the core reads.
const target = request?.target;
if (target && typeof target === 'object' && typeof target.png === 'string' && !('rgba' in target) && !('mask' in target)) {
  const path = resolve(input === '-' ? '.' : dirname(input), target.png);
  let image;
  try {
    image = decodePng(readFileSync(path));
  } catch (error) {
    fail('unreadable_input', `cannot read the target picture ${path}: ${/** @type {Error} */ (error).message}`, 2);
  }
  const { png, ...rest } = target;
  request.target = { ...rest, rgba: { width: image.width, height: image.height, data: Buffer.from(image.data).toString('base64') } };
}

try {
  const result = submit(request);
  if (svgDir) {
    mkdirSync(svgDir, { recursive: true });
    result.crosswords.forEach((crossword, i) => {
      for (const stage of /** @type {const} */ (['orig', 'refined'])) {
        writeFileSync(join(svgDir, `crossword-${i + 1}-${stage}.svg`), renderSvg(crossword[stage]));
        writeFileSync(join(svgDir, `crossword-${i + 1}-${stage}-blank.svg`), renderSvg(crossword[stage], { style: 'blank' }));
        writeFileSync(join(svgDir, `crossword-${i + 1}-${stage}-puzzle.svg`), renderPuzzleSvg(crossword[stage]));
      }
    });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof CrosswordError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
