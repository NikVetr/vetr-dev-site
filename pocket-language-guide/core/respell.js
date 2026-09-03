// IPA -> an informal respelling in the reader's own orthography.
//
// This is what turns the respelling column from O(N^2) into O(N). A curated
// respelling is written per *pair* -- `nee HOW` is Chinese for an English reader
// and nothing else -- which is why only 16 of the 272 shipped pairs have one, and
// why the other 256 print an empty column. A transducer needs two O(N) inputs
// instead: the `ipa` column of the language being learned, and one rule table per
// language doing the reading.
//
// The English rule table was not written from a published pronunciation key. It
// was read off the 12,001 hand-curated respellings already in the corpus, which is
// a better source: it records what a human actually chose for each sound in
// context. `scripts/respell_check.mjs` measures any table against them, and
// `content/RESPELL-PILOT.md` has the failure taxonomy. Every other table starts
// from a published key instead -- see `content/RESPELL-SYSTEMS.md`, which found one
// for six of the sixteen and something adaptable for four more -- because those
// readers have no curated sheet to read a table off of.
//
// Agreement is therefore only measurable for an English reader, and only where the
// table has been fitted: 61.9% of the Spanish sheet exactly and 36.1% of the
// Mandarin one, against 1-7% on the twelve targets nobody has fitted yet. A low
// number there means an unwritten rule, not a broken engine.
//
// **Generated respellings sit under the curated ones, never over them.** The
// sixteen curated sheets are not mutually consistent -- Mandarin's /ɕ/ is `sh` 103
// times and `sy` 58 times, with nothing in the IPA to tell them apart -- so no
// deterministic function can match all of them, and the override layer stays
// authoritative wherever it exists.
//
// The engine expects *phonemic* IPA. Normalising a G2P's phonetic detail is the
// generator's job (`scripts/build_ipa.py`), not this module's: an engine that
// second-guesses its input cannot be reasoned about.

/**
 * Vowels, as the syllabifier needs to recognise them.
 *
 * The second row is the nasal vowels that arrive *precomposed*. The corpus is NFC
 * by invariant, and NFC composes a vowel plus U+0303 into a single codepoint --
 * so espeak's `u` + combining tilde is one character here, not two, and without
 * these five Portuguese, French and Hindi mis-syllabify every nasal vowel. `ɐ̃`
 * and `ɛ̃` have no precomposed form and stay decomposed, which the VOWEL_TAIL
 * rule below already handles.
 */
const VOWELS = new Set([
  ...'iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ',
  ...'ãẽĩõũ',
  // The rhotic vowels. Without them `coverage` /kˈʌvɚɹɪdʒ/ syllabifies `ɚ` as a
  // consonant, `onsetClusters` learns `ɚɹ` as something that can open a word, and
  // the break lands mid-nucleus.
  ...'ɚɝ',
]);
const GLIDES = new Set('jwɥ');
/**
 * Length, nasalisation, the non-syllabic mark and tone all belong to their vowel.
 *
 * Tone is here because a Chao letter is otherwise an unknown consonant, and lands
 * in the coda: `ni˧˩˧` parsed as a three-consonant coda, which made every tonal
 * language look as though it had coda clusters. That mattered once `codaConsonants`
 * started asking. Binding them also means `policy.tone: 'keep'` still works, since
 * a rule matching `˧˩˧` matches it inside the nucleus string just as well.
 */
const VOWEL_TAIL = new Set(['ː', 'ˑ', '̃', '̯', ...'˥˦˧˨˩']);

/**
 * The affricates, which the IPA writes with two base letters and this corpus
 * writes without a tie bar.
 *
 * **A phoneme is the unit, not a codepoint.** Everything downstream of
 * `syllabify` inherits its tokenisation, so segmenting by character made /ts/ two
 * consonants and /tɕʰ/ three: Italian *grazie* broke as `grats-ie`, and asking
 * for a one-consonant onset tore /tɕʰ/ in half and left a bare `ʰ` to be spelt on
 * its own. All four rule tables written so far reported it independently.
 */
