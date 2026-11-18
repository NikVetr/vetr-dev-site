import { readFile } from 'node:fs/promises';
import { createSheetContext } from './core/sheet.js';
import { generateSheet } from './core/sheet-api.js';
import { runJsonCli } from '../shared/json-cli.mjs';

await runJsonCli(async request => {
  const ctx = await createSheetContext({
    loadText: rel => readFile(new URL(rel, import.meta.url), 'utf8'),
    loadBytes: rel => readFile(new URL(rel, import.meta.url)),
  });
  return generateSheet(ctx, request);
});
