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

test('nonblank sheets filter actual fills independently of metadata and match CLI/PNG sizing', () => {
  const Sheet = require('../sheet.js');
  const white = Core.presetFills('white');
  const transparent = Object.fromEntries(Core.FACES.map(face => [face.id, 'none']));
  const oneColored = {...white, [Core.FACES[19].id]:'#FEFFFF'};
  const entries = [
    {key:'white',fills:white,status:'edited'},
    {key:'transparent',fills:transparent,status:'guess'},
    {key:'mixed',fills:{...white,[Core.FACES[0].id]:'none'},status:'edited'},
    {key:'ink',fills:oneColored,status:'blank'}
  ];
  const request = {operation:'sheet',entries,options:{nonblankOnly:true}};
  const output = submit(request);
  assert.equal(output.ok, true);
  assert.match(output.svg, /Character sheet containing 1 studies/);
  assert.match(output.svg, /aria-label="ink"/);
  assert.doesNotMatch(output.svg, /aria-label="white"/);
  assert.equal(Sheet.layout(entries,{nonblankOnly:true}).count,1);
  assert.deepEqual(Sheet.pngDimensions(entries,{nonblankOnly:true}),Sheet.pngDimensions([entries[3]]));
  assert.equal(Sheet.layout(entries,{nonblankOnly:false}).count,4);
  const cli = spawnSync(process.execPath,[path.join(__dirname,'../cli.cjs')],{input:JSON.stringify(request),encoding:'utf8'});
  assert.equal(cli.status,0);
  assert.deepEqual(JSON.parse(cli.stdout),output);
  const blank = submit({...request,entries:entries.slice(0,3)});
  assert.equal(blank.ok,false);
  assert.match(blank.error?.message ?? '',/No nonblank studies/);
  assert.equal(submit({...request,options:{nonblankOnly:'yes'}}).ok,false);
});


test('blank shade, background settings and retired White tool survive project loading', () => {
  const store = new Model.Store();
  Object.assign(store.project.settings, {tool:'paint',shade:3,brush:'none',brushLinked:true,background:'#152238',backgroundColor:'#152238'});
  const restored = new Model.Store(JSON.parse(Model.projectString(store)));
  assert.equal(restored.project.settings.shade, 3);
  restored.updatePalette({lightness:0.6});
  assert.equal(restored.project.settings.brush, 'none');
  assert.equal(restored.project.settings.background, '#152238');
  const legacy = store.toJSON();
  legacy.settings.tool = 'white';
  const migrated = new Model.Store(legacy);
  assert.equal(migrated.project.settings.tool, 'paint');
  assert.equal(migrated.project.settings.brush, '#FFFFFF');
  assert.equal(migrated.project.settings.brushLinked, false);
  assert.deepEqual(migrated.doc.fills, store.doc.fills);
  for (const background of ['#152238', 'white', 'transparent']) {
    const response = submit({operation:'svg',fills:Core.presetFills('blank'),options:{background,outline:true}});
    assert.equal(response.ok, true);
    if (background === 'transparent') assert.doesNotMatch(response.svg, /id="background"/);
    else assert.match(response.svg, new RegExp('id="background"[^>]+fill="'+Core.normalizeBackground(background)+'"'));
    assert.match(response.svg, new RegExp('id="polygon-outlines"[^>]+stroke="'+Core.backgroundContrast(background)+'"'));
  }
  assert.equal(Core.backgroundContrast('#152238'), '#FFFFFF');
  assert.equal(Core.backgroundContrast('#FFFFFF'), '#172D38');
  assert.equal(submit({operation:'svg',options:{background:'invalid'}}).ok, false);
});

test('automatic tiny corners follow ending legs, including color links and history', () => {
  const store = new Model.Store();
  const owners = {
    'inner-fillet-upper-left':'face-red_top-connector',
    'inner-fillet-upper-right':'face-gray_top',
    'inner-fillet-lower-left':'face-red_left',
    'inner-fillet-lower-right':'face-gray_bottom'
  };
  store.setCornerMode('manual');
  for (const corner of Object.keys(owners)) store.paint(corner, '#FFFFFF');
  const manual = structuredClone(store.doc.fills);
  store.setCornerMode('auto');
  const slate = Model.getPalettes(store.project).find((/** @type {{id:string}} */ row) => row.id === 'slate');
  for (const [corner, owner] of Object.entries(owners)) {
    store.paint(owner, slate.colors[2], {familyId:'slate',shade:2});
    assert.equal(store.doc.fills[corner], slate.colors[2]);
    assert.deepEqual(store.doc.bindings[corner], {familyId:'slate',shade:2});
  }
  const auto = structuredClone(store.doc.fills);
  store.paint('face-gray_top', 'none');
  assert.equal(store.doc.fills['inner-fillet-upper-right'], 'none');
  assert.equal(store.doc.bindings['inner-fillet-upper-right'], null);
  store.undo();
  assert.deepEqual({...store.doc.fills}, auto);
  store.redo();
  assert.equal(store.doc.fills['inner-fillet-upper-right'], 'none');
  const restored = new Model.Store(store.toJSON());
  assert.equal(restored.doc.fills['inner-fillet-upper-right'], 'none');
  store.setCornerMode('manual');
  store.setFills(manual, 'Manual colors');
  assert.deepEqual({...new Model.Store(store.toJSON()).doc.fills}, manual);
});
