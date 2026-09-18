// A checkbox that reads as a pressed button, and the phone's grid of section
// buttons built out of them.
//
// **The control underneath is still an `<input type="checkbox">`.** It is
// transparent and stretched over the `<label>` that wraps it, so the whole look
// comes from CSS off `:checked` and `:focus-visible` -- and the space bar, the tab
// order, the form semantics and the screen reader's "checkbox, checked" come free.
// A `<div role="checkbox">` would have to re-implement every one of them, and
// usually re-implements them badly.
//
// On is saturated; off is faded and desaturated. That is a weaker signal than a
// tick in a box, so it buys density at the cost of a glance: it belongs where a
// reader is scanning a set of short names for the two or three they want, and not
// where every row is a sentence they have to read. `ui/content-tree.js` says which
// side of that line each of the app's toggles came down on.
//
// The grid in the second half is the idiom's own reason for existing. Someone
// making a lock-screen wallpaper wants three sections on it, and until now that
// meant scrolling the content list and ticking sections one at a time. Switching a
// section on here does not take all of it: it re-chooses the whole card's rows by
// marginal value, the measure `core/solve/weights.js` fills whitespace by.

import { substitutesOf, CLUSTER_KEEP } from '../core/solve/weights.js';
import { t } from './i18n.js';

/** @typedef {Awaited<ReturnType<import('../core/pack.js').loadCorpus>>} Corpus */

/**
 * A row of colour swatches, one of which is current.
 *
 * Shared because the app had grown two of these and the format panel was about to
 * need two more: the row popup's palette, and the header/footer band's ink and tab
 * colour, which were the last two `<select>`s in a panel where every other option is
 * a drawn glyph. A colour is the one setting a glyph cannot draw -- the option *is*
 * its appearance -- so it is a swatch rather than a line drawing, and a row of six
 * rather than a menu: they fit, the current one can be marked, and a reader who wants
 * the emergency band red should not have to open anything to get it.
 *
 * The content tree keeps its own disclosure button, which is a genuinely different
 * interaction -- it opens *over* a dense list of sections where a row of six would
 * not fit -- and is left alone rather than forced through here.
 * @param {object} config
 * @param {{key:string, hex:string, label:string}[]} config.colours
 * @param {string} config.label  the group's accessible name
 * @param {(key:string)=>void} config.onPick
 * @param {{key:string, label:string}} [config.none]  an opt-out swatch, drawn as paper
 * @param {string} [config.id]
 */
export function swatchRow({ colours, label, onPick, none, id }) {
  const row = document.createElement('div');
  row.className = 'swatch-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', label);
  if (id) row.id = id;

  /** @type {Map<string, HTMLButtonElement>} */
  const chips = new Map();
  /** @param {string} key @param {string} hex @param {string} name */
  const chip = (key, hex, name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch-pick';
    // Left to the stylesheet where there is no hex: an inline `background` shorthand
    // would clear the `background-image` the opt-out swatch is drawn with.
    if (hex) button.style.background = hex;
    button.title = name;
    button.dataset.colour = key;
    button.setAttribute('aria-label', name);
    button.addEventListener('click', () => onPick(key));
    row.append(button);
    chips.set(key, button);
    return button;
  };

  if (none) {
    // Paper with a rule through it, the way "no fill" is drawn everywhere else here,
    // so it is not mistaken for white as a choice of colour.
    chip(none.key, '', none.label).classList.add('swatch-pick-none');
  }
  for (const { key, hex, label: name } of colours) chip(key, hex, name);

  return {
    row,
    /**
     * @param {string} current  the key in use
     * @param {{key:string, hex:string}[]} [next]  fresh hexes, when the palette moved
     */
    paint(current, next) {
      for (const { key, hex } of next ?? []) {
        const chipEl = chips.get(key);
        if (chipEl) chipEl.style.background = hex;
      }
      // Marked, not merely coloured: six blocks of solid colour say nothing about
      // which one is in use.
      for (const [key, chipEl] of chips) {
        if (key === current) chipEl.setAttribute('aria-current', 'true');
        else chipEl.removeAttribute('aria-current');
      }
    },
  };
}

/**
 * One section as the grid needs it: a name, a mark, and the rows it could put on
 * the card. Built by `ui/content-tree.js`, which already filters the corpus down
 * to what this pair can actually show.
 * @typedef {Object} ChipSection
 * @property {string} sectionId
 * @property {string} title
 * @property {Element|null} icon
 * @property {{conceptId:string, weight:number}[]} items
 */

/**
 * A checkbox drawn as a compact button.
 * @param {Object} config
 * @param {string} config.label
 * @param {boolean} config.checked
 * @param {(on:boolean)=>void} config.onChange
 * @param {string} [config.title]
 * @param {Node} [config.mark]  an icon or a swatch, ahead of the label
 * @returns {{label:HTMLLabelElement, box:HTMLInputElement}}
 */