const AFFRICATES = ['ʈʂ', 'tɕ', 'tʃ', 'ts', 'ɖʐ', 'dʑ', 'dʒ', 'dz', 'pf'];
/**
 * Modifier letters and diacritics that belong to the consonant they follow, the
 * way `VOWEL_TAIL` belongs to its vowel: aspiration, palatalisation,
 * labialisation, pharyngealisation, ejectives, the dental and apical marks, the
 * Korean tense mark and the unreleased mark.
 */
const CONSONANT_TAIL = new Set([
  ...'ʰʱʲʷˤˠˀʼ',
  ...['\u0329', '\u032A', '\u033A', '\u0348', '\u031A', '\u0325', '\u032C', '\u0339', '\u031C'],
]);

/**
 * Split an IPA word into phonemes: an affricate digraph, or a base character plus
 * whatever modifiers bind to it.
 * @param {string} ipa
 * @returns {string[]}
 */
export function phonemesOf(ipa) {
  /** @type {string[]} */ const out = [];
  for (let i = 0; i < ipa.length;) {
    const pair = AFFRICATES.find((a) => ipa.startsWith(a, i));
    let unit = pair ?? ipa[i];
    i += unit.length;
    // A modifier binds to a consonant, not to a tone letter or a length mark:
    // Vietnamese writes a glottalised tone `˩ˀ`, and gluing the two together left
    // a unit that `VOWEL_TAIL` no longer recognised, so the tone became a coda
    // consonant again -- the exact thing binding it was meant to stop.
    if (!VOWEL_TAIL.has(unit)) {
      while (i < ipa.length && CONSONANT_TAIL.has(ipa[i])) { unit += ipa[i]; i += 1; }
    }
    out.push(unit);
  }
  return out;
}
/**
 * Chao tone letters. Tone is lexical in Mandarin, Thai and Vietnamese, so the
 * `ipa` column carries it -- but whether a *reader* is shown it is the reading
 * language's decision, which is why it is a `policy` switch rather than absent
 * from the data. All four curated tonal sheets drop it: an English reader given
 * `nee˧˩˧ how˧˩˧` reads neither the word nor the tone.
 */
const TONE = /[\u02E5-\u02E9]/g;
/** @type {Record<string,number>} */
const STRESS = { 'ˈ': 1, 'ˌ': 2 };

/**
 * Which letters a diacritic stress mark can land on, in any of the scripts that
 * use one. Includes `y` and `w`, which spell a nucleus in several of these
 * orthographies, and the already-accented forms so a second mark is not stacked.
 *
 * The Cyrillic vowels are here because Russian's device *is* the acute -- знак
 * ударения -- and without them `stress: 'acute'` was byte-identical to
 * `stress: 'none'` for the whole language: the pattern matched nothing and the
 * string came back untouched on all 11,788 rows. `й` and `ь` are deliberately
 * absent, being a glide and a soft sign rather than vowels.
 */
const VOWEL_LETTERS = /[aeiouáéíóúàèìòùâêîôûäëïöüãõywаеёиоуыэюя]+/iu;
/**
 * Letters that already carry the mark, so a second one would produce a character
 * no orthography has. `ё` is here because it is *inherently* stressed in Russian --
 * an unstressed `ё` does not exist -- so the acute on it is redundant, and at 4.4pt
 * it lands directly on top of the diaeresis.
 */
const ACCENTED = /[áéíóúàèìòùё]/i;

