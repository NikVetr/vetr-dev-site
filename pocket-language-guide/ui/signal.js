// The Morse signaller: a message typed, shown as code, and flashed.
//
// The "conversation" half of the Morse language. A board would be the wrong shape
// -- there is no listener language to translate into, and the point is not to show
// a stranger a sentence but to send it as light -- so this page has two boxes and
// one big button. What you type is shown as dots and dashes as you type it, so the
// code is learnable on the way; pressing Signal hands the unit list to the beacon,
// which already knows how to flash a screen and a lamp to Morse timing because that
// is what the SOS beacon does.

import { wireSiteMenu } from './site-menu.js';
import {
  loadText, loadLanguages, readerLanguage, registerOffline, showFatal,
} from './app.js';
import { loadUiLanguage, applyStatic, t } from './i18n.js';
import { encode, decode, toTimeline, unitMs, MIN_UNIT_MS } from '../core/morse.js';
import { startBeacon } from './platform/beacon.js';
import { keepAwake } from './platform/wake.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const params = new URLSearchParams(location.search);
  const { languages, coverage } = await loadLanguages();
  const owner = params.get('source') || readerLanguage(languages, coverage);
  await loadUiLanguage(owner, loadText);
  applyStatic();
  wireSiteMenu();

  const text = /** @type {HTMLTextAreaElement} */ ($('signal-text'));
  const code = /** @type {HTMLOutputElement} */ ($('signal-code'));
  const unsayable = $('signal-unsayable');
  const received = /** @type {HTMLTextAreaElement} */ ($('signal-received'));
  const decoded = /** @type {HTMLOutputElement} */ ($('signal-decoded'));
  const speed = /** @type {HTMLSelectElement} */ ($('signal-speed'));
  const start = /** @type {HTMLButtonElement} */ ($('signal-start'));
  const sos = /** @type {HTMLButtonElement} */ ($('signal-sos'));

  // **Faster than three flashes a second is the reader's call, made once.** The
  // beacon holds every speed under the photosensitive ceiling unless told the reader
  // has been warned; choosing one of the fast speeds asks, and a no puts the speed
  // back to the fastest safe one.
  const fastGroup = /** @type {HTMLOptGroupElement} */ (speed.querySelector('optgroup'));
  fastGroup.label = t('signal.fast');
  const isFast = () => unitMs(Number(speed.value)) < MIN_UNIT_MS;
  let warned = false;
  speed.addEventListener('change', () => {
    if (!isFast() || warned) return;
    // eslint-disable-next-line no-alert
    warned = confirm(t('signal.fastWarning'));
    if (!warned) speed.value = '7';
  });

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
    const { units, letter, letters } = toTimeline(message);
    if (!units.length) return;
    start.textContent = t('signal.stop');
    // The screen is the signal, so it must not sleep while one is running.
    keepAwake(true);
    // **The whole message at the foot, the letter on the light marked.** Each letter
    // over its code, so the sender can follow where the light is and a reader nearby
    // can learn it; small, because the middle of the screen is the light.
    // Letters kept together by word, so a long message wraps between words.
    const strip = document.createElement('p');
    strip.className = 'beacon-sequence';
    let word = document.createElement('span');
    word.className = 'beacon-word-group';
    strip.append(word);
    const cells = letters.map(({ char, code }) => {
      const cell = document.createElement('span');
      if (char === ' ') {
        word = document.createElement('span');
        word.className = 'beacon-word-group';
        strip.append(word);
        return cell;
      }
      cell.className = 'beacon-letter';
      cell.append(Object.assign(document.createElement('b'), { textContent: char }),
        Object.assign(document.createElement('span'), { textContent: code }));
      word.append(cell);
      return cell;
    });
    let lit = -1;
    startBeacon({
      mode: message === 'SOS' ? 'sos' : 'morse',
      units,
      unitMs: unitMs(Number(speed.value)),
      fast: warned && isFast(),
      // Nothing in the middle -- the middle of the screen is the light, as on the
      // SOS screen. A tap anywhere still stops it, which the Signal button also says.
      label: '',
      lang: 'und',
      dir: 'ltr',
      dismiss: '',
      foot: strip,
      onBeat: (i) => {
        if (letter[i] === lit) return;
        cells[lit]?.classList.remove('beacon-current');
        lit = letter[i];
        cells[lit]?.classList.add('beacon-current');
      },
      onStop: () => { start.textContent = t('signal.start'); keepAwake(false); },
    });
  };
  start.addEventListener('click', () => signal(text.value));
  // **SOS is SOS.** The distress signal is the beacon's own fixed 300ms dot -- the
  // pattern a stranger may recognise, at the pace the board flashes it -- and it
  // does not follow the speed a sender chose for their own messages. `mode: 'sos'`
  // is what says so; the units passed alongside are ignored for it.
  sos.addEventListener('click', () => signal('SOS'));

  registerOffline();
}

main().catch(showFatal);
