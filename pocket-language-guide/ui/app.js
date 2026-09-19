// Shared browser bootstrap: loaders, reader language, spec defaults, font CSS.
//
// The three pages differ in how much of this they need. The gallery reads only
// the registry and the pre-rendered packs, so it never pays for the solver, the
// corpus or a CJK font; the studio loads everything.

import { parseTable } from '../core/csv.js';
import {
  DEFAULT_PADDING, defaultSelection, hasContent, paperSpec, respellOverrideFile,
} from '../core/pack.js';
import { messagesReady, t } from './i18n.js';

/**
 * **The typesetting engine is loaded on demand, not on import.**
 *
 * This module is the shared bootstrap: most of what it exports is small -- fetch a
 * file, read the reader's language, show a fatal error -- and every page imports it
 * for those. Three of its functions need the solver and the font registry, and
 * while they were named at the top of the file every importer paid for them.
 *
 * The bill was 969KB of `vendor/fontkit.esm.js`, reached by
 * `app.js -> core/sheet.js -> core/fonts.js -> fontkit`, plus `core/measure.js` and
 * eight files of `core/solve/`. The gallery fetched all of it before the reader had
 * touched anything -- two thirds of that page's JavaScript, on the landing page,
 * which is the one thing a phone on a bad connection has to get through first. Its
 * own header claimed the opposite, and `ui/lightbox.js` had already been written to
 * import the heavy modules lazily; a static edge in the same file defeated it.
 *
 * So the three heavy functions import what they need when they are called. Each was
 * already asynchronous or already returned a promise, so no caller changes, and the
 * memoised handles below mean the cost is paid once.
 */
const sheetModule = () => import('../core/sheet.js');
const fontsModule = () => import('../render/fonts.js');

const READER_KEY = 'plg.reader';

/**
 * A fetch that failed, carrying the status so `isMissingFile` in core/pack.js can
 * tell "this file does not exist" from "we could not get a file that does".
 */
class LoadError extends Error {
  /** @param {string} rel @param {number} status */
  constructor(rel, status) {
    super(`${rel}: HTTP ${status}`);
    this.name = 'LoadError';
    this.status = status;
  }
}

/** @param {string} rel */
export async function loadText(rel) {
  const res = await fetch(rel, { cache: 'no-cache' });
  if (!res.ok) throw new LoadError(rel, res.status);
  return res.text();
}