/**
 * Put an acute on one end of the syllable's vowel run.
 *
 * Which end is not a matter of taste. A *rising* diphthong is marked on its
 * second element and a *falling* one on its first -- Spanish writes `bién` and
 * `géisha` -- so the same syllable shape takes the mark in opposite places
 * depending on where the nucleus head is. Marking the last letter throughout gave
 * `he-loú` for `hello`, which reads as three syllables ending in a stressed /u/.
 *
 * `VOWEL_LETTERS` is generous on purpose, because `y` and `w` spell a nucleus in
 * several of these orthographies -- so a vowel letter in the run can belong to the
 * *onset* instead, and marking a falling diphthong then landed on it:
 * `est-rang-ýei-rus`, where `y` is the consonant /ʝ/, and `pa-gúei`, where the `u`
 * is the silent half of Spanish's `gue`. Hence `from`: the emitted text is onset
 * then nucleus then coda, so the nucleus begins at a known offset and the search
 * starts there. Guessing from the letter cannot work -- the English table spells
 * /aɪ/ `ye`, where the `y` *is* the head.
 * @param {string} text
 * @param {boolean} head  accent the first letter of the run, not the last
 * @param {number} from   where the nucleus begins
 */
function acute(text, head, from) {
  const onset = text.slice(0, from);
  return onset + text.slice(from).replace(VOWEL_LETTERS, (run) => {
    const i = head ? 0 : run.length - 1;
    // Already accented, either by the phoneme table or by the orthography itself:
    // a second mark would produce a character no orthography has.
    if (ACCENTED.test(run[i])) return run;
    return run.slice(0, i) + `${run[i]}\u0301`.normalize('NFC') + run.slice(i + 1);
  });
}

/**
 * The stress devices a reader's own orthography already has. `caps` is the
 * fallback for a Latin script with no native mark, and is what eleven of the
 * curated sheets use; `acute` is the native device in Spanish, Italian,
 * Portuguese and Russian, where capitals would read as an abbreviation; `prime`
 * is Bhargava's notation for Hindi, whose script is caseless and has no accent.
 *
 * @type {Record<string, (text: string,
 *   at: {locale: string, falling: boolean, nucleusAt: number}) => string>}
 */
const STRESS_DEVICE = {
  caps: (text, at) => text.toLocaleUpperCase(at.locale),
  acute: (text, at) => acute(text, at.falling, at.nucleusAt),
  prime: (text) => `${text}\u02b9`,
};

/**
 * A voiced fricative that is a stop's allophone counts as that stop when deciding
 * what may open a syllable. Without this, Spanish `hablar` -- which espeak gives
 * as `aβlaɾ` -- syllabifies as `ahb-LAR` instead of `ah-BLAR`.
 */
/** @type {Record<string,string>} */
const ALLOPHONE = { β: 'b', ð: 'd', ɣ: 'ɡ', ʋ: 'v' };
const fold = (/** @type {string} */ ph) => ALLOPHONE[ph] ?? ph;

/**
 * @typedef {Object} Syllable
 * @property {string} onset
 * @property {string} nucleus
 * @property {string} coda
 * @property {number} stress  1 primary, 2 secondary, 0 none
 */

/**
 * Which consonant clusters may open a syllable, read off the language's own IPA:
 * **whatever can open a word can open a syllable.**
 *
 * That one observation replaces a hand-curated phonotactic table per language.
 * Spanish gets `pɾ bl tɾ` and correctly does not get `st`, so `está` breaks as
 * `es-TA` rather than `e-STA`; German would get `ʃt` from the same procedure.
 * @param {Iterable<string>} words  IPA words from the target's own corpus
 * @returns {Set<string>}
 */
