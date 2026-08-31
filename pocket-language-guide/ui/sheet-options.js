// Options and export for people who do not want the studio: pick from presets,
// see the result, download it.

import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, showFatal,
} from './app.js';
import { buildSheet, stacksFor } from '../core/sheet.js';
import { defaultSelection } from '../core/pack.js';
import { faceSvgs, exportPdf, exportPng, exportSvg, loadIcons } from './export.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const languages = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages));
  const ctx = await browserSheetContext();
  const presets = JSON.parse(await loadText('data/presets.json'));
  const icons = await loadIcons();
  const manifest = await ensureFontCss(ctx, choice.target, choice.source);
  const stacks = stacksFor(ctx.corpus, choice.target, choice.source);

  const target = ctx.corpus.languages[choice.target];
  const source = ctx.corpus.languages[choice.source];
  document.title = `${target.exonym_en} pocket guide`;
  $('title').textContent = `${target.exonym_en} pocket guide`;
  $('subtitle').textContent = `Glossed into ${source.exonym_en}. `
    + 'Print double-sided, cut down the middle, and you have four pocket cards.';
  /** @type {HTMLAnchorElement} */ ($('to-studio')).href =
    `customize.html?target=${encodeURIComponent(choice.target)}&source=${encodeURIComponent(choice.source)}`;

  const geometrySelect = /** @type {HTMLSelectElement} */ ($('geometry'));
  for (const [id, g] of Object.entries(presets.geometry)) {
    geometrySelect.append(new Option(/** @type {any} */ (g).name, id));
  }
  const paperSelect = /** @type {HTMLSelectElement} */ ($('paper'));
  for (const p of Object.values(ctx.corpus.paper)) {
    paperSelect.append(new Option(p.name, p.preset_id));
  }

  const base = makeSpec(ctx, presets, choice);
  geometrySelect.value = choice.geometry ?? 'card-7x5-4col';
  paperSelect.value = base.paper.presetId;

  /** @type {{plan:import('../core/types.js').LayoutPlan}|null} */ let current = null;

  function currentSpec() {
    const interests = /** @type {HTMLSelectElement} */ ($('preset')).value;
    return {
      ...makeSpec(ctx, presets, { ...choice, geometry: geometrySelect.value, paper: paperSelect.value }),
      inkMode: /** @type {any} */ (/** @type {HTMLSelectElement} */ ($('ink')).value),
      selection: interests ? defaultSelection(ctx.corpus, [interests]) : { sections: {}, items: {} },
    };
  }

  async function refresh() {
    $('status').dataset.busy = '1';
    // Yield so the busy state paints before the solver blocks the main thread.
    await new Promise((r) => setTimeout(r, 0));
    const spec = currentSpec();
    const { plan } = await buildSheet(ctx, spec);
    current = { plan };

    const container = $('faces');
    container.replaceChildren();
    for (const svg of faceSvgs({ plan, manifest, icons, stacks, name: 'x' })) {
      const holder = document.createElement('div');
      holder.className = 'face';
      holder.innerHTML = svg;
      container.append(holder);
    }

    $('warnings').replaceChildren(...plan.warnings.map((w) => {
      const li = document.createElement('li');
      li.className = w.severity;
      li.textContent = w.message;
      return li;
    }));
    $('status').dataset.busy = '0';
    $('status').textContent = plan.faces.length
      ? `${plan.faces.length} faces · type scale ${plan.scale.toFixed(2)}`
      : 'Nothing to show.';
  }

  const name = `${target.exonym_en.toLowerCase().replace(/\W+/g, '-')}-pocket-guide`;
  const input = () => {
    if (!current) throw new Error('nothing solved yet');
    return { plan: current.plan, manifest, icons, stacks, name };
  };

  $('pdf').addEventListener('click', () => exportPdf(input(), {
    title: `${target.exonym_en} pocket guide`, language: choice.source,
  }).catch(showFatal));
  $('png').addEventListener('click', () => exportPng(input(), 600).catch(showFatal));
  $('svg').addEventListener('click', () => exportSvg(input()).catch(showFatal));

  for (const id of ['geometry', 'paper', 'ink', 'preset']) {
    $(id).addEventListener('change', () => refresh().catch(showFatal));
  }
  await refresh();
}

main().catch(showFatal);
