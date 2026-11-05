#!/usr/bin/env node
// Command-line access to the same submit() the gallery's pages use. Needs only Node 22.
//   node cli.mjs request.json
//   node cli.mjs < request.json
// Prints {entry, params, result} as JSON on stdout. Errors go to stderr as
// {"error": {...}} JSON: exit 1 for an invalid request, 2 for a usage problem. See api.md.

import { readFileSync } from 'node:fs';
import { IntuitionsError, submit } from './api.js';

const USAGE = 'usage: node cli.mjs [request.json | -]; reads the request from stdin when no file is given';

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
if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) fail('usage', USAGE, 2);
const input = args[0] ?? '-';
if (input === '-' && process.stdin.isTTY) fail('usage', USAGE, 2);

let text = '';
try {
  text = readFileSync(input === '-' ? 0 : input, 'utf8');
} catch (error) {
  fail('unreadable_input', `cannot read ${input === '-' ? 'stdin' : input}: ${/** @type {Error} */ (error).message}`, 2);
}

let request;
try {
  request = JSON.parse(text);
} catch (error) {
  fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
}

try {
  process.stdout.write(`${JSON.stringify(submit(request))}\n`);
} catch (error) {
  if (!(error instanceof IntuitionsError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
