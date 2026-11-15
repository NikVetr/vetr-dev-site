/* Cardinal Studio v2 project model: semantic swatches, linked corners, global undo.
 * Requires PainterCore and PainterColor. All saved geometry remains in PainterCore.
 */
(function (global) {
  'use strict';
  const Core = global.PainterCore || (typeof require === 'function' ? require('./core.js') : null);
  const Color = global.PainterColor || (typeof require === 'function' ? require('./color-engine.js') : null);
  if (!Core || !Color) throw new Error('Cardinal Studio needs its geometry and color modules.');
  const VERSION = 2;
  const HISTORY_LIMIT = 35;
  const MAX_BYTES = 2 * 1024 * 1024;
  const FACE_IDS = Core.FACES.map(function (face) { return face.id; });
  const FACE_SET = new Set(FACE_IDS);
  const CORNER_OWNERS = Object.freeze({
    'inner-fillet-upper-left':'face-red_top-connector',
    'inner-fillet-upper-right':'face-red_top-right-leg-cell-2',
    'inner-fillet-lower-left':'face-red_bottom-cell-2',
    'inner-fillet-lower-right':'face-gray_bottom'
  });
  const CORNER_MODES = Object.freeze(['auto', 'clear', 'manual']);
  const EXTRA_SETTINGS = Object.freeze({
    remapOnRightClick:false, brushLinked:true, galleryFilter:'uppercase',
    sheetScope:'uppercase', sheetOutlines:true
  });
  const FILTERS = ['uppercase', 'lowercase', 'digits', 'ascii', 'designs', 'all'];
  const SHEET_SCOPES = FILTERS.concat(['gallery', 'saved']);
  const own = function (object, key) { return Object.prototype.hasOwnProperty.call(object, key); };
  const isObject = function (value) { return value !== null && typeof value === 'object' && !Array.isArray(value); };
  const clone = function (value) { return JSON.parse(JSON.stringify(value)); };
  const now = function () { return new Date().toISOString(); };
  const modulo = function (value, length) { return ((value % length) + length) % length; };
  function text(value, fallback, limit) {
    if (typeof value !== 'string') return fallback;
    const result = Array.from(value.replace(/[\u0000-\u001F\u007F]/g, '').trim()).slice(0, limit || 120).join('');
    return result || fallback;
  }
  function validGlyph(value) {
    if (typeof value !== 'string' || !value.length || Array.from(value).length > 24 ||
      /[\u0000-\u001F\u007F]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
      throw new Error('A character label needs 1–24 printable characters.');
    }
    return value;
  }
  function nullBindings() {
    const result = Object.create(null);
    FACE_IDS.forEach(function (id) { result[id] = null; });
    return result;
  }
  function bindingEqual(first, second) {
    if (!first || !second) return first === second;
    return first.familyId === second.familyId && first.shade === second.shade;
  }
  function checkedBinding(value, familyIds) {
    if (value === null || value === undefined) return null;
    if (!isObject(value) || typeof value.familyId !== 'string' || !familyIds.has(value.familyId) ||
      !Number.isInteger(value.shade) || value.shade < 0 || value.shade > 2) {
      throw new Error('A linked color must use a known family and column 0, 1, or 2.');
    }
    return {familyId:value.familyId, shade:value.shade};
  }
  function checkedFills(value, partial) {
    if (!isObject(value)) throw new Error('A design needs a polygon color map.');
    const result = Object.create(null);
    Object.keys(value).forEach(function (id) {
      if (!FACE_SET.has(id)) throw new Error('This design contains an unknown polygon.');
      result[id] = Core.normalizeColor(value[id]);
    });
    if (!partial) FACE_IDS.forEach(function (id) {
      if (!own(result, id)) throw new Error('This design is missing a polygon.');
    });
    return result;
  }
  function familyIds(project) { return new Set(Core.getPalettes(project).map(function (family) { return family.id; })); }
  function getPalettes(project) {
    return Color.buildPalettes(Core.getPalettes(project), project && project.paletteConfig);
  }
  function inferBinding(color, project) {
    const hex = Core.normalizeColor(color);
    if (hex === 'none' || hex === '#FFFFFF') return null;
    const reference = {
      '#A01417':['cardinal',1], '#AD1D23':['cardinal',2], '#901315':['cardinal',0],
      '#A3AEB9':['slate',2], '#697988':['slate',1], '#505860':['slate',0],
      '#353D44':['charcoal',1], '#373F46':['charcoal',1]
    };
    if (own(reference, hex)) return {familyId:reference[hex][0], shade:reference[hex][1]};
    const palettes = Core.getPalettes(project);
    for (let row = 0; row < palettes.length; row += 1) {
      const shade = palettes[row].colors.indexOf(hex);
      if (shade !== -1) return {familyId:palettes[row].id, shade:shade};
    }
    return null;
  }
  function inferredBindings(fills, project) {
    const bindings = nullBindings();
    FACE_IDS.forEach(function (id) { bindings[id] = inferBinding(fills[id], project); });
    return bindings;
  }
  function applyCorners(doc) {
    if (doc.cornerMode === 'manual') return false;
    let changed = false;
    Object.keys(CORNER_OWNERS).forEach(function (id) {
      const owner = CORNER_OWNERS[id];
      const color = doc.cornerMode === 'clear' ? 'none' : doc.fills[owner];
      const binding = doc.cornerMode === 'clear' ? null : doc.bindings[owner];
      if (doc.fills[id] !== color || !bindingEqual(doc.bindings[id], binding)) changed = true;
      doc.fills[id] = color;
      doc.bindings[id] = binding ? {familyId:binding.familyId, shade:binding.shade} : null;
    });
    return changed;
  }
  function checkedExtraSettings(source, base) {
    const input = isObject(source) ? source : {};
    const result = Object.assign({}, base, EXTRA_SETTINGS);
    ['remapOnRightClick', 'brushLinked', 'sheetOutlines'].forEach(function (key) {
      if (typeof input[key] === 'boolean') result[key] = input[key];
    });
    if (FILTERS.includes(input.galleryFilter)) result.galleryFilter = input.galleryFilter;
    if (SHEET_SCOPES.includes(input.sheetScope)) result.sheetScope = input.sheetScope;
    return result;
  }
  function validateProject(value) {
    let input = value;
    if (typeof input === 'string') {
      if (input.length > MAX_BYTES) throw new Error('This project is too large (maximum 2 MB).');
      try { input = JSON.parse(input); } catch (_) { throw new Error('The file is not valid project JSON.'); }
    }
    if (!isObject(input) || input.schema !== Core.SCHEMA || ![1, VERSION].includes(input.version)) {
      throw new Error('This is not a supported Cardinal Studio project.');
    }
    const legacy = input.version === 1;
    // Reuse the strict v1 validator for every original field, color, and geometry ID.
    const base = Core.validateProject(Object.assign({}, input, {version:1}));
    const ids = familyIds(base);
    Object.keys(base.documents).forEach(function (glyph) {
      const source = input.documents[glyph];
      const doc = base.documents[glyph];
      const bindings = nullBindings();
      if (legacy) {
        Object.assign(bindings, inferredBindings(doc.fills, base));
      } else if (source.bindings !== undefined) {
        if (!isObject(source.bindings)) throw new Error('Polygon color links must be a map.');
        Object.keys(source.bindings).forEach(function (id) {
          if (!FACE_SET.has(id)) throw new Error('A color link refers to an unknown polygon.');
          bindings[id] = checkedBinding(source.bindings[id], ids);
        });
      }
      doc.bindings = bindings;
      doc.cornerMode = CORNER_MODES.includes(source.cornerMode) ? source.cornerMode : legacy ? 'manual' : 'auto';
      doc.kind = source.kind === 'design' ? 'design' : 'glyph';
      doc.seedStatus = text(source.seedStatus, legacy ? 'imported' : 'blank', 32);
      applyCorners(doc);
    });
    base.version = VERSION;
    base.paletteConfig = Color.normalizeConfig(input.paletteConfig);
    base.settings = checkedExtraSettings(input.settings, base.settings);
    return base;
  }
  function createProject() {
    const base = Core.createProject();
    const source = base.documents.A;
    const doc = {
      glyph:'@original', name:'Original', fills:source.fills, touched:false, updatedAt:source.updatedAt,
      bindings:inferredBindings(source.fills, base), cornerMode:'manual', kind:'design', seedStatus:'reference'
    };
    base.documents = Object.create(null);
    base.documents['@original'] = doc;
    base.currentGlyph = '@original';
    base.version = VERSION;
    base.paletteConfig = Color.normalizeConfig();
    base.settings = Object.assign({}, base.settings, EXTRA_SETTINGS);
    return base;
  }
  function documentFrom(glyph, fills, meta, project) {
    const source = meta || {};
    const colors = checkedFills(fills, false);
    const ids = familyIds(project);
    const bindings = nullBindings();
    if (source.bindings !== undefined) {
      if (!isObject(source.bindings)) throw new Error('Polygon color links must be a map.');
      Object.keys(source.bindings).forEach(function (id) {
        if (!FACE_SET.has(id)) throw new Error('A color link refers to an unknown polygon.');
        bindings[id] = checkedBinding(source.bindings[id], ids);
      });
    }
    const doc = {
      glyph:glyph, name:text(source.name, glyph, 120), fills:colors,
      touched:false, updatedAt:now(), bindings:bindings,
      cornerMode:CORNER_MODES.includes(source.cornerMode) ? source.cornerMode : 'auto',
      kind:source.kind === 'design' ? 'design' : 'glyph',
      seedStatus:text(source.seedStatus, 'blank', 32)
    };
    applyCorners(doc);
    return doc;
  }

  class Store {
    constructor(project) {
      this.project = project === undefined || project === null ? createProject() : validateProject(project);
      this._past = [];
      this._future = [];
      this._pending = null;
    }
    get doc() { return this.project.documents[this.project.currentGlyph]; }
    get canUndo() { return this._past.length > 0; }
    get canRedo() { return this._future.length > 0; }
    get undoLabel() { return this._past.length ? this._past[this._past.length - 1].label : ''; }
    get redoLabel() { return this._future.length ? this._future[this._future.length - 1].label : ''; }
    _snapshot() { return JSON.stringify(this.project); }
    _push(before, label) {
      this._past.push({snapshot:before, label:label || 'Change design'});
      if (this._past.length > HISTORY_LIMIT) this._past.shift();
      this._future = [];
    }
    _touch(doc) {
      doc.touched = true;
      doc.updatedAt = now();
      this.project.updatedAt = doc.updatedAt;
    }
    _mutate(label, change, touchDoc) {
      const before = this._pending ? null : this._snapshot();
      const changed = change();
      if (!changed) return false;
      if (touchDoc !== false) this._touch(this.doc);
      else this.project.updatedAt = now();
      if (!this._pending) this._push(before, label);
      return true;
    }
    beginEdit(label) {
      if (this._pending) return false;
      this._pending = {before:this._snapshot(), label:label || 'Change design'};
      return true;
    }
    endEdit() {
      if (!this._pending) return false;
      const pending = this._pending;
      this._pending = null;
      if (pending.before === this._snapshot()) return false;
      this._push(pending.before, pending.label);
      return true;
    }
    paint(id, color, binding) {
      if (!FACE_SET.has(id)) throw new Error('Unknown polygon.');
      if (own(CORNER_OWNERS, id) && this.doc.cornerMode !== 'manual') return false;
      const fill = Core.normalizeColor(color);
      const link = checkedBinding(binding, familyIds(this.project));
      return this._mutate(fill === 'none' ? 'Clear piece' : 'Paint piece', () => {
        let changed = this.doc.fills[id] !== fill || !bindingEqual(this.doc.bindings[id], link);
        this.doc.fills[id] = fill;
        this.doc.bindings[id] = link;
        changed = applyCorners(this.doc) || changed;
        return changed;
      });
    }
    setFills(map, label, bindings) {
      const colors = checkedFills(map, true);
      const ids = familyIds(this.project);
      const links = Object.create(null);
      if (bindings !== undefined && !isObject(bindings)) throw new Error('Polygon color links must be a map.');
      if (bindings) Object.keys(bindings).forEach(function (id) {
        if (!FACE_SET.has(id)) throw new Error('A color link refers to an unknown polygon.');
      });
      Object.keys(colors).forEach(function (id) { links[id] = checkedBinding(bindings && bindings[id], ids); });
      return this._mutate(label || 'Change colors', () => {
        let changed = false;
        Object.keys(colors).forEach((id) => {
          if (this.doc.fills[id] !== colors[id] || !bindingEqual(this.doc.bindings[id], links[id])) changed = true;
          this.doc.fills[id] = colors[id];
          this.doc.bindings[id] = links[id];
        });
        return applyCorners(this.doc) || changed;
      });
    }
    setCornerMode(mode) {
      if (!CORNER_MODES.includes(mode)) throw new Error('Unknown corner-piece mode.');
      return this._mutate('Change tiny corners', () => {
        const changed = this.doc.cornerMode !== mode;
        this.doc.cornerMode = mode;
        return applyCorners(this.doc) || changed;
      });
    }
    remapFamily(fromId, toId) {
      const palettes = getPalettes(this.project);
      if (!palettes.some(function (family) { return family.id === fromId; })) throw new Error('Unknown source color family.');
      const target = palettes.find(function (family) { return family.id === toId; });
      if (!target) throw new Error('Unknown destination color family.');
      if (fromId === toId) return false;
      return this._mutate('Move color family', () => {
        let changed = false;
        FACE_IDS.forEach((id) => {
          const binding = this.doc.bindings[id];
          if (!binding || binding.familyId !== fromId) return;
          this.doc.bindings[id] = {familyId:toId, shade:binding.shade};
          this.doc.fills[id] = target.colors[binding.shade];
          changed = true;
        });
        return applyCorners(this.doc) || changed;
      });
    }
    updatePalette(value) {
      const config = Color.normalizeConfig(Object.assign({}, this.project.paletteConfig, value || {}));
      if (JSON.stringify(config) === JSON.stringify(this.project.paletteConfig)) return false;
      return this._mutate('Adjust palette', () => {
        this.project.paletteConfig = config;
        const palettes = getPalettes(this.project);
        const map = new Map(palettes.map(function (family) { return [family.id, family]; }));
        Object.keys(this.project.documents).forEach((glyph) => {
          const doc = this.project.documents[glyph];
          let changed = false;
          FACE_IDS.forEach(function (id) {
            const binding = doc.bindings[id];
            if (!binding) return;
            const row = map.get(binding.familyId);
            if (!row) return;
            const color = row.colors[binding.shade];
            if (doc.fills[id] !== color) changed = true;
            doc.fills[id] = color;
          });
          changed = applyCorners(doc) || changed;
          if (changed) this._touch(doc);
        });
        if (this.project.settings.brushLinked) {
          const row = palettes[this.project.settings.family] || palettes[0];
          this.project.settings.brush = row.colors[this.project.settings.shade];
        }
        return true;
      }, false);
    }
    usedFamilies() {
      const counts = new Map();
      FACE_IDS.forEach((id) => {
        const binding = this.doc.bindings[id];
        if (!binding) return;
        if (!counts.has(binding.familyId)) counts.set(binding.familyId, {familyId:binding.familyId, count:0, shades:[0, 0, 0]});
        const entry = counts.get(binding.familyId);
        entry.count += 1;
        entry.shades[binding.shade] += 1;
      });
      return Core.getPalettes(this.project).map(function (family) { return counts.get(family.id); }).filter(Boolean);
    }
    inferBinding(color) { return inferBinding(color, this.project); }
    ensureDocument(value, fills, meta) {
      const glyph = validGlyph(value);
      if (own(this.project.documents, glyph)) return this.project.documents[glyph];
      if (Object.keys(this.project.documents).length >= 256) throw new Error('A project can contain up to 256 designs.');
      const doc = documentFrom(glyph, fills || Core.presetFills('white'), meta, this.project);
      this.project.documents[glyph] = doc;
      this.project.updatedAt = now();
      return doc;
    }
    selectGlyph(value, options) {
      this.endEdit();
      const glyph = validGlyph(value);
      const seed = options && options.seed || this.project.settings.seed || 'blank';
      if (!['blank', 'copy', 'reference'].includes(seed)) throw new Error('Unknown new-character starting point.');
      if (!own(this.project.documents, glyph)) {
        const fills = seed === 'copy' ? this.doc.fills : Core.presetFills(seed === 'blank' ? 'white' : 'reference');
        this.ensureDocument(glyph, fills, {
          bindings:seed === 'copy' ? this.doc.bindings : seed === 'reference' ? inferredBindings(fills, this.project) : nullBindings(),
          cornerMode:seed === 'copy' ? this.doc.cornerMode : 'auto', kind:'glyph',
          seedStatus:seed === 'copy' ? 'copy' : seed === 'reference' ? 'reference' : 'blank'
        });
      }
      this.project.currentGlyph = glyph;
      this.project.updatedAt = now();
      return this.doc;
    }
    stepGlyph(delta, options) {
      const sequence = Core.SEQUENCES[this.project.sequenceName];
      const index = sequence.indexOf(this.project.currentGlyph);
      const step = Number.isFinite(delta) ? Math.trunc(delta) : 1;
      const next = index === -1 ? (step < 0 ? sequence.length - 1 : 0) : modulo(index + step, sequence.length);
      return this.selectGlyph(sequence[next], options);
    }
    setSequence(name, options) {
      if (!own(Core.SEQUENCES, name)) throw new Error('Unknown character sequence.');
      this.endEdit();
      this.project.sequenceName = name;
      this.project.updatedAt = now();
      if (!Core.SEQUENCES[name].includes(this.project.currentGlyph)) this.selectGlyph(Core.SEQUENCES[name][0], options);
      return this.doc;
    }
    rename(value) {
      const name = text(value, this.project.currentGlyph, 120);
      return this._mutate('Rename design', () => {
        if (this.doc.name === name) return false;
        this.doc.name = name;
        return true;
      });
    }
    setTitle(value) {
      const title = text(value, 'Cardinal study', 120);
      return this._mutate('Rename study', () => {
        if (this.project.title === title) return false;
        this.project.title = title;
        return true;
      }, false);
    }
    reset(preset) {
      const kind = preset || 'reference';
      const fills = Core.presetFills(kind);
      const bindings = kind === 'blank' || kind === 'white' ? nullBindings() : inferredBindings(fills, this.project);
      if (kind !== 'reference' && kind !== 'white' && kind !== 'blank') {
        const palettes = new Map(getPalettes(this.project).map(function (family) { return [family.id, family]; }));
        FACE_IDS.forEach(function (id) {
          const binding = bindings[id];
          if (binding) fills[id] = palettes.get(binding.familyId).colors[binding.shade];
        });
      }
      return this.setFills(fills, 'Apply ' + kind + ' colors', bindings);
    }
    addFamily(name, medium) {
      if (this.project.customPalettes.length >= 8) throw new Error('You can add up to eight custom color families.');
      const used = familyIds(this.project);
      let suffix = 1;
      while (used.has('custom-' + suffix)) suffix += 1;
      const family = Core.makeFamily(name, medium, 'custom-' + suffix);
      this._mutate('Add color family', () => { this.project.customPalettes.push(family); return true; }, false);
      return family;
    }
    undo() {
      this.endEdit();
      if (!this._past.length) return false;
      const entry = this._past.pop();
      this._future.push({snapshot:this._snapshot(), label:entry.label});
      this.project = validateProject(JSON.parse(entry.snapshot));
      return true;
    }
    redo() {
      this.endEdit();
      if (!this._future.length) return false;
      const entry = this._future.pop();
      this._past.push({snapshot:this._snapshot(), label:entry.label});
      this.project = validateProject(JSON.parse(entry.snapshot));
      return true;
    }
    toJSON() {
      // Serialization is read-only: autosave must not split a slider or paint gesture.
      // Validates links and settings without projecting raw reference fills.
      return validateProject(this.project);
    }
  }
  function projectString(project) {
    return JSON.stringify(project instanceof Store ? project.toJSON() : validateProject(project), null, 2);
  }

  const API = Object.freeze({
    VERSION:VERSION, SCHEMA:Core.SCHEMA, GEOMETRY_ID:Core.GEOMETRY_ID,
    CORNER_OWNERS:CORNER_OWNERS, CORNER_MODES:CORNER_MODES, EXTRA_SETTINGS:EXTRA_SETTINGS,
    Store:Store, createProject:createProject, validateProject:validateProject,
    getPalettes:getPalettes, inferBinding:inferBinding, inferredBindings:inferredBindings,
    projectString:projectString
  });
  global.PainterModel = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