export function onsetClusters(words) {
  /** @type {Set<string>} */ const out = new Set();
  for (const ipa of words) {
    /** @type {string[]} */ const run = [];
    for (const unit of phonemesOf(ipa)) {
      if (unit in STRESS || VOWEL_TAIL.has(unit)) continue;
      if (VOWELS.has(unit[0]) || GLIDES.has(unit)) break;
      run.push(fold(unit));
    }
    // Two and three *phonemes*, so /tɕʰ/ is one unit rather than a three-consonant
    // cluster and /ts/ is not mistaken for /t/ plus /s/.
    for (const k of [2, 3]) if (run.length >= k) out.add(run.slice(0, k).join(''));
  }
  // **No count threshold here, and that is measured rather than assumed.**
  // `phonemeInventory` has one, so the symmetry is tempting: four Arabic rows that
  // lost their short vowels to the G2P begin `lls` and `mkbr`, which teaches the
  // engine that Arabic opens words with /lm/ and /lb/. But requiring three
  // occurrences costs the Spanish sheet four points of agreement -- 62.1% to 58.1%
  // -- by dropping genuine clusters that happen to be word-initial only twice, and
  // it does not rescue the Arabic rows, which have no vowels to syllabify either
  // way. A cluster is a claim about what is *possible*, where a phoneme inventory
  // is a claim about what is *usual*, so one sighting is enough for the first and
  // not for the second.
  return out;
}

/**
 * Syllabify an IPA word: nucleus spans first, then onset maximisation over the
 * cluster table.
 *
 * `maxOnset` exists because onset maximisation is a claim about the *reader*, not
 * about the target. It is right for most, and wrong for Turkish, where the TDK
 * prescribes `prog-ram` over `pro-gram` for exactly the Western vocabulary this
 * corpus is full of -- so a Turkish reader shown `pro-gram` is being shown a
 * syllabification their own orthography rejects.
 * @param {string} ipa
 * @param {Set<string>} clusters
 * @param {number} [maxOnset]  how many consonants may open a non-initial syllable
 * @returns {Syllable[]}
 */
export function syllabify(ipa, clusters = new Set(), maxOnset = 3) {
  /** @type {[string, number][]} */ const units = [];
  let pending = 0;
  for (const unit of phonemesOf(ipa)) {
    if (unit in STRESS) { pending = STRESS[unit]; continue; }
    // Length and nasalisation attach to the vowel they follow.
    if (VOWEL_TAIL.has(unit)) {
      if (units.length) units[units.length - 1][0] += unit;
      continue;
    }
    units.push([unit, pending]);
    pending = 0;
  }

  const ph = units.map(([p]) => p);
  const n = ph.length;
  // A word with no vowel is one all-onset syllable, which is what a bare
  // consonant cluster or a stray symbol should become rather than nothing.
  if (!ph.some((p) => VOWELS.has(p[0]))) {
    return [{ onset: ph.join(''), nucleus: '', coda: '', stress: 0 }];
  }

  // A vowel plus its *falling* glides. A glide between two vowels is rising, so
  // it opens the second syllable rather than closing the first.
  /** @type {[number, number][]} */ const spans = [];
  for (let i = 0; i < n;) {
    if (!VOWELS.has(ph[i][0])) { i += 1; continue; }
    let hi = i;
    while (hi + 1 < n && (GLIDES.has(ph[hi + 1]) || 'ɪʊ'.includes(ph[hi + 1][0]))) hi += 1;
    while (hi > i && GLIDES.has(ph[hi]) && hi + 1 < n && VOWELS.has(ph[hi + 1][0])) hi -= 1;
    spans.push([i, hi]);
    i = hi + 1;
  }
  const taken = new Set(spans.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)));
  for (const span of spans) {
    while (span[0] - 1 >= 0 && GLIDES.has(ph[span[0] - 1]) && !taken.has(span[0] - 1)) {
      span[0] -= 1;
      taken.add(span[0]);
    }
  }

  /** @type {number[]} */ const cuts = [];
  for (let s = 0; s + 1 < spans.length; s += 1) {
    /** @type {number[]} */ const inter = [];
    for (let j = spans[s][1] + 1; j < spans[s + 1][0]; j += 1) inter.push(j);
    const at = (/** @type {number} */ k) => inter.slice(-k).map((j) => fold(ph[j])).join('');
    if (!inter.length) cuts.push(spans[s + 1][0]);
    // One consonant between two vowels opens the next syllable. That is right for
    // `ca-sa` and wrong wherever a syllable is also a morpheme -- Mandarin 翻译
    // comes out `fa-ni` rather than `fan-i`, and for a reader whose script spells a
    // consonant with its vowel that changes the characters, not just a hyphen.
    //
    // **Deriving the exception was tried and measured, and does not work.** The
    // proposal was the mirror of the cluster rule -- whatever can close a word can
    // close a syllable -- gated on the language having no coda clusters, on the
    // theory that a CV(C) language's final consonant is lexical. Forced on it takes
    // Mandarin from 63.5% to 66.4% agreement and Spanish from 62.1% to **20.9%**,
    // so the gate is load-bearing; but the coda-cluster rate does not select the
    // right languages (Thai 65%, Vietnamese 66% and Mandarin 25% are the *highest*
    // here, Japanese 0.02% and Korean 0.03% the lowest -- it measures how the G2P
    // transcribed the language, not its phonotactics). Gating on the writing system
    // instead selects `zh-Hans ja ko th`, and Korean then *loses* 0.4 points. Only
    // Mandarin wants it, so there is no typological fact to derive: it needs a
    // per-target claim the engine is not given, and one language does not earn a
    // new concept.
    else if (inter.length === 1) cuts.push(inter[0]);
    else if (maxOnset >= 3 && inter.length > 2 && clusters.has(at(3))) cuts.push(inter[inter.length - 3]);
    else if (maxOnset >= 2 && clusters.has(at(2))) cuts.push(inter[inter.length - 2]);
    else cuts.push(inter[inter.length - 1]);
  }

  const bounds = [0, ...cuts, n];
  return spans.map((span, s) => {
    const [from, to] = [bounds[s], bounds[s + 1]];
    const chunk = units.slice(from, to);
    const lo = span[0] - from;
    const hi = span[1] - from;
    return {
      onset: chunk.slice(0, lo).map(([p]) => p).join(''),
      nucleus: chunk.slice(lo, hi + 1).map(([p]) => p).join(''),
      coda: chunk.slice(hi + 1).map(([p]) => p).join(''),
      stress: Math.max(0, ...chunk.map(([, st]) => st)),
    };
  });
}

