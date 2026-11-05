#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg out.svg]
//   node cli.mjs < request.json
//   node cli.mjs --image in.png [--svg out.svg]     (the defaults, for one PNG)
// In a request read here, "image" may also be the path of a PNG file, relative
// to the request file (or to the working directory); --image sets it. Prints
// the result JSON on stdout. Errors go to stderr as {"error": {...}} JSON:
// exit 1 for an invalid request or a stage that failed, 2 for a usage problem.
// See api.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { RasterToVectorError, submit } from './core/index.js';
import { decodePng } from './decode-png.mjs';

const USAGE = 'usage: node cli.mjs [request.json | -] [--image in.png] [--svg out.svg]; reads the request from stdin when neither a file nor --image is given';

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
  if (!value || value.startsWith('--')) fail('USAGE', `${flag} needs a value; ${USAGE}`, 2);
  args.splice(at, 2);
  return value;
};
const svgPath = option('--svg');
const imagePath = option('--image');
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('USAGE', USAGE, 2);
const input = args[0] ?? (imagePath ? null : '-');
if (input === '-' && process.stdin.isTTY) fail('USAGE', USAGE, 2);

/** @type {any} */
let request = {};
if (input !== null) {
  let text = '';
  try {
    text = readFileSync(input === '-' ? 0 : input, 'utf8');
  } catch (error) {
    fail('UNREADABLE_INPUT', `cannot read ${input === '-' ? 'stdin' : input}: ${/** @type {Error} */ (error).message}`, 2);
  }
  try {
    request = JSON.parse(text);
  } catch (error) {
    fail('INVALID_JSON', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
  }
}

try {
  if (imagePath) request = { ...request, image: readImage(resolve(imagePath)) };
  else if (typeof request?.image === 'string') request = { ...request, image: readImage(resolve(input === '-' || input === null ? '.' : dirname(input), request.image)) };
  const result = submit(request);
  if (svgPath) writeFileSync(svgPath, result.svg);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof RasterToVectorError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}

/** @param {string} file */
function readImage(file) {
  /** @param {string} message @returns {never} */
  const unreadable = (message) => {
    const issue = { code: 'INVALID_IMAGE', path: 'image', message: `${file}: ${message}` };
    throw new RasterToVectorError('INVALID_REQUEST', `Invalid request: image: ${issue.message}`, [issue]);
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
    const png = decodePng(bytes);
    return { width: png.width, height: png.height, data: png.data };
  } catch (error) {
    return unreadable(/** @type {Error} */ (error).message);
  }
}
