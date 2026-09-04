// The studio's content panel: a section/item tree wired both ways to the canvas.
//
// With a few hundred items across four faces, finding the row you just spotted on
// the page is the hard part, so clicking an item on a face scrolls to and flashes
// it here, and hovering here highlights it there.
//
// The tree is built once and then updated in place. Re-rendering it on every solve
// would throw away scroll position and which sections are expanded, and -- because
// a solve is debounced -- would swap the checkbox out from under a reader who is
// working through a list of them.

import { number, t } from './i18n.js';
import { nextIndex } from './keys.js';

/** A pencil, for the button that opens a row's editor. Inline rather than an entry in
 * `data/icons.json`, because that file is the set the *sheet* can draw and this is
 * interface chrome. */
function pencilGlyph() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pencil');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M11.2 1.8a1.7 1.7 0 0 1 2.4 2.4L5.3 12.5l-3 .8.8-3z');
  svg.append(path);
  return svg;
}

/** The sheet's own field order, so a tree row reads the way the printed row does. */
const TREE_FIELDS = /** @type {import('../core/types.js').FieldId[]} */ ([
  'script', 'script_alt', 'roman', 'ipa', 'gloss', 'literal', 'respell',
]);
/** Which of them are the target language's, and so take its font and lang tag. */
const TARGET_FIELDS = new Set(['script', 'script_alt', 'roman', 'ipa', 'literal']);
import { appliesTo } from '../core/pack.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The section's own icon, in its own colour -- the same mark that appears on the
 * printed page, so the list and the sheet read as the same thing.
 * @param {{viewBox:number, strokeWidth:number, paths:Record<string,string[]>}} icons
 * @param {string} name @param {string} color
 */
