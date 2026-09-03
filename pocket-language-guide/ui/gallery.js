// Gallery: pick a language. Reads only the language registry and the pre-rendered
// pack index, so it stays fast and works offline without loading the solver, the
// corpus or a CJK font.
//
// The one exception is the lightbox in `ui/lightbox.js`, which typesets the whole
// sheet -- and only when a reader opens one.

import {
  browserSheetContext, fontManifest, loadText, loadLanguages, readerLanguage,
  registerOffline, saveForOffline, setReaderLanguage, showFatal,
} from './app.js';
import { regionRow } from './flags.js';
import { languagePicker } from './language-picker.js';
import { openLightbox } from './lightbox.js';
import { applyStatic, languageName, loadUiLanguage, t } from './i18n.js';

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
 * @typedef {Object} GalleryContext
 * @property {Record<string,string>[]} languages
 * @property {Map<string,{faces:number, scale:number}>} solved  pre-rendered pairs,
 *   with the face count and type scale the pre-render settled on
 * @property {string} reader
 * @property {{total:number, languages:Record<string,number>}} coverage
 * @property {(source:string)=>Promise<void>} onReaderChange
 */

/** @param {Record<string,string>} lang @param {GalleryContext} gallery */
function card(lang, gallery) {
  const { reader, coverage } = gallery;
  const name = languageName(lang.bcp47, lang.exonym_en);
  const key = `${lang.bcp47}__${reader}`;
  const hasPack = gallery.solved.has(key);
  // A pair can only render what both sides have.
  const have = Math.min(coverage.languages[lang.bcp47] ?? 0, coverage.languages[reader] ?? 0);
  const query = `?target=${encodeURIComponent(lang.bcp47)}&source=${encodeURIComponent(reader)}`;

  const flags = regionRow(lang.regions, {
    label: t('gallery.spokenIn', { language: name, regions: lang.regions.split(';').join(', ') }),
  });
  const head = el('div', { class: 'card-head' }, [
    el('span', { class: 'card-badge', 'aria-hidden': 'true', text: lang.badge }),
    el('span', { class: 'card-titles' }, [
      el('div', { class: 'card-name', text: name }),
      el('div', { class: 'small muted', text: lang.endonym, lang: lang.bcp47 }),
    ]),
    ...(flags ? [flags] : []),
  ]);

  const thumb = hasPack && have
    ? el('button', {
      type: 'button',
      class: 'card-thumb-button',
      // No `data-i18n-label` here: the label is interpolated with the language's
      // name, and `applyStatic` would overwrite it with the raw template. The card
      // is rebuilt whole when the reader changes, so it needs no marker.
      'aria-label': t('gallery.previewOpen', { language: name }),
    }, [el('img', {
      class: 'card-thumb',
      src: `packs/${key}/thumb.png`,
      alt: t('gallery.thumbAlt', { language: name }),
      loading: 'lazy',
      decoding: 'async',
    })])
    : el('div', { class: 'card-thumb placeholder' }, [
      el('span', {
        text: have
          ? t('gallery.coverageLong', { have, total: coverage.total })
          : t('gallery.notTranslated'),
      }),
    ]);

  /** @type {(Node|string)[]} */ const actions = [];
  if (!have) {
    actions.push(el('span', { class: 'tag planned', text: t('gallery.helpTranslate') }));
  } else {
    actions.push(el('a', {
      class: 'btn primary', href: `sheet.html${query}`, text: t('gallery.export'),
    }));
    actions.push(el('a', {
      class: 'btn', href: `customize.html${query}`, text: t('gallery.customise'),
    }));
    const offline = el('button', {
      type: 'button', class: 'btn', text: t('gallery.offline'),
      title: t('gallery.offlineTitle'),
      'data-offline': lang.bcp47,
    });
    offline.addEventListener('click', async () => {
      const button = /** @type {HTMLButtonElement} */ (offline);
      offline.textContent = t('gallery.saving');
      button.disabled = true;
      try {
        const ctx = await browserSheetContext();
        const manifest = await fontManifest();
        const result = await saveForOffline({
          corpus: ctx.corpus, target: lang.bcp47, source: reader, manifest,
        });
        offline.textContent = result.ok ? t('gallery.saved') : t('gallery.partlySaved');
        // Only a complete save is final. "Partly saved" means some file 404ed and
        // the pair may still be unusable offline, so the reader has to be able to
        // try again -- and the button used to be disabled for the life of the page
        // on both of the two ways this can fail.
        button.disabled = result.ok;
      } catch (err) {
        offline.textContent = t('gallery.saveFailed');
        button.disabled = false;
        console.warn('[plg]', err);
      }
    });
    actions.push(offline);
  }

  if (thumb instanceof HTMLButtonElement) {
    thumb.addEventListener('click', () => openLightbox({
      languages: gallery.languages,
      solved: gallery.solved,
      target: lang.bcp47,
      source: reader,
      onReaderChange: gallery.onReaderChange,
    }));
  }
  return el('article', { class: 'card' }, [head, thumb, el('div', { class: 'card-actions' }, actions)]);
}

/** How many other languages to show beside the reader's own. */
const COLLAGE_DEPTH = 5;

/**
 * The ends of the fade. These are words, not texture: `--muted` at the 0.16 the
 * ramp used to bottom out at composites to 1.3:1 on the header's white, which
 * looks like a rendering fault rather than type. 0.62 holds 3.28:1 and, with the
 * size ramp, still sits plainly behind the lead.
 */
const FAINTEST = 0.62;
const NEAREST = 0.9;

