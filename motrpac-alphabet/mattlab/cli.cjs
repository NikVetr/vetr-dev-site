#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const {submit} = require('./api.js');

try {
  if (process.argv.length > 3) throw new Error('Usage: node cli.cjs [request.json]; omit the path to read standard input.');
  const request = JSON.parse(fs.readFileSync(process.argv[2] || 0, 'utf8'));
  const result = submit(request);
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stdout.write(JSON.stringify({ok:false, error:{code:'INPUT_ERROR', message:error instanceof Error ? error.message : String(error)}}) + '\n');
  process.exitCode = 1;
}
