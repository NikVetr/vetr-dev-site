// A section's own format, in a dialog opened from its row in the content list.
//
// The card has one format, and some sections want another: the number line is a list
// of one-word rows that fits two or three to a column where a phrase needs the whole
// width. So a section can set the options that shape an *item* -- how many stand side
// by side, how each is laid out, where its divider sits -- and nothing that belongs to
// the card as a whole, such as its size, its type or its colours. Each option leads
// with "As the card", drawn as the card's own choice, so following the card is a choice
// on the same row as the others rather than the absence of one.

import { dialogHead } from './dialog.js';
import { itemGlyph, pageGlyph, panelField, segmented, splitGlyph } from './glyphs.js';
import { ARRANGEMENTS, arrangementShape } from '../core/solve/arrange.js';
import { t } from './i18n.js';

/** Items side by side in a column. One is the card's own, so it needs no "As the card". */
const ACROSS = [1, 2, 3, 4];
const SPLITS = /** @type {const} */ (['consistent', 'adaptive']);

/**
 * @param {object} config
 * @param {string} config.title  the section's name
 * @param {import('../core/types.js').SheetSpec} config.spec  the card, whose own choices
 *   the "As the card" options draw
 * @param {import('../core/types.js').SectionFormat} config.format  what the section has set
 * @param {(format:import('../core/types.js').SectionFormat) => void} config.onChange  told
 *   of every change, with only the keys the section sets apart from the card
 */
export function openSectionFormat({ title, spec, format, onChange }) {
  /** @type {import('../core/types.js').SectionFormat} */ const held = { ...format };
  const commit = () => onChange({ ...held });

  const across = segmented({
    label: t('sectionFormat.across'),
    value: held.across ?? 1,
    options: ACROSS.map((n) => ({
      value: n,
      caption: String(n),
      title: t('sectionFormat.acrossTitle', { count: n }),
      glyph: pageGlyph({ pageW: 20, pageH: 30, columns: n }),
    })),
    onChange: (n) => {
      if (n === 1) delete held.across;
      else held.across = n;
      commit();
    },
  });

  const card = spec.arrangement ?? 'mixed';
  const arrangement = segmented({
    label: t('format.entryLayoutLong'),
    value: held.arrangement ?? '',
    options: [
      { value: '', caption: t('sectionFormat.asCard'), title: t(`format.arrangementTitle.${card}`),
        glyph: itemGlyph(arrangementShape(card, spec.fieldSet)) },
      ...ARRANGEMENTS.map((a) => ({
        value: a.id,
        caption: t(`format.arrangement.${a.id}`),
        title: t(`format.arrangementTitle.${a.id}`),
        glyph: itemGlyph(arrangementShape(a.id, spec.fieldSet)),
      })),
    ],
    onChange: (id) => {
      if (id) held.arrangement = /** @type {import('../core/types.js').SheetSpec['arrangement']} */ (id);
      else delete held.arrangement;
      commit();
    },
  });

  const cardSplit = spec.split ?? 'consistent';
  const split = segmented({
    label: t('format.splitLong'),
    value: held.split ?? '',
    options: [
      { value: '', caption: t('sectionFormat.asCard'), title: t(`format.splitTitle.${cardSplit}`),
        glyph: splitGlyph(cardSplit === 'consistent') },
      ...SPLITS.map((id) => ({
        value: id,
        caption: t(`format.split.${id}`),
        title: t(`format.splitTitle.${id}`),
        glyph: splitGlyph(id === 'consistent'),
      })),
    ],
    onChange: (id) => {
      if (id) held.split = /** @type {'consistent'|'adaptive'} */ (id);
      else delete held.split;
      commit();
    },
  });

  const panel = /** @type {HTMLDialogElement} */ (document.createElement('dialog'));
  panel.className = 'speaker-settings section-format';
  const name = t('sectionFormat.title', { section: title });
  panel.setAttribute('aria-label', name);
  panel.append(
    dialogHead({ title: name, close: t('gallery.previewClose'), onClose: () => panel.close() }),
    panelField(t('sectionFormat.across'), [across.group]),
    panelField(t('format.entryLayout'), [arrangement.group]),
    panelField(t('format.split'), [split.group]),
  );
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
}
