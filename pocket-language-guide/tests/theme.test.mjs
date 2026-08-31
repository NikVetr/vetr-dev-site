import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const files = (await readdir('data/themes')).filter((f) => f.endsWith('.json'));

test('every theme declares the shape the solver reads', async () => {
  assert.ok(files.length >= 1);
  for (const file of files) {
    const theme = JSON.parse(await readFile(`data/themes/${file}`, 'utf8'));
    assert.equal(typeof theme.id, 'string', `${file}: id`);
    // `note` is the note-template style; prose lives in `description`. These
    // collided once, and JSON silently kept the last one.
    assert.equal(typeof theme.note, 'object', `${file}: note must be the template style`);
    assert.equal(typeof theme.description, 'string', `${file}: description must be prose`);
    assert.ok(Array.isArray(theme.note.pad), `${file}: note.pad`);

    for (const role of ['comm', 'money', 'move', 'stay', 'alert']) {
      assert.match(theme.colors.roles[role], /^#[0-9A-Fa-f]{6}$/, `${file}: role ${role}`);
    }
    for (const level of ['1', '2', '3']) {
      assert.ok(theme.headings[level].size > 0, `${file}: heading ${level}`);
    }
    for (const [name, tpl] of Object.entries(theme.templates)) {
      const t = /** @type {any} */ (tpl);
      assert.ok(t.fields.length > 0, `${file}: template ${name} has no fields`);
      assert.ok(t.minFrac > 0 && t.maxFrac <= 1, `${file}: template ${name} bounds`);
      for (const f of t.fields) {
        assert.ok(f.col < t.cols && f.row < t.rows, `${file}: ${name}.${f.field} outside its grid`);
      }
    }
  }
});
