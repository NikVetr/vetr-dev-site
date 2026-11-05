#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg out.svg] [--frames dir]
//   node cli.mjs signature.csv|signature.svg [--svg out.svg]   (the defaults)
//   node cli.mjs < request.json
// In a request read here, the signature may be given as "file": a path to a
// .csv, .svg or .json (a strokes array or {strokes}) file, relative to the
// request file; morph.target may be {"file": ...} too. Prints the result JSON on
// stdout, or with --svg writes the SVG there ("--svg -" prints only the SVG).
// --frames writes each morph frame as dir/frame-0001.svg and so on. Errors go
// to stderr as {"error": {...}} JSON: exit 1 for an invalid request, 2 for a
// usage problem. See api.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { outlineSvg, SignatureError, submit } from './core/index.js';

const USAGE = 'usage: node cli.mjs [request.json | signature.csv | signature.svg | -] [--svg out.svg | --svg -] [--frames dir]; reads a JSON request from stdin when no file is given';

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
  if (!value || (value.startsWith('--'))) fail('USAGE', `${flag} needs a value; ${USAGE}`, 2);
  args.splice(at, 2);
  return value;
};
const svgPath = option('--svg');
const framesDir = option('--frames');
if (args.length > 1 || args.some((a) => a.startsWith('--'))) fail('USAGE', USAGE, 2);

/** @param {string} path */
const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    return fail('FILE_NOT_READ', `cannot read ${path}: ${/** @type {Error} */ (e).message}`, 2);
  }
};

/** A signature file as the request field it fills. @param {string} path */
function signatureFile(path) {
  const ext = extname(path).toLowerCase();
  const text = read(path);
  if (ext === '.csv') return { csv: text };
  if (ext === '.svg') return { svg: text };
  if (ext === '.json') {
    const v = JSON.parse(text);
    return { strokes: Array.isArray(v) ? v : v.strokes };
  }
  return fail('USAGE', `${path}: a signature file must be .csv, .svg or .json`, 2);
}

/** Replaces a "file" field by the signature it names. @param {Record<string, any>} obj @param {string} base */
function withFile(obj, base) {
  if (!obj || typeof obj !== 'object' || typeof obj.file !== 'string') return obj;
  const { file, ...rest } = obj;
  return { ...rest, ...signatureFile(resolve(base, file)) };
}

const source = args[0] ?? '-';
/** @type {any} */
let request;
let base = process.cwd();
if (source !== '-' && ['.csv', '.svg'].includes(extname(source).toLowerCase())) request = signatureFile(source);
else {
  const text = source === '-' ? readFileSync(0, 'utf8') : read(source);
  if (source !== '-') base = dirname(resolve(source));
  try {
    request = JSON.parse(text);
  } catch (e) {
    fail('INVALID_JSON', `the request is not JSON: ${/** @type {Error} */ (e).message}`, 1);
  }
  request = withFile(request, base);
  if (request?.morph?.target) request.morph = { ...request.morph, target: withFile(request.morph.target, base) };
}

try {
  const result = submit(request);
  if (framesDir) {
    if (!result.morph) fail('USAGE', '--frames needs a request with a morph', 2);
    mkdirSync(framesDir, { recursive: true });
    result.morph.frames.forEach((f, i) => {
      const strokes = f.strokes.map((s) => ({ x: s.points.map((p) => p[0]), y: s.points.map((p) => p[1]) }));
      const widths = f.strokes.map((s) => s.points.map((p) => p[2]));
      const live = strokes.map((_, k) => k).filter((k) => widths[k].some((w) => w > 0));
      const { svg } = outlineSvg(live.map((k) => strokes[k]), live.map((k) => widths[k]), result.height, result.settings.output);
      writeFileSync(join(framesDir, `frame-${String(i + 1).padStart(4, '0')}.svg`), svg);
    });
  }
  if (svgPath === '-') process.stdout.write(result.svg);
  else {
    if (svgPath) writeFileSync(svgPath, result.svg);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (e) {
  if (e instanceof SignatureError) {
    process.stderr.write(`${JSON.stringify(e.toJSON())}\n`);
    process.exit(1);
  }
  throw e;
}
