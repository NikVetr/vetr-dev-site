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
/**
 * Tested on a phoneme's *base* character, like `VOWELS`, because a modifier does
 * not stop a glide being one: Vietnamese writes a glottalised offglide `jˀ`, and
 * matching the whole unit left it a coda consonant, so `t̪aːjˀ` syllabified as
 * though it ended in a stop.
 */
const GLIDES = new Set('jwɥ');
const isGlide = (/** @type {string} */ unit) => GLIDES.has(unit[0]);
/**
 * U+032F says "this vowel is not a syllable", which makes it an offglide by
 * definition -- so it belongs to the nucleus before it and can never start one.
 * Thai writes `ua̯ ia̯ ɯa̯` and they were splitting into two syllables apiece,
 * inflating a monosyllabic language's syllable count on 152 rows.
 *
 * `includes`, not `endsWith`, and for the same reason `isGlide` reads only the base
 * character: the mark is not the last thing on the unit once something else binds
 * after it. A Chao tone letter does, and it is bound before the spans are computed,
 * so `tɕʰua̯j˥˩` stopped matching and Thai's centring diphthongs split again -- but
 * only for a reader whose table *keeps* tone, since a dropping one strips the letter
 * before tokenisation. That is why the 152 rows this was written to fix came back on
 * exactly the two tables that keep it.
 */
const offglide = (/** @type {string} */ unit) => unit.includes('\u032F');
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
 * The last phoneme of a nucleus, ignoring length, nasalisation, the non-syllabic
 * mark and tone -- all of which belong to the vowel in front of them rather than
 * being one of their own.
 *
 * Phonemes, not characters, and that is the whole reason this is a function. The
 * character form -- filter `VOWEL_TAIL` out and take the last one -- reads
 * Vietnamese `aːjˀ` as `ˀ`, because a glottalisation mark is a `CONSONANT_TAIL`
 * member and so survives the filter as a unit of its own. That made a falling
 * diphthong look flat, so the length mark went on the offglide instead of on the
 * head: `lại` /laːjˀ/ printed `laii` for an Italian, Swahili or Turkish reader and
 * `bau:` for a German one, doubling the short half of a long vowel on 43 rows.
 * @param {string} nucleus
 */
const nucleusTail = (nucleus) => phonemesOf(nucleus).filter((p) => !VOWEL_TAIL.has(p)).pop() ?? '';
/**
 * Chao tone letters. Tone is lexical in Mandarin, Thai and Vietnamese, so the
 * `ipa` column carries it -- but whether a *reader* is shown it is the reading
 * language's decision, which is why it is a `policy` switch rather than absent
 * from the data. All four curated tonal sheets drop it: an English reader given
 * `nee˧˩˧ how˧˩˧` reads neither the word nor the tone.
 */
const TONE = /[\u02E5-\u02E9]/g;
/** The same set, to test one character at a time. */
const isTone = (/** @type {string} */ ch) => ch >= '\u02E5' && ch <= '\u02E9';
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
 *
 * Dotless `ı` is here for the same reason and is easy to miss: the `i` flag does
 * not fold it to `i`, since `ı` <-> `I` is a Turkish-locale mapping rather than a
 * Unicode default. Without it both length devices were silent no-ops on Turkish's
 * /ɯː əː ɤː/. **A new table using `stress: 'acute'` or `length` should check its
 * own vowels are in here before designing around the behaviour.**
 */
const VOWEL_LETTERS = /[aeiouáéíóúàèìòùâêîôûäëïöüãõẽĩũıywаеёиоуыэюя]+/iu;
/**
 * Letters that already carry the mark, so a second one would produce a character
 * no orthography has.
 *
 * `ё` is here because it is *inherently* stressed in Russian -- an unstressed `ё`
 * does not exist -- so the acute on it is redundant, and at 4.4pt it lands directly
 * on top of the diaeresis. The tilde and circumflex vowels are the same case in
 * Portuguese: *irmã*, *pão* and *jardim* carry the stress in the nasal itself and
 * Portuguese never stacks a mark on a tilde, so 59 rows were printing `ã-fã́` and
 * `a-nṍs`.
 */
const ACCENTED = /[áéíóúàèìòùёãõẽĩũâêîôû]/i;
/** A mark of either kind, for stripping one back off. */
const MARKS = /[\u0300-\u036f]/gu;

