const test = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const Core = require('../core.js');
const Model = require('../model.js');
const {submit} = require('../api.js');

test('painting, undo, redo and saved project round-trip preserve exported geometry', () => {
  const store = new Model.Store();
  const id = Core.FACES[0].id;
  const before = store.doc.fills[id];
  store.paint(id, '#123456');
  assert.equal(store.doc.fills[id], '#123456');
  assert.equal(store.undo(), true);
  assert.equal(store.doc.fills[id], before);
  assert.equal(store.redo(), true);
  const restored = new Model.Store(JSON.parse(Model.projectString(store)));
  assert.deepEqual(restored.doc, store.doc);
  const output = submit({operation:'svg', fills:restored.doc.fills, options:{background:'transparent'}});
  assert.equal(output.ok, true);
  for (const face of Core.FACES) assert.ok(output.svg.includes('d="' + face.d + '"'));
  assert.ok(!output.svg.includes('id="background"'));
  assert.ok(output.svg.includes('fill="#123456"'));
});

test('sheets export actual studies and escape user titles', () => {
  const output = submit({operation:'sheet', entries:[
    {key:'A', label:'A & B', fills:Core.presetFills('reference')},
    {key:'B', fills:Core.presetFills('monochrome')}
  ], options:{title:'<My studies>', columns:2}});
  assert.equal(output.ok, true);
  assert.ok(output.svg.includes('&lt;My studies&gt;'));
  assert.ok(output.svg.includes('A &amp; B'));
  assert.ok(output.svg.includes('#8C1515'));
});

test('invalid requests and malformed CLI input fail explicitly', () => {
  for (const request of [null, {operation:'nope'}, {operation:'svg', fills:{}}, {operation:'sheet', entries:[]}, {operation:'validate', project:{}}]) {
    const output = submit(request);
    assert.equal(output.ok, false);
    assert.equal(output.error.code, 'INVALID_REQUEST');
    assert.ok(output.error.message);
  }
  const cli = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs')], {input:'{', encoding:'utf8'});
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(cli.stdout).error.code, 'INPUT_ERROR');
});

test('CLI and callable API produce the same exported SVG', () => {
  const request = {operation:'svg', fills:Core.presetFills('reference'), options:{name:'Example'}};
  const cli = spawnSync(process.execPath, [path.join(__dirname, '../cli.cjs')], {input:JSON.stringify(request), encoding:'utf8'});
  assert.equal(cli.status, 0);
  assert.deepEqual(JSON.parse(cli.stdout), submit(request));
});
