// IPA -> an informal respelling in the reader's own orthography.
//
// This is what turns the respelling column from O(N^2) into O(N). A curated
// respelling is written per *pair* -- `nee HOW` is Chinese for an English reader
// and nothing else -- which is why only 16 of the 272 shipped pairs have one, and
// why the other 256 print an empty column. A transducer needs two O(N) inputs
// instead: the `ipa` column of the language being learned, and one rule table per
// language doing the reading.
//
// The rule tables were not written from a published pronunciation key. They were
// read off the 12,001 hand-curated respellings already in the corpus, which is a
// better source: it records what a human actually chose for each sound in context.
// Measured against those, a 99-entry table exactly reproduces 66.8% of the Spanish
// sheet and 71.8% of the Mandarin one, and agrees at the syllable level on 91%.
// `content/RESPELL-PILOT.md` has the numbers and the failure taxonomy.
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
]);
const GLIDES = new Set('jwɥ');
/** Length, nasalisation and the non-syllabic mark all belong to their vowel. */
const VOWEL_TAIL = new Set(['ː', 'ˑ', '̃', '̯']);
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
    let run = '';
    for (const ch of ipa) {
      if (ch in STRESS || VOWEL_TAIL.has(ch)) continue;
      if (VOWELS.has(ch) || GLIDES.has(ch)) break;
      run += fold(ch);
    }
    for (const k of [2, 3]) if (run.length >= k) out.add(run.slice(0, k));
  }
  return out;
}

/**
 * Syllabify an IPA word: nucleus spans first, then onset maximisation over the
 * cluster table.
 * @param {string} ipa
 * @param {Set<string>} clusters
 * @returns {Syllable[]}
 */
export function syllabify(ipa, clusters = new Set()) {
  /** @type {[string, number][]} */ const units = [];
  let pending = 0;
  for (const ch of ipa) {
    if (ch in STRESS) { pending = STRESS[ch]; continue; }
    // Length and nasalisation attach to the vowel they follow.
    if (VOWEL_TAIL.has(ch)) {
      if (units.length) units[units.length - 1][0] += ch;
      continue;
    }
    units.push([ch, pending]);
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
    else if (inter.length === 1) cuts.push(inter[0]);
    else if (inter.length > 2 && clusters.has(at(3))) cuts.push(inter[inter.length - 3]);
    else if (clusters.has(at(2))) cuts.push(inter[inter.length - 2]);
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
    const t = `${syllables.map((s) => s.onset + s.nucleus + s.coda).join('')}#`;
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
  const clusters = onsetClusters(targetIpa.flatMap((s) => s.split(/\s+/)).filter(Boolean));
  const words = targetIpa
    .flatMap((s) => s.split(/\s+/))
    .filter(Boolean)
    .map((w) => syllabify(w, clusters));
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
  const fixups = [...(only.syllable_fixups ?? []), ...(rules.syllable_fixups ?? [])]
    .filter((/** @type {any} */ f) => inventoryHolds(f, inventory))
    .map((/** @type {any} */ f) => ({ ...f, re: new RegExp(f.match) }));
  const splits = only.splits ?? rules.splits ?? [];
  const policy = { stress: 'none', stress_min_syllables: 2, length: 'none', tone: 'keep',
    syllable_separator: '-', word_separator: ' ', ...(rules.policy ?? {}), ...(only.policy ?? {}) };

  /** @param {Syllable[]} syllables */
  const word = (syllables) => {
    const syls = policy.stress === 'none' ? syllables : applySplits(syllables, splits);
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
      text += spellSlot(s.nucleus, 'nucleus', phonemes, ctx, text);
      text += spellSlot(s.coda, 'coda', phonemes, ctx, text);
      for (const f of fixups) {
        if (!holds(f, ctx, '')) continue;
        const next = text.replace(f.re, f.out);
        if (next !== text) { text = next; break; }
      }
      // Length is a policy switch rather than data, because the respelling is
      // generated: a reader who does not want it simply gets the plain form. The
      // Japanese sheet already invented this convention by hand, doubling a letter
      // on 285 of its 286 long-vowel rows.
      if (policy.length === 'double' && /ː/.test(s.nucleus + s.coda)) {
        text = text.replace(/([aeiou]+)/, '$1$1');
      }
      const marked = s.stress === 1 && syls.length >= policy.stress_min_syllables;
      return marked && policy.stress === 'caps' ? text.toUpperCase() : text;
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
        .map((w) => word(syllabify(w, clusters)))
        .join(policy.word_separator);
    },
  };
}