/** @param {string} rel */
export async function loadBytes(rel) {
  const res = await fetch(rel, { cache: 'no-cache' });
  if (!res.ok) throw new LoadError(rel, res.status);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * The sheet context, built once per page.
 *
 * It loads the whole corpus and builds the font registry and the measurer, and
 * nothing in it depends on which pair is being drawn -- so the lightbox was paying
 * for all of that again on every language change, which is the most expensive
 * thing between a click and a card.
 * @type {Promise<Awaited<ReturnType<
 *   typeof import('../core/sheet.js').createSheetContext>>>|null}
 */
let context = null;

export function browserSheetContext() {
  // Still synchronous and still memoised: it returns the same promise it always
  // did, with the module fetch folded into the front of it.
  context ??= sheetModule().then(({ createSheetContext }) => createSheetContext({
    loadText, loadBytes,
  }));
  return context;
}

/**
 * The font manifest, likewise: `ensureFontCss` fetches it and so did every caller
 * that then needed it for rendering, which was two requests for one file.
 * @type {Promise<{faces:{stack:string,weight:number,italic:boolean,file:string}[]}>|null}
 */
let manifestOnce = null;

export function fontManifest() {
  manifestOnce ??= loadText('data/fonts/manifest.json').then(JSON.parse);
  return manifestOnce;
}

/**
 * The language registry together with how many rows each language actually has.
 * Pages need both: `status` says what we mean to do, coverage says what is on
 * file, and only the second one may decide what to offer.
 */
export async function loadLanguages() {
  // **`language-names.csv` is loaded here too, and it is worth the fetch.** The
  // gallery is built to load without the registries it does not need, and this is
  // the O(N^2) one -- but it is 29KB gzipped, an order of magnitude under the pack
  // index the same page already fetches, and it is the only place that knows what a
  // language is called in a locale ICU has never heard of. Without it the Klingon
  // and Quenya cards printed their English exonyms in all fifty interface
  // languages, `Intl.DisplayNames` having no answer and the fallback being English
  // by construction.
  const [languages, coverage, names, regions] = await Promise.all([
    loadText('data/registry/languages.csv'),
    loadText('data/coverage.json'),
    loadText('data/registry/language-names.csv'),
    // 30KB, and it is what turns the country-code fallback from a white box into
    // that country's own colours on a platform with no flag glyphs.
    loadText('data/registry/regions.csv'),
  ]);
  return {
    languages: parseTable(languages, 'languages.csv'),
    coverage: JSON.parse(coverage),
    names: parseTable(names, 'language-names.csv'),
    regions: Object.fromEntries(
      parseTable(regions, 'regions.csv').map((r) => [r.iso3166, r]),
    ),
  };
}

/**
 * The reader's own language: a saved choice, else the best match from the
 * browser, else English. Only languages we can actually gloss into are offered --
 * a Spanish browser used to land on a target we have no Spanish rows for.
 * @param {Record<string,string>[]} languages
 * @param {{total:number, languages:Record<string,number>}} coverage
 */
export function readerLanguage(languages, coverage) {
  const usable = new Set(languages.filter((l) => hasContent(coverage, l.bcp47)).map((l) => l.bcp47));
  const saved = localStorage.getItem(READER_KEY);
  if (saved && usable.has(saved)) return saved;
  for (const tag of navigator.languages ?? []) {
    if (usable.has(tag)) return tag;
    const base = tag.split('-')[0];
    const match = [...usable].find((code) => code === base || code.split('-')[0] === base);
    if (match) return match;
  }
  return usable.has('en') ? 'en' : [...usable][0];
}

/** @param {string} code */
export function setReaderLanguage(code) {
  localStorage.setItem(READER_KEY, code);
}

/**
 * Inject `@font-face` rules for the stacks a pair needs, and wait for them.
 * Fonts are loaded up front rather than lazily because the solver has already
 * committed to advance widths measured from these exact files.
 * @param {Awaited<ReturnType<typeof browserSheetContext>>} ctx
 * @param {string} target @param {string} source
 * @param {import('../core/types.js').SheetSpec['typeface']} [typeface]
 * @param {boolean} [serifHeadings]
 */
export async function ensureFontCss(ctx, target, source, typeface = 'sans', serifHeadings = false) {
  const [manifest, { stacksFor }, { familyFor, fontFaceCss }] = await Promise.all([
    fontManifest(), sheetModule(), fontsModule(),
  ]);
  const stacks = stacksFor(ctx.corpus, target, source, typeface, serifHeadings);
  const id = `plg-fonts-${stacks.join('-')}`;
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = fontFaceCss(manifest, stacks);
    document.head.append(style);
  }
  // The solver measured advances from the .ttf, so a .woff2 that fails to arrive
  // does not degrade the preview -- it makes it wrong, drawing in a fallback face
  // whose advances differ from the ones every box was sized against. The
  // pre-render path already refuses to continue here; so does this one now.
  const families = new Set(stacks.map(familyFor));
  const wanted = [...document.fonts].filter((f) => families.has(f.family.replace(/"/g, '')));
  const results = await Promise.allSettled(wanted.map((f) => f.load()));
  const failed = wanted
    .filter((_, i) => results[i].status === 'rejected')
    .map((f) => `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`);
  if (failed.length) {
    throw new Error(`these fonts could not be loaded, so the sheet would be `
      + `typeset in the wrong face: ${failed.join(', ')}`);
  }
  await document.fonts.ready;
  return manifest;
}

/**
 * Which accent a reader's respellings are keyed on.
 *
 * This was `${source}-US`, which is right for exactly one of the seventeen
 * languages. An accent is a fact about the reading language -- Spanish
 * respellings are `es-419` and Korean's are `ko-KR` -- and it is half of the key
 * that finds both the curated sheet and the rule table, so a concatenated guess
 * meant a table could ship and never load.
 * @param {{languages: Record<string, Record<string,string>>}} corpus
 * @param {string} source
 */
export function accentFor(corpus, source) {
  return corpus.languages[source]?.default_accent || `${source}-US`;
}

/**
 * A sheet spec with everything resolved. `scale: 0` means auto-fit.
 * @param {Awaited<ReturnType<typeof browserSheetContext>>} ctx
 * @param {any} presets
 * @param {{target:string, source:string, geometry?:string, paper?:string, region?:string}} choice
 * @returns {import('../core/types.js').SheetSpec}
 */
export function makeSpec(ctx, presets, choice) {
  const geometryId = choice.geometry ?? 'card-7x5-4col';
  const geometry = presets.geometry[geometryId];
  if (!geometry) throw new Error(`no geometry preset "${geometryId}"`);
  const paperId = choice.paper ?? 'et8550-5x7-photo-bordered';

  const target = ctx.corpus.languages[choice.target];
  const romanization = (target.romanizations || '').split(';').filter(Boolean)[0] ?? '';
  // The first region listed for a language is the one it is most associated with,
  // which is the right default for someone visiting.
  const region = choice.region ?? (target.regions || '').split(';').filter(Boolean)[0] ?? '';

  return {
    target: choice.target,
    source: choice.source,
    accent: accentFor(ctx.corpus, choice.source),
    romanization,
    register: 'neutral',
    region,
    fieldSet: ['script', 'roman', 'gloss', 'respell', 'numeral'],
    geometry: { ...geometry },
    paper: paperSpec(ctx.corpus, paperId),
    themeId: 'latex-reference',
    typeface: 'sans',
    inkMode: 'full',
    autoFaces: true,
    padding: DEFAULT_PADDING,
    arrangement: 'mixed',
    // The band is off, and the folio is already ticked inside it -- so choosing
    // Header or Footer prints a page number without hunting for one.
    //
    // Off rather than on, and measured rather than assumed. The band costs 1.5 lines
    // of the smallest type on the sheet, and the fit search pays for that: the type
    // scale drops about 0.05 on most pairs, and `es <- en` takes a *whole extra pair
    // of faces* -- one more sheet of photo paper per card set, for a page number.
    // Worse, it pushed the Devanagari, Arabic and Thai respellings under their own
    // 5.4pt legibility floor, which `tests/solve.test.mjs` asserts as a safety
    // property. A folio is not worth either of those by default.
    // Both bands off. What a band says when it is switched on lives in
    // `headControl`'s own seed now, rather than in an `at: 'none'` band that
    // held slots it was not printing.
    scale: 0,
    priority: 0,
    selection: defaultSelection(ctx.corpus),
  };
}

/** @param {URLSearchParams} params @param {string} fallbackSource */
export function pairFromQuery(params, fallbackSource) {
  return {
    target: params.get('target') ?? 'zh-Hans',
    source: params.get('source') ?? fallbackSource,
    geometry: params.get('geometry') ?? undefined,
    paper: params.get('paper') ?? undefined,
    region: params.get('region') ?? undefined,
  };
}

/** Resolve once the browser has actually painted. */
export function afterPaint() {
  // A `setTimeout(0)` does not do this: macrotasks run before the next frame, so a
  // busy indicator set immediately before a long synchronous solve never reached
  // the screen -- measured as a full second with no repaint at all. Two frames:
  // one to run our callback, the next to guarantee the first one's paint landed.
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)));
  });
}

