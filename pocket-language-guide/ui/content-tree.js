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

import { t } from './i18n.js';

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
 * @property {(patch:{sections?:Record<string,boolean>, items?:Record<string,boolean>})=>void} onToggle
 * @property {(conceptId:string|null)=>void} onHover
 * @property {any} icons                     data/icons.json
 * @property {import('../core/pack.js').SheetEdits} edits
 */

/**
 * Build the tree. Returns an updater to call after each solve.
 * @param {TreeInput} input
 * @returns {(spec:import('../core/types.js').SheetSpec, blocks:import('../core/types.js').Block[])=>void}
 */
export function createTree(input) {
  const { root, corpus, theme, spec } = input;

  /** @type {{sectionId:string, box:HTMLInputElement, count:HTMLElement,
   *          items:{conceptId:string, box:HTMLInputElement, target:HTMLElement, gloss:HTMLElement}[]}[]} */
  const sections = [];
  /** @type {Node[]} */ const nodes = [];

  for (const section of corpus.sections) {
    const own = (corpus.conceptsByGroup[section.group] ?? [])
      .filter((c) => c.section_id === section.section_id)
      .filter((c) => input.targetRows[c.concept_id] && input.sourceRows[c.concept_id])
      .map((c) => ({ conceptId: c.concept_id, custom: false }));
    // Terms the reader added live in the same list as the corpus ones, marked so
    // they can be told apart and removed.
    const custom = input.edits.extras
      .filter((e) => e.sectionId === section.section_id)
      .map((e) => ({ conceptId: e.conceptId, custom: true }));
    const concepts = [...own, ...custom];
    if (!concepts.length) continue;

    // Named with aria-label rather than a <label>: a label around the title would
    // make clicking the title toggle the checkbox instead of opening the section.
    const sectionBox = /** @type {HTMLInputElement} */ (el('input', {
      type: 'checkbox', 'aria-label': t('tree.include', { section: section.title_en }),
    }));
    sectionBox.addEventListener('change', () => {
      input.onToggle({ sections: { [section.section_id]: sectionBox.checked } });
    });
    const count = el('span', { class: 'count' });
    const color = theme.colors.roles[section.color_role];
    const icon = section.icon ? sectionIcon(input.icons, section.icon, color) : null;
    const summary = el('summary', {}, [
      sectionBox,
      icon ?? el('span', { class: 'dot', style: `background:${color}` }),
      el('span', { text: section.title_en }),
      count,
    ]);

    /** @type {{conceptId:string, box:HTMLInputElement, target:HTMLElement, gloss:HTMLElement}[]} */
    const items = [];
    const list = el('ul', { class: 'items' }, concepts.map((concept) => {
      const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
      box.addEventListener('change', () => {
        input.onToggle({ items: { [concept.conceptId]: box.checked } });
      });
      const target = el('span', { class: 'target', lang: spec.target });
      const gloss = el('span', { class: 'gloss', lang: spec.source });
      const li = el('li', { 'data-concept': concept.conceptId }, [
        el('label', {}, [
          box,
          target,
          gloss,
          ...(concept.custom ? [el('span', { class: 'tag mine', text: t('tree.mine') })] : []),
        ]),
      ]);
      li.addEventListener('mouseenter', () => input.onHover(concept.conceptId));
      li.addEventListener('mouseleave', () => input.onHover(null));
      items.push({ conceptId: concept.conceptId, box, target, gloss });
      return li;
    }));

    sections.push({ sectionId: section.section_id, box: sectionBox, count, items });
    nodes.push(el('li', {}, [el('details', { open: '' }, [summary, list])]));
  }

  root.replaceChildren(...nodes);

  return (/** @type {import('../core/types.js').SheetSpec} */ nextSpec,
    /** @type {import('../core/types.js').Block[]} */ blocks) => {
    // Text comes from the solved blocks, so an imported edit shows here too, not
    // just on the page.
    /** @type {Map<string, import('../core/types.js').ItemRow>} */ const shown = new Map();
    for (const block of blocks) {
      for (const row of block.rows ?? []) shown.set(row.conceptId, row);
    }

    for (const section of sections) {
      const on = nextSpec.selection.sections[section.sectionId] !== false;
      section.box.checked = on;
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
        if (row) {
          item.target.textContent = row.values.script ?? '';
          item.gloss.textContent = row.values.gloss ?? '';
        } else if (!item.target.textContent) {
          item.target.textContent = input.targetRows[item.conceptId]?.text ?? '';
          item.gloss.textContent = input.sourceRows[item.conceptId]?.text ?? '';
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
