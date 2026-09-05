// The gallery lightbox: a card floating on a dimmed page, and nothing else.
//
// Every face of a pair's default sheet, typeset in the browser, one arrow key or
// one thumbnail click apart. The pair itself is editable from inside it -- either
// language, or the direction -- so `fr <- en` and `en <- fr` are one click apart
// rather than a trip back to the grid.
//
// There is deliberately no chrome around the card: no panel, no title, no caption.
// The card is the subject and the only opaque thing on screen. Everything else
// floats over the dim -- the pair above, the paging carets on the card's own
// edges, the thumbnails and the two buttons below.

import { languagePicker } from './language-picker.js';
import { nextIndex } from './keys.js';
import { languageName, t } from './i18n.js';
import { browserSheetContext, ensureFontCss, fontManifest, loadText } from './app.js';

/** @param {string} tag @param {Record<string,string>} attrs @param {(Node|string)[]} kids */
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

/**
 * Every face of a pair's default sheet, as SVG, solved once and kept.
 *
 * This runs the real engine for the *rest* of the sheet rather than reading it off
 * disk, and the reason is the arithmetic: a sheet is 1.5MB of SVG, or ~118KB gzipped,
 * so 420 ordered pairs is 50MB compressed and 670MB raw -- and a compact encoding of
 * the plan is no smaller, because the plan *is* the text, positioned. The first face
 * alone is 13KB gzipped, which is why `firstFace` above ships and this does not.
 *
 * The other thing pre-rendered is the expensive decision. Fitting a sheet means
 * searching for the fewest faces and the largest type that hold the content, which
 * re-measures and re-breaks the whole sheet at a dozen candidate scales.
 * `packs/index.json` already records the answer for every pair, so the lightbox pins
 * it and lays the sheet out exactly once: byte-identical output, measured 10-12x
 * faster. What is left is ~1.2s to typeset eight faces of 600 rows, and it now
 * happens behind a face the reader is already reading.
 * @type {Map<string, Promise<string[]>>}
 */
const sheets = new Map();
/** Geometry presets: one file, the same for every pair. */
/** @type {Promise<any>|null} */ let presetsOnce = null;

/**
 * The same faces, kept across visits.
 *
 * The in-memory map above only helps within one page: close the tab and every pair
 * is solved again from scratch -- and only the first face comes off disk, so faces two
 * onward are what this is for. Shipping all 420 pairs whole is the obvious alternative
 * and it is the 50MB above, which is the same arithmetic that stopped
 * `prerender_packs.mjs` committing PDFs. Keeping what a reader has actually looked at
 * costs nothing until they look.
 *
 * Cache Storage rather than IndexedDB because the service worker already owns a
 * cache per concern and this is one more; and keyed on `data/shell.json`'s version,
 * which is a content hash of every module and theme, so a change to the engine or
 * the type sizes invalidates a stale sheet rather than serving it.
 */
const SHEET_CACHE = 'plg-sheets';
/** @type {Promise<string>|null} */ let stamp = null;

function version() {
  stamp ??= loadText('data/shell.json')
    .then((text) => JSON.parse(text).version)
    // No manifest is not a reason to fail; it is a reason not to cache.
    .catch(() => '');
  return stamp;
}

/** @param {string} key @returns {Promise<string[]|null>} */
async function cached(key) {
  try {
    const v = await version();
    if (!v) return null;
    const hit = await (await caches.open(SHEET_CACHE)).match(`/__sheet/${key}?v=${v}`);
    return hit ? await hit.json() : null;
  } catch {
    // A quota error or a private-mode restriction is not worth failing the open for.
    return null;
  }
}

/** @param {string} key @param {string[]} svgs */
async function keep(key, svgs) {
  try {
    const v = await version();
    if (!v) return;
    const cache = await caches.open(SHEET_CACHE);
    // One version at a time: the key carries the hash, so a stale entry would
    // otherwise sit there forever taking up the reader's quota.
    for (const req of await cache.keys()) {
      if (!req.url.includes(`?v=${v}`)) await cache.delete(req);
    }
    await cache.put(
      `/__sheet/${key}?v=${v}`,
      new Response(JSON.stringify(svgs), { headers: { 'content-type': 'application/json' } }),
    );
  } catch {
    // As above: caching is an optimisation, not a requirement.
  }
}

/**
 * The pre-rendered first face, inflated.
 *
 * `prerender_packs.mjs` writes one gzipped face per pair -- 13KB, against the second
 * of arithmetic the browser would otherwise spend reaching the same bytes. It is the
 * same renderer over the same pinned fit, so when the full solve lands, face one is
 * byte-identical and the swap is invisible.
 *
 * Only the first, because a whole sheet compresses to ~118KB and 420 of those is
 * 50MB. One face is the one the lightbox opens on.
 * @param {string} target @param {string} source @returns {Promise<string|null>}
 */