/**
 * The picker's label as a collage: the reader's own language at full strength, the
 * others receding behind it. Nothing moves -- a header that animates on its own is
 * a distraction on a page you came to read -- but it still says "this is where you
 * choose your language" to someone who reads none of the others.
 * @param {Record<string,string>[]} languages
 * @param {string} reader
 */
function renderSpeakCollage(languages, reader) {
  const label = document.getElementById('reader-label');
  if (!label) return;
  const usable = languages.filter((l) => l.speak_label);
  const mine = usable.find((l) => l.bcp47 === reader);
  const others = usable.filter((l) => l.bcp47 !== reader).slice(0, COLLAGE_DEPTH);
  const fade = (NEAREST - FAINTEST) / Math.max(1, COLLAGE_DEPTH - 1);

  /** @param {Record<string,string>} lang @param {number} depth */
  const chip = (lang, depth) => {
    const span = document.createElement('span');
    span.className = depth === 0 ? 'speak lead' : 'speak';
    span.textContent = lang.speak_label;
    span.lang = lang.bcp47;
    if (lang.bcp47 === 'ar') span.dir = 'rtl';
    // Each step back is fainter and slightly smaller, so the eye lands on the
    // reader's own first and reads the rest as context rather than as a list.
    if (depth > 0) {
      span.style.opacity = String(Math.max(FAINTEST, NEAREST - (depth - 1) * fade));
      span.style.fontSize = `${Math.max(0.66, 0.86 - (depth - 1) * 0.04)}rem`;
      // The repetitions say "many languages" by repeating one idea, so they are
      // decoration. Left exposed they became the <select>'s accessible name, which
      // announced five translations of "I speak" before naming the control.
      span.setAttribute('aria-hidden', 'true');
    }
    return span;
  };

  label.replaceChildren(
    ...others.slice().reverse().map((lang, i) => chip(lang, others.length - i)),
    ...(mine ? [chip(mine, 0)] : []),
  );
}

async function main() {
  registerOffline();
  const { languages, coverage } = await loadLanguages();
  const reader = readerLanguage(languages, coverage);
  // The interface language is the reader's own, so this has to happen before
  // anything is drawn -- including the static markup.
  await loadUiLanguage(reader, loadText);
  applyStatic();

  // The face count and type scale the pre-render settled on, kept rather than
  // discarded: they are the answer to the expensive half of solving a sheet, and
  // the lightbox pins them instead of searching for them again.
  /** @type {Map<string,{faces:number, scale:number}>} */ const solved = new Map();
  try {
    const index = JSON.parse(await loadText('packs/index.json'));
    for (const pack of index.packs) {
      solved.set(`${pack.target}__${pack.source}`, { faces: pack.faces, scale: pack.scale });
    }
  } catch {
    // No pre-rendered packs yet; cards still work, they just have no thumbnail.
  }

  const mount = /** @type {HTMLElement} */ (document.getElementById('reader'));
  // Collapsed it shows only the endonym -- "Deutsch", not "Deutsch (German)" --
  // because that is the word you scan for. The name in the reader's own language
  // earns its place only in the open list, set grey and to the trailing edge.
  // The `aside` is each language's name *in the reader's language*, so the whole
  // list has to be rebuilt when the reader changes -- not just its selection.
  const pickerOptions = () => languages
    .filter((l) => l.status !== 'planned')
    .map((l) => ({
      value: l.bcp47,
      name: l.endonym,
      aside: languageName(l.bcp47, l.exonym_en),
    }));
  const header = languagePicker({
    mount,
    label: t('nav.readerHint'),
    value: reader,
    options: pickerOptions(),
    onChange: setReader,
  });
  renderSpeakCollage(languages, reader);

  /**
   * The reader's language, changed from either place it can be: the header picker,
   * or the pair inside the lightbox. The lightbox is a modal over this page, so the
   * grid it reopens onto has to already agree with it.
   *
   * **The catalogue has to be swapped before anything is redrawn.** Almost none of
   * this page's chrome carries a `data-i18n` attribute -- the strings are passed to
   * `el` as values, so `applyStatic` cannot reach them and they are only correct
   * because they were built after `loadUiLanguage`. Switching the reader without
   * that step left the heading, the cards and the picker's own accessible name in
   * the previous language while the grid and the collage moved to the new one,
   * which is exactly the half-translated state this fixes.
   * @param {string} value
   */
  async function setReader(value) {
    setReaderLanguage(value);
    await loadUiLanguage(value, loadText);
    applyStatic();
    header.select(value);
    header.relabel({ label: t('nav.readerHint'), options: pickerOptions() });
    renderSpeakCollage(languages, value);
    render(value);
  }

  /** @param {string} readerCode */
  function render(readerCode) {
    // Guides into your own language are not a thing; everything else is offered,
    // ordered so the ones that will actually render come first.
    // Most-translated first, so the ones that actually render lead the grid.
    const have = (/** @type {Record<string,string>} */ l) => Math.min(
      coverage.languages[l.bcp47] ?? 0, coverage.languages[readerCode] ?? 0,
    );
    const shown = languages
      .filter((l) => l.bcp47 !== readerCode)
      .sort((a, b) => have(b) - have(a) || a.exonym_en.localeCompare(b.exonym_en));
    const grid = /** @type {HTMLElement} */ (document.getElementById('gallery'));
    /** @type {GalleryContext} */ const context = {
      languages, solved, coverage, reader: readerCode, onReaderChange: setReader,
    };
    grid.replaceChildren(...shown.map((l) => card(l, context)));
    grid.setAttribute('aria-busy', 'false');
  }

  render(reader);
}

main().catch(showFatal);
