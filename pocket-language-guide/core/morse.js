// Morse code: text to dots and dashes, and dots and dashes to light.
//
// Morse is not a language and is treated as one anyway, for the same reason the
// two constructed languages are: it has a published standard (ITU-R M.1677-1), a
// fixed inventory, and a use in exactly the situation this app is for -- a phone
// held up in the dark, saying something to someone who cannot hear it. The
// "language" side is a card of the alphabet, generated from this table; the
// "conversation" side is a signaller that flashes the screen and the lamp.
//
// Timing follows the standard: a dash is three dots, the gap inside a letter is
// one dot, between letters three, between words seven. Encoded here as the unit
// list the beacon already speaks -- `1` and `3` lit, `0` unlit, one unit each --
// so the SOS that was hand-written there is just `toUnits('SOS')`.

/** ITU letters, digits and the punctuation the standard defines. Dots and dashes
 * as `.` and `-`: ASCII, so every font has them and a keyboard can type them. */
export const CODE = /** @type {Readonly<Record<string,string>>} */ ({
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
  I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
  Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
  Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
});

/** Dots and dashes back to the character. Built once from the table above. */
const CHAR = new Map(Object.entries(CODE).map(([ch, code]) => [code, ch]));

/**
 * Letters with a diacritic fold to the base letter, which is what a Morse operator
 * does with them; anything the standard has no code for is dropped and reported.
 * @param {string} text
 */
function letters(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

/**
 * One word's worth of codes, or `null` for a character Morse cannot say.
 * @param {string} word @returns {(string|null)[]}
 */
function codesOf(word) {
  return [...letters(word)].map((ch) => CODE[ch] ?? null);
}

/**
 * The text as dots and dashes, letters spaced, words divided by ` / `.
 *
 * This is the string a card prints and the signaller shows above the light, so it
 * has to be readable by someone learning the code: one space inside a word, the
 * slash between words, which is how every published table lays it out.
 * @param {string} text
 * @returns {{code:string, unsayable:string[]}}
 */
export function encode(text) {
  /** @type {string[]} */ const unsayable = [];
  const words = text.trim().split(/\s+/).filter(Boolean).map((word) => {
    const codes = codesOf(word);
    codes.forEach((code, i) => { if (code === null) unsayable.push([...letters(word)][i]); });
    return codes.filter((c) => c !== null).join(' ');
  }).filter(Boolean);
  return { code: words.join(' / '), unsayable: [...new Set(unsayable)] };
}

/**
 * Dots and dashes back to text. Letters may be separated by spaces, words by `/`;
 * anything that is not a code the table knows comes back as `?`, which is a
 * signaller's own convention for "say again".
 * @param {string} code
 */
export function decode(code) {
  return code.trim().split(/\s*\/\s*/).filter(Boolean).map((word) => (
    word.trim().split(/\s+/).map((c) => CHAR.get(c) ?? '?').join('')
  )).join(' ');
}

/**
 * The text as the beacon's unit list: `1` a dot lit, `3` a dash lit, `0` one unit
 * dark. One dark unit between symbols, three between letters, seven between words,
 * and seven after the whole message so a repeat reads as a repeat.
 * @param {string} text
 * @returns {number[]}
 */
export function toUnits(text) {
  /** @type {number[]} */ const out = [];
  const words = text.trim().split(/\s+/).filter(Boolean);
  words.forEach((word, w) => {
    const codes = codesOf(word).filter((c) => c !== null);
    codes.forEach((code, i) => {
      [...code].forEach((symbol, k) => {
        out.push(symbol === '-' ? 3 : 1);
        if (k < code.length - 1) out.push(0);
      });
      if (i < codes.length - 1) out.push(0, 0, 0);
    });
    if (w < words.length - 1) out.push(0, 0, 0, 0, 0, 0, 0);
  });
  if (out.length) out.push(0, 0, 0, 0, 0, 0, 0);
  return out;
}

/**
 * How long one unit lasts at a given speed, in milliseconds.
 *
 * PARIS is the standard word for timing -- fifty units long including its word gap
 * -- so at `wpm` words per minute a unit is `60000 / (50 * wpm)` ms. Five words a
 * minute, a beginner's receiving speed, gives 240ms, which is also under the
 * three-flashes-a-second ceiling the screen has to respect for anyone
 * photosensitive: the fastest a dot can strobe is one on and one off per two units.
 * @param {number} wpm
 */
export function unitMs(wpm) {
  return Math.round(60000 / (50 * wpm));
}

/**
 * The shortest a unit is ever allowed to be, in milliseconds.
 *
 * WCAG's general flash threshold is three flashes a second. The fastest Morse can
 * strobe is a run of dots -- one unit lit, one dark -- so a flash is two units, and
 * two of these is 340ms: 2.94 a second. The beacon clamps every unit it is handed to
 * this, so no speed setting, present or future, can be the one that bypasses it.
 */
export const MIN_UNIT_MS = 170;

/** @param {number} ms  a unit somebody asked for @returns {number} one that is safe */
export function safeUnitMs(ms) {
  return Number.isFinite(ms) && ms > MIN_UNIT_MS ? ms : MIN_UNIT_MS;
}

/**
 * The most times any rolling second of the pattern goes from dark to lit.
 *
 * The pattern is laid out on a clock twice over, so the repeat's join is counted
 * too, and every onset asks how many onsets fall within the second that starts at it.
 * This is what the ceiling is a ceiling on, and it is arithmetic, so the test for it
 * needs no screen and no waiting.
 * @param {number[]} units  1 and 3 lit, 0 dark, as `toUnits` gives
 * @param {number} unitMs
 */
export function peakFlashRate(units, unitMs) {
  /** @type {number[]} */ const onsets = [];
  let t = 0;
  for (const beat of [...units, ...units]) {
    if (beat > 0) onsets.push(t);
    t += unitMs * Math.max(1, beat);
  }
  let peak = 0;
  for (let i = 0; i < onsets.length; i += 1) {
    let n = 0;
    while (i + n < onsets.length && onsets[i + n] < onsets[i] + 1000) n += 1;
    peak = Math.max(peak, n);
  }
  return peak;
}
