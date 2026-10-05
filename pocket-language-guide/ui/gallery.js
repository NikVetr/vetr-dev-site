// Gallery: pick a language. Reads only the language registry and the pre-rendered
// pack index, so it stays fast and works offline without loading the solver, the
// corpus or a CJK font.
//
// The one exception is the lightbox in `ui/lightbox.js`, which typesets the whole
// sheet -- and only when a reader opens one.
//
// That was the intent and for a while it was not the fact. `ui/lightbox.js` loads the
// engine lazily, but it reaches four helpers through `ui/app.js`, and `ui/app.js`
// named `core/sheet.js` at the top of the file -- so the whole solver and 969KB of
// fontkit arrived on this page anyway, before the reader had touched anything.
// `ui/app.js` imports them on demand now, and this page is nine modules and 89KB.

import { resumeSection, wireSiteMenu } from './site-menu.js';
import { notePlace, onBack, resumeLaunch } from './platform/shell.js';
import {
  download, isSpoken, loadText, loadLanguages, readerLanguage,
  registerOffline, setReaderLanguage, showFatal,
} from './app.js';
import { openSpeakerSettings, personalSection, readProfile } from './speaker-settings.js';
import { readAxes } from '../core/speaker.js';
import { parseTable } from '../core/csv.js';
import { loadCountries } from '../core/pack.js';
import { regionRow, setFlagColours } from './flags.js';
import { languagePicker } from './language-picker.js';
import { openLightbox } from './lightbox.js';
import { storeLinks } from './app-stores.js';
import {
  applyStatic, languageName, loadUiLanguage, regionList, setLanguageNames, t,
} from './i18n.js';

/**
 * Publish the site header's height, so what sticks under it knows where under it is.
 *
 * The header is `position: sticky; top: 0`, and the picker's label sticks below it.
 * That offset cannot be written into the stylesheet: the header wraps to two lines
 * on a narrow phone, to one on a wide one, and grows again when the reader turns up
 * their system text size -- all of which a `ResizeObserver` sees and none of which a
 * media query does.
 */
function trackHeaderHeight() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const set = () => document.documentElement.style.setProperty(
    '--header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
  new ResizeObserver(set).observe(header);
  set();
}

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
 * @property {Set<string>} boardPairs  `target__source` pairs a board covers
 * @property {(source:string)=>Promise<void>} onReaderChange
 */

