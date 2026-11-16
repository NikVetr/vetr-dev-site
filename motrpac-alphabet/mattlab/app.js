/* Cardinal Studio controller. Runs entirely in this document. */
(function () {
  'use strict';
  const Core = window.PainterCore;
  const Color = window.PainterColor;
  const Model = window.PainterModel;
  const Glyphs = window.PainterGlyphs;
  const Sheet = window.PainterSheet;
  const $ = function (id) { return document.getElementById(id); };
  const NS = 'http://www.w3.org/2000/svg';
  const STORAGE_KEY = 'cardinal-studio:' + Core.GEOMETRY_ID + ':v2';
  const LEGACY_STORAGE_KEY = 'cardinal-studio:' + Core.GEOMETRY_ID + ':v1';
  const FACE_BY_ID = new Map(Core.FACES.map(function (face, index) {
    return [face.id, Object.assign({number:index + 1}, face)];
  }));
  const LABEL_POSITIONS = [[584.28,224.71],[456.15,362.69],[676.18,331.99],
    [948.04,225.61],[852.84,332.32],[764.27,432.95],[447.88,680.63],
    [752.22,600.55],[664.22,692.85],[569.71,793.28],[1068.76,348.24],
    [1069.76,666.17],[939.79,800.47],[841.33,696.7],[436.35,529.68],
    [1082.23,491.19],[582.49,677.53],[935.51,697.01],[933.37,355.18],[583.6,350.7]];
  /** @type {InstanceType<typeof import('./model.js').Store>} */
  let store;
  let storageAvailable = true;
  let initialNotice = '';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    store = saved ? new Model.Store(JSON.parse(saved)) : new Model.Store();
  } catch (error) {
    store = new Model.Store();
    initialNotice = 'Starting a fresh study. You can open a saved project with Open.';
    try { localStorage.getItem(STORAGE_KEY); } catch (_) { storageAvailable = false; }
  }
  const skippedStarters = populateGallery(store);
  if (skippedStarters) initialNotice = 'Your existing studies are preserved. Some starter thumbnails were skipped because this project is full.';
  let palettes = Model.getPalettes(store.project);
  let settings = store.project.settings;
  let svg, guides, labels, hoverHalo, hoverLine;
  let pathNodes = new Map();
  let undercoatNodes = new Map();
  let paletteButtons = [];
  let paletteRows = [];
  let glyphButtons = [];
  let remapSource = null;
  let paletteEditing = false;
  let paletteDirty = false;
  let paletteFrame = null;
  let pendingPaletteValues = {};
  let hoveredId = null;
  let drawing = false;
  let strokePointer = null;
  let visitedInStroke = new Set();
  let drag = null;
  let panMode = false;
  let spaceHeld = false;
  let toastTimer = null;
  let saveTimer = null;
  let resizeFrame = null;
  let exportBusy = false;
  let artworkWidth = 0;
  let artworkHeight = 0;
  /** @type {string|null} */
  let cycleWhiteFace = null;
  let wheelAmount = 0;
  let wheelLast = 0;
  let wheelActionAt = -1000;
  const viewport = $('canvasViewport');
  const host = $('artworkHost');
  const sheetNonblankOnly = /** @type {HTMLInputElement} */ ($('sheetNonblankOnly'));
  if (!host) throw new Error('Missing artwork container');
  const clamp = function (value, lo, hi) { return Math.min(hi, Math.max(lo, value)); };
  const modulo = function (value, n) { return ((value % n) + n) % n; };

  function populateGallery(targetStore) {
    const target = targetStore || store;
    let skipped = 0;
    // Retire automatic colour-study starters, retaining any saved user edits.
    ['@cardinal-slate', '@cardinal-sky', '@ember-navy', '@tonal-weave'].forEach(function (key) {
      const doc = target.project.documents[key];
      if (doc && !doc.touched) {
        delete target.project.documents[key];
        if (target.project.currentGlyph === key) target.project.currentGlyph = '@original';
      }
    });
    function ensure(glyph, fills, metadata) {
      if (!Object.prototype.hasOwnProperty.call(target.project.documents, glyph) &&
        Object.keys(target.project.documents).length >= 256) { skipped += 1; return; }
      target.ensureDocument(glyph, fills, metadata);
    }
    const currentPalette = Model.getPalettes(target.project);
    const cardinal = currentPalette.find(function (family) { return family.id === 'cardinal'; });
    Object.keys(Glyphs.SEEDS).forEach(function (glyph) {
      const seed = Glyphs.getSeed(glyph);
      const fills = Glyphs.seedFills(glyph);
      const bindings = Object.create(null);
      seed.red.forEach(function (id) {
        // Imported artwork keeps its exact color even when a saved palette differs.
        if (seed.status !== 'curated') fills[id] = cardinal.colors[1];
        const binding = target.inferBinding(fills[id]);
        if (binding) bindings[id] = binding;
      });
      const existing = target.project.documents[glyph];
      if (existing && !existing.touched && existing.kind === 'glyph' &&
          ['guess', 'blank'].includes(existing.seedStatus) &&
          (existing.seedStatus !== seed.status || existing.cornerMode !== seed.cornerMode ||
           Core.FACES.some(function (/** @type {{id:string}} */ face) { return existing.fills[face.id] !== fills[face.id]; }))) {
        delete target.project.documents[glyph];
      }
      ensure(glyph, fills, {bindings:bindings, cornerMode:seed.cornerMode,
        kind:'glyph', seedStatus:seed.status, name:glyph});
    });
    Glyphs.DESIGNS.forEach(function (design) {
      const bindings = Object.create(null);
      Core.FACES.forEach(function (face) {
        const binding = target.inferBinding(design.fills[face.id]);
        if (binding) bindings[face.id] = binding;
      });
      ensure(design.key, design.fills, {bindings:bindings,
        cornerMode:design.cornerMode, kind:'design', seedStatus:'design', name:design.name});
    });
    if (!Object.prototype.hasOwnProperty.call(target.project.documents, target.project.currentGlyph)) {
      const replacement = Object.keys(target.project.documents)[0];
      if (!replacement) throw new Error('The project has no available studies.');
      target.project.currentGlyph = replacement;
    }
    return skipped;
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.add('show');
    toastTimer = setTimeout(function () { $('toast').classList.remove('show'); }, 3100);
  }
  function setSaveStatus(message) { $('saveIndicator').textContent = message; }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (drawing || paletteEditing) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.toJSON()));
      storageAvailable = true;
      setSaveStatus('Saved in this browser');
    } catch (_) {
      storageAvailable = false;
      setSaveStatus('Session only · Save project');
    }
  }
  function queueSave() {
    clearTimeout(saveTimer);
    setSaveStatus(storageAvailable ? 'Saving…' : 'Session only · Save project');
    saveTimer = setTimeout(saveNow, 180);
  }
  function node(tag, attrs) {
    const element = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (name) { element.setAttribute(name, attrs[name]); });
    return element;
  }
  function colorName(color) {
    if (color === 'none') return 'Transparent';
    if (color === '#FFFFFF') return 'White';
    for (let i = 0; i < palettes.length; i += 1) {
      const j = palettes[i].colors.indexOf(color);
      if (j !== -1) return palettes[i].name + ' · ' + toneName(j);
    }
    return 'Custom color';
  }
  function toneName(shade) {
    return store.project.paletteConfig.mode === 'chroma' ?
      ['Low chroma','Mid chroma','High chroma'][shade] : ['Low','Mid','High'][shade];
  }
  function paintColor() {
    if (settings.tool === 'clear') return 'none';
    if (settings.tool === 'white') return '#FFFFFF';
    return settings.brush;
  }
  function showHover(id) {
    hoveredId = id && FACE_BY_ID.has(id) ? id : null;
    if (!hoveredId) {
      hoverHalo.setAttribute('display', 'none');
      hoverLine.setAttribute('display', 'none');
      $('hoverInfo').textContent = panMode || spaceHeld ? 'Drag to move around the canvas.' : 'Pick a color, then click a piece.';
      return;
    }
    const face = FACE_BY_ID.get(hoveredId);
    hoverHalo.setAttribute('d', face.d);
    hoverLine.setAttribute('d', face.d);
    hoverHalo.removeAttribute('display');
    hoverLine.removeAttribute('display');
    const fill = store.doc.fills[face.id];
    const parent = Glyphs.CORNER_PARENTS[face.id];
    const suffix = parent && store.doc.cornerMode === 'auto' ? ' · follows piece ' + FACE_BY_ID.get(parent).number :
      parent && store.doc.cornerMode === 'clear' ? ' · corners set transparent' : '';
    $('hoverInfo').textContent = face.number + ' · ' + face.label + ' · ' + (fill === 'none' ? 'Clear' : fill) + suffix;
  }

  function buildArtwork() {
    svg = host.querySelector('svg');
    if (!svg) {
      host.innerHTML = Core.svgString(store.doc.fills, {background:'transparent'}).replace(/<\?xml[^>]*>\s*/, '');
      svg = host.querySelector('svg');
    }
    svg.id = 'editorSvg';
    svg.setAttribute('viewBox', '260 132 1004 748');
    svg.setAttribute('width', '1004');
    svg.setAttribute('height', '748');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Twenty independently paintable logo pieces');
    const bg = svg.querySelector('#background');
    if (bg) bg.remove();
    const undercoats = svg.querySelector('#seam-undercoats');
    undercoats.setAttribute('pointer-events', 'none');
    undercoatNodes = new Map();
    Array.from(undercoats.querySelectorAll('use')).forEach(function (use) {
      const id = (use.getAttribute('href') || use.getAttribute('xlink:href') || '').slice(1);
      const face = FACE_BY_ID.get(id);
      if (!face) return;
      // Independent editor undercoats avoid cloning focusable, interactive paths.
      const undercoat = node('path', {d:face.d, fill:store.doc.fills[id],
        stroke:store.doc.fills[id], 'pointer-events':'none', 'aria-hidden':'true'});
      use.replaceWith(undercoat);
      undercoatNodes.set(id, undercoat);
    });
    pathNodes = new Map();
    Core.FACES.forEach(function (face, index) {
      const path = svg.querySelector('#' + face.id);
      path.classList.add('paintable');
      path.setAttribute('data-face', face.id);
      path.setAttribute('pointer-events', 'all');
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', 'Piece ' + (index + 1) + ': ' + face.label);
      pathNodes.set(face.id, path);
    });
    const logo = svg.querySelector('#logo');
    guides = node('g', {id:'editor-guides', fill:'none', stroke:'#172D38',
      'stroke-opacity':'0.42', 'stroke-width':'0.85', 'stroke-linejoin':'round',
      'stroke-linecap':'round', 'pointer-events':'none', 'aria-hidden':'true'});
    Core.FACES.forEach(function (face) {
      guides.appendChild(node('path', {d:face.d, 'vector-effect':'non-scaling-stroke'}));
    });
    logo.appendChild(guides);
    hoverHalo = node('path', {id:'editor-hover-halo', fill:'none', stroke:'#FFFFFF',
      'stroke-width':'3.8', 'stroke-opacity':'0.95', 'stroke-linejoin':'round',
      'pointer-events':'none', 'aria-hidden':'true', 'vector-effect':'non-scaling-stroke', display:'none'});
    hoverLine = node('path', {id:'editor-hover', fill:'none', stroke:'#243D4A',
      'stroke-width':'1.4', 'stroke-linejoin':'round', 'pointer-events':'none',
      'aria-hidden':'true', 'vector-effect':'non-scaling-stroke', display:'none'});
    logo.appendChild(hoverHalo);
    logo.appendChild(hoverLine);
    labels = node('g', {id:'editor-labels', 'pointer-events':'none', 'aria-hidden':'true',
      'font-family':'ui-sans-serif,system-ui,sans-serif', 'text-anchor':'middle',
      'font-size':'13', 'font-weight':'600', fill:'#263A44'});
    LABEL_POSITIONS.forEach(function (position, index) {
      const x = position[0];
      const y = position[1] + (index === 16 || index === 17 ? -28 : index >= 18 ? 28 : 0);
      if (index >= 16) labels.appendChild(node('line', {x1:x, y1:position[1], x2:x, y2:y,
        stroke:'#63737A', 'stroke-width':'0.8', 'vector-effect':'non-scaling-stroke'}));
      labels.appendChild(node('circle', {cx:x, cy:y, r:'11.5', fill:'#FFFFFF',
        'fill-opacity':'0.93', stroke:'#7E8C92', 'stroke-width':'0.7', 'vector-effect':'non-scaling-stroke'}));
      const text = node('text', {x:x, y:y + 4.5});
      text.textContent = String(index + 1);
      labels.appendChild(text);
    });
    svg.appendChild(labels);
    renderFills();
    renderViewOptions();
  }

  function renderFills() {
    Core.FACES.forEach(function (face, index) {
      const fill = store.doc.fills[face.id];
      const path = pathNodes.get(face.id);
      path.setAttribute('fill', fill);
      path.setAttribute('aria-label', 'Piece ' + (index + 1) + ': ' + face.label + ', ' + (fill === 'none' ? 'transparent' : fill) + '. Press Enter to paint.');
      const undercoat = undercoatNodes.get(face.id);
      if (undercoat) {
        undercoat.setAttribute('fill', fill);
        undercoat.setAttribute('stroke', fill);
      }
    });
    const title = svg.querySelector('#logo-title');
    if (title) title.textContent = store.project.title + ' — ' + store.project.currentGlyph;
    if (hoveredId) showHover(hoveredId);
    renderHistory();
  }
  function renderHistory() {
    $('undoBtn').disabled = !store.canUndo;
    $('redoBtn').disabled = !store.canRedo;
    $('undoBtn').title = store.canUndo ? 'Undo: ' + store.undoLabel + ' (Ctrl / ⌘ Z)' : 'Nothing to undo';
    $('redoBtn').title = store.canRedo ? 'Redo: ' + store.redoLabel : 'Nothing to redo';
  }
  function renderPalette() {
    palettes = Model.getPalettes(store.project);
    const grid = $('paletteGrid');
    grid.replaceChildren();
    paletteButtons = [];
    paletteRows = [];
    palettes.forEach(function (family, familyIndex) {
      const row = document.createElement('div');
      row.className = 'palette-row';
      row.setAttribute('data-family-id', family.id);
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'family-use';
      use.draggable = true;
      use.setAttribute('draggable', 'true');
      use.setAttribute('data-family-id', family.id);
      use.addEventListener('click', function () {
        if (!store.usedFamilies().some(function (entry) { return entry.familyId === family.id && entry.count; })) return;
        remapSource = remapSource === family.id ? null : family.id;
        renderFamilyUsage();
      });
      use.addEventListener('dragstart', function (event) {
        if (!store.usedFamilies().some(function (entry) { return entry.familyId === family.id && entry.count; })) {
          event.preventDefault(); return;
        }
        remapSource = family.id;
        if (event.dataTransfer) {
          event.dataTransfer.setData('text/plain', family.id);
          event.dataTransfer.effectAllowed = 'move';
        }
        renderFamilyUsage();
      });
      use.addEventListener('dragend', function () {
        remapSource = null;
        paletteRows.forEach(function (item) { item.row.classList.remove('is-drop-target'); });
        renderFamilyUsage();
      });
      row.appendChild(use);
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'family-name';
      name.textContent = family.name;
      name.title = family.name;
      name.addEventListener('click', function () {
        if (remapSource) applyFamilyRemap(remapSource, family.id);
        else selectSwatch(familyIndex, settings.shade);
      });
      row.appendChild(name);
      family.colors.forEach(function (hex, shadeIndex) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'swatch';
        button.style.backgroundColor = hex;
        button.setAttribute('data-family', String(familyIndex));
        button.setAttribute('data-shade', String(shadeIndex));
        button.setAttribute('aria-label', family.name + ', ' + toneName(shadeIndex) + ', ' + hex);
        const actual = family.meta && family.meta[shadeIndex] && family.meta[shadeIndex].actual;
        button.title = family.name + ' · ' + toneName(shadeIndex) + ' · ' + hex +
          (actual ? ' · L ' + (actual.L * 100).toFixed(1) + '% · C ' + actual.C.toFixed(3) : '');
        button.addEventListener('click', function () {
          if (remapSource) { applyFamilyRemap(remapSource, family.id); return; }
          const repeat = settings.tool === 'paint' && settings.brushLinked &&
            settings.family === familyIndex && settings.shade === shadeIndex;
          selectSwatch(familyIndex, repeat ? (shadeIndex + 1) % 3 : shadeIndex);
        });
        row.appendChild(button);
        paletteButtons.push({button:button, family:familyIndex, shade:shadeIndex, color:hex});
      });
      row.addEventListener('contextmenu', function (event) {
        event.preventDefault();
        cycleFamilyTag(family.id, event.shiftKey ? -1 : 1);
      });
      row.addEventListener('dragover', function (event) {
        if (!remapSource) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', function (event) {
        if (!event.relatedTarget || !row.contains(event.relatedTarget)) row.classList.remove('is-drop-target');
      });
      row.addEventListener('drop', function (event) {
        event.preventDefault();
        row.classList.remove('is-drop-target');
        const source = remapSource || (event.dataTransfer && event.dataTransfer.getData('text/plain'));
        if (source && palettes.some(function (item) { return item.id === source; })) applyFamilyRemap(source, family.id);
      });
      paletteRows.push({row:row, use:use, familyId:family.id});
      grid.appendChild(row);
    });
    $('paletteSummary').textContent = palettes.length + ' families · 3 tones';
    $('addFamilyBtn').disabled = store.project.customPalettes.length >= 8;
    renderFamilyUsage();
    renderBrush();
  }
  function renderFamilyUsage() {
    const used = new Map(store.usedFamilies().map(function (entry) { return [entry.familyId, entry]; }));
    paletteRows.forEach(function (item) {
      const info = used.get(item.familyId);
      const count = info ? info.count : 0;
      item.use.textContent = count ? String(count) : '·';
      item.use.disabled = !count;
      item.use.draggable = !!count;
      item.use.setAttribute('data-used', String(!!count));
      item.use.setAttribute('aria-pressed', String(remapSource === item.familyId));
      const family = palettes.find(function (entry) { return entry.id === item.familyId; });
      item.use.title = count ? family.name + ': ' + count + ' linked pieces. Drag to another row, or click then choose a destination.' :
        family.name + ': no linked pieces in this design.';
      item.use.setAttribute('aria-label', item.use.title);
      item.row.classList.toggle('is-remap-source', remapSource === item.familyId);
    });
    const source = palettes.find(function (family) { return family.id === remapSource; });
    $('paletteRemapStatus').textContent = source ? 'Move ' + source.name + ': choose a destination row. Each piece keeps its column.' :
      'Numbered markers show rows used in this design. Drag a marker to another row, or tap it and then a row name.';
    $('cancelRemapBtn').hidden = !source;
  }
  function applyFamilyRemap(from, to, select) {
    finishStroke();
    finishPaletteEdit();
    try {
      const changed = store.remapFamily(from, to);
      remapSource = null;
      if (select !== false) {
        const index = palettes.findIndex(function (family) { return family.id === to; });
        if (index >= 0) selectSwatch(index, settings.shade);
      }
      if (changed) {
        afterEdit();
        const source = palettes.find(function (family) { return family.id === from; });
        const target = palettes.find(function (family) { return family.id === to; });
        toast(source.name + ' → ' + target.name + ' · columns preserved.');
      }
      renderFamilyUsage();
    } catch (error) { toast(error.message); }
  }
  function renderBrush() {
    const color = paintColor();
    const swatch = $('activeSwatch');
    swatch.style.backgroundColor = color === 'none' ? '#FFFFFF' : color;
    swatch.style.backgroundImage = color === 'none' ? 'repeating-conic-gradient(#d8dcd9 0% 25%, #fff 0% 50%)' : 'none';
    swatch.style.backgroundSize = color === 'none' ? '14px 14px' : 'auto';
    $('activeColorName').textContent = settings.tool === 'pick' ? 'Pick from artwork' :
      settings.tool === 'paint' && settings.brushLinked ? palettes[settings.family].name + ' · ' + toneName(settings.shade) :
      settings.tool === 'paint' ? 'Custom color · fixed' : colorName(color);
    $('activeHex').textContent = settings.tool === 'pick' ? 'Click a piece to sample' : color === 'none' ? 'No fill · transparent' : color;
    if (settings.brush !== 'none') {
      $('customColor').value = settings.brush.toLowerCase();
      if (document.activeElement !== $('customHex')) $('customHex').value = settings.brush;
    }
    paletteButtons.forEach(function (item) {
      const selected = settings.tool === 'paint' && settings.brushLinked &&
        item.family === settings.family && item.shade === settings.shade;
      item.button.setAttribute('aria-pressed', String(selected));
    });
    paletteRows.forEach(function (item, index) {
      item.row.classList.toggle('is-active', settings.tool === 'paint' && settings.brushLinked && index === settings.family);
    });
    [['paintTool','paint'],['whiteTool','white'],['clearTool','clear'],['sampleTool','pick']].forEach(function (pair) {
      $(pair[0]).setAttribute('aria-pressed', String(!panMode && settings.tool === pair[1]));
    });
    $('shadeDarker').disabled = settings.shade <= 0;
    $('shadeLighter').disabled = settings.shade >= 2;
    $('panTool').setAttribute('aria-pressed', String(panMode));
    host.classList.toggle('is-sampling', settings.tool === 'pick' && !panMode && !spaceHeld);
    host.classList.toggle('is-panning', panMode || spaceHeld);
    host.classList.toggle('is-dragging', !!drag);
    viewport.setAttribute('aria-label', 'Painting canvas. Active ' + (panMode ? 'pan tool' : colorName(color)) + '. Scroll changes brush tool; arrow up/down changes shade; left/right changes color family.');
  }
  function selectSwatch(family, shade) {
    cycleWhiteFace = null;
    settings.family = modulo(family, palettes.length);
    settings.shade = clamp(shade, 0, 2);
    settings.brush = palettes[settings.family].colors[settings.shade];
    settings.brushLinked = true;
    settings.tool = 'paint';
    panMode = false;
    renderBrush();
    queueSave();
  }
  /** @param {string} familyId @param {number} delta */
  function cycleFamilyTag(familyId, delta) {
    const source = palettes.findIndex(function (/** @type {{id:string}} */ family) { return family.id === familyId; });
    if (source < 0) throw new Error('Unknown palette row: ' + familyId);
    const target = palettes[modulo(source + delta, palettes.length)];
    applyFamilyRemap(familyId, target.id, false);
  }
  /** @param {number} delta */
  function stepFamily(delta) {
    const target = modulo(settings.family + delta, palettes.length);
    selectSwatch(target, settings.shade);
  }
  function stepShade(delta) { selectSwatch(settings.family, settings.shade + delta); }
  function setTool(tool) {
    finishStroke();
    cycleWhiteFace = null;
    settings.tool = tool;
    panMode = false;
    renderBrush();
    queueSave();
  }
  function useCustomColor(value) {
    try {
      const hex = Core.normalizeColor(value);
      if (hex === 'none') { setTool('clear'); return true; }
      settings.brush = hex;
      settings.brushLinked = false;
      settings.tool = 'paint';
      panMode = false;
      for (let i = 0; i < palettes.length; i += 1) {
        const shade = palettes[i].colors.indexOf(hex);
        if (shade !== -1) { settings.family = i; settings.shade = shade; break; }
      }
      $('customHex').removeAttribute('aria-invalid');
      renderBrush();
      queueSave();
      return true;
    } catch (_) {
      $('customHex').setAttribute('aria-invalid', 'true');
      toast('Use a hex color such as #8C1515.');
      return false;
    }
  }
  function pickFace(id) {
    const color = store.doc.fills[id];
    if (color === 'none') setTool('clear');
    else {
      useCustomColor(color);
      const binding = store.doc.bindings[id];
      if (binding) {
        const index = palettes.findIndex(function (family) { return family.id === binding.familyId; });
        if (index >= 0 && palettes[index].colors[binding.shade] === color) {
          settings.family = index;
          settings.shade = binding.shade;
          settings.brushLinked = true;
          renderBrush();
        }
      }
    }
    toast('Picked ' + (color === 'none' ? 'transparent' : color + ' · ' + colorName(color)));
  }

  function glyphLabel(glyph) { return glyph === ' ' ? '␠' : glyph; }
  function galleryKeys(scope) {
    const documents = store.project.documents;
    const designKeys = Object.keys(documents).filter(function (key) { return key === '@original'; });
    const key = scope || settings.galleryFilter || 'uppercase';
    if (key === 'designs') return designKeys;
    if (key === 'saved') return Object.keys(documents).filter(function (item) { return documents[item].touched; });
    if (key === 'all') return designKeys.concat(Object.keys(documents).filter(function (item) { return documents[item].kind !== 'design'; }));
    const sequence = Core.SEQUENCES[key] || Core.SEQUENCES.uppercase;
    return designKeys.concat(sequence.filter(function (item) { return Object.prototype.hasOwnProperty.call(documents, item); }));
  }
  function sheetKeys(scope) {
    if (scope === 'gallery') return galleryKeys();
    if (scope === 'all' || scope === 'saved') return galleryKeys(scope);
    return (Core.SEQUENCES[scope] || Core.SEQUENCES.uppercase).filter(function (key) {
      return Object.prototype.hasOwnProperty.call(store.project.documents, key);
    });
  }
  function thumbnail(fills, outline) {
    return Sheet.thumbnailSvg(fills, {outline:outline, background:'white'});
  }
  function renderGlyphStrip() {
    const strip = $('glyphStrip');
    strip.replaceChildren();
    glyphButtons = [];
    const keys = galleryKeys();
    keys.forEach(function (glyph) {
      const doc = store.project.documents[glyph];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'glyph-card';
      button.setAttribute('data-glyph', glyph);
      const preview = document.createElement('div');
      preview.className = 'glyph-preview';
      preview.setAttribute('aria-hidden', 'true');
      preview.innerHTML = thumbnail(doc.fills, doc.kind !== 'design');
      button.appendChild(preview);
      const caption = document.createElement('div');
      caption.className = 'glyph-caption';
      const letter = document.createElement('span');
      letter.className = doc.kind === 'design' ? 'glyph-name' : 'glyph-letter';
      letter.textContent = doc.kind === 'design' ? doc.name : glyphLabel(glyph);
      const status = document.createElement('span');
      status.className = 'glyph-status';
      status.textContent = doc.touched ? 'Edited' : doc.kind === 'design' ? '' : !Sheet.hasVisibleFills(doc.fills) ? 'Blank' : doc.seedStatus === 'curated' ? 'Curated' : 'Guess';
      caption.appendChild(letter);
      caption.appendChild(status);
      button.appendChild(caption);
      button.addEventListener('click', function () { switchGlyph(glyph); });
      glyphButtons.push({button:button, preview:preview, status:status, glyph:glyph});
      strip.appendChild(button);
    });
    $('galleryFilter').value = settings.galleryFilter || 'uppercase';
    const characters = keys.filter(function (key) { return store.project.documents[key].kind !== 'design'; });
    $('gallerySummary').textContent = characters.length + ' characters · ' +
      (keys.length - characters.length) + ' designs';
    updateGlyphStates();
  }
  function updateGlyphStates() {
    glyphButtons.forEach(function (item) {
      const doc = store.project.documents[item.glyph];
      const saved = doc.touched;
      const active = item.glyph === store.project.currentGlyph;
      item.button.setAttribute('data-saved', String(saved));
      item.button.setAttribute('aria-current', String(active));
      const label = doc.kind === 'design' ? doc.name : item.glyph === ' ' ? 'Space' : item.glyph;
      const note = doc.kind === 'design' ? (Glyphs.getDesign(item.glyph) || {}).note : Glyphs.getSeed(item.glyph).note;
      item.button.title = label + (saved ? ' · edited draft' : doc.seedStatus === 'guess' ? ' · starting guess' : '') +
        (note ? '. ' + note : '');
      item.button.setAttribute('aria-label', item.button.title);
      if (active) {
        item.preview.innerHTML = thumbnail(doc.fills, doc.kind !== 'design');
        item.status.textContent = doc.touched ? 'Edited' : doc.kind === 'design' ? '' : !Sheet.hasVisibleFills(doc.fills) ? 'Blank' : doc.seedStatus === 'curated' ? 'Curated' : 'Guess';
      }
    });
    $('glyphInput').value = store.doc.kind === 'design' ? '' : store.project.currentGlyph;
    $('glyphInput').placeholder = store.doc.kind === 'design' ? '—' : 'A';
    $('glyphInput').title = store.doc.kind === 'design' ? store.doc.name + ' design; enter a character to switch' : 'Enter any character';
    $('glyphSet').value = store.project.sequenceName;
  }
  function commitName() {
    const changed = store.setTitle($('designName').value);
    $('designName').value = store.project.title;
    if (changed) { renderHistory(); queueSave(); }
  }
  function switchGlyph(glyph) {
    cycleWhiteFace = null;
    finishStroke();
    finishPaletteEdit();
    commitName();
    try {
      store.selectGlyph(glyph, {seed:settings.seed});
      remapSource = null;
      showHover(null);
      renderFills();
      renderViewOptions();
      renderGlyphStrip();
      renderFamilyUsage();
      queueSave();
    } catch (error) {
      $('glyphInput').value = store.project.currentGlyph;
      toast(error.message);
    }
  }
  function nextGlyph(delta) {
    cycleWhiteFace = null;
    finishStroke();
    finishPaletteEdit();
    commitName();
    try {
      store.stepGlyph(delta, {seed:settings.seed});
      remapSource = null;
      showHover(null);
      renderFills();
      renderViewOptions();
      renderGlyphStrip();
      renderFamilyUsage();
      queueSave();
    } catch (error) { toast(error.message); }
  }
  function afterEdit() {
    renderFills();
    renderFamilyUsage();
    updateGlyphStates();
    queueSave();
  }
  function renderEverything() {
    cycleWhiteFace = null;
    settings = store.project.settings;
    palettes = Model.getPalettes(store.project);
    remapSource = null;
    $('designName').value = store.project.title;
    renderPalette();
    renderPaletteControls();
    renderFills();
    renderViewOptions();
    renderGlyphStrip();
    fitArtwork(true);
  }
  function applyPreset(preset) {
    cycleWhiteFace = null;
    finishStroke();
    finishPaletteEdit();
    if (store.reset(preset)) afterEdit();
  }
  function renderViewOptions() {
    guides.setAttribute('display', settings.showGuides ? 'inline' : 'none');
    labels.setAttribute('display', settings.showIds ? 'inline' : 'none');
    $('showOutlines').checked = settings.showGuides;
    $('showLabels').checked = settings.showIds;
    const checker = settings.background === 'transparent';
    $('canvasBackground').value = checker ? 'checker' : 'white';
    viewport.classList.toggle('checker', checker);
    $('nextMode').value = settings.seed;
    $('exportTransparent').checked = settings.exportTransparent !== false;
    $('cornerMode').value = store.doc.cornerMode;
    $('sheetScope').value = settings.sheetScope || 'uppercase';
    $('sheetOutlines').checked = settings.sheetOutlines !== false;
    sheetNonblankOnly.checked = settings.sheetNonblankOnly === true;
  }

  const paletteFields = [
    ['lightnessCenter','lightnessCenterValue','lightness'],
    ['lightnessSpread','lightnessSpreadValue','lightnessRange'],
    ['chromaScale','chromaScaleValue','chroma'],
    ['chromaSpread','chromaSpreadValue','chromaRange']
  ];
  function renderPaletteControls() {
    const config = store.project.paletteConfig;
    $('paletteMode').value = config.mode;
    paletteFields.forEach(function (field) {
      $(field[0]).value = String(config[field[2]]);
      $(field[1]).textContent = field[2] === 'chroma' ? config.chroma.toFixed(2) + '×' :
        (config[field[2]] * 100).toFixed(1) + '%';
      $(field[0]).disabled = config.mode === 'reference' ||
        (field[2] === 'lightnessRange' && config.mode === 'chroma') ||
        (field[2] === 'chromaRange' && config.mode === 'lightness');
    });
    ['paletteTone1','paletteTone2','paletteTone3'].forEach(function (id, index) {
      $(id).textContent = config.mode === 'chroma' ? ['Muted','Mid','Vivid'][index] : ['Low','Mid','High'][index];
    });
  }
  function beginPaletteEdit() {
    if (paletteEditing) return;
    finishStroke();
    paletteEditing = true;
    store.beginEdit('Adjust palette');
  }
  function applyPaletteInputs() {
    paletteFrame = null;
    if (!paletteDirty) return;
    paletteDirty = false;
    const config = pendingPaletteValues;
    pendingPaletteValues = {};
    store.updatePalette(config);
    settings = store.project.settings;
    palettes = Model.getPalettes(store.project);
    if (settings.brushLinked) settings.brush = palettes[settings.family].colors[settings.shade];
    renderPalette();
    renderPaletteControls();
    renderFills();
    renderFamilyUsage();
  }
  function finishPaletteEdit() {
    if (!paletteEditing) return;
    if (paletteFrame !== null) cancelAnimationFrame(paletteFrame);
    applyPaletteInputs();
    paletteEditing = false;
    store.endEdit();
    renderHistory();
    renderGlyphStrip();
    queueSave();
  }
  function queuePaletteInputs(event) {
    beginPaletteEdit();
    const target = event && event.target;
    const field = paletteFields.find(function (item) { return $(item[0]) === target; });
    if (field) pendingPaletteValues[field[2]] = Number(target.value);
    else pendingPaletteValues.mode = $('paletteMode').value;
    paletteDirty = true;
    if (paletteFrame === null) paletteFrame = requestAnimationFrame(applyPaletteInputs);
  }
  paletteFields.forEach(function (field) {
    $(field[0]).addEventListener('pointerdown', beginPaletteEdit);
    $(field[0]).addEventListener('input', queuePaletteInputs);
    $(field[0]).addEventListener('change', function (event) {
      queuePaletteInputs(event);
      finishPaletteEdit();
    });
    $(field[0]).addEventListener('blur', finishPaletteEdit);
  });
  window.addEventListener('pointerup', finishPaletteEdit);
  $('paletteMode').addEventListener('change', function (event) {
    queuePaletteInputs(event);
    finishPaletteEdit();
  });
  $('resetPaletteBtn').addEventListener('click', function () {
    finishStroke();
    finishPaletteEdit();
    store.beginEdit('Reset palette to Cardinal');
    store.updatePalette(Color.DEFAULTS);
    settings = store.project.settings;
    palettes = Model.getPalettes(store.project);
    if (settings.brushLinked) settings.brush = palettes[settings.family].colors[settings.shade];
    store.endEdit();
    renderEverything();
    queueSave();
  });
  $('cancelRemapBtn').addEventListener('click', function () { remapSource = null; renderFamilyUsage(); });
  $('cornerMode').addEventListener('change', function () {
    finishStroke();
    finishPaletteEdit();
    if (store.setCornerMode(this.value)) afterEdit();
  });
  $('galleryFilter').addEventListener('change', function () {
    settings.galleryFilter = this.value;
    renderGlyphStrip();
    queueSave();
  });
  $('sheetScope').addEventListener('change', function () { settings.sheetScope = this.value; queueSave(); });
  $('sheetOutlines').addEventListener('change', function () { settings.sheetOutlines = this.checked; queueSave(); });
  sheetNonblankOnly.addEventListener('change', function () { settings.sheetNonblankOnly = sheetNonblankOnly.checked; queueSave(); });

  function fitArtwork(preserveCenter) {
    const availableWidth = viewport.clientWidth || 900;
    const availableHeight = viewport.clientHeight || 550;
    const oldLeft = (viewport.scrollLeft || 0) + availableWidth / 2 - Math.max(0, (availableWidth - artworkWidth) / 2);
    const oldTop = (viewport.scrollTop || 0) + availableHeight / 2 - Math.max(0, (availableHeight - artworkHeight) / 2);
    const cx = artworkWidth ? oldLeft / artworkWidth : 0.5;
    const cy = artworkHeight ? oldTop / artworkHeight : 0.5;
    const scale = Math.min(availableWidth / 1004, availableHeight / 748) * settings.zoom;
    artworkWidth = Math.max(1, 1004 * scale);
    artworkHeight = Math.max(1, 748 * scale);
    host.style.width = artworkWidth + 'px';
    host.style.height = artworkHeight + 'px';
    host.style.marginTop = Math.max(0, (availableHeight - artworkHeight) / 2) + 'px';
    host.style.marginBottom = host.style.marginTop;
    if (preserveCenter) {
      viewport.scrollLeft = Math.max(0, cx * artworkWidth - availableWidth / 2);
      viewport.scrollTop = Math.max(0, cy * artworkHeight - availableHeight / 2);
    } else {
      viewport.scrollLeft = Math.max(0, (artworkWidth - availableWidth) / 2);
      viewport.scrollTop = Math.max(0, (artworkHeight - availableHeight) / 2);
    }
    $('zoomReset').textContent = Math.round(settings.zoom * 100) + '%';
    $('zoomIn').disabled = settings.zoom >= 16;
    $('zoomOut').disabled = settings.zoom <= 0.5;
  }
  function setZoom(value, reset) {
    settings.zoom = clamp(value, 0.5, 16);
    fitArtwork(!reset);
    queueSave();
  }
  function faceFrom(element) {
    if (!element || typeof element.closest !== 'function') return null;
    const path = element.closest('[data-face]');
    return path && host.contains(path) ? path.getAttribute('data-face') : null;
  }
  function faceAt(event) {
    const target = document.elementFromPoint && Number.isFinite(event.clientX) && Number.isFinite(event.clientY) ?
      document.elementFromPoint(event.clientX, event.clientY) : event.target;
    return faceFrom(target);
  }
  function paintOne(id) {
    if (!id || visitedInStroke.has(id)) return;
    if (Glyphs.CORNER_PARENTS[id] && store.doc.cornerMode !== 'manual') return;
    visitedInStroke.add(id);
    const binding = settings.tool === 'paint' && settings.brushLinked ?
      {familyId:palettes[settings.family].id, shade:settings.shade} : null;
    if (store.paint(id, paintColor(), binding)) {
      renderFills();
      renderFamilyUsage();
    }
    showHover(id);
  }
  function finishStroke() {
    if (!drawing) return;
    drawing = false;
    const finishedPointer = strokePointer;
    strokePointer = null;
    try { if (finishedPointer !== null) host.releasePointerCapture(finishedPointer); } catch (_) {}
    visitedInStroke.clear();
    const changed = store.endEdit();
    renderHistory();
    if (changed) {
      updateGlyphStates();
    }
    queueSave();
  }
  function clickPaint(id) {
    if (!id) return;
    if (settings.tool === 'pick') { pickFace(id); return; }
    if (!canPaintFace(id)) return;
    cycleMatchingFace(id);
    const binding = settings.tool === 'paint' && settings.brushLinked ?
      {familyId:palettes[settings.family].id, shade:settings.shade} : null;
    if (store.paint(id, paintColor(), binding)) afterEdit();
    showHover(id);
  }
  function canPaintFace(id) {
    if (!Glyphs.CORNER_PARENTS[id] || store.doc.cornerMode === 'manual') return true;
    toast(store.doc.cornerMode === 'clear' ? 'Tiny corners are transparent. Choose “Paint manually” to color one.' :
      'This corner follows its ending leg. Choose “Paint manually” to color it separately.');
    showHover(id);
    return false;
  }
  function cycleMatchingFace(id) {
    if (cycleWhiteFace === id && settings.tool === 'white' && store.doc.fills[id] === '#FFFFFF') {
      selectSwatch(settings.family, 0);
    } else if (settings.tool === 'paint' && settings.brushLinked && store.doc.fills[id] === settings.brush) {
      if (settings.shade === 2) {
        setTool('white');
        cycleWhiteFace = id;
      } else selectSwatch(settings.family, settings.shade + 1);
    } else cycleWhiteFace = null;
  }

  host.addEventListener('pointerdown', function (event) {
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      if (event.button === 1) stepFamily(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.button !== 0 || event.isPrimary === false) return;
    viewport.focus({preventScroll:true});
    if (panMode || spaceHeld) {
      event.preventDefault();
      finishStroke();
      drag = {x:event.clientX, y:event.clientY, left:viewport.scrollLeft || 0,
        top:viewport.scrollTop || 0, pointer:event.pointerId};
      try { host.setPointerCapture(event.pointerId); } catch (_) {}
      showHover(null);
      renderBrush();
      return;
    }
    const id = faceFrom(event.target);
    if (!id) return;
    event.preventDefault();
    if (event.altKey || settings.tool === 'pick') { pickFace(id); return; }
    if (!canPaintFace(id)) return;
    finishPaletteEdit();
    cycleMatchingFace(id);
    drawing = true;
    strokePointer = event.pointerId;
    visitedInStroke = new Set();
    try { host.setPointerCapture(event.pointerId); } catch (_) {}
    store.beginEdit(settings.tool === 'clear' ? 'Clear pieces' : 'Paint pieces');
    paintOne(id);
  });
  window.addEventListener('pointermove', function (event) {
    if (drag) {
      if (event.pointerId !== drag.pointer) return;
      viewport.scrollLeft = drag.left - (event.clientX - drag.x);
      viewport.scrollTop = drag.top - (event.clientY - drag.y);
      return;
    }
    if (drawing && event.pointerId === strokePointer) {
      if (event.pointerType === 'mouse' && Number.isInteger(event.buttons) && !(event.buttons & 1)) finishStroke();
      else paintOne(faceAt(event));
    }
  });
  host.addEventListener('pointermove', function (event) {
    if (!drag) showHover(faceAt(event));
  });
  host.addEventListener('pointerleave', function () { if (!drawing) showHover(null); });
  function releasePointer(event) {
    if (drawing && (event.pointerId === strokePointer || event.type === 'blur')) finishStroke();
    if (drag && (event.pointerId === drag.pointer || event.type === 'blur')) {
      try { host.releasePointerCapture(drag.pointer); } catch (_) {}
      drag = null;
      renderBrush();
    }
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  host.addEventListener('lostpointercapture', releasePointer);
  window.addEventListener('blur', function (event) {
    releasePointer(event);
    finishPaletteEdit();
    spaceHeld = false;
    renderBrush();
    saveNow();
  });
  host.addEventListener('contextmenu', function (event) {
    event.preventDefault();
    const id = faceFrom(event.target);
    if (!id) return;
    const binding = store.doc.bindings[id];
    if (!binding) {
      toast('This piece is not linked to a palette row. Paint it with a palette colour first.');
      return;
    }
    cycleFamilyTag(binding.familyId, event.shiftKey ? -1 : 1);
    showHover(id);
  });
  host.addEventListener('auxclick', function (event) { event.preventDefault(); });
  host.addEventListener('dragstart', function (event) { event.preventDefault(); });
  host.addEventListener('click', function (event) {
    if (event.detail === 0 || event.detail === undefined) {
      if (event.altKey) { const id = faceFrom(event.target); if (id) pickFace(id); }
      else if (!panMode) clickPaint(faceFrom(event.target));
    }
  });
  host.addEventListener('focusin', function (event) { const id = faceFrom(event.target); if (id) showHover(id); });
  host.addEventListener('focusout', function () { if (!drawing) showHover(null); });

  viewport.addEventListener('wheel', function (event) {
    if (event.ctrlKey || event.metaKey) return;
    if (panMode || spaceHeld) return;
    const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    const horizontal = event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = (horizontal ? (event.deltaX || event.deltaY) : event.deltaY) * factor;
    if (!delta) return;
    event.preventDefault();
    const now = performance.now();
    if (now - wheelLast > 200 || Math.sign(delta) !== Math.sign(wheelAmount)) wheelAmount = 0;
    wheelLast = now;
    wheelAmount += delta;
    if (Math.abs(wheelAmount) < 28 || now - wheelActionAt < 95) return;
    const direction = wheelAmount > 0 ? 1 : -1;
    wheelAmount = 0;
    wheelActionAt = now;
    const tools = ['paint', 'white', 'clear', 'pick'];
    setTool(tools[modulo(tools.indexOf(settings.tool) + direction, tools.length)]);
  }, {passive:false});

  function isTyping(target) {
    return !!(target && (target.isContentEditable || target.closest &&
      target.closest('input:not([type="range"]):not([type="checkbox"]):not([type="color"]),textarea,select,[contenteditable="true"]')));
  }
  document.addEventListener('keydown', function (event) {
    if (isTyping(event.target)) return;
    const key = String(event.key || '');
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      if (key.toLowerCase() === 'z') {
        event.preventDefault();
        finishStroke();
        finishPaletteEdit();
        if (event.shiftKey ? store.redo() : store.undo()) { renderEverything(); queueSave(); }
        return;
      }
      if (key.toLowerCase() === 'y') {
        event.preventDefault();
        finishStroke();
        finishPaletteEdit();
        if (store.redo()) { renderEverything(); queueSave(); }
        return;
      }
      return;
    }
    const face = faceFrom(event.target);
    if (face && (key === 'Enter' || key === ' ')) {
      event.preventDefault();
      if (!event.repeat) clickPaint(face);
      return;
    }
    const inCanvas = viewport.contains(event.target) || event.target === viewport;
    if (key === ' ' && inCanvas) {
      event.preventDefault();
      spaceHeld = true;
      renderBrush();
      return;
    }
    if (key === 'Escape') {
      finishStroke();
      finishPaletteEdit();
      remapSource = null;
      panMode = false;
      spaceHeld = false;
      settings.tool = 'paint';
      renderBrush();
      renderFamilyUsage();
      return;
    }
    if (!inCanvas) return;
    const actions = {
      ArrowUp:function () { stepShade(1); },
      ArrowDown:function () { stepShade(-1); },
      ArrowLeft:function () { stepFamily(-1); },
      ArrowRight:function () { stepFamily(1); },
      '+':function () { setZoom(settings.zoom * 1.25); },
      '=':function () { setZoom(settings.zoom * 1.25); },
      '-':function () { setZoom(settings.zoom / 1.25); },
      '0':function () { setZoom(1, true); },
      b:function () { setTool('paint'); },
      e:function () { setTool('clear'); },
      i:function () { setTool('pick'); }
    };
    if (actions[key]) { event.preventDefault(); actions[key](); }
  });
  document.addEventListener('keyup', function (event) {
    if (event.key === ' ' && spaceHeld) { spaceHeld = false; renderBrush(); }
  });

  $('familyPrev').addEventListener('click', function () { stepFamily(-1); });
  $('familyNext').addEventListener('click', function () { stepFamily(1); });
  $('shadeDarker').addEventListener('click', function () { stepShade(-1); });
  $('shadeLighter').addEventListener('click', function () { stepShade(1); });
  [['paintTool','paint'],['whiteTool','white'],['clearTool','clear'],['sampleTool','pick']].forEach(function (pair) {
    $(pair[0]).addEventListener('click', function () { setTool(pair[1]); });
  });
  $('panTool').addEventListener('click', function () {
    finishStroke();
    panMode = !panMode;
    renderBrush();
    showHover(null);
  });
  $('customColor').addEventListener('input', function () { useCustomColor(this.value); });
  $('customHex').addEventListener('change', function () { useCustomColor(this.value); });
  $('customHex').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && useCustomColor(this.value)) { this.value = settings.brush; this.blur(); }
  });
  $('addFamilyBtn').addEventListener('click', function () {
    try {
      const base = Core.normalizeColor($('customHex').value);
      store.addFamily($('customFamilyName').value || 'Custom ' + (store.project.customPalettes.length + 1), base);
      renderHistory();
      renderPalette();
      selectSwatch(palettes.length - 1, 1);
      $('customFamilyName').value = '';
      toast(palettes[palettes.length - 1].name + ': three tones added.');
    } catch (error) { toast(error.message); }
  });
  $('customFamilyName').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') $('addFamilyBtn').click();
  });
  $('undoBtn').addEventListener('click', function () {
    finishStroke(); finishPaletteEdit();
    if (store.undo()) { renderEverything(); queueSave(); }
  });
  $('redoBtn').addEventListener('click', function () {
    finishStroke(); finishPaletteEdit();
    if (store.redo()) { renderEverything(); queueSave(); }
  });
  $('fillAllBtn').addEventListener('click', function () {
    finishStroke();
    finishPaletteEdit();
    if (settings.tool === 'pick') { toast('Choose a color before using Fill all.'); return; }
    const fills = {};
    const bindings = {};
    Core.FACES.forEach(function (face) { fills[face.id] = paintColor(); });
    if (settings.tool === 'paint' && settings.brushLinked) Core.FACES.forEach(function (face) {
      bindings[face.id] = {familyId:palettes[settings.family].id, shade:settings.shade};
    });
    if (store.setFills(fills, 'Fill all pieces', bindings)) afterEdit();
  });
  $('blankBtn').addEventListener('click', function () { applyPreset('white'); });
  $('restoreBtn').addEventListener('click', function () { applyPreset('reference'); });
  $('cardinalBtn').title = 'Use Cardinal red tones with the original cool grays';
  $('cardinalBtn').addEventListener('click', function () { applyPreset('cardinal'); });
  $('designName').addEventListener('change', commitName);
  $('designName').addEventListener('keydown', function (event) { if (event.key === 'Enter') { commitName(); this.blur(); } });
  $('nextGlyph').addEventListener('click', function () { nextGlyph(1); });
  $('prevGlyph').addEventListener('click', function () { nextGlyph(-1); });
  $('glyphInput').addEventListener('change', function () { switchGlyph(this.value); });
  $('glyphInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') { switchGlyph(this.value); this.blur(); }
    if (event.key === 'Escape') { this.value = store.project.currentGlyph; this.blur(); }
  });
  $('glyphSet').addEventListener('change', function () {
    finishStroke();
    finishPaletteEdit();
    commitName();
    try {
      store.setSequence(this.value, {seed:settings.seed});
      settings.galleryFilter = this.value;
      showHover(null);
      renderFills();
      renderViewOptions();
      renderGlyphStrip();
      renderFamilyUsage();
      queueSave();
    } catch (error) { toast(error.message); }
  });
  $('nextMode').addEventListener('change', function () { settings.seed = this.value; queueSave(); });
  $('showOutlines').addEventListener('change', function () {
    settings.showGuides = this.checked;
    renderViewOptions();
    queueSave();
  });
  $('showLabels').addEventListener('change', function () {
    settings.showIds = this.checked;
    renderViewOptions();
    queueSave();
  });
  $('canvasBackground').addEventListener('change', function () {
    settings.background = this.value === 'checker' ? 'transparent' : 'white';
    renderViewOptions();
    queueSave();
  });
  $('exportTransparent').addEventListener('change', function () {
    settings.exportTransparent = this.checked;
    queueSave();
  });
  $('zoomIn').addEventListener('click', function () { setZoom(settings.zoom * 1.25); });
  $('zoomOut').addEventListener('click', function () { setZoom(settings.zoom / 1.25); });
  $('zoomReset').addEventListener('click', function () { setZoom(1, true); });
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(function () { fitArtwork(true); resizeFrame = null; });
    }).observe(viewport);
  } else {
    window.addEventListener('resize', function () { fitArtwork(true); });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  async function exportArtwork(type, advance) {
    if (exportBusy) return;
    finishStroke();
    finishPaletteEdit();
    commitName();
    const key = store.project.currentGlyph;
    const glyph = store.doc.kind === 'design' ? key.replace(/^@/, '') : key;
    const name = store.project.title;
    const fills = Object.assign({}, store.doc.fills);
    const options = {name:name, glyph:store.doc.kind === 'design' ? store.doc.name : glyph,
      background:$('exportTransparent').checked ? 'transparent' : 'white', scale:2};
    exportBusy = true;
    $('exportSvg').disabled = true;
    $('exportPng').disabled = true;
    $('exportAndNext').disabled = true;
    try {
      const blob = type === 'png' ? await Core.pngBlob(fills, options) : Core.svgBlob(fills, options);
      const filename = Core.filename(name, glyph, type);
      download(blob, filename);
      toast(filename + ' ready to download.');
      if (advance && store.project.currentGlyph === key) nextGlyph(1);
    } catch (error) {
      toast('Export failed: ' + error.message);
    } finally {
      exportBusy = false;
      $('exportSvg').disabled = false;
      $('exportPng').disabled = false;
      $('exportAndNext').disabled = false;
    }
  }
  $('exportSvg').addEventListener('click', function () { exportArtwork('svg', false); });
  $('exportPng').addEventListener('click', function () { exportArtwork('png', false); });
  $('exportAndNext').addEventListener('click', function () { exportArtwork('svg', true); });
  let sheetBusy = false;
  async function exportCharacterSheet(type) {
    if (sheetBusy) return;
    finishStroke();
    finishPaletteEdit();
    commitName();
    const scope = $('sheetScope').value;
    const keys = sheetKeys(scope);
    if (!keys.length) { toast('No edited studies yet. Choose a character set or the visible gallery.'); return; }
    let entries = keys.map(function (key) {
      const doc = store.project.documents[key];
      return {key:key, label:doc.kind === 'design' ? doc.name : key, kind:doc.kind,
        status:doc.touched ? 'edited' : doc.seedStatus, fills:Object.assign({}, doc.fills)};
    });
    try { entries = Sheet.selectEntries(entries, {nonblankOnly:sheetNonblankOnly.checked}); }
    catch (error) { toast(error instanceof Error ? error.message : String(error)); return; }
    const scopes = {uppercase:'A–Z', lowercase:'a–z', digits:'0–9', ascii:'Printable ASCII',
      all:'All characters and original', gallery:'Visible gallery', saved:'Edited studies'};
    const options = {title:store.project.title + ' · ' + scopes[scope],
      subtitle:entries.length + ' studies · edited colors and corner settings included',
      outline:$('sheetOutlines').checked, columns:6, scale:2};
    sheetBusy = true;
    $('sheetSvgBtn').disabled = true;
    $('sheetPngBtn').disabled = true;
    try {
      const blob = type === 'png' ? await Sheet.pngBlob(entries, options) : Sheet.svgBlob(entries, options);
      const filename = Core.filename(store.project.title + '-character-sheet', scope, type);
      download(blob, filename);
      toast(entries.length + '-study character sheet ready to download.');
    } catch (error) {
      toast('Sheet export failed: ' + error.message);
    } finally {
      sheetBusy = false;
      $('sheetSvgBtn').disabled = false;
      $('sheetPngBtn').disabled = false;
    }
  }
  $('sheetSvgBtn').addEventListener('click', function () { exportCharacterSheet('svg'); });
  $('sheetPngBtn').addEventListener('click', function () { exportCharacterSheet('png'); });
  $('saveProject').addEventListener('click', function () {
    finishStroke();
    finishPaletteEdit();
    commitName();
    try {
      const text = Model.projectString(store);
      download(new Blob([text], {type:'application/json;charset=utf-8'}), Core.filename(store.project.title + '-project', '', 'json'));
      saveNow();
      toast('Project download includes every character and custom palette.');
    } catch (error) { toast('Could not save project: ' + error.message); }
  });
  $('loadProject').addEventListener('click', function () { $('projectFile').click(); });
  $('projectFile').addEventListener('change', async function () {
    const file = this.files && this.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Please choose a project smaller than 2 MB.');
      const text = await file.text();
      const incoming = new Model.Store(Model.validateProject(text));
      const skipped = populateGallery(incoming);
      finishStroke();
      finishPaletteEdit();
      store = incoming;
      settings = store.project.settings;
      panMode = false;
      spaceHeld = false;
      renderEverything();
      fitArtwork(false);
      showHover(null);
      saveNow();
      toast('Opened ' + store.project.title + ' · ' + Object.keys(store.project.documents).length + ' drafts.' +
        (skipped ? ' Existing studies preserved; project capacity limits new starters.' : ''));
    } catch (error) { toast('Could not open project: ' + error.message); }
    this.value = '';
  });
  window.addEventListener('pagehide', function () { finishStroke(); finishPaletteEdit(); saveNow(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { finishStroke(); finishPaletteEdit(); saveNow(); }
  });

  $('designName').value = store.project.title;
  buildArtwork();
  renderPalette();
  renderPaletteControls();
  renderGlyphStrip();
  fitArtwork(false);
  saveNow();
  if (initialNotice) toast(initialNotice);
  // A small read-only integration surface for inspecting the standalone document.
  window.CardinalStudio = Object.freeze({
    geometryId:Core.GEOMETRY_ID,
    getProject:function () { return store.toJSON(); },
    getCurrentGlyph:function () { return store.project.currentGlyph; },
    getFills:function () { return Object.assign({}, store.doc.fills); }
  });
})();