/**
 * Run a slow button action with the button visibly out of service. A 600dpi
 * six-face export takes seconds, and the only previous feedback was that nothing
 * appeared to happen.
 * @param {HTMLElement} button
 * @param {string} label            shown while it runs
 * @param {(onProgress:(done:number,total:number)=>void)=>Promise<void>} run
 */
export async function withBusy(button, label, run) {
  const target = /** @type {HTMLButtonElement} */ (button);
  const original = target.textContent;
  target.disabled = true;
  target.textContent = label;
  await afterPaint();
  try {
    await run((done, total) => { target.textContent = `${label} ${done}/${total}`; });
  } finally {
    target.disabled = false;
    target.textContent = original;
  }
}

/** Trigger a download without leaving the page. @param {Blob} blob @param {string} name */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // Revoke on the next turn: Safari needs the element to have been clicked first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Register the service worker. Failure is not fatal -- the app still works, it just
 * will not work offline -- so it is reported rather than thrown.
 */
export function registerOffline() {
  if (!('serviceWorker' in navigator)) return;
  // **Not in the native bundle.** A WebView serves from the application's own
  // container, so every file is already local and a worker would add a second cache
  // in front of them -- pure overhead, and a stale-shell bug waiting on an app that
  // updates through a store rather than over the network. `scripts/build_mobile.mjs`
  // overwrites `data/native.json` with `serviceWorker: false` and leaves `sw.js` out
  // of the bundle. The file ships on the web too, saying `true`, so this is a cached
  // hit rather than a 404 on every page load -- and so the two builds run identical
  // JavaScript rather than differing by a build-time substitution.
  loadText('data/native.json').then((text) => {
    if (JSON.parse(text).serviceWorker !== false) registerWorker();
  }).catch(() => registerWorker());
}

