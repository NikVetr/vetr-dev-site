#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { submit } from './core/native.mjs';
import { dispatchExploration } from './core/explorer-native.mjs';
try {
  if (process.argv.length > 3) throw Object.assign(new Error('Usage: node stan2r/cli.mjs [request.json]'), { code: 'USAGE_ERROR' });
  const text = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await new Promise((resolve, reject) => {
    let input = ''; process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => resolve(input)); process.stdin.on('error', reject);
  });
  const request = JSON.parse(text);
  console.log(JSON.stringify(request?.action === undefined ? await submit(request) : dispatchExploration(request)));
} catch (raw) {
  const error = /** @type {Error & {code?:string,issues?:unknown[]}} */ (raw);
  console.error(JSON.stringify({ error: { code: error.code || 'INVALID_REQUEST', message: error.message, issues: error.issues || [] } }));
  process.exitCode = error.code === 'USAGE_ERROR' ? 2 : 1;
}
