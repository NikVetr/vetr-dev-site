#!/usr/bin/env node
// Command-line access to the same request dispatcher the page uses. Needs only Node 22.
//   node cli.mjs request.json [--svg dir]
//   node cli.mjs < request.json
// Prints the result JSON on stdout. A request in the R version's spelling (seat.R's, with
// snake_case options) is read too. --svg writes the best seating's chart and the score trace
// as dir/seating.svg and dir/trace.svg, or round-1.svg etc for event rounds. Errors go to stderr as {"error": {...}} JSON: exit 1
// for an invalid request or JSON, 2 for a usage problem or an unreadable file. See api.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SeatingError, fromRRequest, renderSeatingSvg, renderTraceSvg, renderRoundSvg, isRoundPlan, runRequest } from './core/index.js';

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

/** All of stdin, read as a stream (a synchronous read of a pipe can fail before the writer is done). */
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

let text = '';
try {
  text = input === '-' ? await readStdin() : readFileSync(input, 'utf8');
} catch (error) {
  fail('unreadable_input', `cannot read ${input === '-' ? 'stdin' : input}: ${/** @type {Error} */ (error).message}`, 2);
}

/** @type {unknown} */
let request;
try {
  request = fromRRequest(JSON.parse(text));
} catch (error) {
  fail('invalid_json', `the request is not valid JSON: ${/** @type {Error} */ (error).message}`, 1);
}

try {
  const result = runRequest(request);
  if (svgDir) {
    mkdirSync(svgDir, { recursive: true });
    if (isRoundPlan(result)) {
      result.rounds.forEach((_,round)=>writeFileSync(join(svgDir, `round-${round+1}.svg`),renderRoundSvg(result,request,{round})));
    } else {
      writeFileSync(join(svgDir, 'seating.svg'), renderSeatingSvg(result, request));
      writeFileSync(join(svgDir, 'trace.svg'), renderTraceSvg(result));
    }
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  if (!(error instanceof SeatingError)) throw error;
  process.stderr.write(`${JSON.stringify(error)}\n`);
  process.exit(1);
}