/** @param {Record<string,string>} lang @param {GalleryContext} gallery */
function card(lang, gallery) {
  const { reader, coverage, boardPairs } = gallery;
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
    // **No Export here.** Exporting is what you do once you have decided what is on
    // the card, and deciding is the customise page -- which carries Export PDF and
    // PNG in its own header. Two buttons on a card is a choice a reader can make at a
    // glance; three was one of them asking them to commit to a default they had not
    // seen yet.
    actions.push(el('a', {
      class: 'btn primary', href: `customize.html${query}`, text: t('gallery.customise'),
    }));
    // **Only where a board exists for this pair.** A conversation board is authored
    // content, not a view the corpus can generate, and it needs text on both sides --
    // so offering it on every card would advertise a page that opens onto a grid of
    // dead buttons for any reader it was not written for. A pair with no board simply
    // has the two buttons it had.
    if (boardPairs.has(key)) {
      actions.push(el('a', {
        class: 'btn', href: `conversation.html${query}`, text: t('gallery.converse'),
      }));
    }
    // **Morse is a language whose conversation is light.** There is nothing to show
    // a stranger a sentence in, so its second button is not the board but the
    // signaller: type, and the phone flashes it. The one language named here rather
    // than flagged in the registry, because it is the one that works this way.
    if (lang.bcp47 === 'morse') {
      actions.push(el('a', {
        class: 'btn', href: `signal.html${query}`, text: t('gallery.signal'),
      }));
    }
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
 * gets the reorder with no travel, since the ring is what says "this one", and so does
 * a reader coming back to the page, who is not watching it happen.
 * @param {HTMLElement} grid @param {string} code @param {boolean} [travel]
 * @returns {HTMLElement|null} the chosen card
 */
function reelToTopRow(grid, code, travel = true) {
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
    if (travel && chosen.getBoundingClientRect().top < 0) {
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

    if (travel && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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
  markGridEnd();
}

/** The grid fades where more of it is below, and not once its last row is in view. */
function markGridEnd() {
  const grid = document.getElementById('want');
  grid?.classList.toggle('want-grid-end', grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 1);
}

/**
 * Open or shut the language picker.
 *
 * **Not remembered between visits.** It folds itself the moment a language has been
 * picked, which is the common case, so persisting that state meant almost every
 * return visit opened on a page whose first control was collapsed -- and the picker
 * is the thing the page is for. A reader who wants it out of the way is one tap from
 * it; a reader who wanted to change language and found it folded has to work out
 * that the grey line is a button.
 *
 * Nothing else about the picker is a setting either: which card was reeled to the top
 * row is a reordering of this visit. Coming back to the page within the session puts
 * the visit back as it was (`returnToPlace`), which is "where I was", not a
 * preference. The one thing that persists beyond it is the reader's *own* language,
 * which is the site header's business.
 * @param {boolean} open @param {string} [chosen] the language name, when shut
 */
function setWantOpen(open, chosen) {
  const toggle = document.getElementById('want-toggle');
  const grid = document.getElementById('want');
  const said = document.getElementById('want-chosen');
  if (!toggle || !grid) return;
  toggle.setAttribute('aria-expanded', String(open));
  grid.hidden = !open;
  markGridEnd();
  if (!open) want?.classList.remove('want-dropped');
  // The chosen language reads as the answer to the label's question, so it is shown
  // only while the question is folded up -- with the grid open it is already marked
  // on the button itself.
  if (said) said.textContent = open ? '' : (chosen ?? said.textContent ?? '');
}

/**
 * On a phone, the language grid folds away as the reader scrolls past it and its
 * toggle floats under the header as a bar -- fifty buttons are a screen and a half,
 * and the thing the page is for is below them. Scrolling back up puts the bar back in
 * its own place, and a grid that a choice folded opens again once the page is back at
 * its top; a tap on the floating bar drops the grid down under it, over the cards;
 * scrolling on folds it again. Nothing of this on a desktop, where the grid sits
 * beside the sentence and there is room for all of it.
 * @param {HTMLElement} toggle
 */
function foldOnScroll(toggle) {
  const narrow = matchMedia('(max-width: 1080px)');
  if (!want) return;
  let foldedByScroll = false;
  const check = () => {
    if (!narrow.matches) {
      want.classList.remove('want-floating');
      want.style.minHeight = '';
      return;
    }
    // Past the whole grid, not past its toggle: folding the grid the moment its
    // top went under the header folded it on the first nudge of a scroll. While any
    // of it is in view it stays as the reader left it; once it has all gone under
    // the header the bar takes over.
    const past = scrollY > want.offsetTop + want.offsetHeight - headerHeight();
    // The bar floats the moment its own place goes under the header, so it is never
    // off the screen: it was scrolling away with the grid and reappearing only once
    // the whole grid had gone, which read as a bar that blinks.
    const floating = scrollY > want.offsetTop - headerHeight();
    // Its place is held at its own height, margin and all, measured as it leaves the
    // flow: a fixed 2rem was 2px off, and a label that wraps is taller.
    if (floating && !want.classList.contains('want-floating')) {
      const room = toggle.getBoundingClientRect().height
        + Number.parseFloat(getComputedStyle(toggle).marginBottom);
      want.style.setProperty('--bar-room', `${room}px`);
    }
    want.classList.toggle('want-floating', floating);
    // A grid dropped from the bar hangs from its lower edge, not a guessed distance
    // below it, which left a strip of the cards showing between the two.
    if (floating) want.style.setProperty('--bar-h', `${toggle.getBoundingClientRect().height}px`);
    const open = toggle.getAttribute('aria-expanded') === 'true';
    const dropped = want.classList.contains('want-dropped');
    // A grid dropped down from the floating bar belongs to the bar: it shuts when the
    // bar goes back to its place, and when the page scrolls under it.
    if (dropped && (!floating || past)) { setWantOpen(false); return; }
    // What the scroll folded, the scroll back unfolds; what the reader folded, or a
    // choice folded, stays folded until they ask. **A grid the scroll folded keeps its
    // room** until the scroll unfolds it. Giving the room up moved everything under it
    // up by the grid's height mid-scroll, which a phone without scroll anchoring showed
    // as the page jumping; scrolling back by the difference would stop a flick dead.
    // The room is never seen empty: the grid folds only once all of it is under the
    // header, and unfolds -- in its place, not dropped -- as it comes back out.
    if (past && open) {
      want.style.minHeight = `${want.offsetHeight}px`;
      setWantOpen(false);
      foldedByScroll = true;
    } else if (!past && foldedByScroll) {
      want.classList.remove('want-dropped');
      setWantOpen(true);
      want.style.minHeight = '';
      foldedByScroll = false;
      foldedByChoice = false;
    } else if (foldedByChoice && scrollY < 1) {
      // **A choice's fold comes undone at the top.** It folded the grid so the chosen
      // card was the next thing on the screen; all the way back up, the reader has come
      // back to the question, and a bar that stayed shut there read as the grid having
      // gone. It grows open rather than appearing, because the growing is what says
      // where it went -- briefly, and not at all for a reader who asked for less motion.
      foldedByChoice = false;
      setWantOpen(true);
      const grid = document.getElementById('want');
      if (grid && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        grid.animate([{ maxBlockSize: '0px', opacity: 0 }, { maxBlockSize: `${grid.offsetHeight}px`, opacity: 1 }],
          { duration: UNFOLD_MS, easing: 'ease-out' });
      }
    }
  };
  addEventListener('scroll', check, { passive: true });
  narrow.addEventListener('change', check);
}
const want = /** @type {HTMLElement|null} */ (document.querySelector('.want'));
/** Whether the grid is shut because a language was chosen from it, rather than by the reader. */
let foldedByChoice = false;
/** Long enough to see the grid come back, short enough not to be a wait. */
const UNFOLD_MS = 180;
document.getElementById('want')?.addEventListener('scroll', markGridEnd, { passive: true });
addEventListener('resize', markGridEnd);
const headerHeight = () => Number.parseFloat(
  getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;

/** How many other languages to show beside the reader's own. */
const COLLAGE_DEPTH = 5;

/**
 * Two guesses at a language the reader has not asked for.
 *
 * **The collage used to say "I speak" in whichever languages the registry happened to
 * list first, which is decoration that means nothing.** These two mean something, and
 * they are the only two a browser will give away.
 *
 * The **system language** is what the device is set to, and it is the first thing to
 * offer someone whose browser is in a language the picker also has.
 *
 * The **place** is the more useful one, and the one that actually moves: a traveller's
 * laptop is still in their own language, and what they need is the language of the
 * street they are standing in. No browser will say which country that is, and every
 * browser will say which timezone -- which is what `data/registry/timezones.csv` is
 * for. From the region, `languages.csv` says what is spoken there, and it names
 * several for the places that have several, so this returns the list rather than
 * pretending there is one answer.
 *
 * Both are matched against the languages this app can show, on subtag boundaries, so
 * a `de-AT` browser is offered German and a Hausa one is not offered Hawaiian.
 * @param {Record<string,string>[]} languages the registry rows
 * @returns {Promise<{system: string|null, place: string[]}>}
 */
async function guessedLanguages(languages) {
  const usable = new Set(languages.map((l) => l.bcp47));
  /** @param {string} tag @returns {string|null} */
  const match = (tag) => {
    if (usable.has(tag)) return tag;
    const base = tag.split('-')[0];
    return [...usable].find((code) => code === base || code.split('-')[0] === base) ?? null;
  };

  const system = (navigator.languages ?? []).map(match).find(Boolean) ?? null;

  /** @type {string[]} */ let place = [];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone) {
    // Generated, two columns, no quoting, no comments -- so a line scan rather than
    // the RFC 4180 parser, which has nothing to do here.
    const table = await loadText('data/registry/timezones.csv').catch(() => '');
    const row = table.split('\n').find((line) => line.startsWith(`${zone},`));
    const region = row?.split(',')[1]?.trim();
    if (region) {
      place = languages
        .filter((l) => (l.regions ?? '').split(';').some((r) => r.trim() === region))
        .map((l) => l.bcp47);
    }
  }
  return { system, place };
}

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
 * **The order is nearest-meaning-first, not registry order.** Behind the reader's own
 * comes the language their device is set to, then the languages of the place they
 * appear to be in, and only then whatever else fills the row -- so someone who opens
 * this in Tokyo sees `話せる言語` behind `I speak` rather than whichever language
 * sorts first. On a phone only the nearest two fit, which is exactly why they are the
 * two worth having there.
 * @param {Record<string,string>[]} languages
 * @param {string} reader
 * @param {{system: string|null, place: string[]}} guessed
 */
function renderSpeakCollage(languages, reader, guessed) {
  const label = document.getElementById('reader-label');
  if (!label) return;
  const usable = languages.filter(isSpoken);
  const byCode = new Map(usable.map((l) => [l.bcp47, l]));
  const mine = byCode.get(reader);
  /** @type {Record<string,string>[]} */ const others = [];
  /** @param {string|null|undefined} code */
  const add = (code) => {
    const lang = code ? byCode.get(code) : undefined;
    if (lang && lang !== mine && !others.includes(lang) && others.length < COLLAGE_DEPTH) {
      others.push(lang);
    }
  };
  add(guessed.system);
  for (const code of guessed.place) add(code);
  // Padded out with the rest for a wide screen, where there is room for five and the
  // point is the repetition. A phone shows the nearest two, which are the guesses.
  for (const lang of usable) add(lang.bcp47);
  const fade = (NEAREST - FAINTEST) / Math.max(1, COLLAGE_DEPTH - 1);

  /** @param {Record<string,string>} lang @param {number} depth */
  const chip = (lang, depth) => {
    const span = document.createElement('span');
    span.className = depth === 0 ? 'speak lead' : 'speak';
    span.textContent = lang.speak_label;
    span.lang = lang.bcp47;
    // Which way the label runs. The same fact `scripts.csv` holds, named here rather
    // than fetched, because the gallery does not otherwise read that file and this is
    // one attribute on a decorative chip. It was hardcoded to Arabic until the guesses
    // above made Hebrew, Persian and Urdu reachable.
    if (['Arab', 'Hebr', 'Thaa'].includes(lang.script)) span.dir = 'rtl';
    // Each step back is fainter and slightly smaller, so the eye lands on the
    // reader's own first and reads the rest as context rather than as a list -- and
    // in a hue of its own, so they read as other languages rather than grey noise.
    if (depth > 0) {
      span.classList.add(`hue-${depth}`);
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
  fitHeader();
}

/**
 * Keep the site header to one line: drop the farthest labels of the collage until the
 * row fits, then ease the lead's size down if even it alone does not. The header does
 * not wrap -- a second line pushed the settings button under the picker -- and the
 * labels repeat one idea, so fewer of them loses nothing.
 */
function fitHeader() {
  const label = document.getElementById('reader-label');
  if (!label) return;
  // The label's own content against its own box, on both sides: it is shrunk by the
  // row and overflows towards the brand, where no scroll width counts it.
  const over = () => {
    const box = label.getBoundingClientRect();
    const shown = [...label.children].filter((c) => !(/** @type {HTMLElement} */ (c).hidden));
    if (!shown.length) return false;
    const first = shown[0].getBoundingClientRect();
    const last = shown[shown.length - 1].getBoundingClientRect();
    return Math.min(first.left, last.left) < box.left - 1 || Math.max(first.right, last.right) > box.right + 1;
  };
  const chips = /** @type {HTMLElement[]} */ ([...label.querySelectorAll('.speak:not(.lead)')]);
  const brand = document.querySelector('.site-header .brand');
  for (const chip of chips) chip.hidden = false;
  label.style.fontSize = '';
  label.classList.remove('wraps');
  brand?.classList.remove('mark-only');
  for (const chip of chips) {
    if (!over()) return;
    chip.hidden = true;
  }
  for (const size of [0.9, 0.8, 0.75]) {
    if (!over()) return;
    label.style.fontSize = `${size}em`;
  }
  // A lead that is a whole sentence -- Ukrainian's, Malayalam's -- can still not fit a
  // phone beside the brand. The brand's word goes before the lead is allowed a second
  // line; never a word of the lead itself.
  if (over()) brand?.classList.add('mark-only');
  if (over()) label.classList.add('wraps');
}

/**
 * The settings the bars open here: everything personal that holds in every language
 * and on both the sheets and the boards -- how the reader speaks, their own details,
 * what a board's message screen shows, and their saved copy. A board's or a sheet's
 * own settings add what only its pair needs. The sections' modules arrive when the
 * bars are pressed, as the lightbox's engine does, so the grid stays the small page
 * the note above describes.
 * @param {string} reader @param {(code: string) => string} nameOf
 */
async function openSettings(reader, nameOf) {
  const read = async (/** @type {string} */ rel) => parseTable(await loadText(rel), rel);
  const [[{ personalWiring }, { aboutSection, askCountry, dietOptions }, { displaySection, readDisplay }, { travelSection }],
    [axes, listed]] = await Promise.all([
    Promise.all([import('./personal-data.js'), import('./about.js'), import('./board-display.js'),
      import('./travel-check.js')]),
    Promise.all([read('data/registry/speaker-axes.csv').then(readAxes),
      loadText('data/countries/index.json').then((text) => JSON.parse(text))]),
  ]);
  const diet = await dietOptions(loadText, reader);
  const countries = listed.includes(reader) ? await loadCountries(loadText, reader) : undefined;
  // Nothing on this page shows what these change; the boards and sheets read them when opened.
  const nothing = () => {};
  openSpeakerSettings({
    axes,
    languages: Object.keys(axes),
    profile: readProfile(),
    onChange: nothing,
    extra: [
      aboutSection(nothing, diet, undefined, countries && (() => askCountry(countries, reader, nothing))),
      displaySection(readDisplay(), nothing),
      ...resumeSection(),
      travelSection({ nameOf, loadText }),
      personalSection(personalWiring({ save: download, onChanged: nothing })),
    ],
  });
}

async function main() {
  registerOffline();
  const { languages, coverage, names, regions } = await loadLanguages();
  if (resumeLaunch()) return;
  notePlace(null);
  // The top: an unhandled Back leaves the app, where Capacitor alone would do nothing.
  onBack(() => false);
  setFlagColours(regions);
  const reader = readerLanguage(languages, coverage);
  /**
   * The registry's rows for one locale, as `languageName` wants them.
   *
   * One locale's slice rather than the whole table, because that is what the
   * function needs and the table is the O(N^2) one -- fifty rows out of two
   * thousand two hundred. The rows themselves rather than a `bcp47 -> name` map,
   * because the table has two name columns and picking between them is
   * `setLanguageNames`' job: this is a gallery, it has no view on Czech
   * declension.
   * @param {string} locale
   */
  const useNamesFor = (locale) => setLanguageNames(
    names.filter((r) => r.locale === locale),
  );
  useNamesFor(reader);
  // The interface language is the reader's own, so this has to happen before
  // anything is drawn -- including the static markup.
  await loadUiLanguage(reader, loadText);
  applyStatic();
  /** @type {HTMLElement} */ (document.querySelector('.site-footer')).prepend(...storeLinks());
  /** @param {string} code */
  const nameOf = (code) => languageName(code, languages.find((l) => l.bcp47 === code)?.exonym_en ?? code);
  wireSiteMenu(() => { openSettings(readerLanguage(languages, coverage), nameOf).catch(showFatal); });
  trackHeaderHeight();
  const headerRow = document.querySelector('.site-header .container');
  if (headerRow) new ResizeObserver(fitHeader).observe(headerRow);

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

  // Which *pairs* a conversation board covers. Pairs and not targets, because
  // resolving a phrase needs a row on both sides: a board written in Mandarin and
  // English serves an English reader, and would hand a French one a grid of dead
  // buttons. Authored content, so it is a list rather than something the corpus
  // implies -- and absent, every card simply keeps the two buttons it had.
  /** @type {Set<string>} */ const boardPairs = new Set();
  try {
    const boards = JSON.parse(await loadText('data/boards/index.json'));
    // The same two-list membership the board page uses, flattened into the pairs
    // this gallery actually draws -- it already knows which pairs have content, so
    // the product is small here even though the registry is 2,756 ordered pairs.
    for (const board of boards.boards) {
      for (const listener of board.listeners) {
        for (const owner of board.owners) {
          if (listener !== owner) boardPairs.add(`${listener}__${owner}`);
        }
      }
    }
  } catch {
    // No boards shipped yet.
  }

  const mount = /** @type {HTMLElement} */ (document.getElementById('reader'));
  // Collapsed it shows only the endonym -- "Deutsch", not "Deutsch (German)" --
  // because that is the word you scan for. The open list is the board's language
  // menu: the name in the reader's own language at the start of each row, the
  // language's own at its end in the second colour. The `label` is each language's
  // name *in the reader's language*, so the whole list has to be rebuilt when the
  // reader changes -- not just its selection.
  const pickerOptions = () => languages
    .filter((l) => l.status !== 'planned' && isSpoken(l))
    .map((l) => ({
      value: l.bcp47,
      label: languageName(l.bcp47, l.exonym_en),
      own: l.endonym,
    }));
  const header = languagePicker({
    mount,
    label: t('nav.readerHint'),
    value: reader,
    options: pickerOptions(),
    onChange: setReader,
  });
  // Asked once. Neither answer changes while the page is open -- the device's
  // language and the timezone are settings, not state -- so the collage is redrawn
  // from the same pair of guesses whenever the reader switches language.
  const guessed = await guessedLanguages(languages);
  renderSpeakCollage(languages, reader, guessed);

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
    renderSpeakCollage(languages, value, guessed);
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
      languages, solved, coverage, boardPairs, reader: readerCode, onReaderChange: setReader,
    };
    grid.replaceChildren(...shown.map((l) => card(l, context)));
    grid.setAttribute('aria-busy', 'false');

    // The language grid takes the same order as the cards, so the two read as one
    // list seen twice rather than two lists.
    renderWantGrid(shown, coverage, readerCode, (code) => choose(code));

    const toggle = document.getElementById('want-toggle');
    if (toggle && !toggle.dataset.wired) {
      toggle.dataset.wired = '1';
      toggle.addEventListener('click', () => {
        // **What the reader was looking at stays where it was.** Shutting the grid
        // left the scroll position alone while everything under it moved up by the
        // grid's height, which read as the page throwing itself down; and opening it
        // from the floating bar scrolled back to where the grid lives, which lost the
        // reader's place among the cards. So the first card in view -- or the toggle,
        // when no card is -- is held at its place on the screen, and from the floating
        // bar the grid drops down under it instead (the stylesheet's `want-floating`).
        const cards = [...document.querySelectorAll('#gallery .card')];
        const anchor = cards.find((c) => {
          const box = c.getBoundingClientRect();
          return box.bottom > headerHeight() && box.top < innerHeight;
        }) ?? toggle;
        const before = anchor.getBoundingClientRect().top;
        const opening = toggle.getAttribute('aria-expanded') === 'false';
        // The reader's own tap: from here the grid stays as they leave it.
        foldedByChoice = false;
        want?.classList.toggle('want-dropped', opening && want.classList.contains('want-floating'));
        setWantOpen(opening);
        const moved = anchor.getBoundingClientRect().top - before;
        if (moved) scrollBy({ top: moved, behavior: 'instant' });
      });
      foldOnScroll(toggle);
    }
  }

  /**
   * Want a language: press its button, bring its card up, and fold the grid away.
   * Coming back to the page chooses it again without the travel or the scroll, since
   * the place restored after it is where the reader had got to.
   * @param {string} code @param {boolean} [returning]
   */
  function choose(code, returning = false) {
    const grid = /** @type {HTMLElement} */ (document.getElementById('gallery'));
    // On a phone the cards are one column and the grid above them folds: reeling
    // a card to the top row moved it out from under the reader's scroll position,
    // and reopening the grid lost the place again. So the card stays where it is
    // and the page goes to it, after the fold so the offsets are the final ones.
    const narrow = matchMedia('(max-width: 1080px)').matches;
    const chosen = narrow
      ? /** @type {HTMLElement|null} */ (grid.querySelector(`.card[data-lang="${code}"]`))
      : reelToTopRow(grid, code, !returning);
    for (const button of document.querySelectorAll('#want .want-btn')) {
      button.setAttribute('aria-pressed',
        String(button.getAttribute('data-lang') === code));
    }
    // **Folded the moment it has been used.** The card is now in the top row and
    // the three things to do with it are on it; leaving fifty buttons above them
    // means scrolling past the question to reach its answer.
    const row = languages.find((l) => l.bcp47 === code);
    setWantOpen(false, languageName(code, row?.exonym_en ?? code));
    foldedByChoice = true;
    if (chosen && narrow && !returning) chosen.scrollIntoView({ block: 'start' });
  }

  /**
   * Put the page back as the reader left it this session: the language they chose,
   * folded or not, and how far down the cards they were.
   *
   * **Measured from the cards, not from the top of the page**, because what is above
   * them -- the grid, open, folded, or holding its room -- need not be the height it
   * was, and the cards are what the reader was looking at.
   */
  function returnToPlace() {
    const held = sessionStorage.getItem(PLACE_KEY);
    if (!held) return;
    const place = JSON.parse(held);
    // A language that has since become the reader's own is no longer offered.
    if (place.want && document.querySelector(`#want .want-btn[data-lang="${place.want}"]`)) {
      choose(place.want, true);
      if (!place.folded) {
        setWantOpen(true);
        foldedByChoice = false;
      }
    }
    const cards = /** @type {HTMLElement} */ (document.getElementById('gallery'));
    scrollTo({ top: cards.getBoundingClientRect().top + scrollY + place.into, behavior: 'instant' });
  }

  render(reader);
  returnToPlace();
  addEventListener('pagehide', () => {
    const pressed = document.querySelector('#want .want-btn[aria-pressed="true"]');
    const cards = /** @type {HTMLElement} */ (document.getElementById('gallery'));
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({
      want: pressed?.getAttribute('data-lang') ?? null,
      folded: foldedByChoice,
      into: -cards.getBoundingClientRect().top,
    }));
  });
}

/**
 * Where the reader was on this page, for coming back to it: Converse's and the
 * studio's way back are links to `./`, a fresh load, and a browser's Back may load the
 * page afresh too. Session storage, because this is "where I was" and not a
 * preference: a new visit starts at the top.
 */
const PLACE_KEY = 'plg.galleryPlace';
// The page puts itself back once its cards exist; the browser's own restoration aimed
// at a page still saying "Loading languages…" and would fight it.
history.scrollRestoration = 'manual';

main().catch(showFatal);
