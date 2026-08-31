// Gallery: pick a language. Reads only the language registry and the pre-rendered
// pack index, so it stays fast and works offline without loading the solver, the
// corpus or a CJK font.

import {
  browserSheetContext, loadText, loadLanguages, readerLanguage, registerOffline,
  saveForOffline, setReaderLanguage, showFatal,
} from './app.js';

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
 * @param {Record<string,string>} lang
 * @param {Set<string>} packs   `target__source` keys that exist
 * @param {string} reader
 * @param {{total:number, languages:Record<string,number>}} coverage
 */
function card(lang, packs, reader, coverage) {
  const key = `${lang.bcp47}__${reader}`;
  const hasPack = packs.has(key);
  // A pair can only render what both sides have.
  const have = Math.min(coverage.languages[lang.bcp47] ?? 0, coverage.languages[reader] ?? 0);
  const query = `?target=${encodeURIComponent(lang.bcp47)}&source=${encodeURIComponent(reader)}`;

  const head = el('div', { class: 'card-head' }, [
    el('span', { class: 'card-badge', 'aria-hidden': 'true', text: lang.badge }),
    el('span', {}, [
      el('div', { class: 'card-name', text: lang.exonym_en }),
      el('div', { class: 'small muted', text: lang.endonym, lang: lang.bcp47 }),
    ]),
  ]);

  const thumb = hasPack && have
    ? el('img', {
      class: 'card-thumb',
      src: `packs/${key}/thumb.png`,
      alt: `First face of the default ${lang.exonym_en} guide`,
      loading: 'lazy',
      decoding: 'async',
    })
    : el('div', { class: 'card-thumb placeholder' }, [
      el('span', {
        text: have
          ? `${have} of ${coverage.total} phrases translated`
          : 'Not translated yet',
      }),
    ]);

  /** @type {(Node|string)[]} */ const actions = [];
  if (!have) {
    actions.push(el('span', { class: 'tag planned', text: 'help translate' }));
  } else {
    if (have < coverage.total) {
      actions.push(el('span', { class: 'tag draft', text: `${have} phrases` }));
    }
    actions.push(el('a', { class: 'btn primary', href: `sheet.html${query}`, text: 'Export' }));
    actions.push(el('a', { class: 'btn', href: `customize.html${query}`, text: 'Customise' }));
    const offline = el('button', {
      type: 'button', class: 'btn small', text: 'Save offline',
      'data-offline': lang.bcp47,
    });
    offline.addEventListener('click', async () => {
      offline.textContent = 'Saving…';
      /** @type {HTMLButtonElement} */ (offline).disabled = true;
      try {
        const ctx = await browserSheetContext();
        const manifest = JSON.parse(await loadText('data/fonts/manifest.json'));
        const result = await saveForOffline({
          corpus: ctx.corpus, target: lang.bcp47, source: reader, manifest,
        });
        offline.textContent = result.ok ? 'Saved offline' : 'Partly saved';
      } catch (err) {
        offline.textContent = 'Could not save';
        console.warn('[plg]', err);
      }
    });
    actions.push(offline);
  }

  return el('article', { class: 'card' }, [head, thumb, el('div', { class: 'card-actions' }, actions)]);
}

async function main() {
  registerOffline();
  const languages = await loadLanguages();
  const reader = readerLanguage(languages);

  const coverage = JSON.parse(await loadText('data/coverage.json'));

  /** @type {Set<string>} */ let packs = new Set();
  try {
    const index = JSON.parse(await loadText('packs/index.json'));
    packs = new Set(index.packs.map((/** @type {any} */ p) => `${p.target}__${p.source}`));
  } catch {
    // No pre-rendered packs yet; cards still work, they just have no thumbnail.
  }

  const picker = /** @type {HTMLSelectElement} */ (document.getElementById('reader'));
  for (const lang of languages.filter((l) => l.status !== 'planned')) {
    picker.append(el('option', { value: lang.bcp47, text: `${lang.endonym} (${lang.exonym_en})` }));
  }
  picker.value = reader;
  picker.addEventListener('change', () => {
    setReaderLanguage(picker.value);
    render(picker.value);
  });

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
