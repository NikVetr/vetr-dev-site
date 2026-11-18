import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { generateSheet } from '../core/sheet-api.js';

test('the request API resolves registry defaults and uses the studio solver', async () => {
  const root = new URL('../', import.meta.url);
  const ctx = await createSheetContext({
    loadText: rel => readFile(new URL(rel, root), 'utf8'),
    loadBytes: rel => readFile(new URL(rel, root)),
  });
  const request = { source: 'en', target: 'es', settings: { inkMode: 'mono' } };
  const { spec, plan } = await generateSheet(ctx, request);
  assert.equal(spec.inkMode, 'mono');
  assert.ok(plan.faces.length > 0);
  assert.deepEqual(plan, (await buildSheet(ctx, spec)).plan);
  await assert.rejects(generateSheet(ctx, { ...request, settings: { themeId: 'missing' } }), { code: 'invalid_request' });
});
