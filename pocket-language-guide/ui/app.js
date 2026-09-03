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
import { createSheetContext, stacksFor } from '../core/sheet.js';
import { familyFor, fontFaceCss } from '../render/fonts.js';

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

export function browserSheetContext() {
  return createSheetContext({ loadText, loadBytes });
}

/**
 * The language registry together with how many rows each language actually has.
 * Pages need both: `status` says what we mean to do, coverage says what is on
 * file, and only the second one may decide what to offer.
 */
export async function loadLanguages() {
  return {
    languages: parseTable(await loadText('data/registry/languages.csv'), 'languages.csv'),
    coverage: JSON.parse(await loadText('data/coverage.json')),
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
 * @param {'sans'|'serif'} [typeface]
 */
export async function ensureFontCss(ctx, target, source, typeface = 'sans') {
  const manifest = JSON.parse(await loadText('data/fonts/manifest.json'));
  const stacks = stacksFor(ctx.corpus, target, source, typeface);
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
    arrangement: 'two-column',
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
