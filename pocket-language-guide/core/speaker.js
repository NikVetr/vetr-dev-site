// Who is speaking, and what that changes about the words.
//
// A traveller holds up a phone that says "I am lost". In Russian that sentence has a
// different form depending on who is saying it, and a general translation tool picks
// the masculine one — which is how a woman ends up addressing her grandmother in a
// voice that is not hers. A translator cannot know; it has one sentence and no
// speaker.
//
// **This app can know, because its phrases are a fixed set.** It asks once,
// beforehand, in a settings screen, and then every phrase resolves to the right form
// with no menu at the moment of use. That is the advantage a small inflexible board
// has over a flexible translator, and it is the whole reason this module exists.
//
// Three rules shape it, and each rules out an obvious design:
//
// **Only meaningful choices are offered.** The axes are declared per language in
// `data/registry/speaker-axes.csv`, so a reader whose languages have no gender
// agreement in the first person is never asked their gender. A settings screen that
// asks everyone everything is the thing this replaces.
//
// **Nothing is inferred.** Not from a name, not from a browser locale, not from a
// previous answer in another language. Unset is a real state and resolves to the
// language's own declared default, which is what the corpus already says today.
//
// **It never touches an incoming reply.** What the *listener* taps is theirs, and
// their grammar is not the owner's business: replies are written gender-neutral in
// both languages instead. `variantOf` refuses a phrase marked incoming, so this is
// structural rather than a rule someone has to remember.

/**
 * @typedef {Object} SpeakerAxis
 * @property {string} language
 * @property {string} axis      a stable slug: `speaker_gender`, `politeness`, ...
 * @property {string[]} values  every permitted value, in the order to offer them
 * @property {string} fallback  the one used when the reader has not chosen
 */

/**
 * What the reader has said about themselves, per axis.
 *
 * Flat and global rather than per language: "I am a woman" is a fact about the
 * reader, not about Russian, and asking again for every pair would be the repeated
 * menu this is meant to remove. Which axes are *used* is per language; what the
 * reader answered is not.
 * @typedef {Record<string, string>} SpeakerProfile
 */

/**
 * Read the axis registry into something indexable.
 * @param {Record<string,string>[]} rows
 * @returns {Record<string, SpeakerAxis[]>} language -> axes
 */
export function readAxes(rows) {
  /** @type {Record<string, Record<string, SpeakerAxis>>} */ const byLanguage = {};
  for (const row of rows) {
    const language = row.language?.trim();
    const axis = row.axis?.trim();
    const value = row.value?.trim();
    if (!language || !axis || !value) continue;
    const forLanguage = (byLanguage[language] ??= {});
    const held = (forLanguage[axis] ??= { language, axis, values: [], fallback: value });
    held.values.push(value);
    if (row.default === '1') held.fallback = value;
  }
  return Object.fromEntries(
    Object.entries(byLanguage).map(([language, axes]) => [language, Object.values(axes)]),
  );
}

/**
 * The questions worth asking this reader, for the pair they are using.
 *
 * The union of both languages' axes, because a pair is two languages and either may
 * inflect — and deduplicated, because "are you speaking as a man or a woman" is one
 * question even when two languages both need the answer.
 * @param {Record<string, SpeakerAxis[]>} axes
 * @param {string[]} languages
 * @returns {SpeakerAxis[]}
 */
export function axesFor(axes, languages) {
  /** @type {Map<string, SpeakerAxis>} */ const asked = new Map();
  for (const language of languages) {
    for (const axis of axes[language] ?? []) {
      // First language to declare an axis owns its value order; a second one
      // declaring the same axis adds any values the first did not have.
      const held = asked.get(axis.axis);
      if (!held) { asked.set(axis.axis, { ...axis, values: [...axis.values] }); continue; }
      for (const value of axis.values) if (!held.values.includes(value)) held.values.push(value);
    }
  }
  return [...asked.values()];
}

/**
 * The variant key a phrase should be looked up under, or `null` for the base text.
 *
 * `null` is the common answer and the cheap one: most phrases are the same whoever
 * says them, and the variant table is sparse for that reason. A key is built only
 * from axes the *language* declares and the *reader* has answered — so an unanswered
 * axis, or one this language does not have, simply does not appear in it.
 *
 * Sorted, so `gender=f|politeness=formal` and `politeness=formal|gender=f` are the
 * same key and a data file cannot disagree with the code about ordering.
 * @param {SpeakerAxis[]} axes       the axes this language declares
 * @param {SpeakerProfile} profile
 * @returns {string|null}
 */