export function chipToggle({ label, checked, onChange, title, mark }) {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  const text = document.createElement('span');
  text.className = 'chip-label';
  text.textContent = label;
  const wrap = document.createElement('label');
  wrap.className = 'chip-toggle';
  if (title) wrap.title = title;
  wrap.append(box, ...(mark ? [mark] : []), text);
  return { label: wrap, box };
}

/* --- choosing the rows --------------------------------------------------- */

/** A card of three rows is not a card; the control starts here. */
const MIN_ROWS = 4;

/**
 * What one candidate is worth, given what the card already carries.
 *
 * The scorer is `core/solve/weights.js`'s, reused rather than restated:
 * `importance` discounted once by every substitute already on the card, with
 * `substitutesOf` supplying both halves of what a substitute is -- the rated pairs
 * in `data/registry/redundancy.csv` and, for pairs nobody has rated, the flat
 * `cluster_id` prior. What differs is the cost model, and only because there is no
 * cost model to have: this runs before the solve, so there are no measured row
 * heights to divide by. Every row costs one row, which makes value-per-point the
 * plain value and the greedy a cardinality-constrained one.
 *
 * **The one departure: the cluster prior is charged once per cluster rather than
 * once per cluster-mate.** A rated pair is an observation and compounds with the
 * next; the cluster prior is a single guess about a whole flat group, and
 * compounding it `k` times claims `k` observations where there is one. On this
 * corpus that claim is not merely unearned, it is wrong in a way that breaks the
 * card: `numbers-money.misc` is the number line, so with `cero uno dos` on, `tres`
 * is worth `0.884 x 0.55**3` and the greedy walks off and leaves a card that counts
 * "0 1 2 4 6 7 8 9" -- measured, and exactly the failure `core/pack.js` refuses to
 * run a decay for at all.
 *
 * Charged once, it has a property worth having: after the first member of a cluster
 * is taken every other member carries exactly one 0.55, so their order reverts to
 * their `importance` order, and a cut takes a *prefix* of the cluster. The number
 * line comes out 0 through 9, in order, and "hello (polite)" still cannot arrive
 * before "hello".
 * @param {{weight:number, substitutes:Map<string,number>, rated:Record<string,string>}} item
 * @param {Set<string>} onCard
 */
function valueOf(item, onCard) {
  let keep = 1;
  let mates = 0;
  for (const [other, factor] of item.substitutes) {
    // `factor === 1` is a pair the raters looked at and called independent -- the two
    // halves of the drinking-water sign. It is in the map to shadow the cluster it
    // shares, not to be counted against anything.
    if (factor === 1 || !onCard.has(other)) continue;
    if (item.rated[other]) keep *= factor;
    else mates += 1;
  }
  return item.weight * keep * (mates ? CLUSTER_KEEP : 1);
}

/**
 * Which rows to keep across the sections the reader has switched on.
 *
 * Greedy, re-picking the best candidate each round rather than sorting once,
 * because taking an item changes what its substitutes are worth -- the textbook
 * greedy for a monotone submodular objective under a cardinality constraint, and
 * the same argument `proposeBalance` makes at greater length.
 *
 * Nothing is dropped for being redundant on its own: redundancy only decides *which*
 * rows go when the budget binds. A budget that covers every row in the picked
 * sections keeps all of them, whatever the table says about them.
 * @param {Object} config
 * @param {Corpus} config.corpus
 * @param {ChipSection[]} config.sections
 * @param {Set<string>} config.on        the sections the reader picked
 * @param {number} config.budget         how many rows the card should carry
 * @returns {Record<string,boolean>}     one entry per row of a picked section
 */
export function chooseItems({ corpus, sections, on, budget }) {
  /** @type {{conceptId:string, weight:number, substitutes:Map<string,number>,
   *          rated:Record<string,string>}[]} */
  const pool = [];
  for (const section of sections) {
    if (!on.has(section.sectionId)) continue;
    for (const item of section.items) {
      const concept = corpus.concepts[item.conceptId];
      pool.push({
        conceptId: item.conceptId,
        weight: item.weight,
        // A term the reader typed is not in the corpus and substitutes for nothing.
        substitutes: concept ? substitutesOf(corpus, concept) : new Map(),
        rated: corpus.redundancy[item.conceptId] ?? {},
      });
    }
  }

  /** @type {Record<string,boolean>} */ const items = {};
  const left = new Set(pool);
  /** @type {Set<string>} */ const onCard = new Set();
  while (onCard.size < budget && left.size) {
    /** @type {typeof pool[number]|null} */ let best = null;
    let bestValue = -Infinity;
    for (const item of left) {
      const value = valueOf(item, onCard);
      if (value > bestValue) { bestValue = value; best = item; }
    }
    if (!best) break;
    left.delete(best);
    onCard.add(best.conceptId);
    items[best.conceptId] = true;
  }
  for (const item of left) items[item.conceptId] = false;
  return items;
}

