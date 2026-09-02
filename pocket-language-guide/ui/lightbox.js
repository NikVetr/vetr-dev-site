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
import { browserSheetContext, ensureFontCss, loadText } from './app.js';

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
 * This runs the real engine rather than reading pre-rendered faces, and the reason
 * is worth recording because shipping them was the obvious alternative. A face is
 * about 120KB of SVG and a default sheet is eight of them, so 240 ordered pairs is
 * roughly 230MB in the working tree -- and a compact encoding of the plan is no
 * smaller, because the plan *is* the text, positioned.
 *
 * What is pre-rendered is the expensive part. Fitting a sheet means searching for
 * the fewest faces and the largest type that hold the content, which re-measures
 * and re-breaks the whole sheet at a dozen candidate scales. `packs/index.json`
 * already records the answer for every pair, so the lightbox pins it and lays the
 * sheet out exactly once: byte-identical output, measured 10-12x faster -- about
 * 150ms rather than 1.8s. Nothing new is shipped to buy that, and the SVG stays
 * vector, so it is sharper at any size than a committed PNG could be.
 * @type {Map<string, Promise<string[]>>}
 */
const sheets = new Map();

/**
 * @param {string} target @param {string} source
 * @param {{faces:number, scale:number}|undefined} solved  from the pack index
 */
function faceSheet(target, source, solved) {
  const key = `${target}__${source}`;
  const held = sheets.get(key);
  if (held) return held;
  const job = (async () => {
    const [{ buildSheet }, { faceSvgs, loadIcons }, { defaultSelection }, { makeSpec }] =
      await Promise.all([
        import('../core/sheet.js'),
        import('./export.js'),
        import('../core/pack.js'),
        import('./app.js'),
      ]);
    const ctx = await browserSheetContext();
    const presets = JSON.parse(await loadText('data/presets.json'));
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
      loadText('data/fonts/manifest.json').then(JSON.parse),
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
    return faceSvgs({ plan, manifest, icons });
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
 * @param {(source:string)=>void} config.onReaderChange  keeps the grid behind in step
 */
export function openLightbox({ languages, solved, target, source, onReaderChange }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'lightbox';

  let pair = { target, source };
  let at = 0;
  /** @type {string[]} */ let svgs = [];

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
  const exportLink = el('a', { class: 'btn primary', text: t('gallery.export') });
  const customiseLink = el('a', { class: 'btn', text: t('gallery.customise') });
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
  // learning -- rather than the way the code names it.
  const options = languages
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
    options,
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
    options,
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

    if (!svgs.length) return;
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

  /** @param {{target:string, source:string}} next */
  function setPair(next) {
    pair = next;
    at = 0;
    svgs = [];
    strip.replaceChildren();
    // The pre-rendered thumbnail holds the frame while the new pair typesets, so
    // the card is never blank and never the wrong pair's.
    face.replaceChildren(thumbImage());
    onReaderChange(pair.source);
    paint();
    load();
  }

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

  dialog.append(
    close,
    el('div', { class: 'lightbox-pair' }, [sourcePicker.element, swap, targetPicker.element]),
    card,
    foot,
  );
  face.append(thumbImage());
  document.body.append(dialog);
  dialog.showModal();
  paint();
  load();
}
