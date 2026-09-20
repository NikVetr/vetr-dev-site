// Answers that are a quantity, not a sentence.
//
// "How long is the wait?" is answered with a number and a unit, and a number and a
// unit are the one kind of answer this project does not have to translate. Storing
// `{ amount: 15, unit: 'minute' }` and formatting it per language gets Russian's
// three plural forms, Polish's 22 *minuty*, Arabic's دقائق and Mandarin's 15分钟 out
// of CLDR — data every browser already ships — rather than out of a translator or,
// worse, out of a machine translating the string "15 minutes".
//
// **The structured value is what is stored and what travels.** The text is derived
// at the moment of display, twice: once in the listener's language for the person
// choosing it, and once in the owner's for the person reading the answer. Nothing
// round-trips through prose, so there is no wording to go stale, no plural rule to
// get wrong, and no language that needs a new row to support a new duration.
//
// It refuses rather than guesses. `Intl` falls back to the runtime's default locale
// for a tag it does not know, which would answer a Klingon board in English — the
// silent substitution the whole project is careful about. `supportedLocalesOf` is
// asked first and `null` comes back instead.

/** What a duration may be counted in. Each is a CLDR unit `Intl` knows. */
export const UNITS = /** @type {const} */ (['minute', 'hour', 'day']);

/**
 * @typedef {Object} Duration
 * @property {number} amount  a whole count; fractions are not how anyone answers this
 * @property {'minute'|'hour'|'day'} unit
 */

/**
 * A duration in one language, or `null` where that language has no formatter.
 *
 * `null` is a real answer and callers must handle it: the two constructed languages
 * in this registry have no CLDR data, and a board for one of them cannot offer a
 * duration reply at all. Better than `15 minutes` appearing on a Klingon screen.
 * @param {Duration} duration
 * @param {string} locale
 * @returns {string|null}
 */
export function formatDuration({ amount, unit }, locale) {
  if (!supports(locale)) return null;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    // `long` rather than `short`: this is read off a phone held at arm's length by
    // someone who may not know the abbreviation, and "15 minutes" is unambiguous
    // where "15 min" assumes a convention.
    unitDisplay: 'long',
  }).format(amount);
}

/** Whether a language can carry a formatted quantity at all. @param {string} locale */
export function supports(locale) {
  try {
    return Intl.NumberFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    // A malformed tag throws rather than returning empty.
    return false;
  }
}

/**
 * The durations a reply grid offers before anyone reaches for the keypad.
 *
 * Chosen to be the answers people actually give — no wait, a few minutes, a quarter
 * of an hour, half an hour, an hour, two hours — rather than an even scale. Someone
 * answering "how long is the wait" says "about ten minutes", never "about eleven".
 * @type {Duration[]}
 */
export const COMMON_WAITS = [
  { amount: 5, unit: 'minute' },
  { amount: 10, unit: 'minute' },
  { amount: 15, unit: 'minute' },
  { amount: 30, unit: 'minute' },
  { amount: 1, unit: 'hour' },
  { amount: 2, unit: 'hour' },
];

/** The most a keypad will accept, per unit. Past these the answer is a different unit. */
const CEILING = { minute: 600, hour: 48, day: 30 };

/**
 * Read a typed amount, or say why it is not one.
 *
 * Deliberately strict about what a duration can be. A blank, a minus sign, a decimal
 * point and three hundred hours are all things a keypad will happily produce and
 * none of them is an answer to "how long is the wait" — and an answer nobody meant
 * is worse here than no answer, because it is shown to a stranger as fact.
 * @param {string} raw @param {'minute'|'hour'|'day'} unit
 * @returns {{ok:true, duration:Duration} | {ok:false, reason:'empty'|'not-a-number'|'too-small'|'too-large'}}
 */
export function parseAmount(raw, unit) {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'not-a-number' };
  const amount = Number(text);
  if (amount < 1) return { ok: false, reason: 'too-small' };
  if (amount > CEILING[unit]) return { ok: false, reason: 'too-large' };
  return { ok: true, duration: { amount, unit } };
}

/**
 * What a unit is called in a language, without anybody translating it.
 *
 * The keypad's three buttons say "minutes", "hours", "days" to the person tapping
 * them, and that person reads the listener's language. Rather than three more
 * catalogue keys in fifty-one languages — each an invitation to invent a word —
 * CLDR is asked for the unit token it already uses when formatting a quantity.
 * Mandarin answers 分钟, 小时, 天; Russian answers минуты.
 *
 * A plural count is formatted and the unit part lifted out of it, because a button
 * standing for "5, 10, 15 of these" wants the plural form where a language has one.
 * @param {'minute'|'hour'|'day'} unit @param {string} locale
 * @returns {string|null}
 */
export function unitName(unit, locale) {
  if (!supports(locale)) return null;
  const parts = new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'long' })
    .formatToParts(3);
  const said = parts.filter((p) => p.type === 'unit').map((p) => p.value).join('').trim();
  return said || null;
}
