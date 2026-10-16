// What the solver says about a sheet, and where it goes once it has been said.
//
// The warnings used to sit at the head of the content panel for as long as they held,
// which on a phone is the panel's most valuable room spent on a sentence already read.
// So a warning is said once, in a dialog, when a solve first produces it, and then kept
// in a record behind the menu button: a dialog that offers a decision -- a fix to press,
// or a sheet that did not fit -- waits for the reader; one that only reports what was
// done for them leaves after a moment, flying into the button it is kept behind.
//
// **The flight is the one motion here, and it is the message.** A notice that simply
// vanished would leave the reader wondering where it went; shrinking into the button
// says. Short, and with reduced motion asked for it closes in place -- the count on the
// button says the same thing without moving.

import { dialogHead } from './dialog.js';
import { warningText, fixText, number, t } from './i18n.js';

/** How long a notice that asks nothing stays before it goes, in milliseconds. */
const LINGER_MS = 1500;
const FLIGHT_MS = 620;

/**
 * A warning plus, where the solver found one, a button that actually fixes it.
 * @param {import('../core/types.js').Warning} warning
 * @param {(fix:import('../core/types.js').WarningFix) => void} onFix
 */
export function renderWarning(warning, onFix) {
  const li = document.createElement('li');
  li.className = warning.severity;
  li.append(document.createTextNode(warningText(warning)));
  if (!warning.fixes?.length) return li;

  const row = document.createElement('div');
  row.className = 'row fixes';
  for (const fix of warning.fixes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fix';
    button.textContent = fixText(fix);
    button.addEventListener('click', () => onFix(fix));
    row.append(button);
  }
  li.append(row);
  return li;
}

/**
 * Shrink a dialog into the control it is kept behind, then close it.
 * @param {HTMLDialogElement} panel @param {Element|undefined} target
 */
function flyInto(panel, target) {
  if (!panel.open || panel.dataset.leaving) return;
  panel.dataset.leaving = '1';
  if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    panel.close();
    return;
  }
  const from = panel.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const bend = dx < 0 ? -12 : 12;
  panel.animate([
    { offset: 0, transform: 'none', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', opacity: 1 },
    { offset: 0.3, transform: `translate(${dx * 0.12}px, ${dy * 0.08}px) skewX(${bend}deg) scale(0.82, 1.08)`,
      clipPath: 'polygon(12% 0, 88% 0, 100% 100%, 0 100%)', opacity: 1 },
    { offset: 0.72, transform: `translate(${dx * 0.65}px, ${dy * 0.55}px) skewX(${-bend}deg) scale(0.28, 0.65)`,
      clipPath: 'polygon(40% 0, 60% 0, 100% 100%, 0 100%)', opacity: 0.9 },
    { offset: 1, transform: `translate(${dx}px, ${dy}px) scale(0.015, 0.03)`,
      clipPath: 'polygon(48% 0, 52% 0, 65% 100%, 35% 100%)', opacity: 0 },
  ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.45, 0, 0.8, 0.35)', fill: 'forwards' })
    .finished.then(() => panel.close(), () => panel.close());
}

/**
 * Say what is new, in a dialog that waits for a decision or leaves on its own.
 *
 * A notice that asks nothing opens without taking the focus, which goes straight back
 * to wherever the reader was: it is news, and it should not cost them their place.
 * @param {object} config
 * @param {import('../core/types.js').Warning[]} config.warnings  the new ones
 * @param {(fix:import('../core/types.js').WarningFix) => void} config.onFix
 * @param {() => Element|undefined} config.target  the control they are kept behind
 * @param {() => void} config.onAbsorbed
 */
function announce({ warnings, onFix, target, onAbsorbed }) {
  const decide = warnings.some((w) => w.severity === 'error' || w.fixes?.length);
  const panel = /** @type {HTMLDialogElement} */ (document.createElement('dialog'));
  panel.className = 'speaker-settings warning-dialog';
  panel.setAttribute('aria-label', t('studio.warnings'));
  const away = () => flyInto(panel, target());
  const list = document.createElement('ul');
  list.className = 'warnings';
  list.append(...warnings.map((w) => renderWarning(w, (fix) => { away(); onFix(fix); })));
  panel.append(dialogHead({ title: t('studio.warnings'), close: t('gallery.previewClose'), onClose: away }), list);
  // Escape leaves the way the cross does, into the menu.
  panel.addEventListener('cancel', (event) => { event.preventDefault(); away(); });
  panel.addEventListener('close', () => { panel.remove(); onAbsorbed(); });
  document.body.append(panel);
  if (decide) {
    panel.showModal();
    return;
  }
  const was = /** @type {HTMLElement|null} */ (document.activeElement);
  panel.show();
  was?.focus({ preventScroll: true });
  setTimeout(away, LINGER_MS);
}

/**
 * The record behind the menu, and the dialog for whatever a solve says that the last
 * one did not. Returns the function to call with each solve's warnings.
 * @param {object} config
 * @param {HTMLElement} config.menu   the expandable item the record lives in
 * @param {HTMLElement} config.list   its list
 * @param {HTMLElement} config.count  how many, beside its name
 * @param {HTMLElement[]} config.buttons  the menu buttons, which carry the count too
 * @param {(fix:import('../core/types.js').WarningFix) => void} config.onFix
 */
export function createWarnings({ menu, list, count, buttons, onFix }) {
  /** What was said last time, by its words, so a re-solve does not say it again. */
  let said = new Set();
  /** @type {import('../core/types.js').Warning[]} */ let current = [];
  const absorbed = new Set();
  const pending = new Map();
  const renderRecord = () => {
    const recorded = current.filter((w) => absorbed.has(warningText(w)));
    list.replaceChildren(...recorded.map((w) => renderWarning(w, onFix)));
    menu.hidden = !recorded.length;
    count.textContent = number(recorded.length, 0);
    for (const button of buttons) {
      if (recorded.length) button.dataset.warnings = number(recorded.length, 0);
      else delete button.dataset.warnings;
    }
  };
  return (/** @type {import('../core/types.js').Warning[]} */ warnings) => {
    current = warnings;
    const keys = new Set(warnings.map(warningText));
    for (const key of absorbed) if (!keys.has(key)) absorbed.delete(key);
    for (const key of pending.keys()) if (!keys.has(key)) pending.delete(key);
    renderRecord();
    const fresh = warnings.filter((w) => !said.has(warningText(w)));
    said = keys;
    if (fresh.length) {
      const token = Symbol();
      for (const warning of fresh) pending.set(warningText(warning), token);
      announce({
        warnings: fresh,
        onFix,
        onAbsorbed: () => {
          for (const warning of fresh) {
            const key = warningText(warning);
            if (pending.get(key) !== token) continue;
            pending.delete(key);
            absorbed.add(key);
          }
          renderRecord();
        },
        // Whichever of the two is on screen: the bars on a desktop, the phone's menu.
        target: () => buttons.find((b) => b.offsetParent !== null),
      });
    }
  };
}