/**
 * Every one-to-three-symbol string the target's own IPA contains at least
 * `minCount` times, so a rule can ask *"does this language have /pʰ/"* or *"can
 * its /ŋ/ end a word"* (`ŋ#`).
 *
 * This is the single most load-bearing idea in the rule format. Spanish /p t k/
 * must be written `p t k` and Mandarin's must be written `b d g` -- the same IPA
 * symbols, the opposite output -- and the discriminator is typological rather than
 * curated: a language that contrasts /p/ with /pʰ/ has no voiced stop for `b` to
 * collide with. One table serves both, with no per-language flag. Getting it wrong
 * cost thirty percentage points of agreement before it was found.
 *
 * The threshold is why one loanword cannot invent a phoneme: Spanish has exactly
 * one word-final /ŋ/, in `roaming`, against thirty-four pre-velar ones.
 * @param {Syllable[][]} words
 * @param {number} minCount
 * @returns {Set<string>}
 */
export function phonemeInventory(words, minCount = 3) {
  /** @type {Map<string, number>} */ const seen = new Map();
  for (const syllables of words) {
    // `#` at both ends, so a rule can ask *where* a phoneme occurs and not only
    // whether it exists. That distinction is the difference between a phoneme and
    // an allophone: Korean's `ipa` carries `b d ɡ` from Revised Romanization, but
    // never word-initially, because they are the intervocalic realisations of the
    // lenis series -- while Thai has 41 word-initial `b` and Hindi 123, where they
    // are contrastive. `unless_inventory: "#b #d #ɡ"` separates the two, which no
    // test for bare presence can.
    const t = `#${syllables.map((s) => s.onset + s.nucleus + s.coda).join('')}#`;
    for (let i = 0; i < t.length; i += 1) {
      for (const k of [1, 2, 3]) {
        if (i + k > t.length) continue;
        const key = t.slice(i, i + k);
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }
  return new Set([...seen].filter(([, v]) => v >= minCount).map(([k]) => k));
}

/** @param {any} rule @param {Set<string>} inventory */
function inventoryHolds(rule, inventory) {
  const need = rule.if_inventory;
  const forbid = rule.unless_inventory;
  if (need && !need.split(' ').every((/** @type {string} */ x) => inventory.has(x))) return false;
  if (forbid && forbid.split(' ').some((/** @type {string} */ x) => inventory.has(x))) return false;
  return true;
}

/** @param {any} rule @param {Record<string,any>} ctx @param {string} emitted */
function holds(rule, ctx, emitted) {
  if (rule.if_nucleus && !rule.if_nucleus.split(' ').includes(ctx.nucleus)) return false;
  if (rule.before_onset && !rule.before_onset.split(' ').includes(ctx.nextOnset.slice(0, 1))) return false;
  if (rule.after_nucleus && !rule.after_nucleus.split(' ').includes(ctx.prevNucleus)) return false;
  for (const w of rule.when ?? []) {
    const negated = w.startsWith('not_');
    if (ctx[negated ? w.slice(4) : w] === negated) return false;
  }
  if (rule.after_out && !rule.after_out.split(' ').some((/** @type {string} */ x) => emitted.endsWith(x))) {
    return false;
  }
  return true;
}

/**
 * Spell one slot of one syllable, longest IPA match first.
 * @param {string} ipa @param {string} slot @param {any[]} phonemes
 * @param {Record<string,any>} ctx @param {string} emitted  what this syllable has
 *   already produced, which some rules condition on
 */
function spellSlot(ipa, slot, phonemes, ctx, emitted = '') {
  const head = emitted.length;
  let out = emitted;
  for (let i = 0; i < ipa.length;) {
    const rule = phonemes.find((r) => (r.slot === slot || r.slot === 'any')
      && ipa.startsWith(r.ipa, i) && holds(r, ctx, out));
    if (rule) {
      out += rule.out;
      i += rule.ipa.length;
    } else {
      // An unmapped symbol passes through rather than vanishing, so a gap in the
      // table shows up on the card instead of silently shortening a word.
      out += ipa[i];
      i += 1;
    }
  }
  return out.slice(head);
}

/**
 * Break a rising diphthong out into its own syllable, because an English reader
 * cannot read one inside an onset: /sja/ is given as `see-ah`.
 * @param {Syllable[]} syllables @param {any[]} splits
 */
function applySplits(syllables, splits) {
  /** @type {Syllable[]} */ const out = [];
  for (let s of syllables) {
    for (const rule of splits) {
      if (!s.onset || !s.nucleus.startsWith(rule.glide)) continue;
      if (rule.only_after && !rule.only_after.split(' ').includes(s.onset)) continue;
      if ((rule.except_after ?? '').split(' ').includes(s.onset)) continue;
      out.push({ onset: s.onset, nucleus: rule.glide === 'j' ? 'i' : 'u', coda: '', stress: 0 });
      s = { ...s, onset: '', nucleus: s.nucleus.slice(1) };
      break;
    }
    out.push(s);
  }
  return out;
}

/**
 * A respeller for one reader's language, bound to one language being learned.
 *
 * The binding matters: the rule table is target-independent, but three of its
 * predicates ask about the *target's* phoneme inventory and its syllable-opening
 * clusters, both of which are derived here from the target's own `ipa` column.
 *
 * @param {Object} config
 * @param {any} config.rules  a `data/respell/rules/<source>__<accent>.json`
 * @param {string[]} config.targetIpa  every IPA string the target language has, so
 *   its inventory and phonotactics can be read off it
 * @param {string} [config.target]  the target's code, for the `targets` block
 */
export function createRespeller({ rules, targetIpa, target = '' }) {
  const maxOnset = rules.policy?.max_onset ?? 3;
  /**
   * A cluster has to be legal for *both* sides. The table is read off the target,
   * which answers "can this language open a word this way" and not "can my reader
   * read it" -- so a Spanish reader was shown `an-der-stánd` and `hój-shtul`,
   * onsets no Spanish speaker can begin and will repair unpredictably. Dropping to
   * one consonant fixes those and costs the 333 C+liquid onsets Spanish *does*
   * admit, giving `práb-lem` for `prá-blem`. Naming the reader's own clusters is
   * what gets both: the RAE's *división de palabras* list is thirteen groups long.
   *
   * The list is IPA, not output letters, because it is intersected with the
   * target's table -- and so it carries both rhotics, since German writes `pɾ`
   * where Russian writes `pr`.
   */
  const reader = (rules.policy?.reader_onsets ?? '').split(' ').filter(Boolean);
  const clusters = onsetClusters(targetIpa.flatMap((s) => s.split(/\s+/)).filter(Boolean));
  if (reader.length) for (const c of clusters) if (!reader.includes(c)) clusters.delete(c);
  const words = targetIpa
    .flatMap((s) => s.split(/\s+/))
    .filter(Boolean)
    .map((w) => syllabify(w, clusters, maxOnset));
  const inventory = phonemeInventory(words);


  // A handful of rules cannot be expressed against the target's inventory and have
  // to name it: Mandarin needs `ah` for /a/ where every other language wants the
  // conditional `a`/`ah` split. Target rules go *first*, so they win.
  const only = (rules.targets ?? {})[target] ?? {};

  // A rule whose inventory condition fails can never fire, so drop it once here
  // rather than testing it per syllable. Then sort by IPA length, because
  // "longest match wins" is a property of the table and not of the order someone
  // happened to write it in -- an unsorted list silently spells /tɕʰ/ as /t/.
  const phonemes = [...(only.phonemes ?? []), ...(rules.phonemes ?? [])]
    .filter((/** @type {any} */ r) => inventoryHolds(r, inventory))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => b.ipa.length - a.ipa.length);
  // A fixup's `out` writes backreferences as `\1`, which is the convention in
  // `content/RESPELL-PILOT.md` and in every table written against it. JS spells
  // them `$1`, and silently emits the literal text for `\1` -- so a table written
  // to the documented format put `\1gh\2` on the card instead of `ghee`.
  const fixups = [...(only.syllable_fixups ?? []), ...(rules.syllable_fixups ?? [])]
    .filter((/** @type {any} */ f) => inventoryHolds(f, inventory))
    .map((/** @type {any} */ f) => ({
      ...f, re: new RegExp(f.match), out: f.out.replace(/\\(\d)/g, '$$$1'),
    }));
  const splits = only.splits ?? rules.splits ?? [];
  const policy = { stress: 'none', stress_min_syllables: 2, length: 'none', tone: 'keep',
    syllable_separator: '-', word_separator: ' ', max_onset: 3, fixups: 'first',
    locale: rules.source ?? 'en', ...(rules.policy ?? {}), ...(only.policy ?? {}) };
  const stressDevice = STRESS_DEVICE[policy.stress];

  /** @param {Syllable[]} syllables */
  const word = (syllables) => {
    const syls = applySplits(syllables, splits);
    return syls.map((s, i) => {
      const ctx = {
        word_initial: i === 0,
        word_final: i === syls.length - 1,
        open: !s.coda,
        closed: Boolean(s.coda),
        has_onset: Boolean(s.onset),
        no_onset: !s.onset,
        stressed: s.stress === 1,
        unstressed: s.stress !== 1,
        nucleus: s.nucleus,
        nextOnset: syls[i + 1]?.onset ?? '',
        prevNucleus: syls[i - 1]?.nucleus ?? '',
      };
      let text = spellSlot(s.onset, 'onset', phonemes, ctx);
      // Where the nucleus starts, which is what a diacritic device needs: `y` and
      // `w` are vowel letters, so an onset can put one into the run the mark would
      // otherwise land on.
      const nucleusAt = text.length;
      text += spellSlot(s.nucleus, 'nucleus', phonemes, ctx, text);
      text += spellSlot(s.coda, 'coda', phonemes, ctx, text);
      // **A syllable is composed, not concatenated.** For every alphabetic reader
      // this line does nothing. For Hangul it is the difference between a rule
      // table and a lookup table: the three slots are exactly Korean's
      // 초성/중성/종성, so a table that emits conjoining jamo gets precomposed
      // syllable blocks for free -- and a 받침 becomes expressible at all, where
      // concatenation could only reach it by enumerating initial x vowel x final,
      // some 2,800 entries. It also composes a Devanagari nukta and a kana
      // dakuten, both of which the corpus writes precomposed.
      //
      // It has to happen here rather than in a renderer, because `charset.json`
      // and `subset_fonts.py` build the font subset from what this emits: jamo in
      // the output would ship jamo glyphs and leave the composed syllable out of
      // the subset, where the PDF has no system font to fall back to.
      text = text.normalize('NFC');
      for (const f of fixups) {
        // The syllable's own text, not `''`: a fixup's `after_out` asks what this
        // syllable has emitted so far, and against an empty string every such
        // condition was false, so the rule silently never fired.
        if (!holds(f, ctx, text)) continue;
        const next = text.replace(f.re, f.out);
        if (next === text) continue;
        text = next;
        // One fixup per syllable is the default, and it is the right one for a
        // table whose fixups are alternative repairs. A table whose fixups are a
        // transliteration chart needs every one of them: the kana table has to
        // contract an onset *and* a coda in the same syllable, and worked around
        // it with nineteen precomposed coda rules that only cover this corpus.
        if (policy.fixups !== 'all') break;
      }
      // Length is a policy switch rather than data, because the respelling is
      // generated: a reader who does not want it simply gets the plain form. The
      // Japanese sheet already invented this convention by hand, doubling a letter
      // on 285 of its 286 long-vowel rows.
      if (/ː/.test(s.nucleus + s.coda)) {
        // Against `VOWEL_LETTERS` rather than `[aeiou]`, which made both of these
        // silent no-ops in every script but Latin.
        if (policy.length === 'double') text = text.replace(VOWEL_LETTERS, '$&$&');
        // Turkish writes length with a colon rather than by doubling, because a
        // doubled vowel there is read as two syllables.
        else if (policy.length === 'colon') text = text.replace(VOWEL_LETTERS, '$&:');
      }
      const marked = s.stress === 1 && syls.length >= policy.stress_min_syllables;
      if (!marked || !stressDevice) return text;
      // The nucleus carries the answer to which end the mark goes on: a falling
      // diphthong is a vowel followed by a glide or by one of the two lax vowels
      // `syllabify` absorbs, and its head is therefore the first element.
      const tail = [...s.nucleus].filter((c) => !VOWEL_TAIL.has(c)).pop() ?? '';
      const falling = s.nucleus.length > 1 && (GLIDES.has(tail) || 'ɪʊ'.includes(tail));
      return stressDevice(text, { locale: policy.locale, falling, nucleusAt });
    }).join(policy.syllable_separator);
  };

  return {
    inventory,
    clusters,
    /**
     * One row's respelling, or `''` if its IPA is missing -- which is not a
     * failure but the normal state of a language whose column is unfilled.
     * @param {string} ipa
     */
    respell(ipa) {
      const raw = (ipa ?? '').trim();
      const trimmed = policy.tone === 'drop' ? raw.replace(TONE, '') : raw;
      if (!trimmed) return '';
      return trimmed
        .split(/\s+/)
        .map((w) => word(syllabify(w, clusters, maxOnset)))
        .join(policy.word_separator);
    },
  };
}
