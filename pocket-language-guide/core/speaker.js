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
 * One phrase's wording for this speaker, falling back to the base text.
 *
 * **Refuses an incoming phrase outright.** What the listener taps is theirs to say,
 * and inflecting it for the owner's gender would be putting words in a stranger's
 * mouth — as well as leaking the owner's profile to someone who never asked. Replies
 * are kept naturally neutral in both languages instead, which is a content rule; this
 * is the structural half of it, so the content rule cannot be quietly broken by a
 * caller.
 * @param {object} args
 * @param {string} args.conceptId
 * @param {string} args.base                 the row's own `text`
 * @param {Record<string, Record<string, string>>} args.variants  key -> concept -> text
 * @param {string|null} args.key             from `variantKey`
 * @param {boolean} [args.incoming]          true for anything the listener says
 * @returns {{text:string, varied:boolean}}
 */
export function variantOf({ conceptId, base, variants, key, incoming }) {
  if (incoming || !key) return { text: base, varied: false };
  const said = variants[key]?.[conceptId];
  return said ? { text: said, varied: true } : { text: base, varied: false };
}

/**
 * Which declared axes this reader has actually answered, for a pair.
 *
 * What a settings screen shows as outstanding, and what an honest coverage report
 * counts. An unanswered axis is not an error — the language's default is a real
 * wording, and the corpus has been shipping it all along.
 * @param {SpeakerAxis[]} axes @param {SpeakerProfile} profile
 */
export function unanswered(axes, profile) {
  return axes.filter((axis) => !axis.values.includes(profile[axis.axis]));
}
