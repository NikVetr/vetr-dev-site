// Shared two-position control. Wanderwart bundles generated local copies for offline use.
const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/>'
  + '<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"'
  + ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 14.6A8.5 8.5 0 0 1 9.4 3.8a8.5 8.5 0 1 0 10.8 10.8Z"'
  + ' fill="currentColor"/></svg>';

/**
 * The switch itself, for whatever is one of two: the app's light and dark, or -- with its
 * own two marks -- whom the board's sentences are said to. A card's dark is not this:
 * it is its palette, chosen in the studio's Colours ladder like any other. `show`
 * re-reads `dark` when something else has changed it.
 * @param {{label:string, dark:() => boolean, flip:() => void, marks?:[string, string], button?:HTMLButtonElement}} config
 */
export function lightSwitch({ label, dark, flip, marks = [SUN, MOON], button = document.createElement('button') }) {
  button.type = 'button';
  button.className = 'theme-switch';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', label);
  button.innerHTML = `${marks[0]}<span class="theme-switch-track"><span class="theme-switch-knob"></span></span>${marks[1]}`;
  const show = () => button.setAttribute('aria-checked', String(dark()));
  button.addEventListener('click', () => { flip(); show(); });
  show();
  return { button, show };
}
