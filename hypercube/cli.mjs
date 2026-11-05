#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json                  result JSON on stdout
//   node cli.mjs < request.json                (or "-")
//   node cli.mjs request.json --svg frame.svg  also write the SVG (left out of the JSON)
//   node cli.mjs request.json --frames 1-1448:2 --out dir
//                                              one SVG per listed frame, dir/frame-00001.svg ...
//   --plan plan.json                           use another exported plan instead of plans/k<k>.json
// Errors go to stderr as {"error": {...}} JSON: exit 1 for an invalid request or plan,
// 2 for a usage problem or an unreadable file. See api.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePlan, HypercubeError, SHIPPED_K, submit } from './core/index.js';

const USAGE = 'usage: node cli.mjs [request.json | -] [--svg frame.svg | --frames 1,5,10-20:2 --out dir] [--plan plan.json]; reads the request from stdin when no file is given';
const here = dirname(fileURLToPath(import.meta.url));

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
function option(flag) {
  const at = args.indexOf(flag);
  if (at === -1) return null;
  const value = args[at + 1];
  if (!value || value.startsWith('--')) fail('usage', `${flag} needs a value; ${USAGE}`, 2);
  args.splice(at, 2);
  return value;
}
const svgPath = option('--svg');
const framesText = option('--frames');
const outDir = option('--out');
const planPath = option('--plan');
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('usage', USAGE, 2);
if (svgPath && framesText) fail('usage', `give --svg or --frames, not both; ${USAGE}`, 2);
if (Boolean(framesText) !== Boolean(outDir)) fail('usage', `--frames and --out go together; ${USAGE}`, 2);
const input = args[0] ?? '-';
if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);

/** @param {string} path @param {string} what */
function read(path, what) {
  try {
    return readFileSync(path === '-' ? 0 : path, 'utf8');
  } catch (error) {
    return fail('unreadable_input', `cannot read ${what} ${path === '-' ? 'stdin' : path}: ${/** @type {Error} */ (error).message}`, 2);
  }
}

/** @type {any} */
let request;
try {
  request = JSON.parse(read(input, 'the request'));
} catch (error) {
  fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
}

/** "1,5,10-20:2" → [1, 5, 10, 12, ..., 20] @param {string} text */
function parseFrames(text) {
  /** @type {number[]} */
  const frames = [];
  for (const part of text.split(',')) {
    const match = /^(\d+)(?:-(\d+)(?::(\d+))?)?$/.exec(part.trim());
    if (!match) fail('usage', `--frames takes frame numbers and ranges such as 1,5,10-20:2; "${part}" is neither`, 2);
    const from = Number(match[1]);
    const to = match[2] === undefined ? from : Number(match[2]);
    const by = match[3] === undefined ? 1 : Number(match[3]);
    if (to < from || by < 1) fail('usage', `--frames range "${part}" must run upwards with a positive step`, 2);
    for (let f = from; f <= to; f += by) frames.push(f);
  }
  return frames;
}

/** @param {number} k */
function planFor(k) {
  if (!planPath && !SHIPPED_K.includes(k)) {
    throw new HypercubeError('plan_unavailable', `No plan ships for k = ${k}; the plans are for k = ${SHIPPED_K.join(', ')}`, [{ code: 'plan_unavailable', path: 'k', message: `plans exist for ${SHIPPED_K.join(', ')}` }]);
  }
  return decodePlan(read(planPath ?? join(here, 'plans', `k${k}.json`), 'the plan'));
}

try {
  if (framesText) {
    const frames = parseFrames(framesText);
    if (Object.hasOwn(request ?? {}, 'frame') || Object.hasOwn(request ?? {}, 't')) fail('usage', '--frames sets the frames; leave "frame" and "t" out of the request', 2);
    if ((request?.render ?? 'svg') !== 'svg') fail('usage', '--frames writes SVG; leave "render" out or set it to "svg"', 2);
    let plan = null;
    const files = [];
    mkdirSync(/** @type {string} */ (outDir), { recursive: true });
    for (const frame of frames) {
      const result = /** @type {any} */ (submit({ ...request, frame, render: 'svg' }, (k) => (plan ??= planFor(k))));
      const file = join(/** @type {string} */ (outDir), `frame-${String(frame).padStart(5, '0')}.svg`);
      writeFileSync(file, result.svg);
      files.push({ frame, file, stage: result.stage.label });
    }
    process.stdout.write(`${JSON.stringify({ k: request.k, frames: files })}\n`);
  } else {
    const result = /** @type {any} */ (submit(request, planFor));
    if (svgPath) {
      if (!result.svg) fail('usage', '--svg needs render "svg" (the default)', 2);
      writeFileSync(svgPath, result.svg);
      delete result.svg;
      result.svgFile = svgPath;
    }
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
} catch (error) {
  if (!(error instanceof HypercubeError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
