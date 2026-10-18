import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { prerenderInputs } from '../scripts/prerender_inputs.mjs';

test('preview freshness follows contents, with row changes scoped to their language pairs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plg-preview-inputs-'));
  const directories = ['core', 'render', 'vendor', 'data/concepts', 'data/fonts', 'data/registry',
    'data/themes', 'data/respell', 'data/lang/en', 'data/lang/es', 'data/lang/fr'];
  const files = ['package-lock.json', 'scripts/spec.mjs', 'scripts/prerender_packs.mjs',
    'scripts/prerender_inputs.mjs', 'scripts/local_page.mjs', 'data/coverage.json', 'data/presets.json', 'data/icons.json'];
  /** @param {string} path @param {string} content */
  const write = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  try {
    for (const dir of directories) await mkdir(join(root, dir), { recursive: true });
    for (const file of files) await write(file, 'fixture');
    const packages = Object.fromEntries(['@playwright/test', 'playwright', 'playwright-core']
      .map((name) => [`node_modules/${name}`, { version: '1', integrity: 'fixture' }]));
    await write('package-lock.json', JSON.stringify({ packages }));
    const initial = await prerenderInputs(['en', 'es', 'fr'], root);
    await write('data/lang/es/core.csv', 'changed');
    const rowsChanged = await prerenderInputs(['en', 'es', 'fr'], root);
    assert.notEqual(initial('es', 'en'), rowsChanged('es', 'en'));
    assert.notEqual(initial('fr', 'es'), rowsChanged('fr', 'es'));
    assert.equal(initial('fr', 'en'), rowsChanged('fr', 'en'));
    await write('core/solve.js', 'changed');
    const codeChanged = await prerenderInputs(['en', 'es', 'fr'], root);
    assert.notEqual(rowsChanged('fr', 'en'), codeChanged('fr', 'en'));
    const repeated = await prerenderInputs(['en', 'es', 'fr'], root);
    assert.equal(codeChanged('fr', 'en'), repeated('fr', 'en'));
    await write('package-lock.json', JSON.stringify({ packages: { ...packages, 'node_modules/uuid': { version: '11' } } }));
    const nativeChanged = await prerenderInputs(['en', 'es', 'fr'], root);
    assert.equal(repeated('fr', 'en'), nativeChanged('fr', 'en'));
    packages['node_modules/playwright'].version = '2';
    await write('package-lock.json', JSON.stringify({ packages }));
    const browserChanged = await prerenderInputs(['en', 'es', 'fr'], root);
    assert.notEqual(repeated('fr', 'en'), browserChanged('fr', 'en'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
