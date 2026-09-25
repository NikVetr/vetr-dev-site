// The quick path: pick from a few presets and export.
//
// Deliberately a subset of the studio, sharing its controls so the two pages read
// as one app rather than two. Everything not offered here is a studio decision.

import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, showFatal, afterPaint, withBusy, download,
} from './app.js';
import { buildSheet, stacksFor } from '../core/sheet.js';
import { isElven } from '../core/elven-frame.js';
import { defaultSelection } from '../core/pack.js';
import {
  faceSvgs, exportPdf, exportPng, exportSvg, loadIcons,
  showSavedImages, reportExportError,
} from './export.js';
import { lockScreenPreview } from './preview.js';
import {
  typefaceGlyph, inkGlyph, dpiGlyph, paddingGlyph, PADDING_CHOICES, customGlyph,
  priorityOptions, segmented, numericChoice, panelField,
  cardSizeControl, paletteControl, reserveControl, backgroundControl, headControl,
} from './glyphs.js';
import { familyFor } from '../render/fonts.js';
import { regionRow } from './flags.js';
import { speakerControl, personalSection } from './speaker-settings.js';
import { personalWiring } from './personal-data.js';
import {
  warningText, applyStatic, languageName, loadUiLanguage, number, regionList, t,
} from './i18n.js';

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

/**
 * The flag colours of the countries a language is spoken in, first two only. Empty
 * where the registry has none, which lets the `flag` background fall back to paper.
 * @param {any} corpus @param {string} target
 */
