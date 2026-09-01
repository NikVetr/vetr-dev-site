// Gallery: pick a language. Reads only the language registry and the pre-rendered
// pack index, so it stays fast and works offline without loading the solver, the
// corpus or a CJK font.

import {
  browserSheetContext, loadText, loadLanguages, readerLanguage, registerOffline,
  saveForOffline, setReaderLanguage, showFatal,
} from './app.js';
import { regionRow } from './flags.js';
import { languagePicker } from './language-picker.js';
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
 * A closer look at a language's default card, without leaving the page. The
 * gallery deliberately does not load the solver, so this shows the pre-rendered
 * first face rather than typesetting anything -- the studio is one click away for
 * the rest.
 * @param {{name:string, key:string, query:string}} card
 */
function openPreview({ name, key, query }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'preview-dialog';
  dialog.append(
    el('h2', { text: t('gallery.previewTitle', { language: name }) }),
    el('img', { src: `packs/${key}/thumb.png`, alt: t('gallery.thumbAlt', { language: name }) }),
    el('p', { class: 'small muted', text: t('gallery.previewNote') }),
    el('div', { class: 'row' }, [
      el('a', { class: 'btn primary', href: `sheet.html${query}`, text: t('gallery.export') }),
      el('a', { class: 'btn', href: `customize.html${query}`, text: t('gallery.customise') }),
    ]),
  );
  const close = el('button', { type: 'button', class: 'preview-close', text: '\u00d7' });
  close.setAttribute('aria-label', t('gallery.previewClose'));
  close.addEventListener('click', () => dialog.close());
  dialog.prepend(close);
  // Clicking the backdrop closes it, which is what everyone expects of a lightbox.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

/**
 * @param {Record<string,string>} lang
 * @param {Set<string>} packs   `target__source` keys that exist
 * @param {string} reader
 * @param {{total:number, languages:Record<string,number>}} coverage
 */
function card(lang, packs, reader, coverage) {
  const name = languageName(lang.bcp47, lang.exonym_en);
  const key = `${lang.bcp47}__${reader}`;
  const hasPack = packs.has(key);
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
      'data-i18n-label': 'gallery.previewOpen',
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
      offline.textContent = t('gallery.saving');
      /** @type {HTMLButtonElement} */ (offline).disabled = true;
      try {
        const ctx = await browserSheetContext();
        const manifest = JSON.parse(await loadText('data/fonts/manifest.json'));
        const result = await saveForOffline({
          corpus: ctx.corpus, target: lang.bcp47, source: reader, manifest,
        });
        offline.textContent = result.ok ? t('gallery.saved') : t('gallery.partlySaved');
      } catch (err) {
        offline.textContent = t('gallery.saveFailed');
        console.warn('[plg]', err);
      }
    });
    actions.push(offline);
  }

  if (thumb instanceof HTMLButtonElement) {
    thumb.addEventListener('click', () => openPreview({ name, key, query }));
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

  /** @type {Set<string>} */ let packs = new Set();
  try {
    const index = JSON.parse(await loadText('packs/index.json'));
    packs = new Set(index.packs.map((/** @type {any} */ p) => `${p.target}__${p.source}`));
  } catch {
    // No pre-rendered packs yet; cards still work, they just have no thumbnail.
  }

  const mount = /** @type {HTMLElement} */ (document.getElementById('reader'));
  // Collapsed it shows only the endonym -- "Deutsch", not "Deutsch (German)" --
  // because that is the word you scan for. The name in the reader's own language
  // earns its place only in the open list, set grey and to the trailing edge.
  languagePicker({
    mount,
    label: t('nav.readerHint'),
    value: reader,
    options: languages
      .filter((l) => l.status !== 'planned')
      .map((l) => ({
        value: l.bcp47,
        name: l.endonym,
        aside: languageName(l.bcp47, l.exonym_en),
      })),
    onChange: (value) => {
      setReaderLanguage(value);
      renderSpeakCollage(languages, value);
      render(value);
    },
  });
  renderSpeakCollage(languages, reader);

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
    const gallery = /** @type {HTMLElement} */ (document.getElementById('gallery'));
    gallery.replaceChildren(...shown.map((l) => card(l, packs, readerCode, coverage)));
    gallery.setAttribute('aria-busy', 'false');
  }

  render(reader);
}

main().catch(showFatal);