/* --- the grid ------------------------------------------------------------ */

/**
 * The phone's section grid, at the head of the content panel.
 *
 * A grid rather than a fourth surface over the card: the panel it sits in already
 * folds into a bar, already scrolls inside itself, and already holds "All on" and
 * "All off" -- which is how a reader gets to three sections in two taps rather than
 * fifty-six.
 *
 * The budget starts at the number of rows the card is already carrying, so the
 * first chip a reader taps gives them a *different* card rather than a smaller one;
 * after that the control is theirs. The solver still has the last word on what
 * fits -- this decides which rows are offered to it, not how many survive.
 *
 * It is a bulk control, like "All on" and the questionnaire and unlike a tick in
 * the list below: every press rewrites the row choices across all the picked
 * sections rather than layering on the ones a reader made by hand. The list is
 * where a row is decided one at a time, and it shows what this chose.
 * @param {Object} config
 * @param {HTMLElement} config.root
 * @param {Corpus} config.corpus
 * @param {ChipSection[]} config.sections
 * @param {(patch:{sections?:Record<string,boolean>,
 *   items?:Record<string,boolean>})=>void} config.onToggle
 * @returns {(spec:import('../core/types.js').SheetSpec,
 *   blocks:import('../core/types.js').Block[])=>void}
 */
export function createSectionPicker({ root, corpus, sections, onToggle }) {
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  /** Rows the card should carry. Zero until the first sync reads it off the card. */
  let budget = 0;

  const range = document.createElement('input');
  range.type = 'range';
  const box = document.createElement('input');
  box.type = 'number';
  box.className = 'numeric-box';
  // The format panel's own numeric idiom: the slider to feel the range, the box to
  // type or step an exact value. Same markup, so it takes the same styling.
  for (const input of [range, box]) {
    input.min = String(MIN_ROWS);
    input.max = String(total);
    input.setAttribute('aria-label', t('picker.budget'));
    input.title = t('picker.budgetTitle');
  }

  const grid = document.createElement('div');
  grid.className = 'chip-grid section-chips';
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', t('picker.sections'));

  /** @type {{sectionId:string, box:HTMLInputElement, count:HTMLElement,
   *          conceptIds:string[]}[]} */
  const chips = [];

  /** Re-choose the card: which sections are on, and which of their rows. */
  const apply = () => {
    /** @type {Record<string,boolean>} */ const picked = {};
    /** @type {Set<string>} */ const on = new Set();
    for (const chip of chips) {
      picked[chip.sectionId] = chip.box.checked;
      if (chip.box.checked) on.add(chip.sectionId);
    }
    onToggle({ sections: picked, items: chooseItems({ corpus, sections, on, budget }) });
  };

  for (const section of sections) {
    const chip = chipToggle({
      label: section.title,
      checked: true,
      mark: section.icon ?? undefined,
      onChange: apply,
    });
    // How much of the section is actually on the card, which is the thing the reader
    // cannot otherwise see the prioritiser doing. Same figure the tree's own section
    // rows carry, from the same source.
    const count = document.createElement('span');
    count.className = 'chip-count';
    chip.label.append(count);
    grid.append(chip.label);
    chips.push({
      sectionId: section.sectionId,
      box: chip.box,
      count,
      conceptIds: section.items.map((item) => item.conceptId),
    });
  }

  /** @param {number} next */
  const setBudget = (next) => {
    budget = Math.min(total, Math.max(MIN_ROWS, Math.round(next)));
    range.value = String(budget);
    box.value = String(budget);
  };
  // The box follows the slider as it moves, but the card is re-chosen on release:
  // choosing is a few milliseconds and a solve behind it, and a slider that stutters
  // under the thumb is worse than one that answers when you let go.
  range.addEventListener('input', () => setBudget(Number(range.value)));
  range.addEventListener('change', apply);
  box.addEventListener('change', () => { setBudget(Number(box.value)); apply(); });

  const caption = document.createElement('span');
  caption.className = 'small muted';
  caption.textContent = t('picker.budget');
  const slider = document.createElement('div');
  slider.className = 'numeric-custom';
  slider.append(range, box);
  const field = document.createElement('div');
  field.className = 'picker-budget';
  field.append(caption, slider);

  root.replaceChildren(field, grid);

  return (spec, blocks) => {
    /** @type {Set<string>} */ const shown = new Set();
    for (const block of blocks) for (const row of block.rows ?? []) shown.add(row.conceptId);
    if (!budget) setBudget(shown.size || total);
    for (const chip of chips) {
      chip.box.checked = spec.selection.sections[chip.sectionId] !== false;
      const on = chip.conceptIds.filter((id) => shown.has(id)).length;
      chip.count.textContent = `${on}/${chip.conceptIds.length}`;
    }
  };
}
