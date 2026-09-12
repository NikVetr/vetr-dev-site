// Gallery: pick a language. Reads only the language registry and the pre-rendered
// pack index, so it stays fast and works offline without loading the solver, the
// corpus or a CJK font.
//
// The one exception is the lightbox in `ui/lightbox.js`, which typesets the whole
// sheet -- and only when a reader opens one.

import {
  loadText, loadLanguages, readerLanguage,
  registerOffline, setReaderLanguage, showFatal,
} from './app.js';
import { regionRow } from './flags.js';
import { languagePicker } from './language-picker.js';
import { openLightbox } from './lightbox.js';
import {
  applyStatic, languageName, loadUiLanguage, regionList, setLanguageNames, t,
} from './i18n.js';

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
    label: t('gallery.spokenIn', { language: name, regions: regionList(lang.regions) }),
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
    // **No "Offline" button here.** It said "Offline" and did something that needs a
    // sentence to explain -- fetch this pair's data and its subset fonts into the
    // service worker cache -- so it read as a state ("this is offline") rather than
    // an action, and sat beside two buttons that navigate. Export and Customise are
    // the two things to do with a card. The capability is unchanged: `sw.js` still
    // precaches the shell, and `app.js` still exports `saveForOffline` for a surface
    // that can afford to explain itself.
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
  return el('article', { class: 'card', 'data-lang': lang.bcp47 },
    [head, thumb, el('div', { class: 'card-actions' }, actions)]);
}

/**
 * How many cards the grid is currently laying across.
 *
 * Read off the cards rather than the CSS, because `auto-fill` means the count is a
 * function of the viewport and nothing in the stylesheet knows it. Everything in the
 * first row shares a top offset; the first card that does not is the start of row
 * two.
 * @param {HTMLElement[]} cards
 */
function columnCount(cards) {
  if (!cards.length) return 1;
  const top = cards[0].offsetTop;
  let n = 0;
  while (n < cards.length && cards[n].offsetTop === top) n += 1;
  return n || 1;
}

/** Long enough to follow a card across the grid, short enough not to be a wait. */
const REEL_MS = 420;

/**
 * Bring one language's card into the top row by turning its own column, the way a
 * reel stops on a symbol.
 *
 * **Only that column moves.** Sorting the chosen card to the front instead would
 * displace every card after it, so the answer to "where did the others go" is
 * "everywhere" -- and the grid is alphabetical, which is a property worth keeping
 * when the reader's next move is to look for a different language. Rotating one
 * column leaves the other columns' contents exactly where they were, and the
 * chosen column stays in alphabetical order too, just entered at a different point.
 *
 * The travel is the explanation: the card is somewhere on screen already, and
 * without motion the grid simply looks different afterwards. It is measured with
 * FLIP -- positions before, reorder, positions after, animate the difference -- so
 * the layout is the real one and only the paint is offset. `prefers-reduced-motion`
 * gets the reorder with no travel, since the ring is what says "this one".
 * @param {HTMLElement} grid @param {string} code
 * @returns {HTMLElement|null} the chosen card
 */
function reelToTopRow(grid, code) {
  const cards = /** @type {HTMLElement[]} */ ([...grid.children]
    .filter((n) => n instanceof HTMLElement && n.classList.contains('card')));
  const index = cards.findIndex((c) => c.dataset.lang === code);
  if (index < 0) return null;

  const cols = columnCount(cards);
  const row = Math.floor(index / cols);
  const chosen = cards[index];

  if (row > 0) {
    // **Scroll first, and instantly.** Two reasons, both found by measuring. A
    // running `animate()` moves an element's own box, so calling `scrollIntoView`
    // on the card afterwards aims at the position it is travelling *from* and sends
    // the page the wrong way -- 787px the wrong way, in the case that found this.
    // And a `smooth` scroll would still be running while the cards travel, so the
    // offsets FLIP measured would be stale before they were used. One instant jump
    // to the top of the grid, only when the card would otherwise arrive off-screen,
    // then the reel turns where it can be seen.
    if (chosen.getBoundingClientRect().top < 0) {
      grid.scrollIntoView({ block: 'start' });
    }
    const before = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    /** The indices this card's column occupies, top to bottom. */
    /** @type {number[]} */ const column = [];
    for (let i = index % cols; i < cards.length; i += cols) column.push(i);
    // Rotate the column upward by `row`, so what was in this card's row is now in
    // the first. `% column.length` is the wrap, and it is why this reads as a reel
    // rather than a shuffle: nothing leaves the column.
    const turned = column.map((_, k) => cards[column[(k + row) % column.length]]);
    const order = cards.slice();
    column.forEach((i, k) => { order[i] = turned[k]; });
    grid.replaceChildren(...order);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const cardEl of order) {
        const from = before.get(cardEl);
        const to = cardEl.getBoundingClientRect();
        if (!from) continue;
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        if (!dx && !dy) continue;
        cardEl.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: REEL_MS, easing: 'cubic-bezier(0.2, 0.75, 0.2, 1)' },
        );
      }
    }
  }

  for (const cardEl of cards) cardEl.classList.toggle('chosen', cardEl === chosen);
  return chosen;
}

