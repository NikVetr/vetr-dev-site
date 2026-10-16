import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

test('the patched UUID dependency remains compatible with Xcode project generation', () => {
  const load = createRequire(import.meta.url);
  const project = /** @type {{hash: unknown, generateUuid: () => string}} */ (load('xcode').project('unused.pbxproj'));
  project.hash = { project: { objects: {} } };
  const ids = Array.from({ length: 100 }, () => project.generateUuid());
  assert(ids.every((id) => /^[A-F0-9]{24}$/.test(id)));
  assert.equal(new Set(ids).size, ids.length);
});
