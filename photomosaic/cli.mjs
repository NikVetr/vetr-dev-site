#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs --target target.png --photos folder/ [options]   the request built from images
//   node cli.mjs request.json [options]                           or a request as JSON ("-" or none: stdin)
// Prints the result JSON on stdout. Options --columns, --max-uses, --metric and --seed set those
// request fields. With images, --png file also draws the mosaic (--tile-width, --fit, --tint)
// and --request-out file writes the request built. Photos are the folder's .png, .jpg and .jpeg
// files, by name; PNG reads with crossword's decoder, JPEG with the vendored jpeg-js decoder.
// Errors go to stderr as {"error": {...}} JSON: exit 1 for an invalid request or JSON, 2 for
// a usage problem or an unreadable file. See api.md.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { decodePng } from '../crossword/decode-png.mjs';
import { FITS, PhotomosaicError, composeMosaic, layoutMosaic, submit, summarisePhoto } from './core/index.js';
import decodeJpeg from './vendor/jpeg-js-decoder.cjs';

const USAGE = 'usage: node cli.mjs (--target image --photos folder | request.json | -) [--columns n] [--max-uses k] [--metric hsl-r|lab] [--seed n] [--png out.png [--tile-width px] [--fit keep|crop] [--tint 0-1]] [--request-out file]';
/** The extensions the R script reads (it passes them to ImageMagick); this reads the first three. */
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.heic', '.gif', '.tiff', '.bmp'];

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
const flags = {};
const VALUE_FLAGS = ['--target', '--photos', '--columns', '--max-uses', '--metric', '--seed', '--png', '--tile-width', '--fit', '--tint', '--request-out'];
/** @type {string[]} */
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (VALUE_FLAGS.includes(args[i])) {
    if (args[i + 1] === undefined) fail('usage', `${args[i]} needs a value; ${USAGE}`, 2);
    flags[args[i]] = args[++i];
  } else if (args[i].startsWith('--')) {
    fail('usage', `unknown option ${args[i]}; ${USAGE}`, 2);
  } else {
    positional.push(args[i]);
  }
}
const fromImages = '--target' in flags || '--photos' in flags;
if (fromImages && (!flags['--target'] || !flags['--photos'] || positional.length)) fail('usage', `give --target and --photos together, without a request file; ${USAGE}`, 2);
if (!fromImages && (positional.length > 1 || ['--png', '--request-out'].some((f) => f in flags))) fail('usage', `--png and --request-out need --target and --photos; ${USAGE}`, 2);

/** A whole or decimal number from a flag, or the flag's text if it is not one (submit() then rejects it). @param {string} text */
const numberOr = (text) => (text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : text);

// the drawing's options, checked before any work
const tileWidth = Number(flags['--tile-width'] ?? '200');
const fit = /** @type {import('./core/layout.js').Fit} */ (flags['--fit'] ?? 'keep');
const tint = Number(flags['--tint'] ?? '0');
if (['--tile-width', '--fit', '--tint'].some((f) => f in flags) && !flags['--png']) fail('usage', `--tile-width, --fit and --tint go with --png; ${USAGE}`, 2);
if (!Number.isInteger(tileWidth) || tileWidth < 1) fail('usage', '--tile-width must be a whole number of pixels >= 1', 2);
if (!FITS.includes(fit)) fail('usage', `--fit must be one of ${FITS.join(', ')}`, 2);
if (!(tint >= 0 && tint <= 1)) fail('usage', '--tint must be a number from 0 to 1', 2);

/** @param {string} path */
function readImage(path) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (error) {
    fail('unreadable_input', `cannot read ${path}: ${/** @type {Error} */ (error).message}`, 2);
  }
  try {
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
  } catch (error) {
    fail('unreadable_input', `${path} could not be decoded: ${/** @type {Error} */ (error).message}`, 2);
  }
  fail('unreadable_input', `${path} is not a PNG or JPEG; the command line reads only those (the web page reads what the browser can)`, 2);
}

/** @param {string} folder */
function photoFiles(folder) {
  let names;
  try {
    names = readdirSync(folder);
  } catch (error) {
    fail('unreadable_input', `cannot read the folder ${folder}: ${/** @type {Error} */ (error).message}`, 2);
  }
  const images = names.filter((n) => IMAGE_EXTENSIONS.includes(extname(n).toLowerCase())).sort();
  const unsupported = images.filter((n) => !['.png', '.jpg', '.jpeg'].includes(extname(n).toLowerCase()));
  if (unsupported.length) fail('unreadable_input', `the command line reads PNG and JPEG only; convert these first: ${unsupported.join(', ')}`, 2);
  if (!images.length) fail('unreadable_input', `${folder} has no .png, .jpg or .jpeg files`, 2);
  return images.map((n) => join(folder, n));
}

/** @returns {Promise<string>} */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/** An opaque RGB PNG of RGBA pixels. @param {number} width @param {number} height @param {Uint8ClampedArray} rgba */
function encodePng(width, height, rgba) {
  const stride = 3 * width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = 4 * (y * width + x);
      raw.set(rgba.subarray(s, s + 3), y * stride + 1 + 3 * x);
    }
  }
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ body) => {
    const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(typed));
    return Buffer.concat([head, typed, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** @type {Record<string, any>} */
let request;
/** @type {string[]} */
let files = [];
/** @type {{ width: number, height: number }[]} */
const sizes = [];
if (fromImages) {
  const target = readImage(flags['--target']);
  files = photoFiles(flags['--photos']);
  request = {
    target: { width: target.width, height: target.height, data: Buffer.from(target.data).toString('base64') },
    photos: files.map((f) => {
      const photo = readImage(f);
      sizes.push({ width: photo.width, height: photo.height });
      return { name: basename(f), mean: summarisePhoto(photo) };
    }),
  };
} else {
  const input = positional[0] ?? '-';
  if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);
  let text = '';
  try {
    text = input === '-' ? await readStdin() : readFileSync(input, 'utf8');
  } catch (error) {
    fail('unreadable_input', `cannot read ${input === '-' ? 'stdin' : input}: ${/** @type {Error} */ (error).message}`, 2);
  }
  try {
    request = JSON.parse(text);
  } catch (error) {
    fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
  }
}
for (const [flag, field] of [['--columns', 'columns'], ['--max-uses', 'maxUses'], ['--metric', 'metric'], ['--seed', 'seed']]) {
  if (flag in flags) request[field] = field === 'metric' ? flags[flag] : numberOr(flags[flag]);
}

let result;
try {
  result = submit(request);
} catch (error) {
  if (!(error instanceof PhotomosaicError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
if (flags['--request-out']) writeFileSync(flags['--request-out'], `${JSON.stringify(request)}\n`);
if (flags['--png']) {
  const layout = layoutMosaic(result.grid, result.assignment, sizes, { tileWidth, fit });
  const pixels = composeMosaic(layout, (photo) => readImage(files[photo]), result.cells, tint);
  writeFileSync(flags['--png'], encodePng(layout.width, layout.height, pixels));
}
process.stdout.write(`${JSON.stringify(result)}\n`);
