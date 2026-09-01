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
  pageGlyph, typefaceGlyph, inkGlyph, dpiGlyph, paddingGlyph, PADDING_CHOICES,
  segmented, panelField,
} from './glyphs.js';
import { familyFor } from '../render/fonts.js';
import { regionRow } from './flags.js';
import { warningText, applyStatic, loadUiLanguage, t } from './i18n.js';

// Module scope, so the words cannot be looked up here: the keys are, and the
// menu resolves them when it is built.
const AUDIENCES = [
  { value: '', textKey: 'preset.everything' },
  { value: 'core', textKey: 'preset.core' },
  { value: 'transit', textKey: 'quiz.interest.transit' },
  { value: 'food', textKey: 'quiz.interest.food' },
  { value: 'lodging', textKey: 'quiz.interest.lodging' },
  { value: 'outdoors', textKey: 'quiz.interest.outdoors' },
  { value: 'health', textKey: 'quiz.interest.health' },
];

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const { languages, coverage } = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages, coverage));
  // The interface language is the one the sheet is glossed into -- the reader's
  // own -- so it is loaded before anything is drawn, static markup included.
  await loadUiLanguage(choice.source, loadText);
  applyStatic();
  const ctx = await browserSheetContext();
  const presets = JSON.parse(await loadText('data/presets.json'));
  const icons = await loadIcons();
  const themes = { 'latex-reference': await ctx.theme('latex-reference') };
  const roles = Object.values(themes['latex-reference'].colors.roles);

  const target = ctx.corpus.languages[choice.target];
  const source = ctx.corpus.languages[choice.source];
  document.title = t('quick.heading', { language: target.exonym_en });
  $('title').textContent = t('quick.heading', { language: target.exonym_en });
  $('subtitle').textContent = t('quick.subtitle', { source: source.exonym_en });
  const flags = regionRow(target.regions, {
    label: t('gallery.spokenIn', {
      language: target.exonym_en, regions: target.regions.split(';').join(', '),
    }),
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
    label: t('format.cardSize'),
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
    { value: 'sans', caption: t('format.typeface.sans'), stack: 'latin' },
    { value: 'serif', caption: t('format.typeface.serif'), stack: 'latin-serif' },
  ];
  const typeface = segmented({
    label: t('format.typeface'),
    value: /** @type {'sans'|'serif'} */ ('sans'),
    options: typefaces.map((face) => ({
      value: face.value,
      caption: face.caption,
      title: face.caption,
      glyph: typefaceGlyph(`"${familyFor(face.stack)}", ${face.value}-serif`),
    })),
    onChange: (value) => set({ typeface: value }),
  });

  const padding = segmented({
    label: t('format.breathingRoom'),
    value: spec.padding,
    options: PADDING_CHOICES.map((choice, i) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t('format.paddingTitle', { padding: t(choice.captionKey) }),
      glyph: paddingGlyph(i),
    })),
    onChange: (value) => set({ padding: value }),
  });

  const ink = segmented({
    label: t('format.ink'),
    value: /** @type {'full'|'low-ink'|'mono'} */ ('full'),
    options: /** @type {const} */ ([
      ['full', 'format.ink.full'], ['low-ink', 'format.ink.lowInk'], ['mono', 'format.ink.mono'],
    ]).map(([value, captionKey]) => ({
      value, caption: t(captionKey), title: t(captionKey), glyph: inkGlyph(value, roles),
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
  for (const a of AUDIENCES) preset.append(new Option(t(a.textKey), a.value));
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
    panelField(t('format.cardSize'), [card.group]),
    panelField(t('format.typeface'), [typeface.group]),
    panelField(t('format.textPadding'), [padding.group]),
    panelField(t('format.ink'), [ink.group]),
    menu('paper', t('format.paper'), paper),
    menu('preset', t('format.whatToInclude'), preset),
  );

  const dpiControl = segmented({
    label: t('format.pngResolution'),
    value: 600,
    options: [[150, 'format.dpi.screen'], [300, 'format.dpi.print'], [600, 'format.dpi.photo']]
      .map(([value, captionKey]) => ({
        value: /** @type {number} */ (value),
        caption: t(/** @type {string} */ (captionKey)),
        title: t('format.dpiTitle', { dpi: /** @type {number} */ (value) }),
        glyph: dpiGlyph(/** @type {number} */ (value)),
      })),
    onChange: (value) => { dpi = value; },
  });
  // Labelled like every other control on the page; three bare glyph buttons under
  // the export row read as decoration rather than as a setting.
  $('dpi-control').append(panelField(t('format.pngResolution'), [dpiControl.group]));

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
        holder.setAttribute('aria-label', t('preview.faceOf', { n: i + 1, total: svgs.length }));
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
        li.textContent = warningText(w);
        return li;
      }));
    $('status').dataset.busy = '0';
    $('status').textContent = plan.faces.length
      ? t('quick.status', {
        faces: plan.faces.length,
        sheets: plan.faces.length / 2,
        scale: plan.scale.toFixed(2),
      })
      : t('quick.nothing');
  }

  const name = `${target.exonym_en.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}-pocket-guide`;
  const input = () => {
    if (!plan) throw new Error('nothing solved yet');
    return {
      plan, manifest, icons, name,
      stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface),
    };
  };

  $('pdf').addEventListener('click', () => withBusy($('pdf'), t('common.buildingPdf'), () => exportPdf(
    input(),
    { title: t('quick.heading', { language: target.exonym_en }), language: choice.source },
  )).catch(showFatal));
  $('png').addEventListener('click', () => withBusy($('png'), t('common.rendering'),
    (onProgress) => exportPng({ ...input(), onProgress }, dpi)).catch(showFatal));
  $('svg').addEventListener('click', () => withBusy($('svg'), t('common.buildingSvg'),
    () => exportSvg(input())).catch(showFatal));

  await refresh();
}

main().catch(showFatal);
