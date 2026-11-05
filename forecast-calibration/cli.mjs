#!/usr/bin/env node
// Command-line access to the same submit() the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg plot.svg]
//   node cli.mjs < request.json
// Prints the result JSON on stdout. Errors go to stderr as {"error": {...}} JSON:
// exit 1 for an invalid request, 2 for a usage problem. See api.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { ForecastCalibrationError, renderSvg, submit } from './core/index.js';

const USAGE = 'usage: node cli.mjs [request.json | -] [--svg plot.svg]; reads the request from stdin when no file is given';

/** @param {string} code @param {string} message @param {number} exitCode */
function fail(code, message, exitCode) {
  process.stderr.write(`${JSON.stringify({ error: { code, message, issues: [] } })}\n`);
  process.exit(exitCode);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`${USAGE}\n`);
  process.exit(0);
}
let svgPath = null;
const svgFlag = args.indexOf('--svg');
if (svgFlag !== -1) {
  svgPath = args[svgFlag + 1];
  if (!svgPath) fail('usage', `--svg needs a file name; ${USAGE}`, 2);
  args.splice(svgFlag, 2);
}
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('usage', USAGE, 2);
const input = args[0] ?? '-';
if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);

let text;
try {
  text = readFileSync(input === '-' ? 0 : input, 'utf8');
} catch (error) {
  fail('unreadable_input', `cannot read ${input === '-' ? 'stdin' : input}: ${/** @type {Error} */ (error).message}`, 2);
}

let request;
try {
  request = JSON.parse(/** @type {string} */ (text));
} catch (error) {
  fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
}

try {
  const result = submit(request);
  if (svgPath) writeFileSync(svgPath, renderSvg(result));
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof ForecastCalibrationError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