function flagColoursFor(corpus, target) {
  const codes = (corpus.languages[target]?.regions ?? '').split(';').filter(Boolean).slice(0, 2);
  return codes
    .flatMap((/** @type {string} */ code) => (corpus.regions[code]?.flag_colors ?? '').split(';'))
    .map((/** @type {string} */ c) => c.trim())
    .filter(Boolean);
}

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
  // Both, because the palette ladder offers both -- and the CVD-safe one is the
  // reason this control belongs on the quick page at all: colour is the section
  // encoding, so a reader who cannot use the default needs it before they print,
  // not after they find the studio.
  const themes = Object.fromEntries(await Promise.all(
    ['latex-reference', 'cvd-safe', 'dark', 'parchment'].map(async (id) => [id, await ctx.theme(id)]),
  ));

  const target = ctx.corpus.languages[choice.target];
  const source = ctx.corpus.languages[choice.source];
  // The reader's own language throughout: this page is read by whoever the sheet
  // is glossed into, so naming their language in English is the same mistake as
  // leaving the heading untranslated.
  const targetName = languageName(target.bcp47, target.exonym_en);
  document.title = t('quick.heading', { language: targetName });
  $('title').textContent = t('quick.heading', { language: targetName });
  $('subtitle').textContent = t('quick.subtitle', {
    source: languageName(source.bcp47, source.exonym_en),
  });
  const flags = regionRow(target.regions, {
    label: t('gallery.spokenIn', {
      language: targetName, regions: regionList(target.regions),
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

  /**
   * Narrow enough that the warning list is past the fold.
   *
   * The page stacks at 700px, and stacked it is 3900pt tall on a 844pt screen with
   * the warnings at 1622pt -- so an error saying the sheet does not fit was two
   * screens below the controls that caused it. Read per solve rather than latched,
   * so rotating a phone or resizing gets the behaviour that matches the layout.
   */
  const narrow = () => matchMedia('(max-width: 700px)').matches;

  /** The auto-applied fit fix, kept so it can be named and given back. */
  /** @type {{label:string, before:Partial<import('../core/types.js').SheetSpec>}|null} */
  let autoFix = null;
  /** Set when the reader takes it back, so the next solve does not reapply it. */
  let refused = false;

  // --- controls -----------------------------------------------------------

  // The shared controls, so a reader who wants a card size or a palette this page
  // does not list is not sent to the studio for a number it could perfectly well
  // take. Everything else here stays a fixed ladder: this page is the offer, and
  // the studio is where the offer runs out.
  const card = cardSizeControl({
    geometry: presets.geometry,
    value: spec.geometry,
    onChange: set,
  });

  // The one control from the studio's "how much fits" group that this page also
  // needs, and it is here rather than only there because of what it is *for*: the
  // phone card plus the top step is a lock screen, and asking someone to open the
  // studio to set a wallpaper would be asking them to open the studio for the one
  // thing the quick path does best. No Custom segment -- the ladder is the offer
  // this page makes, and a continuous importance floor is a studio decision.
  const priority = segmented({
    label: t('format.priority'),
    value: spec.priority,
    options: priorityOptions(ctx.corpus.concepts),
    onChange: (value) => set({ priority: value }),
  });

  /** @type {{value:import('../core/types.js').SheetSpec['typeface'],
   *          caption:string, stack:string}[]} */
  const typefaces = [
    { value: 'sans', caption: t('format.typeface.sans'), stack: 'latin' },
    { value: 'serif', caption: t('format.typeface.serif'), stack: 'latin-serif' },
    // Narrow is not only a style: the condensed face fits more per line, so the
    // reference card comes out at 0.78 of nominal type against 0.70 for sans on the
    // same eight faces.
    { value: 'cond', caption: t('format.typeface.cond'), stack: 'latin-cond' },
    { value: 'cond-serif', caption: t('format.typeface.cond-serif'), stack: 'latin-cond-serif' },
  ];
  const typeface = segmented({
    label: t('format.typeface'),
    value: /** @type {import('../core/types.js').SheetSpec['typeface']} */ ('sans'),
    options: typefaces.map((face) => ({
      value: face.value,
      caption: face.caption,
      title: face.caption,
      glyph: typefaceGlyph(
        `"${familyFor(face.stack)}", ${face.value.endsWith('serif') ? 'serif' : 'sans-serif'}`,
      ),
    })),
    onChange: (value) => set({ typeface: value }),
  });

  const padding = numericChoice({
    label: t('format.breathingRoom'),
    value: spec.padding,
    min: 0,
    max: 4,
    step: 0.1,
    unit: 'pt',
    customCaption: t('format.custom'),
    customGlyph: customGlyph(),
    options: PADDING_CHOICES.map((choice, i) => ({
      value: choice.value,
      caption: t(choice.captionKey),
      title: t('format.paddingTitle', { padding: t(choice.captionKey) }),
      glyph: paddingGlyph(i),
    })),
    onChange: (value) => set({ padding: value }),
  });

  // Only on a screen preset. The phone card plus the top priority step is the
  // wallpaper recipe, so this page is where someone setting a lock screen already
  // is -- and a clock drawn over the top two rows is the first thing they would
  // hit.
  const reserve = reserveControl({ value: spec.geometry, onChange: set });
  const reserveField = panelField(t('format.reserve'), [reserve.group, reserve.custom]);
  reserveField.hidden = !spec.geometry.screen;

  const theme = paletteControl({
    themes,
    themeId: spec.themeId,
    themeColors: spec.themeColors,
    onChange: set,
  });

  // Two settings the studio grew after this page was written, so their absence here
  // was an omission rather than a decision. Both are choices about how the finished
  // card *looks* rather than about how the solver packs it, which is the line this
  // page draws: the columns, the face count, the divider, the entry layout and which
  // columns appear are all still studio decisions.
  const background = backgroundControl({
    value: spec.background,
    roleColours: () => theme.colours(),
    flagColours: flagColoursFor(ctx.corpus, spec.target),
    onChange: set,
  });
  const head = headControl({ spec, onChange: set });

  const ink = segmented({
    label: t('format.ink'),
    value: /** @type {'full'|'low-ink'|'mono'} */ ('full'),
    options: /** @type {const} */ ([
      ['full', 'format.ink.full'], ['low-ink', 'format.ink.lowInk'], ['mono', 'format.ink.mono'],
    ]).map(([value, captionKey]) => ({
      value,
      caption: t(captionKey),
      title: t(captionKey),
      glyph: inkGlyph(value, theme.colours()),
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

  // **Whose voice the card is in**, on the page someone prints from rather than
  // buried in the studio. Absent for the 31 languages that decline to ask, which is
  // the point: a control that opens onto an empty form is worse than no control.
  const voice = speakerControl({
    axes: ctx.corpus.speakerAxes,
    languages: [choice.target, choice.source],
    profile: spec.speaker ?? {},
    onChange: (next) => set({ speaker: next }),
    // The same settings dialog the board opens, so the reader's own phrases and
    // their saved card edits can be carried off a machine that only ever prints.
    // A reload afterwards, because this page holds a solved layout built from the
    // edits that just changed underneath it -- re-deriving that by hand would be a
    // second, quieter copy of `buildSheet`.
    extra: () => personalSection(personalWiring({
      save: download,
      onChanged: () => location.reload(),
    })),
  });

  $('controls').replaceChildren(
    ...(voice ? [panelField(t('speaker.title'), [voice.button, voice.note])] : []),
    panelField(t('format.cardSize'), [card.group, card.custom]),
    reserveField,
    panelField(t('format.priority'), [priority.group]),
    panelField(t('format.typeface'), [typeface.group]),
    panelField(t('format.textPadding'), [padding.group]),
    panelField(t('format.colours'), [theme.group, theme.custom]),
    panelField(t('format.background'),
      [background.group, background.custom, background.rowsField]),
    head.field,
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
    // Both of these follow the card, and the card is a control on this page.
    reserveField.hidden = !spec.geometry.screen;
    reserve.sync(spec.geometry);
    await afterPaint();
    manifest = await ensureFontCss(ctx, spec.target, spec.source, spec.typeface, isElven(spec));
    let built = await buildSheet(ctx, spec);

    // **A fit error that cannot be read is a fit error that cannot be fixed.** The
    // solver already works out what would make the sheet fit and hangs it on the
    // warning as `fixes`; on a wide screen those are offered as buttons further
    // down, which is the studio's behaviour and now this page's too. At phone width
    // that list is off the bottom of a 3900pt page, so the first fix is applied
    // instead and named in the notice above, where it is the first thing under the
    // preview -- with the undo beside it, which is what was asked for.
    //
    // Only the first fix, and only once: `findFixes` orders them by how little they
    // concede, so the first is the cheapest, and applying more than one would
    // compound concessions nobody asked for. No control needs syncing afterwards
    // because the patches change `geometry.columns`, `autoFaces` or `selection`,
    // and this page exposes none of those -- the notice is the only place the
    // change is visible, which is exactly why it says what it did.
    const blocker = built.plan.warnings.find((w) => w.severity === 'error' && w.fixes?.length);
    if (blocker && narrow() && !autoFix && !refused) {
      const fix = /** @type {import('../core/types.js').WarningFix[]} */ (blocker.fixes)[0];
      const keys = /** @type {(keyof import('../core/types.js').SheetSpec)[]} */
        (Object.keys(fix.patch));
      autoFix = {
        label: fix.label,
        before: Object.fromEntries(keys.map((k) => [k, spec[k]])),
      };
      spec = { ...spec, ...fix.patch };
      built = await buildSheet(ctx, spec);
    }
    plan = built.plan;

    const container = $('faces');
    container.replaceChildren();
    if (plan.faces.length) {
      const svgs = faceSvgs({
        plan, manifest, icons, name: 'x',
        stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface, isElven(spec)),
      });
      for (const [i, svg] of svgs.entries()) {
        const holder = document.createElement('div');
        holder.className = 'face';
        holder.setAttribute('aria-label', t('preview.faceOf', { n: i + 1, total: svgs.length }));
        holder.innerHTML = svg;
        // What is going to sit on top of a lock screen, where the card reserves room
        // for it. A DOM overlay rather than part of the plan, so it cannot reach an
        // export.
        const lock = lockScreenPreview(plan);
        if (lock) holder.prepend(lock);
        container.append(holder);
      }
    }

    $('warnings').replaceChildren(...plan.warnings
      // The quick path should not lecture: only things that change what prints.
      .filter((w) => w.severity !== 'info')
      .map((w) => {
        const li = document.createElement('li');
        li.className = w.severity;
        li.append(document.createTextNode(warningText(w)));
        // The solver's own remedies, as buttons rather than as prose a reader has
        // to translate into a control. The studio has offered these since it had
        // warnings at all; this page showed the sentence and no way to act on it.
        if (!w.fixes?.length) return li;
        const row = document.createElement('div');
        row.className = 'row fixes';
        for (const fix of w.fixes) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'fix';
          button.textContent = fix.label;
          button.addEventListener('click', () => {
            // Taking a fix by hand is not the automatic one, so it must not be
            // offered back as though it were.
            autoFix = null;
            refused = true;
            set(fix.patch);
          });
          row.append(button);
        }
        li.append(row);
        return li;
      }));

    const notice = $('fit-notice');
    notice.replaceChildren();
    notice.hidden = !autoFix;
    if (autoFix) {
      const said = document.createElement('span');
      said.textContent = t('quick.autofit', { fix: autoFix.label });
      const undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'fix';
      undo.textContent = t('quick.autofitUndo');
      undo.addEventListener('click', () => {
        const back = /** @type {Partial<import('../core/types.js').SheetSpec>} */ (autoFix?.before);
        autoFix = null;
        refused = true;
        set(back);
      });
      notice.append(said, undo);
    }
    $('status').dataset.busy = '0';
    // A screen has no sheets, and saying it has half of one is worse than saying
    // nothing: this line is the only place the page reports what it produced.
    //
    // Both keys are spelled out rather than picked inside the call, because
    // `npm run i18n` finds strings by scanning for literal calls to `t` and read a
    // computed key as two catalogue entries nobody uses.
    const counts = {
      faces: plan.faces.length,
      sheets: plan.faces.length / 2,
      scale: number(plan.scale, 2),
    };
    $('status').textContent = plan.faces.length
      ? (spec.geometry.screen ? t('quick.statusScreen', counts) : t('quick.status', counts))
      : t('quick.nothing');
  }

  const name = `${target.exonym_en.toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}-pocket-guide`;

  const input = () => {
    if (!plan) throw new Error('nothing solved yet');
    return {
      plan, manifest, icons, name,
      present: (/** @type {any[]} */ files, /** @type {string} */ pages) =>
        showSavedImages($('saved-images'), files, pages),
      stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface, isElven(spec)),
    };
  };

  /** Nothing-to-export is a sentence; anything else is still fatal. */
  const failed = (/** @type {unknown} */ err) => reportExportError(err, $('status'), showFatal);

  $('pdf').addEventListener('click', () => withBusy($('pdf'), t('common.buildingPdf'), () => exportPdf(
    input(),
    { title: t('quick.heading', { language: targetName }), language: choice.source },
  )).catch(failed));
  $('png').addEventListener('click', () => withBusy($('png'), t('common.rendering'),
    (onProgress) => exportPng({ ...input(), onProgress }, dpi)).catch(failed));
  $('svg').addEventListener('click', () => withBusy($('svg'), t('common.buildingSvg'),
    () => exportSvg(input())).catch(failed));

  await refresh();
}

main().catch(showFatal);
