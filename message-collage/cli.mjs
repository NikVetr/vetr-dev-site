#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg card.svg] [--text outlines|embedded] [--pdf card.pdf]
//   node cli.mjs --messages messages.txt [request.json] [--svg card.svg]   (no stdin read)
//   node cli.mjs < request.json
// Prints the result JSON on stdout. --messages reads the messages from a text file, one per line
// (blank lines skipped), in place of the request's. --svg writes the card with its text as glyph
// outlines (or, with --text embedded, as selectable text in embedded fonts); --pdf writes it with
// outlines. Errors go to stderr as {"error": {...}} JSON: exit 1 for an invalid request, invalid
// JSON or a layout that failed, 2 for a usage problem or an unreadable file. See api.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { CollageError, loadFaces, parseMessages, renderPdf, renderSvg, submit } from './core/index.js';

const USAGE = 'usage: node cli.mjs [request.json | -] [--messages file.txt] [--svg card.svg] [--text outlines|embedded] [--pdf card.pdf]; reads the request from stdin when no file is given';

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
/** @type {Record<string, string>} */
const options = {};
for (const flag of ['--messages', '--svg', '--text', '--pdf']) {
  const at = args.indexOf(flag);
  if (at === -1) continue;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) fail('usage', `${flag} needs a value; ${USAGE}`, 2);
  options[flag.slice(2)] = value;
  args.splice(at, 2);
}
if (options.text && !['outlines', 'embedded'].includes(options.text)) fail('usage', `--text is outlines or embedded; ${USAGE}`, 2);
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('usage', USAGE, 2);
const input = args[0] ?? (options.messages ? null : '-');
if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);

/** All of stdin, read as a stream (a synchronous read of a pipe can fail before the writer is done). */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** @param {string} path */
async function read(path) {
  try {
    return path === '-' ? await readStdin() : readFileSync(path, 'utf8');
  } catch (error) {
    return fail('unreadable_input', `cannot read ${path === '-' ? 'stdin' : path}: ${/** @type {Error} */ (error).message}`, 2);
  }
}

/** @type {any} */
let request = {};
if (input !== null) {
  const text = await read(input);
  try {
    request = JSON.parse(text);
  } catch (error) {
    fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
  }
}
if (options.messages) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) fail('invalid_request', 'the request must be a JSON object', 1);
  request.messages = parseMessages(await read(options.messages));
}

try {
  const result = await submit(request);
  if (options.svg || options.pdf) {
    const faces = await loadFaces(result.request.fonts, result.request.styles);
    if (options.svg) writeFileSync(options.svg, renderSvg(result, faces, { text: /** @type {'outlines' | 'embedded'} */ (options.text ?? 'outlines') }));
    if (options.pdf) writeFileSync(options.pdf, renderPdf(result, faces));
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof CollageError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