async function firstFace(target, source) {
  try {
    const res = await fetch(`packs/${target}__${source}/face-1.svg.gz`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Inflate only if it arrived compressed. Some hosts answer a `.gz` with
    // `Content-Encoding: gzip`, in which case `fetch` has already inflated it and
    // running it through `DecompressionStream` would throw -- silently disabling this
    // on the deployed site while it worked locally. The two magic bytes settle it.
    if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    // A pair with no pack, or a browser without `DecompressionStream`. Either way
    // the solver is still there and the thumbnail still holds the frame.
    return null;
  }
}

/**
 * @param {string} target @param {string} source
 * @param {{faces:number, scale:number}|undefined} solved  from the pack index
 */
function faceSheet(target, source, solved) {
  const key = `${target}__${source}`;
  const held = sheets.get(key);
  if (held) return held;
  const job = (async () => {
    const kept = await cached(key);
    if (kept?.length) return kept;
    const [{ buildSheet }, { faceSvgs, loadIcons }, { defaultSelection }, { makeSpec }] =
      await Promise.all([
        import('../core/sheet.js'),
        import('./export.js'),
        import('../core/pack.js'),
        import('./app.js'),
      ]);
    const ctx = await browserSheetContext();
    presetsOnce ??= loadText('data/presets.json').then(JSON.parse);
    const presets = await presetsOnce;
    const base = makeSpec(ctx, presets, { target, source });
    const spec = {
      ...base,
      selection: defaultSelection(ctx.corpus),
      // The pinned fit, when the index knows it. `scale: 0` with auto faces reaches
      // the same sheet by the long road, so an unknown pair still works.
      ...(solved
        ? {
          autoFaces: false,
          geometry: { ...base.geometry, faces: solved.faces },
          scale: solved.scale,
        }
        : { scale: 0 }),
    };
    await ensureFontCss(ctx, target, source, spec.typeface);
    const [built, manifest, icons] = await Promise.all([
      buildSheet(ctx, spec),
      fontManifest(),
      loadIcons(),
    ]);
    // A pinned fit is a cached answer, and a cached answer can be wrong: the index
    // is committed, so any change to the type or the spacing leaves it describing a
    // sheet that no longer fits, and a pin that does not fit lays out no faces at
    // all. Falling back to the search costs a second and always draws something,
    // where trusting the index blindly drew an empty card.
    const plan = built.plan.faces.length || !solved
      ? built.plan
      : (await buildSheet(ctx, { ...base, selection: spec.selection, scale: 0 })).plan;
    const svgs = faceSvgs({ plan, manifest, icons });
    await keep(key, svgs);
    return svgs;
  })();
  sheets.set(key, job);
  return job;
}

/**
 * The mark between the two languages: one head, and two on hover, because two is
 * what clicking it does.
 *
 * Both are drawn and CSS shows one, rather than the shape being rebuilt on hover.
 * The shape *is* the affordance, and an affordance that arrives late is not one.
 */
function swapGlyph() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 26 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const [d, cls] of [
    ['M2 8h20M17.5 3.5 22 8l-4.5 4.5', 'swap-one'],
    ['M2 5h22M19.5 1.5 23.5 5 19.5 8.5M24 11H2M6.5 7.5 2 11l4.5 3.5', 'swap-two'],
  ]) {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', cls);
    svg.append(path);
  }
  return svg;
}

/**
 * @param {Object} config
 * @param {Record<string,string>[]} config.languages  the registry rows
 * @param {Map<string,{faces:number, scale:number}>} config.solved  by `target__source`
 * @param {string} config.target   the language being learned
 * @param {string} config.source   the language it is glossed into
 * @param {(source:string)=>Promise<void>} config.onReaderChange  keeps the grid behind
 *   in step, and swaps the interface language before this dialog redraws
 */