function registerWorker() {

  // **A deploy has to land on the first load, not the second.** The worker serves
  // cache-first and revalidates behind it, which is what makes the app instant and
  // offline -- and it means the page a returning reader is looking at was parsed
  // from the *previous* deploy's shell while the new worker installs underneath.
  // The new worker calls `skipWaiting` and `clients.claim()`, so it takes control of
  // this page immediately, but the HTML, CSS and modules already parsed are the old
  // ones. Without this the reader has to load the page twice to see a change, which
  // reads exactly like the change not having shipped.
  //
  // Guarded on there having *been* a controller, because `controllerchange` also
  // fires the first time a worker takes charge of a page that had none -- reloading
  // then would reload every first visit. And latched, because a reload during the
  // handler would otherwise be able to re-enter it.
  const had = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('sw.js', { scope: './' })
    .catch((err) => console.warn('[plg] offline support unavailable:', err.message));
}

/**
 * Ask the worker to cache everything one language pair needs, so the sheet can be
 * rebuilt and exported with no network at all.
 * @param {{corpus:any, target:string, source:string, manifest:any}} args
 */
export async function saveForOffline({ corpus, target, source, manifest }) {
  if (!('serviceWorker' in navigator)) throw new Error('this browser cannot save for offline');
  const registration = await navigator.serviceWorker.ready;
  const { stacksFor } = await sheetModule();
  const stacks = stacksFor(corpus, target, source);
  /** @type {string[]} */ const urls = [];
  for (const group of corpus.groups) {
    urls.push(`data/concepts/${group}.csv`);
    urls.push(`data/lang/${target}/${group}.csv`);
    urls.push(`data/lang/${source}/${group}.csv`);
  }
  // Only the curated files that exist: asking for one that was never written made
  // the worker report a partial save and the button stop at "Partly saved".
  const accent = accentFor(corpus, source);
  if (corpus.respellOverrides.has(`${target}__${source}__${accent}`)) {
    urls.push(respellOverrideFile(target, source, accent));
  }
  for (const face of manifest.faces.filter((/** @type {any} */ f) => stacks.includes(f.stack))) {
    urls.push(`data/fonts/${face.file}.woff2`, `data/fonts/${face.file}.ttf`);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('saving for offline timed out')), 120000);
    /** @param {MessageEvent} event */
    const onMessage = (event) => {
      if (event.data?.type !== 'cache-urls-done') return;
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      resolve(event.data);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    registration.active?.postMessage({ type: 'cache-urls', urls });
  });
}

/** @param {unknown} err */
export function showFatal(err) {
  const message = err instanceof Error ? err.message : String(err);
  const box = document.createElement('div');
  box.className = 'container';
  box.style.padding = '1rem';
  const heading = document.createElement('h2');
  // A fatal can fire before a catalogue has loaded, and `t` falls back to the key
  // in that case. English is a better thing to show someone than `common.somethingWrong`.
  heading.textContent = messagesReady() ? t('common.somethingWrong') : 'Something went wrong';
  box.append(heading);
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = message;
  box.append(p);
  document.body.prepend(box);
  throw err;
}