/**
 * Put a mark on the one letter of the nucleus that carries it.
 *
 * **Which letter is not a matter of taste, and it is the same question for both
 * devices that ask it.** A *falling* diphthong takes the mark on its first element
 * and a *rising* one on its second, because that is where the head is: Spanish
 * writes `géisha` and `bién`, and the TDK writes `da:y` and `kya:`. Marking one end
 * throughout gets the other half wrong -- always-last gave `he-loú` for `hello`,
 * a stressed /u/ in a syllable that is not there, and always-first gave `ky:a` for
 * क्या, which asks a Turkish reader to lengthen a consonant.
 *
 * `from` exists because `VOWEL_LETTERS` is generous on purpose -- `y` and `w` spell
 * a nucleus in several of these orthographies -- so a vowel letter in the run can
 * belong to the *onset* instead, and marking a falling diphthong then landed on it:
 * `est-rang-ýei-rus`, where `y` is the consonant /ʝ/, and `pa-gúei`, where the `u`
 * is the silent half of Spanish's `gue`. The emitted text is onset then nucleus
 * then coda, so the nucleus begins at a known offset and the search starts there.
 * Guessing from the letter cannot work: the English table spells /aɪ/ `ye`, where
 * the `y` *is* the head.
 * @param {string} text
 * @param {number} from   where the nucleus begins
 * @param {number} to     where the coda begins, so the run cannot escape into it
 * @param {number} at     which letter of the run; negative counts from the end
 * @param {(letter: string) => string} mark
 */
function markNucleus(text, from, to, at, mark) {
  // Bounded at both ends. With only a start, the `VOWEL_LETTERS` run could carry on
  // past the nucleus into the coda -- `w` and `y` are vowel letters, so a coda /v/
  // spelt `w` pulled the German length mark off the vowel entirely (`IW:-ning` for
  // *evening*), and Turkish had sixteen marks land on a coda glide.
  const head = text.slice(0, from);
  const nucleus = text.slice(from, to);
  const coda = text.slice(to);
  return head + nucleus.replace(VOWEL_LETTERS, (run) => {
    const i = Math.min(Math.max(at < 0 ? run.length + at : at, 0), run.length - 1);
    return run.slice(0, i) + mark(run[i]) + run.slice(i + 1);
  }) + coda;
}

/**
 * The stress devices a reader's own orthography already has. `caps` is the
 * fallback for a Latin script with no native mark, and is what eleven of the
 * curated sheets use; `acute` is the native device in Spanish, Italian,
 * Portuguese and Russian, where capitals would read as an abbreviation; `prime`
 * is Bhargava's notation for Hindi, whose script is caseless and has no accent.
 *
 * @type {Record<string, (text: string,
 *   at: {locale: string, head: number, nucleusAt: number, codaAt: number}) => string>}
 */
