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
 * @property {'duration'} kind
 * @property {number} amount  a whole count; fractions are not how anyone answers this
 * @property {'minute'|'hour'|'day'} unit
 */

/**
 * A time of day, which is not a duration and was not sayable at all.
 *
 * **Every one of the three tree audits asked for this independently**, because its
 * absence produced a wrong answer rather than a missing one: asked "what time does it
 * open?" at eight in the morning, the only substantive cell in the answer space was
 * *It is closed*, so the owner read back a false statement when the answer was *opens
 * at ten*. A clock time needs no translation either -- twelve- or twenty-four-hour,
 * the separator, and which side the marker goes are all things CLDR knows per locale.
 * @typedef {Object} Clock
 * @property {'clock'} kind
 * @property {number} hour    0-23, always; how it is *written* is the locale's business
 * @property {number} minute  0-59
 */

/**
 * A bare number: a platform, a price, a quantity of something.
 *
 * The other thing the corpus cannot say. `numbers-money` holds single digits and
 * magnitudes, and a price is not spellable one tap at a time -- so "how much is
 * this?" had no answer but a promise to write it down. Formatted rather than printed,
 * because a locale's digits are its own: Arabic answers ٢٥٠.
 * @typedef {Object} Count
 * @property {'count'} kind
 * @property {number} amount
 */

/** @typedef {Duration|Clock|Count} Quantity */

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

/**
 * Whether a language can carry a formatted quantity at all.
 *
 * Asked of the formatter that will actually be used: a locale `Intl` can count in is
 * not necessarily one it can tell the time in, and the point of asking is to get
 * `null` instead of a silent fall back to the runtime's own language.
 * @param {string} locale @param {'number'|'time'} [as]
 */
export function supports(locale, as = 'number') {
  try {
    const of = as === 'time'
      ? Intl.DateTimeFormat.supportedLocalesOf([locale])
      : Intl.NumberFormat.supportedLocalesOf([locale]);
    return of.length > 0;
  } catch {
    // A malformed tag throws rather than returning empty.
    return false;
  }
}

/**
 * A time of day in one language, or `null` where that language has no formatter.
 *
 * A `Date` is built only to be formatted: its components are read back in the same
 * system zone they were written in, so the wall clock survives the round trip and no
 * timezone enters the model. The date part is arbitrary and never shown.
 * @param {Clock} clock @param {string} locale
 * @returns {string|null}
 */
export function formatClock({ hour, minute }, locale) {
  if (!supports(locale, 'time')) return null;
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(2000, 0, 1, hour, minute));
}

/**
 * A bare number in one language, or `null` where it has no formatter.
 * @param {Count} count @param {string} locale
 * @returns {string|null}
 */
export function formatCount({ amount }, locale) {
  if (!supports(locale)) return null;
  return new Intl.NumberFormat(locale).format(amount);
}

/**
 * Whichever of the three this is, in one language.
 *
 * One entry point so a caller never has to know which kind it is holding -- the whole
 * reason the value is tagged rather than discriminated by which fields it happens to
 * carry.
 * @param {Quantity} value @param {string} locale
 * @returns {string|null}
 */
export function formatQuantity(value, locale) {
  if (value.kind === 'clock') return formatClock(value, locale);
  if (value.kind === 'count') return formatCount(value, locale);
  return formatDuration(value, locale);
}

/**
 * The durations a reply grid offers before anyone reaches for the keypad.
 *
 * Chosen to be the answers people actually give — no wait, a few minutes, a quarter
 * of an hour, half an hour, an hour, two hours — rather than an even scale. Someone
 * answering "how long is the wait" says "about ten minutes", never "about eleven".
 * @type {Duration[]}
 */
export const COMMON_WAITS = /** @type {Duration[]} */ ([
  { kind: 'duration', amount: 5, unit: 'minute' },
  { kind: 'duration', amount: 10, unit: 'minute' },
  { kind: 'duration', amount: 15, unit: 'minute' },
  { kind: 'duration', amount: 30, unit: 'minute' },
  { kind: 'duration', amount: 1, unit: 'hour' },
  { kind: 'duration', amount: 2, unit: 'hour' },
]);

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
 * @returns {{ok:true, value:Duration} | {ok:false, reason:'empty'|'not-a-number'|'too-small'|'too-large'}}
 */
export function parseAmount(raw, unit) {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'not-a-number' };
  const amount = Number(text);
  if (amount < 1) return { ok: false, reason: 'too-small' };
  if (amount > CEILING[unit]) return { ok: false, reason: 'too-large' };
  return { ok: true, value: { kind: 'duration', amount, unit } };
}

/** The most a bare number will be taken to be. A price, a platform, a count of
 *  people: past a million somebody has leant on the keypad. */
const COUNT_CEILING = 1_000_000;

/**
 * Read a typed number, or say why it is not one.
 *
 * Same contract and the same strictness as `parseAmount`, for the same reason: what
 * is typed here is shown to a stranger as a fact, so a blank, a minus sign or a
 * decimal point has to be refused rather than coerced.
 * @param {string} raw
 * @returns {{ok:true, value:Count} | {ok:false, reason:'empty'|'not-a-number'|'too-large'}}
 */
export function parseCount(raw) {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'not-a-number' };
  const amount = Number(text);
  if (amount > COUNT_CEILING) return { ok: false, reason: 'too-large' };
  return { ok: true, value: { kind: 'count', amount } };
}

/**
 * Read a time of day off an `<input type="time">`, or say why it is not one.
 *
 * The control hands back `HH:MM` in twenty-four-hour form whatever it *displays*,
 * which is exactly the seam this project wants: the platform's own picker, in the
 * reader's own convention, and one unambiguous string crossing back.
 * @param {string} raw
 * @returns {{ok:true, value:Clock} | {ok:false, reason:'empty'|'not-a-time'}}
 */
export function parseClock(raw) {
  const text = raw.trim();
  if (!text) return { ok: false, reason: 'empty' };
  const at = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!at) return { ok: false, reason: 'not-a-time' };
  const hour = Number(at[1]);
  const minute = Number(at[2]);
  if (hour > 23 || minute > 59) return { ok: false, reason: 'not-a-time' };
  return { ok: true, value: { kind: 'clock', hour, minute } };
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
