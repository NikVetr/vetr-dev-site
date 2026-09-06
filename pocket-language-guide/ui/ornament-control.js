import { ORNAMENT_STYLES, motifFor, ornamentRule } from '../core/ornaments.js';
import { t } from './i18n.js';

/** @param {import('../core/types.js').SheetSpec} spec
 * @param {(style:import('../core/ornaments.js').OrnamentStyle)=>void} onChange */
export function ornamentControl(spec, onChange) {
  const root = document.createElement('div');
  root.className = 'field ornament-control';
  const label = document.createElement('label');
  label.htmlFor = 'ornament-style';
  label.textContent = t('format.ornamentStyle');
  const select = document.createElement('select');
  select.id = 'ornament-style';
  for (const style of ORNAMENT_STYLES) {
    select.add(new Option(t(`ornament.${style}`), style));
  }
  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  preview.setAttribute('viewBox', '0 0 240 42');
  preview.setAttribute('aria-hidden', 'true');
  preview.classList.add('ornament-sample');
  const caption = document.createElement('p');
  caption.className = 'small muted';
  const hint = document.createElement('p');
  hint.id = 'ornament-hint';
  hint.className = 'small muted';
  hint.textContent = t('ornament.hint');
  select.setAttribute('aria-describedby', hint.id);
  root.append(label, select, preview, caption, hint);
  select.addEventListener('change', () => {
    onChange(/** @type {import('../core/ornaments.js').OrnamentStyle} */ (select.value));
  });

  /** @param {import('../core/types.js').SheetSpec} next */
  function sync(next) {
    const style = next.ornamentStyle ?? 'classic';
    select.value = style;
    const motif = motifFor(style, next.target);
    const color = next.inkMode === 'mono' ? '#111820' : '#237547';
    const path = document.createElementNS(preview.namespaceURI, 'path');
    if (motif) {
      const rule = ornamentRule(motif, 10, 12, 220, 18, color);
      path.setAttribute('d', rule.d);
      path.setAttribute('transform', `translate(${rule.x} ${rule.y})`);
      path.setAttribute('stroke-width', '1');
    } else {
      path.setAttribute('d', 'M10 21 H230');
      path.setAttribute('stroke-width', '2');
    }
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    preview.replaceChildren(path);
    caption.textContent = t(`ornament.${style === 'language' ? 'language' : motif ?? 'classic'}`);
    if (motif && next.inkMode === 'low-ink') caption.textContent = t('ornament.lowInk');
  }
  sync(spec);
  return { root, sync };
}