function sectionIcon(icons, name, color) {
  const paths = icons.paths[name];
  if (!paths) return null;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${icons.viewBox} ${icons.viewBox}`);
  svg.setAttribute('class', 'tree-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color);
  svg.setAttribute('stroke-width', String(icons.strokeWidth));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
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
 * @typedef {Object} TreeInput
 * @property {HTMLElement} root
 * @property {Awaited<ReturnType<import('../core/sheet.js').createSheetContext>>['corpus']} corpus
 * @property {Record<string,Record<string,string>>} targetRows
 * @property {Record<string,Record<string,string>>} sourceRows
 * @property {import('../core/types.js').SheetSpec} spec
 * @property {any} theme
 * @property {(patch:{sections?:Record<string,boolean>, items?:Record<string,boolean>, sectionColors?:Record<string,string>})=>void} onToggle
 * @property {(conceptId:string)=>void} onPick  bring this row into view on the card
 * @property {(conceptId:string, values:Record<string,string>)=>void} [onEdit]  what
 *   the reader typed into a row, to go in the same `overrides` layer the CSV import
 *   writes
 * @property {(conceptId:string|null)=>void} onHover
 * @property {any} icons                     data/icons.json
 * @property {Record<string,string>} [sectionTitles] headings in the source
 *   language, so the tree and the sheet call a section the same thing
 * @property {import('../core/pack.js').SheetEdits} edits
 */

/**
 * Build the tree. Returns an updater to call after each solve.
 * @param {TreeInput} input
 * @returns {(spec:import('../core/types.js').SheetSpec,
 *   blocks:import('../core/types.js').Block[],
 *   marked?:Record<string,boolean>|null)=>void}
 */
export function createTree(input) {
  const { root, corpus, theme, spec } = input;

  /** @type {{sectionId:string, box:HTMLInputElement, count:HTMLElement,
   *          swatch:HTMLElement, menu:HTMLElement, icon:Element|null, role:string,
   *          items:{conceptId:string, box:HTMLInputElement,
   *                  cells:Record<string,HTMLElement>, row:HTMLElement}[]}[]} */
  const sections = [];
  /** @type {Node[]} */ const nodes = [];
  /** The one colour menu that is open, if any. One at a time, and one listener for
   * the whole tree rather than fifty. */
  /** @type {(() => void)|null} */ let open = null;
  root.addEventListener('pointerdown', (event) => {
    if (open && !(/** @type {Element} */ (event.target).closest('.tree-color-wrap'))) open();
  });

  for (const section of corpus.sections) {
    const title = input.sectionTitles?.[section.section_id] || section.title_en;
    const own = (corpus.conceptsByGroup[section.group] ?? [])
      .filter((c) => c.section_id === section.section_id)
      // The same scope the sheet applies. 32 concepts mean something for one
      // target only -- Chinese measure words, the yuan, Japanese counters, the
      // Thai politeness note -- and the tree was listing all of them for every
      // target, ticked, and counting them in the section total. So a Spanish
      // sheet offered a paragraph about Thai politeness particles, said it was
      // included, and then correctly did not print it.
      .filter((c) => appliesTo(c, input.spec.target))
      .filter((c) => input.targetRows[c.concept_id] && input.sourceRows[c.concept_id])
      // `importance` comes with it, because the tree is where the priority ladder's
      // effect is legible: the ladder is a floor on this number, so a reader who
      // wonders why a row vanished at "Core" can see which side of the line it was.
      .map((c) => ({ conceptId: c.concept_id, custom: false, weight: Number(c.importance) }));
    // Terms the reader added live in the same list as the corpus ones, marked so
    // they can be told apart and removed.
    const custom = input.edits.extras
      .filter((e) => e.sectionId === section.section_id)
      .map((e) => ({ conceptId: e.conceptId, custom: true, weight: 1 }));
    const concepts = [...own, ...custom];
    if (!concepts.length) continue;

    // Named with aria-label rather than a <label>: a label around the title would
    // make clicking the title toggle the checkbox instead of opening the section.
    const sectionBox = /** @type {HTMLInputElement} */ (el('input', {
      type: 'checkbox', 'aria-label': t('tree.include', { section: title }),
    }));
    sectionBox.addEventListener('change', () => {
      input.onToggle({ sections: { [section.section_id]: sectionBox.checked } });
    });
    const count = el('span', { class: 'count' });
    // The registry's role is the default; a reader can say otherwise. The colour is
    // the section-coding mechanism on the printed sheet, so which section is which
    // colour is a real editorial choice -- and this is the one place both the
    // colour and the section's contents are in front of you at once.
    const role = spec.sectionColors?.[section.section_id] ?? section.color_role;
    const color = theme.colors.roles[role];
    // **A swatch of its own, not the section's icon.** The icon *was* the button, and
    // it was reported as missing three times: a clock or a fork does not look like
    // something you can press, and nothing distinguished it from the icons the sheet
    // draws. So the icon stays an icon and the colour becomes a filled chip beside
    // it, which is the one shape that reads as "this is the colour, press to change
    // it" without a label.
    const icon = section.icon ? sectionIcon(input.icons, section.icon, color) : null;
    const chip = el('span', { class: 'chip-fill', style: `background:${color}` });
    const swatch = el('button', {
      type: 'button', class: 'tree-color',
      'aria-label': t('tree.recolour', { section: title }),
      title: t('tree.recolour', { section: title }),
    }, [chip]);
    // **A menu, not a cycle.** This used to advance to the next role on each click,
    // which is a control you cannot use: the swatch is the section's own icon and
    // does not read as a button, and even once you find it you are cycling blind
    // through five colours to reach the one you want. The five are in front of you
    // now, the current one is marked, and the section's colour is the sheet's whole
    // category cue -- so choosing it deliberately is the point.
    const roles = Object.keys(theme.colors.roles);
    const menu = el('div', { class: 'role-menu', hidden: 'hidden', role: 'menu' },
      roles.map((r) => {
        const option = el('button', {
          type: 'button',
          class: `role-option${r === role ? ' current' : ''}`,
          role: 'menuitemradio',
          'aria-checked': String(r === role),
          'aria-label': r,
          title: r,
        }, [el('span', { class: 'dot', style: `background:${theme.colors.roles[r]}` })]);
        option.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          closeMenu();
          input.onToggle({ sectionColors: { [section.section_id]: r } });
        });
        return option;
      }));

    function closeMenu(focus = false) {
      if (menu.hidden) return;
      menu.hidden = true;
      swatch.setAttribute('aria-expanded', 'false');
      if (focus) swatch.focus();
      if (open === closeMenu) open = null;
    }

    swatch.setAttribute('aria-haspopup', 'true');
    swatch.setAttribute('aria-expanded', 'false');
    swatch.addEventListener('click', (event) => {
      // Inside a <summary>, so the click would otherwise fold the section.
      event.preventDefault();
      event.stopPropagation();
      const show = menu.hidden;
      if (open) open();
      menu.hidden = !show;
      swatch.setAttribute('aria-expanded', String(show));
      if (show) {
        open = closeMenu;
        /** @type {HTMLElement} */ (menu.firstElementChild)?.focus();
      }
    });
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); return; }
      const options = [...menu.children];
      const to = nextIndex(event.key, options.indexOf(/** @type {Element} */ (event.target)),
        options.length);
      if (to < 0) return;
      event.preventDefault();
      /** @type {HTMLElement} */ (options[to]).focus();
    });
    const summary = el('summary', {}, [
      sectionBox,
      el('span', { class: 'tree-color-wrap' }, [swatch, menu]),
      ...(icon ? [icon] : []),
      el('span', { text: title }),
      count,
    ]);

    /** @type {{conceptId:string, box:HTMLInputElement,
     *          cells:Record<string,HTMLElement>, row:HTMLElement}[]} */
    const items = [];
    const list = el('ul', { class: 'items' }, concepts.map((concept) => {
      const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
      box.addEventListener('change', () => {
        input.onToggle({ items: { [concept.conceptId]: box.checked } });
      });
      // **Every column the sheet shows, in the sheet's own order.** The row used to
      // carry the script and the gloss alone, so a reader checking a romanisation or
      // a respelling had to find the row on the page instead -- and the respelling is
      // the column most likely to be wrong, since it is generated. `TREE_FIELDS` is
      // the sheet's order (`core/solve/arrange.js`), and `numeral` is left out
      // because it is the gloss cell under another name.
      /** @type {Record<string, HTMLElement>} */ const cells = {};
      for (const field of TREE_FIELDS) {
        if (!spec.fieldSet.includes(field) || field === 'numeral') continue;
        cells[field] = el('span', {
          class: `cell ${field}`,
          lang: TARGET_FIELDS.has(field) ? spec.target : spec.source,
        });
      }
      // Next to the checkbox, where the row's own controls are.
      const pencil = el('button', {
        type: 'button', class: 'item-edit-open',
        'aria-label': t('tree.editRow'), title: t('tree.editRow'),
      }, [pencilGlyph()]);
      const li = el('li', { 'data-concept': concept.conceptId }, [
        el('label', {}, [
          box,
          pencil,
          ...Object.values(cells),
          ...(concept.custom ? [el('span', { class: 'tag mine', text: t('tree.mine') })] : []),
          // Two decimals, right-justified against the panel edge, because it is a
          // number to compare down a column rather than to read in a sentence.
          el('span', {
            class: 'weight',
            title: t('tree.importanceTitle', { value: number(concept.weight, 2) }),
            text: number(concept.weight, 2),
          }),
        ]),
      ]);
      li.addEventListener('mouseenter', () => input.onHover(concept.conceptId));
      li.addEventListener('mouseleave', () => input.onHover(null));

      // **Three different questions, three different gestures.** The checkbox says
      // whether the row is on the sheet. A click on the row says "show me this one on
      // the card", which is the same thing clicking a row on the card does in the
      // other direction. And the pencil -- or a double-click -- says "let me change
      // what it says", which is an entry in `edits.overrides`, the same layer the CSV
      // import writes, so it survives a reload and exports with everything else.
      //
      // A single click used to open the editor, which made the commonest gesture the
      // most disruptive one and gave no way to just look at a row on the page.
      const openEditor = () => {
        if (li.querySelector('.item-edit')) return;
        const fields = Object.keys(cells);
        /** @type {Record<string, HTMLInputElement>} */ const boxes = {};
        const form = el('form', { class: 'item-edit' });
        for (const field of fields) {
          const id = `edit-${concept.conceptId}-${field}`;
          const box2 = /** @type {HTMLInputElement} */ (el('input', {
            type: 'text', id, value: cells[field].textContent ?? '',
            lang: TARGET_FIELDS.has(/** @type {any} */ (field)) ? spec.target : spec.source,
          }));
          boxes[field] = box2;
          form.append(el('label', { for: id }, [
            el('span', { class: 'small muted', text: t(`field.${field}`) }), box2,
          ]));
        }
        const close = () => form.remove();
        form.append(el('div', { class: 'row' }, [
          el('button', { type: 'submit', text: t('tree.saveEdit') }),
          el('button', { type: 'button', class: 'ghost', text: t('quiz.cancel') }),
        ]));
        form.querySelector('.ghost')?.addEventListener('click', close);
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          /** @type {Record<string,string>} */ const values = {};
          for (const [field, b] of Object.entries(boxes)) values[field] = b.value.trim();
          close();
          input.onEdit?.(concept.conceptId, values);
        });
        form.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') { event.preventDefault(); close(); }
        });
        li.append(form);
        /** @type {HTMLElement} */ (form.querySelector('input'))?.focus();
      };
      pencil.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor();
      });

      const label = /** @type {HTMLElement} */ (li.querySelector('label'));
      label.addEventListener('click', (event) => {
        const target = /** @type {Element} */ (event.target);
        if (target.closest('input[type="checkbox"], .item-edit-open, .item-edit')) return;
        // The label would otherwise toggle the checkbox it wraps.
        event.preventDefault();
        input.onPick(concept.conceptId);
      });
      label.addEventListener('dblclick', (event) => {
        if (/** @type {Element} */ (event.target).closest('.item-edit')) return;
        event.preventDefault();
        openEditor();
      });

      items.push({ conceptId: concept.conceptId, box, cells, row: li });
      return li;
    }));

    sections.push({
      sectionId: section.section_id,
      box: sectionBox,
      count,
      items,
      swatch,
      menu,
      icon,
      role: section.color_role,
    });
    nodes.push(el('li', {}, [el('details', { open: '' }, [summary, list])]));
  }

  root.replaceChildren(...nodes);

  return (/** @type {import('../core/types.js').SheetSpec} */ nextSpec,
    /** @type {import('../core/types.js').Block[]} */ blocks,
    /** @type {Record<string,boolean>|null} */ marked = null) => {
    // Text comes from the solved blocks, so an imported edit shows here too, not
    // just on the page.
    /** @type {Map<string, import('../core/types.js').ItemRow>} */ const shown = new Map();
    for (const block of blocks) {
      for (const row of block.rows ?? []) shown.set(row.conceptId, row);
    }

    for (const section of sections) {
      const on = nextSpec.selection.sections[section.sectionId] !== false;
      section.box.checked = on;
      // The swatch is state, not shape, so it changes here rather than by rebuilding
      // the tree -- which would cost every open section and the scroll position.
      const role = nextSpec.sectionColors?.[section.sectionId] ?? section.role;
      const next = theme.colors.roles[role];
      const mark = section.swatch.firstElementChild;
      if (mark instanceof HTMLElement) mark.style.background = next;
      // The icon takes the colour too, since it is the mark the sheet prints.
      const drawn = section.icon;
      if (drawn instanceof SVGElement) drawn.setAttribute('stroke', next);
      // And the menu's own mark, which is what says *which* of the five is in
      // effect. Without this the swatch changed colour and the menu went on
      // pointing at the role the section started with.
      for (const option of section.menu.children) {
        const on = option.getAttribute('aria-label') === role;
        option.classList.toggle('current', on);
        option.setAttribute('aria-checked', String(on));
      }
      let included = 0;
      for (const item of section.items) {
        const row = shown.get(item.conceptId);
        if (row) included += 1;
        // A checkbox states intent, so it follows the selection. Deriving it from
        // the solved blocks instead let an in-flight solve tick a box back on
        // moments after it was cleared, because that solve had started from the
        // older selection. The count below is the outcome, and does come from
        // the blocks.
        item.box.checked = on && nextSpec.selection.items[item.conceptId] !== false;
        item.box.disabled = !on;
        // What the last balance did to this row, until the reader touches anything
        // else. Two classes rather than one, because "it added twelve rows" and "it
        // switched nine off so the twelve would not bring a whole section with them"
        // are different news.
        const change = marked?.[item.conceptId];
        item.row.classList.toggle('added', change === true);
        item.row.classList.toggle('removed', change === false);
        if (row) {
          const values = /** @type {Record<string,string>} */ (row.values);
          for (const [field, cell] of Object.entries(item.cells)) {
            cell.textContent = values[field] ?? '';
          }
        } else if (!item.cells.script?.textContent) {
          // A row the solve dropped still has to say what it is, or switching a
          // section off empties its labels. The corpus is the fallback, which has
          // the two sides and none of the generated columns.
          if (item.cells.script) {
            item.cells.script.textContent = input.targetRows[item.conceptId]?.text ?? '';
          }
          if (item.cells.gloss) {
            item.cells.gloss.textContent = input.sourceRows[item.conceptId]?.text ?? '';
          }
        }
      }
      section.count.textContent = `${included}/${section.items.length}`;
    }
  };
}

/**
 * Scroll to an item and flash it. Called when a row is clicked on a face.
 * @param {HTMLElement} root @param {string} conceptId
 */
export function revealItem(root, conceptId) {
  const li = root.querySelector(`[data-concept="${CSS.escape(conceptId)}"]`);
  if (!(li instanceof HTMLElement)) return;
  const details = li.closest('details');
  if (details && !details.open) details.open = true;
  li.scrollIntoView({ block: 'center', behavior: 'smooth' });
  li.classList.add('flash');
  setTimeout(() => li.classList.remove('flash'), 1200);
}
