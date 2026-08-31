// Shared browser bootstrap: loaders, reader language, spec defaults, font CSS.
//
// The three pages differ in how much of this they need. The gallery reads only
// the registry and the pre-rendered packs, so it never pays for the solver, the
// corpus or a CJK font; the studio loads everything.

import { parseTable } from '../core/csv.js';
import { createSheetContext, stacksFor } from '../core/sheet.js';
import { fontFaceCss } from '../render/fonts.js';

const READER_KEY = 'plg.reader';

/** @param {string} rel */
export async function loadText(rel) {
  const res = await fetch(rel, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.text();
}

/** @param {string} rel */
export async function loadBytes(rel) {
  const res = await fetch(rel, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function browserSheetContext() {
  return createSheetContext({ loadText, loadBytes });
}

/** Just the language registry, for pages that need nothing else. */
export async function loadLanguages() {
  const rows = parseTable(await loadText('data/registry/languages.csv'), 'languages.csv');
  return rows;
}

/**
 * The reader's own language: a saved choice, else the best match from the
 * browser, else English. Only languages we can actually gloss into are offered.
 * @param {Record<string,string>[]} languages
 */
export function readerLanguage(languages) {
  const usable = new Set(languages.filter((l) => l.status !== 'planned').map((l) => l.bcp47));
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
 */
export async function ensureFontCss(ctx, target, source) {
  const manifest = JSON.parse(await loadText('data/fonts/manifest.json'));
  const stacks = stacksFor(ctx.corpus, target, source);
  const id = `plg-fonts-${stacks.join('-')}`;
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = fontFaceCss(manifest, stacks);
    document.head.append(style);
  }
  await Promise.allSettled([...document.fonts].map((f) => f.load()));
  await document.fonts.ready;
  return manifest;
}

/**
 * A sheet spec with everything resolved. `scale: 0` means auto-fit.
 * @param {Awaited<ReturnType<typeof browserSheetContext>>} ctx
 * @param {any} presets
 * @param {{target:string, source:string, geometry?:string, paper?:string}} choice
 * @returns {import('../core/types.js').SheetSpec}
 */
export function makeSpec(ctx, presets, choice) {
  const geometryId = choice.geometry ?? 'card-7x5-4col';
  const geometry = presets.geometry[geometryId];
  if (!geometry) throw new Error(`no geometry preset "${geometryId}"`);
  const paperId = choice.paper ?? 'et8550-5x7-photo-bordered';
  const paper = ctx.corpus.paper[paperId];
  if (!paper) throw new Error(`no paper preset "${paperId}"`);

  const target = ctx.corpus.languages[choice.target];
  const romanization = (target.romanizations || '').split(';').filter(Boolean)[0] ?? '';

  return {
    target: choice.target,
    source: choice.source,
    accent: `${choice.source}-US`,
    romanization,
    register: 'neutral',
    fieldSet: ['script', 'roman', 'gloss', 'respell', 'numeral'],
    geometry: { ...geometry },
    paper: {
      presetId: paperId,
      borderless: paper.borderless === '1',
      oversprayPct: Number(paper.overspray_pct),
      nonprintablePt: Number(paper.nonprintable_pt),
      minRulePt: Number(paper.min_rule_pt),
      minSizeDelta: Number(paper.min_size_delta),
    },
    themeId: 'latex-reference',
    inkMode: 'full',
    density: 0.7,
    arrangement: 'two-column',
    scale: 0,
    selection: { sections: {}, items: {} },
  };
}

/** @param {URLSearchParams} params @param {string} fallbackSource */
export function pairFromQuery(params, fallbackSource) {
  return {
    target: params.get('target') ?? 'zh-Hans',
    source: params.get('source') ?? fallbackSource,
    geometry: params.get('geometry') ?? undefined,
    paper: params.get('paper') ?? undefined,
  };
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
  urls.push(`data/respell/overrides/${target}__${source}__${source}-US.csv`);
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
  box.innerHTML = '<h2>Something went wrong</h2>';
  const p = document.createElement('p');
  p.className = 'muted';
  p.textContent = message;
  box.append(p);
  document.body.prepend(box);
  throw err;
}