export function variantKey(axes, profile) {
  const parts = [];
  for (const axis of axes) {
    const chosen = profile[axis.axis];
    // Only a value the language actually declares. A profile carried over from
    // another language may hold one this one has never heard of.
    if (chosen && chosen !== axis.fallback && axis.values.includes(chosen)) {
      parts.push(`${axis.axis}=${chosen}`);
    }
  }
  return parts.length ? parts.sort().join('|') : null;
}

/**
 * One concept's row as this speaker says it, falling back to the row on disk.
 *
 * A whole row rather than just `text`, because a wording that changes changes with
 * its pronunciation: a Russian woman's `Я заблудилась` is romanised *ya zabludilas*
 * and has its own IPA, and a card that varied the script while leaving the
 * respelling masculine would be teaching her to say the wrong thing out loud. A
 * variant row's non-empty cells win and its blank ones inherit — the same rule an
 * edited CSV follows everywhere else here — so a variant that changes one suffix is
 * one cell, not a duplicated row.
 *
 * **Refuses an incoming phrase outright.** What the listener taps is theirs to say,
 * and inflecting it for the owner's gender would be putting words in a stranger's
 * mouth — as well as leaking the owner's profile to someone who never asked. Replies
 * are kept naturally neutral in both languages instead, which is a content rule; this
 * is the structural half of it, so the content rule cannot be quietly broken by a
 * caller.
 * @param {object} args
 * @param {string} args.conceptId
 * @param {Record<string,string>} args.row   the language pack's own row
 * @param {VariantTable} args.variants
 * @param {string|null} args.key             from `variantKey`
 * @param {boolean} [args.incoming]          true for anything the listener says
 * @returns {{row:Record<string,string>, varied:boolean}}
 */
export function variantOf({ conceptId, row, variants, key, incoming }) {
  if (incoming || !key) return { row, varied: false };
  const said = variants[key]?.[conceptId];
  if (!said) return { row, varied: false };
  const merged = { ...row };
  for (const [field, value] of Object.entries(said)) if (value) merged[field] = value;
  return { row: merged, varied: true };
}

/**
 * Every row of a language's `variants.csv`, as `key -> concept_id -> partial row`.
 *
 * Sparse twice over: most languages have no such file at all, and the ones that do
 * carry a row only for the concepts that genuinely differ. A reader who has answered
 * nothing never looks in here.
 * @typedef {Record<string, Record<string, Record<string,string>>>} VariantTable
 */

/**
 * A whole language pack as this speaker says it.
 *
 * The sheet's entry point, where the board uses `variantOf` one phrase at a time. A
 * printed card is all the traveller's own speech, so there is no incoming case to
 * keep apart and the substitution can happen once, before anything is measured —
 * which matters, because the solver decides what fits by measuring these exact
 * strings. Returns the table unchanged when there is nothing to do, which is the
 * common case.
 * @param {Record<string, Record<string,string>>} rows
 * @param {VariantTable} variants
 * @param {string|null} key
 */
export function applyVariants(rows, variants, key) {
  const said = key ? variants[key] : null;
  if (!said) return rows;
  const out = { ...rows };
  for (const conceptId of Object.keys(said)) {
    if (out[conceptId]) out[conceptId] = variantOf({ conceptId, row: out[conceptId], variants, key }).row;
  }
  return out;
}

/**
 * Which declared axes this reader has not answered, for a pair.
 *
 * What a settings screen shows as outstanding, and what the board says under the
 * grid so that a masculine default is never silently shown to someone it is wrong
 * for. Not an error: the language's default is a real wording and the corpus has
 * been printing it all along.
 *
 * **Presence, not validity.** Declining to answer is an answer — it is stored as an
 * empty value and the axis stops being outstanding, because a reader who said
 * "rather not say" has been asked and a line that keeps telling them so is a nag.
 * `variantKey` ignores an empty value exactly as it ignores an unset one, so the
 * wording is the same either way; only the asking stops.
 * @param {SpeakerAxis[]} axes @param {SpeakerProfile} profile
 */
export function unanswered(axes, profile) {
  return axes.filter((axis) => !(axis.axis in profile));
}
