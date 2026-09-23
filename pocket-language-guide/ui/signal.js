// The Morse signaller: a message typed, shown as code, and flashed.
//
// The "conversation" half of the Morse language. A board would be the wrong shape
// -- there is no listener language to translate into, and the point is not to show
// a stranger a sentence but to send it as light -- so this page has two boxes and
// one big button. What you type is shown as dots and dashes as you type it, so the
// code is learnable on the way; pressing Signal hands the unit list to the beacon,
// which already knows how to flash a screen and a lamp to Morse timing because that
// is what the SOS beacon does.

import {
  loadText, loadLanguages, readerLanguage, registerOffline, showFatal,
} from './app.js';
import { loadUiLanguage, applyStatic, t } from './i18n.js';
import { encode, decode, toUnits, unitMs } from '../core/morse.js';
import { startBeacon, stopBeacon } from './platform/beacon.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const params = new URLSearchParams(location.search);
  const { languages, coverage } = await loadLanguages();
  const owner = params.get('source') || readerLanguage(languages, coverage);
  await loadUiLanguage(owner, loadText);
  applyStatic();

  const text = /** @type {HTMLTextAreaElement} */ ($('signal-text'));
  const code = /** @type {HTMLOutputElement} */ ($('signal-code'));
  const unsayable = $('signal-unsayable');
  const received = /** @type {HTMLTextAreaElement} */ ($('signal-received'));
  const decoded = /** @type {HTMLOutputElement} */ ($('signal-decoded'));
  const speed = /** @type {HTMLSelectElement} */ ($('signal-speed'));
  const start = /** @type {HTMLButtonElement} */ ($('signal-start'));
  const sos = /** @type {HTMLButtonElement} */ ($('signal-sos'));

  // **Shown as typed.** The code is the learning aid; a reader who has typed HELP
  // and seen `.... . .-.. .--.` a few times will know it before they need it.
  const show = () => {
    const { code: c, unsayable: bad } = encode(text.value);
    code.value = c;
    unsayable.textContent = bad.length ? t('signal.unsayable', { chars: bad.join(' ') }) : '';
    start.disabled = !c;
  };
  text.addEventListener('input', show);
  show();
  received.addEventListener('input', () => { decoded.value = decode(received.value); });

  /**
   * Flash a message. The beacon owns the screen and the lamp while it runs and hands
   * back with `onStop`, so Signal reads as Stop until then.
   * @param {string} message
   */
  const signal = (message) => {
    const units = toUnits(message);
    if (!units.length) return;
    start.textContent = t('signal.stop');
    startBeacon({
      mode: 'morse',
      units,
      unitMs: unitMs(Number(speed.value)),
      // Nothing in the middle -- the middle of the screen is the light, as on the
      // SOS screen -- and the code small at the foot, where the sender can follow
      // along. A tap anywhere still stops it, which the Signal button also says.
      label: '',
      lang: 'und',
      dir: 'ltr',
      dismiss: encode(message).code,
      onStop: () => { start.textContent = t('signal.start'); },
    });
  };
  start.addEventListener('click', () => signal(text.value));
  sos.addEventListener('click', () => signal('SOS'));
  addEventListener('pagehide', stopBeacon);

  registerOffline();
}

main().catch(showFatal);
