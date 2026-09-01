// The quick path: pick from a few presets and export.
//
// Deliberately a subset of the studio, sharing its controls so the two pages read
// as one app rather than two. Everything not offered here is a studio decision.

import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, showFatal, afterPaint, withBusy,
} from './app.js';
import { buildSheet, stacksFor } from '../core/sheet.js';
import { defaultSelection } from '../core/pack.js';
import { faceSvgs, exportPdf, exportPng, exportSvg, loadIcons } from './export.js';
import {
  pageGlyph, typefaceGlyph, inkGlyph, dpiGlyph, densityGlyph, segmented, panelField,
} from './glyphs.js';
import { familyFor } from '../render/fonts.js';
import { regionRow } from './flags.js';

const AUDIENCES = [
  { value: '', text: 'Everything we have' },
  { value: 'core', text: 'Just the essentials' },
  { value: 'transit', text: 'Getting around' },
  { value: 'food', text: 'Eating and shopping' },
  { value: 'lodging', text: 'Hotels and buildings' },
  { value: 'outdoors', text: 'Hiking and parks' },
  { value: 'health', text: 'Health and emergencies' },
];

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const { languages, coverage } = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages, coverage));
  const ctx = await browserSheetContext();
  const presets = JSON.parse(await loadText('data/presets.json'));
  const icons = await loadIcons();
  const themes = { 'latex-reference': await ctx.theme('latex-reference') };
  const roles = Object.values(themes['latex-reference'].colors.roles);

  const target = ctx.corpus.languages[choice.target];
  const source = ctx.corpus.languages[choice.source];
  document.title = `${target.exonym_en} pocket guide`;
  $('title').textContent = `${target.exonym_en} pocket guide`;
  $('subtitle').textContent = `Glossed into ${source.exonym_en}. Print double-sided, `
    + 'cut down the middle, and you have four pocket cards.';
  const flags = regionRow(target.regions, {
    label: `${target.exonym_en} is spoken in ${target.regions.split(';').join(', ')}`,
  });
  if (flags) $('pair-flags').append(flags);

  const query = `?target=${encodeURIComponent(choice.target)}&source=${encodeURIComponent(choice.source)}`;
  /** @type {HTMLAnchorElement} */ ($('to-studio')).href = `customize.html${query}`;

  /** @type {import('../core/types.js').SheetSpec} */
  let spec = makeSpec(ctx, presets, choice);
  let dpi = 600;
  let audience = '';
  let manifest = /** @type {any} */ (null);
  /** @type {import('../core/types.js').LayoutPlan|null} */ let plan = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let pending;

  const schedule = () => {
    clearTimeout(pending);
    pending = setTimeout(() => refresh().catch(showFatal), 120);
  };

  /** @param {Partial<import('../core/types.js').SheetSpec>} patch */
  const set = (patch) => {
    spec = { ...spec, ...patch };
    schedule();
  };

  // --- controls -----------------------------------------------------------

  const card = segmented({
    label: 'Card size',
    value: choice.geometry ?? 'card-7x5-4col',
    options: Object.entries(presets.geometry).map(([id, raw]) => {
      const g = /** @type {any} */ (raw);
      return {
        value: id,
        caption: g.name.split('·')[0].trim().replace(/landscape|portrait/g, '').trim(),
        title: g.name,
        glyph: pageGlyph({ pageW: g.pageW, pageH: g.pageH, columns: g.columns }),
      };
    }),
    onChange: (id) => set({ geometry: { ...presets.geometry[id] } }),
  });

  /** @type {{value:'sans'|'serif', caption:string, stack:string}[]} */
  const typefaces = [
    { value: 'sans', caption: 'Sans', stack: 'latin' },
    { value: 'serif', caption: 'Serif', stack: 'latin-serif' },
  ];
  const typeface = segmented({
    label: 'Typeface',
    value: /** @type {'sans'|'serif'} */ ('sans'),
    options: typefaces.map((t) => ({
      value: t.value,
      caption: t.caption,
      title: t.caption,
      glyph: typefaceGlyph(`"${familyFor(t.stack)}", ${t.value}-serif`),
    })),
    onChange: (value) => set({ typeface: value }),
  });

  const density = segmented({
    label: 'Row spacing',
    value: 0.7,
    options: [[0, 'Tight'], [0.7, 'Normal'], [1.6, 'Airy']].map(([value, caption], i) => ({
      value: /** @type {number} */ (value),
      caption: /** @type {string} */ (caption),
      title: `${caption} spacing`,
      glyph: densityGlyph(i),
    })),
    onChange: (value) => set({ density: value }),
  });

  const ink = segmented({
    label: 'Ink',
    value: /** @type {'full'|'low-ink'|'mono'} */ ('full'),
    options: /** @type {const} */ ([['full', 'Colour'], ['low-ink', 'Low ink'], ['mono', 'Mono']])
      .map(([value, caption]) => ({
        value, caption, title: caption, glyph: inkGlyph(value, roles),
      })),
    onChange: (value) => set({ inkMode: value }),
  });

  const paper = document.createElement('select');
  paper.id = 'paper';
  for (const p of Object.values(ctx.corpus.paper)) paper.append(new Option(p.name, p.preset_id));
  paper.value = spec.paper.presetId;
  paper.addEventListener('change', () => {
    set({ paper: makeSpec(ctx, presets, { ...choice, paper: paper.value }).paper });
  });

  const preset = document.createElement('select');
  preset.id = 'preset';
  for (const a of AUDIENCES) preset.append(new Option(a.text, a.value));
  preset.addEventListener('change', () => {
    audience = preset.value;
    set({
      selection: audience ? defaultSelection(ctx.corpus, [audience]) : { sections: {}, items: {} },
    });
  });

  /** @param {string} id @param {string} label @param {HTMLSelectElement} select */
  const menu = (id, label, select) => {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.htmlFor = id;
    const span = document.createElement('span');
    span.textContent = label;
    lab.append(span);
    wrap.append(lab, select);
    return wrap;
  };

  $('controls').replaceChildren(
    panelField('Card size', [card.group]),
    panelField('Typeface', [typeface.group]),
    panelField('Row spacing', [density.group]),
    panelField('Ink', [ink.group]),
    menu('paper', 'Paper and printer', paper),
    menu('preset', 'What to include', preset),
  );

  const dpiControl = segmented({
    label: 'PNG resolution',
    value: 600,
    options: [[150, 'Screen'], [300, 'Print'], [600, 'Photo']].map(([value, caption]) => ({
      value: /** @type {number} */ (value),
      caption: /** @type {string} */ (caption),
      title: `${value} dpi`,
      glyph: dpiGlyph(/** @type {number} */ (value)),
    })),
    onChange: (value) => { dpi = value; },
  });
  // Labelled like every other control on the page; three bare glyph buttons under
  // the export row read as decoration rather than as a setting.
  $('dpi-control').append(panelField('PNG resolution', [dpiControl.group]));

  // --- solving and export -------------------------------------------------

  async function refresh() {
    $('status').dataset.busy = '1';
    await afterPaint();
    manifest = await ensureFontCss(ctx, spec.target, spec.source, spec.typeface);
    const built = await buildSheet(ctx, spec);
    plan = built.plan;

    const container = $('faces');
    container.replaceChildren();
    if (plan.faces.length) {
      const svgs = faceSvgs({
        plan, manifest, icons, name: 'x',
        stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface),
      });
      for (const [i, svg] of svgs.entries()) {
        const holder = document.createElement('div');
        holder.className = 'face';
        holder.setAttribute('aria-label', `Face ${i + 1} of ${svgs.length}`);
        holder.innerHTML = svg;
        container.append(holder);
      }
    }

    $('warnings').replaceChildren(...plan.warnings
      // The quick path should not lecture: only things that change what prints.
      .filter((w) => w.severity !== 'info')
      .map((w) => {
        const li = document.createElement('li');
        li.className = w.severity;
        li.textContent = w.message;
        return li;
      }));
    $('status').dataset.busy = '0';
    $('status').textContent = plan.faces.length
      ? `${plan.faces.length} faces · ${plan.faces.length / 2} sheets · type ${plan.scale.toFixed(2)}×`
      : 'Nothing to show.';
  }

  const name = `${target.exonym_en.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}-pocket-guide`;
  const input = () => {
    if (!plan) throw new Error('nothing solved yet');
    return {
      plan, manifest, icons, name,
      stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface),
    };
  };

  $('pdf').addEventListener('click', () => withBusy($('pdf'), 'Building PDF…', () => exportPdf(
    input(), { title: `${target.exonym_en} pocket guide`, language: choice.source },
  )).catch(showFatal));
  $('png').addEventListener('click', () => withBusy($('png'), 'Rendering…',
    (onProgress) => exportPng({ ...input(), onProgress }, dpi)).catch(showFatal));
  $('svg').addEventListener('click', () => withBusy($('svg'), 'Building SVG…',
    () => exportSvg(input())).catch(showFatal));

  await refresh();
}

main().catch(showFatal);