export function openLightbox({ languages, solved, target, source, onReaderChange }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';

  let pair = { target, source };
  let at = 0;
  /** @type {string[]} */ let svgs = [];
  /** The pre-rendered first face, until the solved sheet replaces it. */
  /** @type {string|null} */ let first = null;

  // --- the card, with a caret on each of its edges -------------------------
  const face = el('div', { class: 'lightbox-face' });
  // The keys are spelled out rather than derived from `dir`, because
  // `npm run i18n` finds strings by scanning for literal calls to `t`, and a
  // computed key reads to it as a catalogue entry nobody uses.
  /** @param {'prev'|'next'} dir @param {string} glyph @param {string} label */
  const stepButton = (dir, glyph, label) => {
    const button = /** @type {HTMLButtonElement} */ (
      el('button', { type: 'button', class: `lightbox-step ${dir}`, text: glyph }));
    button.setAttribute('aria-label', label);
    return button;
  };
  const prev = stepButton('prev', '‹', t('gallery.previewPrev'));
  const next = stepButton('next', '›', t('gallery.previewNext'));
  const card = el('div', { class: 'lightbox-card' }, [prev, face, next]);

  // --- the thumbnails, and the two things you can do with the card ---------
  const strip = el('div', { class: 'lightbox-strip', role: 'tablist' });
  strip.setAttribute('aria-label', t('gallery.previewStrip'));
  // Classed as well as labelled, because the label is translated: swapping the pair
  // makes the language being learned the *reader*, which switches the interface --
  // so on an Arabic card these say تصدير and تخصيص, and anything looking for the
  // English word stops finding them.
  const exportLink = el('a', { class: 'btn primary lightbox-export', text: t('gallery.export') });
  const customiseLink = el('a', { class: 'btn lightbox-customise', text: t('gallery.customise') });
  const foot = el('div', { class: 'lightbox-foot' }, [
    strip,
    el('div', { class: 'lightbox-do' }, [exportLink, customiseLink]),
  ]);

  // --- the pair, floating above the card -----------------------------------
  const sourceMount = el('span');
  const targetMount = el('span');
  const swap = /** @type {HTMLButtonElement} */ (
    el('button', { type: 'button', class: 'lightbox-swap' }, [swapGlyph()]));
  swap.setAttribute('aria-label', t('gallery.previewSwap'));

  const close = /** @type {HTMLButtonElement} */ (
    el('button', { type: 'button', class: 'lightbox-close', text: '×' }));
  close.setAttribute('aria-label', t('gallery.previewClose'));

  // Reads the way the pair is spoken -- the language you read, then the one you are
  // learning -- rather than the way the code names it. Each `aside` is a language
  // name in the *reader's* language, and the reader can be changed from inside this
  // dialog, so the list is a function rather than a value.
  const options = () => languages
    .filter((l) => l.status !== 'planned')
    .map((l) => ({
      value: l.bcp47,
      name: l.endonym,
      aside: languageName(l.bcp47, l.exonym_en),
    }));

  const sourcePicker = languagePicker({
    mount: sourceMount,
    label: t('gallery.previewReading'),
    value: pair.source,
    options: options(),
    // Choosing the language already on the other side means the reader wants the
    // pair the other way round, which is what a swap is. Filtering it out of the
    // list instead would have meant rebuilding both controls on every change.
    onChange: (value) => setPair(
      value === pair.target
        ? { target: pair.source, source: pair.target }
        : { ...pair, source: value },
    ),
  });
  const targetPicker = languagePicker({
    mount: targetMount,
    label: t('gallery.previewLearning'),
    value: pair.target,
    options: options(),
    onChange: (value) => setPair(
      value === pair.source
        ? { target: pair.source, source: pair.target }
        : { ...pair, target: value },
    ),
  });

  // --- painting -------------------------------------------------------------

  const thumbImage = () => el('img', {
    class: 'lightbox-holding',
    src: `packs/${pair.target}__${pair.source}/thumb.png`,
    alt: t('gallery.thumbAlt', { language: languageName(pair.target, pair.target) }),
  });

  /** @param {number} to */
  const go = (to) => {
    at = Math.min(Math.max(to, 0), Math.max(0, svgs.length - 1));
    paint();
  };

  const paint = () => {
    prev.disabled = at === 0;
    next.disabled = at >= svgs.length - 1;
    const query = `?target=${encodeURIComponent(pair.target)}`
      + `&source=${encodeURIComponent(pair.source)}`;
    exportLink.setAttribute('href', `sheet.html${query}`);
    customiseLink.setAttribute('href', `customize.html${query}`);
    sourcePicker.select(pair.source);
    targetPicker.select(pair.target);

    // The pre-rendered face while the rest of the sheet lays out. It is kept apart
    // from `svgs` on purpose: the strip and the paging buttons are shape, and driving
    // them from a one-element list would have built one thumbnail and then eight, and
    // resizing the foot after the fact is the thing the reserved band exists to stop.
    if (!svgs.length) {
      if (first) face.innerHTML = first;
      return;
    }
    face.innerHTML = svgs[at];
    // The strip is the same faces at strip size, built once per sheet: re-parsing
    // eight sheets of SVG to move one outline is the only thing in here a reader
    // would feel.
    if (strip.children.length !== svgs.length) {
      strip.replaceChildren(...svgs.map((svg, i) => {
        const thumb = el('button', { type: 'button', class: 'lightbox-thumb', role: 'tab' });
        thumb.setAttribute(
          'aria-label',
          t('gallery.previewFace', { face: i + 1, faces: svgs.length }),
        );
        thumb.innerHTML = svg;
        thumb.addEventListener('click', () => go(i));
        return thumb;
      }));
    }
    strip.querySelectorAll('.lightbox-thumb').forEach((thumb, i) => {
      thumb.setAttribute('aria-selected', String(i === at));
    });
  };

  function load() {
    const wanted = pair;
    // The pre-rendered face first, and it wins the race by an order of magnitude:
    // one fetch of 13KB against a second of layout. Guarded on `svgs` being empty so
    // a slow inflate cannot overwrite a solve that has already landed.
    firstFace(wanted.target, wanted.source).then((svg) => {
      if (!svg || !dialog.isConnected || pair !== wanted) return;
      first = svg;
      paint();
    });
    faceSheet(wanted.target, wanted.source, solved.get(`${wanted.target}__${wanted.source}`))
      .then((built) => {
        // The pair may have changed while this was solving.
        if (!dialog.isConnected || pair !== wanted) return;
        svgs = built;
        paint();
      })
      .catch((err) => {
        console.warn('[plg]', err);
        if (pair === wanted) {
          face.append(el('p', { class: 'lightbox-failed', text: t('gallery.previewFailed') }));
        }
      });
  }

  /**
   * Re-set every string in here that came from the catalogue.
   *
   * The reader's language can be changed from inside this dialog, and nothing in it
   * carries a `data-i18n` attribute -- the labels are passed to `el` and to
   * `languagePicker` as values, so `applyStatic` cannot reach them. Rebuilding the
   * dialog would throw away the typeset card and the strip, so they are re-set in
   * place instead.
   */
  function relabel() {
    prev.setAttribute('aria-label', t('gallery.previewPrev'));
    next.setAttribute('aria-label', t('gallery.previewNext'));
    strip.setAttribute('aria-label', t('gallery.previewStrip'));
    exportLink.textContent = t('gallery.export');
    customiseLink.textContent = t('gallery.customise');
    swap.setAttribute('aria-label', t('gallery.previewSwap'));
    close.setAttribute('aria-label', t('gallery.previewClose'));
    sourcePicker.relabel({ label: t('gallery.previewReading'), options: options() });
    targetPicker.relabel({ label: t('gallery.previewLearning'), options: options() });
  }

  /** @param {{target:string, source:string}} next */
  async function setPair(next) {
    // Only a change of *reader* is a change of interface language. Firing this on
    // a target-only change also rewrote the stored reading language, so picking a
    // new language to learn quietly reordered the gallery behind the dialog.
    const readerChanged = next.source !== pair.source;
    pair = next;
    at = 0;
    svgs = [];
    first = null;
    strip.replaceChildren();
    if (readerChanged) {
      await onReaderChange(pair.source);
      relabel();
    }
    // The pre-rendered thumbnail holds the frame while the new pair typesets, so
    // the card is never blank and never the wrong pair's.
    face.replaceChildren(thumbImage());
    paint();
    load();
  }

  // **Publish the card's width so the pair and the foot can share it.**
  // It is not expressible in CSS: the face's width is its rendered height times the
  // sheet's aspect, and on a short window the height is what binds -- so the pair
  // was hard-coded to the width a *tall* window gives and the foot was sized by its
  // own thumbnails, and both ended up outboard of the paper's edges.
  dialog.style.setProperty('--card-aspect', String(504 / 360));
  const bounds = new ResizeObserver(([entry]) => {
    dialog.style.setProperty('--card-w', `${Math.round(entry.contentRect.width)}px`);
  });
  bounds.observe(face);
  dialog.addEventListener('close', () => bounds.disconnect(), { once: true });

  prev.addEventListener('click', () => go(at - 1));
  next.addEventListener('click', () => go(at + 1));
  swap.addEventListener('click', () => setPair({ target: pair.source, source: pair.target }));
  close.addEventListener('click', () => dialog.close());

  // Arrows page through the faces -- unless a picker has the keyboard, where they
  // move through the languages.
  dialog.addEventListener('keydown', (event) => {
    if (/** @type {HTMLElement} */ (event.target).closest('.lang-picker')) return;
    const to = nextIndex(event.key, at, svgs.length);
    if (to < 0) return;
    event.preventDefault();
    go(to);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    // Both pickers hold a document-level listener for dismissing themselves.
    sourcePicker.destroy();
    targetPicker.destroy();
    dialog.remove();
  });

  // The card and the foot share a column so the strip and the two buttons are
  // exactly as wide as the sheet above them. The card's width is derived from its
  // own height and aspect, so nothing else can state it: the column has to take
  // it from the card.
  dialog.append(
    close,
    el('div', { class: 'lightbox-pair' }, [
      el('span', { class: 'pair-side start' }, [sourcePicker.element]),
      swap,
      el('span', { class: 'pair-side end' }, [targetPicker.element]),
    ]),
    el('div', { class: 'lightbox-stack' }, [card, foot]),
  );
  face.append(thumbImage());
  document.body.append(dialog);
  dialog.showModal();
  paint();
  load();
}