const STRESS_DEVICE = {
  caps: (text, at) => text.toLocaleUpperCase(at.locale),
  // Italian's default, and not interchangeable with the acute: `città`, `così`,
  // `più` -- `á í ú` occur in no Italian word, and 8,930 of that table's 12,923
  // marks land on one of those three letters. The acute is available there only on
  // `é ó`, which is a choice a table makes in its own rules.
  grave: (text, at) => markNucleus(text, at.nucleusAt, at.codaAt, at.head,
    (c) => (ACCENTED.test(c) ? c : `${c}\u0300`.normalize('NFC'))),
  // Already accented, either by the phoneme table or by the orthography itself --
  // Portuguese and French both write accents of their own, and `ё` is inherently
  // stressed -- so a second mark would produce a character no orthography has.
  acute: (text, at) => markNucleus(text, at.nucleusAt, at.codaAt, at.head,
    (c) => (ACCENTED.test(c) ? c : `${c}\u0301`.normalize('NFC'))),
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
      if (VOWELS.has(unit[0]) || isGlide(unit)) break;
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
      // A tone letter follows the whole *syllable*, not the segment before it, so
      // attaching it to the previous unit put it on the coda consonant: `tɕʰiŋ˧˩˧`
      // gave a coda of `ŋ˧˩˧`, which is four phonemes wearing a trench coat. It
      // belongs to the nucleus, which is also where a reader who writes tone --
      // Vietnamese is the only one -- wants the diacritic to land.
      let at = units.length - 1;
      while (isTone(unit) && at >= 0 && !VOWELS.has(units[at][0][0])) at -= 1;
      if (at >= 0) units[at][0] += unit;
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
    if (!VOWELS.has(ph[i][0]) || offglide(ph[i])) { i += 1; continue; }
    let hi = i;
    while (hi + 1 < n) {
      const next = ph[hi + 1];
      if (!isGlide(next) && !offglide(next) && !'ɪʊ'.includes(next[0])) break;
      // **A glide with a vowel on both sides opens the next syllable rather than
      // closing this one.** The span used to grow greedily and only retract if it
      // *ended* on a glide, so `V glide V` collapsed into one nucleus and the
      // boundary between two syllables was lost. Four tables reported it
      // independently: 借用 /tɕjɛjʊŋ/ came out as one syllable for a Japanese,
      // Russian, Turkish and Indonesian reader alike, and Russian -ние and Turkish
      // *miyim* lost a vowel each.
      if (isGlide(next) && hi + 2 < n && VOWELS.has(ph[hi + 2][0])) break;
      hi += 1;
    }
    while (hi > i && isGlide(ph[hi]) && hi + 1 < n && VOWELS.has(ph[hi + 1][0])) hi -= 1;
    spans.push([i, hi]);
    i = hi + 1;
  }
  const taken = new Set(spans.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)));
  for (const span of spans) {
    while (span[0] - 1 >= 0 && isGlide(ph[span[0] - 1]) && !taken.has(span[0] - 1)) {
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
    // **The exception was implemented twice, measured, and rejected both times.**
    // The proposal is the mirror of the cluster rule -- whatever can close a word
    // can close a syllable -- gated on the language rarely ending a syllable with
    // two consonants, on the theory that a CV(C) language's final consonant is
    // lexical. It works: the gate leaves Spanish at 62.1% and Mandarin gains 2.9
    // points, 63.5% to 66.4%, which is real because the curated Mandarin sheet
    // keeps Mandarin's own boundaries. But Korean loses 0.4 and Swahili 0.9, for a
    // corpus-wide net of +0.1%, and it needs a tuned threshold: the distribution
    // is `ja` 0.02%, `ko` 0.03%, `th` 0.03%, `sw` 0.06%, `vi` 0.10%, `zh-Hans`
    // 0.13%, then `it` 0.34% and up to `de` 9.97%, so the gate sits in a 2.6x gap
    // and nowhere else. One language gaining three points does not pay for a magic
    // constant that two languages pay for.
    //
    // Two earlier numbers for this are wrong and are corrected here. An absolute
    // "no coda clusters" gate disqualifies all seventeen, since the floor is 0.02%
    // rather than 0. And a first measurement that put Thai at 65% and Vietnamese
    // at 66% was an artifact of Chao tone letters being parsed as coda consonants
    // -- the bug this proposal surfaced and `VOWEL_TAIL` now fixes.
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
 * Every two- or three-phoneme consonant run the target has *anywhere*, not only at
 * the start of a word.
 *
 * `onsetClusters` reads what can open a *word*, which is the right question for
 * onset maximisation and the wrong one for `policy.reader_onsets`: a reader whose
 * own orthography opens syllables with `mb nd nj ng` cannot be given them if no
 * word in the target happens to begin that way. Swahili is the case -- only Arabic
 * has a word-initial `mb`, so five prenasal onsets survived the intersection and a
 * nasal was split from its own obstruent on 735 boundaries, which is exactly what
 * BAKITA's division rules forbid.
 *
 * The count threshold is what keeps the addition honest: it will not invent `mb`
 * for a language that does not have the sequence at all.
 * @param {Iterable<string>} words  IPA words from the target's own corpus
 * @param {number} minCount
 * @returns {Set<string>}
 */
export function consonantRuns(words, minCount = 3) {
  /** @type {Map<string, number>} */ const seen = new Map();
  for (const ipa of words) {
    /** @type {string[]} */ let run = [];
    for (const unit of phonemesOf(ipa)) {
      if (unit in STRESS || VOWEL_TAIL.has(unit)) continue;
      if (VOWELS.has(unit[0]) || isGlide(unit) || offglide(unit)) { run = []; continue; }
      run.push(fold(unit));
      for (const k of [2, 3]) {
        if (run.length < k) continue;
        const key = run.slice(-k).join('');
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }
  return new Set([...seen].filter(([, n]) => n >= minCount).map(([k]) => k));
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
  // `if_nucleus` is an exact match on the whole string, which is what a rule wants
  // when it names a specific vowel. "The following vowel is front" is a different
  // question and needs the *head*: asking it with `if_nucleus` meant enumerating
  // 112 nucleus strings and repeating them across seventeen rules, which was 8KB of
  // the Italian table and its only brittle part. Every digraph orthography has this
  // question, since `c` before a front vowel is a different letter.
  if (rule.if_nucleus_head
    && !rule.if_nucleus_head.split(' ').includes(ctx.nucleusHead)) return false;
  // A *phoneme*, not a character: `nextOnset.slice(0, 1)` could never match a
  // two-character aspirate, so a rule written `before_onset: "kʰ"` silently never
  // fired and only looked as though it did.
  if (rule.before_onset && !rule.before_onset.split(' ').includes(ctx.nextPhoneme)) return false;
  if (rule.after_nucleus && !rule.after_nucleus.split(' ').includes(ctx.prevNucleus)) return false;
  // **The vowel on the other side of this syllable's onset**, which is what a
  // script with no way to write a bare vowel has to ask before it can pick a seat
  // for one. Arabic and Thai asked for it independently -- the bar for a change
  // here -- and both had already written the bounded version by hand, as
  // `syllable_fixups` whose `after_nucleus` lists are short monophthongs and
  // nothing else, because that is as far as an exact string reaches. Arabic now
  // writes the standard hamza seat on **148 medial onsetless syllables** that were
  // أ or a doubled glide, 113 of them ئ and 35 ء, over 145 rows and fourteen
  // targets: *SIM* is إِسَيْئِمْ where the exact form could only give إِسَيْيِمْ, a doubled
  // yā' that reads as a geminate. Thai's ย/ว glide seat reaches **28 more**.
  //
  // **The tail, not the head, and it is not a close call.** The mirror of
  // `if_nucleus_head` by *name* is the previous nucleus's first phoneme; the mirror
  // by *position* -- the vowel adjacent to the onset being spelt -- is its last.
  // Over the 3,689 medial onsetless syllables an Arabic reader gets, the head is a
  // *glide* on 208, because `syllabify` pulls a rising diphthong's /j/ or /w/ into
  // the nucleus: after Korean 돼 /wɛ/ the head asks about a labial consonant where
  // the vowel before the seat is front /ɛ/. It is also the wrong half of the 90
  // falling diphthongs, classing /aɪ aʊ eɪ oʊ ɔɪ/ by their onset vowel rather than
  // by the offglide -- and the offglide is what Arabic's own هَيْئَة spells a seat
  // for. The tail is a glide on 8, and all eight want exactly that.
  //
  // It also strips tone, which is not incidental: Thai keeps tone, so its two
  // fixups had been matching a nucleus string that carries a Chao letter and fired
  // on no Mandarin row at all. 14 of the 28 are that bug.
  if (rule.after_nucleus_tail
    && !rule.after_nucleus_tail.split(' ').includes(ctx.prevNucleusTail)) return false;
  // **This syllable's own coda, which a nucleus rule could not see.** `open` and
  // `closed` say whether there is one; `before_onset` sees the *next* syllable's
  // onset. Neither answers "what closes this syllable", and two tables asked for it
  // independently, which is the bar for a change here.
  //
  // Thai needs it because its standard spells a vowel differently before a coda /r/
  // -- `Merhaba` is เม่อ-ฮะ-บะ, not เม่ะ-, which turned out to be **1,948 rows** across
  // twelve targets -- and Hindi needs the same rule to keep English START apart from
  // LOT, where /ɑː/ takes आ before /ɹ/ and ऑ elsewhere: 43 rows are START (*card*,
  // *charge*, *pharmacy*) and 105 are LOT (*not*, *doctor*, *sorry*).
  //
  // `sorry` is the case that settles the shape of this predicate. Its /ɹ/ opens the
  // *next* syllable, so `before_onset` would have caught it and given it the START
  // vowel; only a question about this syllable's own coda gets it right.
  //
  // The head, not the whole coda, because that is what both tables want to ask and a
  // second whole-string form would be built for nobody. `if_coda: ""` is the useful
  // negative -- "nothing closes this syllable" -- so this tests for the key rather
  // than for a truthy value, the same way `after_out: ""` does.
  if (rule.if_coda !== undefined
    && !rule.if_coda.split(' ').includes(ctx.codaHead)) return false;
  for (const w of rule.when ?? []) {
    const negated = w.startsWith('not_');
    if (ctx[negated ? w.slice(4) : w] === negated) return false;
  }
  // `after_out: ""` asks whether this slot has emitted anything yet, which is the
  // "is this the first segment of the syllable" predicate. `when: ["word_initial"]`
  // answers it one level up and so answers it wrongly: in /jsaːɾaː/ the onset is
  // `js`, the /j/ emits its letter, and the /s/ still sees a word-initial syllable
  // -- which for a French reader is the difference between `ss` and an intervocalic
  // `s` read as /z/. Every deep-orthography reader wants this.
  if (rule.after_out === '') return emitted === '';
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
  const spoken = targetIpa.flatMap((s) => s.split(/\s+/)).filter(Boolean);
  const clusters = onsetClusters(spoken);
  if (reader.length) {
    // Intersect, then add back the reader's own clusters that the target has
    // *somewhere* -- see `consonantRuns`. Intersection alone could only ever
    // subtract, so a reader could not be given a cluster its own orthography
    // requires unless a target word happened to begin with it.
    for (const c of clusters) if (!reader.includes(c)) clusters.delete(c);
    const anywhere = consonantRuns(spoken);
    for (const c of reader) if (anywhere.has(c)) clusters.add(c);
  }
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
  // Longest IPA first, and at equal length the *more specific* slot first, because
  // both are properties of the table rather than of the order someone wrote it in.
  // Sorting on length alone left ties to a stable sort, so a `slot: 'any'` rule
  // written earlier in the file shadowed the `slot: 'coda'` override for the same
  // phoneme -- and the shadowed rule never fired, which no output inspection
  // reveals. The kana table lost 99 rows to it: a coda /tʃ/ printed マチュ where
  // the standard's own epenthetic column gives マチ.
  const phonemes = [...(only.phonemes ?? []), ...(rules.phonemes ?? [])]
    .filter((/** @type {any} */ r) => inventoryHolds(r, inventory))
    .sort((/** @type {any} */ a, /** @type {any} */ b) => b.ipa.length - a.ipa.length
      || Number(a.slot === 'any') - Number(b.slot === 'any'));
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
        nextPhoneme: phonemesOf(syls[i + 1]?.onset ?? '')[0] ?? '',
        nucleusHead: phonemesOf(s.nucleus)[0] ?? '',
        codaHead: phonemesOf(s.coda)[0] ?? '',
        prevNucleus: syls[i - 1]?.nucleus ?? '',
        prevNucleusTail: nucleusTail(syls[i - 1]?.nucleus ?? ''),
      };
      let text = spellSlot(s.onset, 'onset', phonemes, ctx);
      // Where the nucleus starts, which is what a diacritic device needs: `y` and
      // `w` are vowel letters, so an onset can put one into the run the mark would
      // otherwise land on.
      const nucleusAt = text.length;
      text += spellSlot(s.nucleus, 'nucleus', phonemes, ctx, text);
      const codaAt = text.length;
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
      // Which letter of the nucleus carries a mark. A *falling* diphthong -- a
      // vowel followed by a glide or by one of the two lax vowels `syllabify`
      // absorbs -- has its head first, a rising one has it last. And a nucleus that
      // both opens and closes with a glide has it in the middle: /waɪ/ is `uai`,
      // where neither end is the vowel, so `úai` marks the /w/.
      const units = phonemesOf(s.nucleus);
      const tail = nucleusTail(s.nucleus);
      const falling = units.length > 1 && (isGlide(tail) || 'ɪʊ'.includes(tail));
      const head = falling ? Number(isGlide(units[0])) : -1;
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
      // **Stress before length**, so that a doubled vowel carries its mark on the
      // first copy: Italian writes `sàari`, not `saári`. The two devices otherwise
      // land on the same letter and the later one wins, which put the mark on the
      // wrong half of 1,240 syllables.
      const marked = s.stress === 1 && syls.length >= policy.stress_min_syllables;
      if (marked && stressDevice) {
        text = stressDevice(text, { locale: policy.locale, head, nucleusAt, codaAt });
      }
      // Length goes through the same placement as the stress mark, on the same
      // letter, for the same reason -- and against `VOWEL_LETTERS` rather than
      // `[aeiou]`, which made both devices silent no-ops in every script but
      // Latin. Marking the first vowel run in the whole syllable put Turkish's
      // colon on an onset glide, and marking the first *letter* of the nucleus
      // then put it on a rising diphthong's glide: `day:`, then `ky:a`.
      if (/ː/.test(s.nucleus) && policy.length !== 'none') {
        const mark = policy.length === 'double'
          // The second copy is the bare letter: the mark belongs to the syllable
          // once, and `àà` is a character sequence no orthography writes.
          ? (/** @type {string} */ c) => c + c.normalize('NFD').replace(MARKS, '')
          : (/** @type {string} */ c) => `${c}:`;
        text = markNucleus(text, nucleusAt, codaAt, head, mark);
      }
      return text;
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