/**
 * Every language as a button, which is the other half of the header's question:
 * "I speak" is answered up there, "and I want to speak" down here. The badge is the
 * language's own orthography, which is what tells two Latin-alphabet neighbours
 * apart, and the name is in the reader's language because that is what they are
 * scanning for.
 * @param {Record<string,string>[]} shown  already ordered and minus the reader
 * @param {{total:number, languages:Record<string,number>}} coverage
 * @param {string} readerCode
 * @param {(code:string)=>void} onPick
 */
function renderWantGrid(shown, coverage, readerCode, onPick) {
  const mount = document.getElementById('want');
  if (!mount) return;
  mount.replaceChildren(...shown.map((l) => {
    const name = languageName(l.bcp47, l.exonym_en);
    const have = Math.min(
      coverage.languages[l.bcp47] ?? 0, coverage.languages[readerCode] ?? 0,
    );
    const button = el('button', {
      type: 'button',
      class: have ? 'want-btn' : 'want-btn thin',
      'data-lang': l.bcp47,
      'aria-pressed': 'false',
      title: t('gallery.wantPick', { language: name }),
    }, [
      el('span', { class: 'want-badge', 'aria-hidden': 'true', text: l.badge }),
      el('span', { class: 'want-name', text: name }),
    ]);
    button.addEventListener('click', () => onPick(l.bcp47));
    return button;
  }));
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
  const { languages, coverage, names } = await loadLanguages();
  const reader = readerLanguage(languages, coverage);
  /**
   * The registry's names for one locale, as `languageName` wants them.
   *
   * One locale's slice rather than the whole table, because that is what the
   * function needs and the table is the O(N^2) one -- fifty rows out of two
   * thousand two hundred.
   * @param {string} locale
   */
  const useNamesFor = (locale) => setLanguageNames(Object.fromEntries(
    names.filter((r) => r.locale === locale && r.name)
      .map((r) => [r.bcp47, r.name]),
  ));
  useNamesFor(reader);
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
    // Before anything is redrawn, for the same reason the catalogue is: these are
    // names the new reader sees, and `languageName` reads whichever slice it was
    // last handed.
    useNamesFor(value);
    applyStatic();
    header.select(value);
    header.relabel({ label: t('nav.readerHint'), options: pickerOptions() });
    renderSpeakCollage(languages, value);
    render(value);
  }

  /** @param {string} readerCode */
  function render(readerCode) {
    // Guides into your own language are not a thing; everything else is offered,
    // **alphabetically by the name as the reader actually sees it**. Coverage-first
    // was the earlier order and it read as arbitrary: forty-three cards in an order
    // nobody can predict is forty-three cards you have to scan, where an alphabet is
    // a thing you can skip through. The number is still on every card, so the signal
    // that used to be carried by position is not lost, only moved to where it is
    // legible.
    //
    // `Intl.Collator` in the *reader's* locale rather than `localeCompare` on the
    // English exonym, because both halves of that mattered: the label is
    // `languageName()`'s output, which is already in the reader's language, and
    // sorting Arabic labels by their English names would have produced an order with
    // no visible logic at all. A collator also knows things a codepoint sort does
    // not -- that Swedish files `ö` after `z`, that German does not, and that `zh`
    // means pinyin order rather than stroke order. Unsupported tags (`qya`, `tlh`)
    // fall back to the default collation, which is the same answer `localeCompare`
    // would have given.
    const collator = new Intl.Collator(readerCode, { numeric: true });
    const label = (/** @type {Record<string,string>} */ l) => (
      languageName(l.bcp47, l.exonym_en));
    const have = (/** @type {Record<string,string>} */ l) => Math.min(
      coverage.languages[l.bcp47] ?? 0, coverage.languages[readerCode] ?? 0,
    );
    const shown = languages
      .filter((l) => l.bcp47 !== readerCode)
      // Coverage only breaks a tie between two identical labels, so the order is
      // still total and the grid cannot reshuffle between renders.
      .sort((a, b) => collator.compare(label(a), label(b)) || have(b) - have(a));
    const grid = /** @type {HTMLElement} */ (document.getElementById('gallery'));
    /** @type {GalleryContext} */ const context = {
      languages, solved, coverage, reader: readerCode, onReaderChange: setReader,
    };
    grid.replaceChildren(...shown.map((l) => card(l, context)));
    grid.setAttribute('aria-busy', 'false');

    // The language grid takes the same order as the cards, so the two read as one
    // list seen twice rather than two lists.
    renderWantGrid(shown, coverage, readerCode, (code) => {
      const chosen = reelToTopRow(grid, code);
      for (const button of document.querySelectorAll('#want .want-btn')) {
        button.setAttribute('aria-pressed',
          String(button.getAttribute('data-lang') === code));
      }
      // `reelToTopRow` owns the scroll: it has to happen before the cards are
      // transformed, or it measures the wrong position.
      if (!chosen) return;
    });
  }

  render(reader);
}

main().catch(showFatal);
