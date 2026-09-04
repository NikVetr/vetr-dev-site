// The IPA -> respelling transducer.
//
// The assertions here are the pilot's own documented findings, restated as tests:
// `content/RESPELL-PILOT.md` derived each of them from the 12,001 curated
// respellings, and each one cost agreement when it was got wrong. They are the
// regression net for the parts of the engine that are not obvious.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  consonantRuns, createRespeller, onsetClusters, phonemeInventory, syllabify,
} from '../core/respell.js';

const rules = JSON.parse(await readFile('data/respell/rules/en__en-US.json', 'utf8'));

/** A few real espeak `es-419` strings, normalised as the generator leaves them. */
const SPANISH = {
  'esˈta': 'está',
  'aˈblaɾ': 'hablar',
  'ˈpaɾa': 'para',
  'ˈkwanto': 'cuánto',
  'ˈdonde': 'dónde',
  'ˈbaɲo': 'baño',
  'ˈtenɡo': 'tengo',
  // A cluster is read off the *start* of a word, so the sample has to contain
  // words that begin with one -- `hablar` does not.
  'ˈblanko': 'blanco',
  'ˈgɾande': 'grande',
  'ˈtɾes': 'tres',
};

/**
 * The fixture three times over, for the tests that go through `phonemeInventory`:
 * it wants three occurrences before it will believe in a phoneme, which a real
 * language's ~750 rows clear easily and a ten-word fixture does not.
 */
const SAMPLE = [...Object.keys(SPANISH), ...Object.keys(SPANISH), ...Object.keys(SPANISH)];

test('a syllable may open with whatever can open a word, and no more', () => {
  // The whole phonotactic table for a language, from the language itself. Spanish
  // gets /bl/ and does not get /st/, which is the difference between `ah-BLAR`
  // and `ahb-LAR`, and between `es-TA` and `e-STA`.
  const clusters = onsetClusters(SAMPLE);
  assert.ok(clusters.has('bl'), 'Spanish can open a word with /bl/');
  assert.ok(!clusters.has('st'), 'Spanish cannot open a word with /st/');

  const split = (/** @type {string} */ ipa) => syllabify(ipa, clusters)
    .map((s) => `${s.onset}|${s.nucleus}|${s.coda}`).join(' ');
  assert.equal(split('esˈta'), '|e|s t|a|');
  assert.equal(split('aˈblaɾ'), '|a| bl|a|ɾ');
});

test('the documented Spanish outputs come out, exactly', () => {
  // Each of these is a rule the pilot derived from the curated corpus, and each
  // one was wrong before that rule existed.
  const es = createRespeller({ rules, targetIpa: SAMPLE });
  assert.equal(es.respell('esˈta'), 'es-TA', '/st/ is not a Spanish onset');
  assert.equal(es.respell('aˈblaɾ'), 'ah-BLAR', 'but /bl/ is');
  assert.equal(es.respell('ˈpaɾa'), 'PAH-ra', 'open /a/ is `ah` word-internally, bare word-finally');
  assert.equal(es.respell('ˈtenɡo'), 'TEN-go', 'pre-velar /ŋ/ is the allophone, so not TENG-go');
  assert.equal(es.respell('ˈkwanto'), 'KWAN-toh', 'closed /o/ before a coronal stop takes `oh`');
  assert.equal(es.respell('ˈtɾes'), 'tres', 'a monosyllable takes no capitals');
});

test('a voiced fricative counts as its stop when clusters are read off', () => {
  // espeak gives Spanish `hablar` as `aβlaɾ`, and /βl/ is not a cluster anyone
  // writes -- but /bl/ is, and it is the same cluster. Without the fold, the
  // syllable break lands in the wrong place.
  const clusters = onsetClusters(['aˈβlaɾ', 'ˈbla']);
  assert.ok(clusters.has('bl'));
  const syls = syllabify('aˈβlaɾ', clusters);
  assert.equal(syls.length, 2);
  assert.equal(syls[1].onset, 'βl', 'the cluster stays intact and opens the second syllable');
});

test('one loanword cannot invent a phoneme', () => {
  // The count threshold. Spanish has exactly one word-final /ŋ/, in `roaming`,
  // against thirty-four pre-velar ones -- so a rule asking "can this language's
  // /ŋ/ end a word" must answer no for Spanish.
  const once = [syllabify('ˈroamiŋ')];
  assert.ok(!phonemeInventory(once).has('ŋ#'), 'one occurrence is not an inventory');
  const thrice = [syllabify('ˈroamiŋ'), syllabify('ˈroamiŋ'), syllabify('ˈroamiŋ')];
  assert.ok(phonemeInventory(thrice).has('ŋ#'), 'three is');
});

test('the same IPA takes opposite spellings in two languages, with no per-language flag', () => {
  // The load-bearing idea in the rule format. Spanish /p t k/ is written `p t k`;
  // Mandarin's is written `b d g`, because a language that contrasts /p/ with /pʰ/
  // has no voiced stop for `b` to collide with. Both come out of one table, read
  // off the target's own inventory. Getting this wrong cost thirty points.
  const spanish = createRespeller({ rules, targetIpa: SAMPLE });
  const mandarin = createRespeller({
    rules,
    // /pʰ/ present three times, so the inventory has it.
    targetIpa: ['pʰa', 'pʰi', 'pʰu', 'pa', 'pi', 'pu'],
  });
  assert.ok(!spanish.inventory.has('pʰ'), 'Spanish has no aspirated stop');
  assert.ok(mandarin.inventory.has('pʰ'), 'Mandarin does');
  assert.match(spanish.respell('ˈpaɾa'), /^[Pp]/, 'Spanish /p/ stays p');
  assert.match(mandarin.respell('pa'), /^[Bb]/, 'Mandarin /p/ becomes b');
});

test('stress is marked only where the policy says, and only on real polysyllables', () => {
  const es = createRespeller({ rules, targetIpa: SAMPLE });
  assert.equal(rules.policy.stress, 'caps');
  const out = es.respell('esˈta');
  assert.ok(/[A-Z]/.test(out), `expected a capitalised syllable, got ${out}`);
  assert.ok(/[a-z]/.test(out), 'and an uncapitalised one');

  // A one-syllable word gets none, because a card that shouts every monosyllable
  // has stopped saying anything.
  const one = createRespeller({ rules, targetIpa: [...['ˈsi'], ...['ˈsi'], ...['ˈsi']] }).respell('ˈsi');
  assert.equal(one, one.toLowerCase(), `a monosyllable takes no capitals, got ${one}`);
});

test('a reader who does not want vowel length gets the plain form', () => {
  // Length is a policy switch rather than data, because the respelling is
  // generated. The Japanese sheet invented this convention by hand, doubling a
  // letter on 285 of its 286 long-vowel rows.
  const plain = createRespeller({ rules, targetIpa: [...['doːzo'], ...['doːzo'], ...['doːzo']] }).respell('doːzo');
  const doubled = createRespeller({
    rules: { ...rules, policy: { ...rules.policy, length: 'double' } },
    targetIpa: [...['doːzo'], ...['doːzo'], ...['doːzo']],
  }).respell('doːzo');
  assert.notEqual(plain, doubled);
  assert.ok(doubled.length > plain.length, `${doubled} should be longer than ${plain}`);
});

test('an unmapped symbol survives to the page instead of vanishing', () => {
  // A gap in the table has to be visible. Silently dropping a phoneme shortens a
  // word, which is worse than printing something odd: the reader cannot tell.
  const out = createRespeller({ rules, targetIpa: [...['ˈkaʘa'], ...['ˈkaʘa'], ...['ˈkaʘa']] }).respell('ˈkaʘa');
  assert.ok(out.includes('ʘ'), `expected the bilabial click to pass through, got ${out}`);
});

test('an empty ipa cell is not an error', () => {
  // The normal state of a language whose column is unfilled, which is most of
  // them. It must produce nothing rather than throw.
  const es = createRespeller({ rules, targetIpa: [] });
  assert.equal(es.respell(''), '');
  assert.equal(es.respell('   '), '');
});

test('the same input always gives the same output', () => {
  const a = createRespeller({ rules, targetIpa: SAMPLE });
  const b = createRespeller({ rules, targetIpa: SAMPLE });
  for (const ipa of Object.keys(SPANISH)) assert.equal(a.respell(ipa), b.respell(ipa));
});

// --- the devices a reader's own orthography already has --------------------
//
// Capitals are the fallback for a Latin script with no native stress mark, and
// eleven of the curated sheets use them. They are not available to a caseless
// script and not idiomatic where an accent exists, so the device is a policy
// switch. `content/RESPELL-SYSTEMS.md` derives the two-argument decision: which
// device is a fact about the *reader*, whether to mark at all is a fact about the
// target.
const withPolicy = (/** @type {Record<string,any>} */ patch) => ({
  ...rules, policy: { ...rules.policy, ...patch },
});

test('the stress device is the reader own, not capitals everywhere', () => {
  const say = (/** @type {Record<string,any>} */ patch) => createRespeller({
    rules: withPolicy(patch), targetIpa: SAMPLE,
  }).respell('esˈta');
  assert.equal(say({ stress: 'caps' }), 'es-TA');
  // The acute lands on the vowel, and the syllable stays lower case -- which is
  // what a Spanish, Italian, Portuguese or Russian reader expects.
  assert.equal(say({ stress: 'acute' }), 'es-tá');
  // Devanagari is caseless and takes no accent, so Bhargava's prime marks the
  // syllable instead.
  assert.equal(say({ stress: 'prime' }), 'es-taʹ');
  assert.equal(say({ stress: 'none' }), 'es-ta');
});

test('the acute goes on the last vowel letter of the nucleus, not the first', () => {
  // `bién`, not `bíen`: a nucleus can be more than one letter, so "the vowel" has
  // to mean the last one. Here the diphthong is split out first and this table
  // spells the /i/ `ee`, so the mark lands on the `e` of the second syllable.
  const es = createRespeller({
    rules: withPolicy({ stress: 'acute' }), targetIpa: ['bjˈen', 'ˈbjen', 'bjˈen', 'ˈbjen', 'bjˈen', 'ˈbjen'],
  });
  assert.equal(es.respell('bjˈen'), 'bee-én');
  // Two letters in one nucleus, marked once and at the end.
  const oo = createRespeller({ rules: withPolicy({ stress: 'acute' }), targetIpa: ['ˈkwanto', 'ˈkwanto', 'ˈkwanto'] });
  assert.equal(oo.respell('ˈkwanto'), 'kwán-toh');
});

test('a falling diphthong takes the mark on its first element, not its last', () => {
  // The other half of the same rule, and the half that is easy to miss: Spanish
  // writes `bién` but `géisha`, because the nucleus head moves. Marking the last
  // letter throughout gave `he-loú` for `hello`, which reads as a stressed /u/ in
  // a third syllable that is not there.
  const ipa = ['hɛˈloʊ', 'ɛɾlˈaʊpt', 'tʃˈaɪna', 'pˈeɪpa'].flatMap((x) => [x, x, x]);
  const say = createRespeller({ rules: withPolicy({ stress: 'acute' }), targetIpa: ipa });
  // This table spells /aɪ/ `ye` and /eɪ/ `ay`, so both emit a two-letter run and
  // the choice of end is visible: the head is the first.
  assert.equal(say.respell('tʃˈaɪna'), 'chýe-na');
  assert.equal(say.respell('pˈeɪpa'), 'páy-pa');
  // /oʊ/ is `oh` here, one vowel letter and an orthographic `h`, so there is only
  // one place the mark can go and it is the right one either way.
  assert.equal(say.respell('hɛˈloʊ'), 'heh-lóh');
});

test('an accented letter does not take a second accent', () => {
  // A phoneme rule may already have written an accent -- Portuguese and French
  // both need to -- and stacking the stress mark on top of it produces a character
  // no orthography has. So the device leaves an accented vowel alone.
  const table = {
    ...withPolicy({ stress: 'acute' }),
    phonemes: [{ slot: 'nucleus', ipa: 'e', out: 'é' }, ...rules.phonemes],
  };
  const out = createRespeller({ rules: table, targetIpa: [...['esˈte'], ...['esˈte'], ...['esˈte']] }).respell('esˈte');
  // Both `e`s are the table's own; neither has gained a second mark.
  assert.equal(out, 'és-té');
  const marks = [...out.normalize('NFD')].filter((c) => c === '\u0301');
  assert.equal(marks.length, 2, `one acute per vowel, got ${marks.length} in ${out}`);

  // The same guard, for a letter that is accented by being itself: `ё` is
  // inherently stressed in Russian -- an unstressed one does not exist -- so the
  // mark is redundant, and at 4.4pt it lands on top of the diaeresis.
  const cyrillic = {
    ...withPolicy({ stress: 'acute' }),
    phonemes: [{ slot: 'nucleus', ipa: 'ɜ', out: 'ё' }, { slot: 'any', ipa: 's', out: 'с' }],
  };
  const yo = createRespeller({ rules: cyrillic, targetIpa: ['sˈɜsɜ', 'sˈɜsɜ', 'sˈɜsɜ'] }).respell('sˈɜsɜ');
  assert.equal([...yo.normalize('NFD')].filter((c) => c === '\u0301').length, 0, yo);
});

test('length and stress mark the same letter of the nucleus', () => {
  // They ask one question -- which element is the head -- so they share one
  // answer. Always-last gave `he-loú` for `hello`; always-first gave `ky:a` for
  // क्या, which asks a Turkish reader to lengthen a consonant. The TDK writes
  // `da:y` for the falling diphthong and `kya:` for the rising one, which is the
  // same split as Spanish's `géisha` against `bién`.
  const ipa = ['kjaː', 'daːj', 'kjoː'].flatMap((x) => [x, x, x]);
  const say = createRespeller({
    rules: {
      source: 'x',
      policy: { stress: 'none', length: 'colon', syllable_separator: '-' },
      phonemes: [
        { slot: 'any', ipa: 'k', out: 'k' }, { slot: 'any', ipa: 'd', out: 'd' },
        { slot: 'any', ipa: 'j', out: 'y' }, { slot: 'nucleus', ipa: 'a', out: 'a' },
        { slot: 'nucleus', ipa: 'o', out: 'o' },
        // The length mark itself spells nothing; the device writes the colon.
        { slot: 'any', ipa: 'ː', out: '' },
      ],
    },
    targetIpa: ipa,
  });
  // Rising: the glide is first, so the mark goes on the second letter.
  assert.equal(say.respell('kjaː'), 'kya:');
  assert.equal(say.respell('kjoː'), 'kyo:');
  // Falling: the vowel is first, and the mark stays there.
  assert.equal(say.respell('daːj'), 'da:y');
});

test('vowel length is written the way the reader writes it', () => {
  const say = (/** @type {string} */ length) => createRespeller({
    rules: withPolicy({ length }), targetIpa: [...['doːzo'], ...['doːzo'], ...['doːzo']],
  }).respell('doːzo');
  // Turkish reads a doubled vowel as two syllables, so it takes a colon instead.
  assert.notEqual(say('colon'), say('double'));
  assert.match(say('colon'), /:/);
  assert.equal(say('none'), createRespeller({ rules, targetIpa: [...['doːzo'], ...['doːzo'], ...['doːzo']] }).respell('doːzo'));
});

test('onset maximisation is the reader decision, not the target', () => {
  // The TDK prescribes `prog-ram` over `pro-gram` for exactly the Western
  // vocabulary this corpus is full of, so a Turkish reader shown `pro-gram` is
  // being shown a syllabification their own orthography rejects. Nothing about
  // the *target* changes between these two calls.
  // The sample has to contain a /gr/-initial word for /gr/ to be a cluster at all,
  // which is the point of `onsetClusters` -- `ˈgɾande` supplies it.
  const ipa = [...SAMPLE, 'proˈgɾama', 'proˈgɾama', 'proˈgɾama'];
  const wide = createRespeller({ rules: withPolicy({ stress: 'none' }), targetIpa: ipa });
  const narrow = createRespeller({
    rules: withPolicy({ stress: 'none', max_onset: 1 }), targetIpa: ipa,
  });
  assert.equal(wide.respell('proˈgɾama'), 'pro-grah-ma');
  assert.equal(narrow.respell('proˈgɾama'), 'prog-rah-ma');
});

test('a fixup backreference reaches the page as text, not as a backslash', () => {
  // `syllable_fixups` writes captures as `\1`, which is the documented format and
  // what Python's `re.sub` takes. JS spells them `$1` and silently emits the
  // literal characters for `\1`, so the table's own `g(ee|e) -> \1gh\2` rule put
  // `\1gh\2` on the card for every Hindi and Korean velar.
  const out = createRespeller({ rules, targetIpa: ['ɡiː', 'ɡiː', 'ɡiː'] }).respell('ɡiː');
  assert.equal(out, 'ghee', `expected the capture to be substituted, got ${out}`);
  assert.ok(!out.includes('\\'), 'and no backslash to survive to the page');
});

test('a rising diphthong is split whether or not stress is marked', () => {
  // These are two independent decisions -- an English reader cannot read /sja/
  // inside an onset regardless of whether the syllable is capitalised -- and
  // gating one on the other dropped the split for every reader whose policy marks
  // no stress at all.
  const ipa = ['bjˈen', 'ˈbjen'].flatMap((x) => [x, x, x]);
  const marked = createRespeller({ rules: withPolicy({ stress: 'caps' }), targetIpa: ipa });
  const plain = createRespeller({ rules: withPolicy({ stress: 'none' }), targetIpa: ipa });
  assert.equal(marked.respell('bjˈen'), 'bee-EN');
  assert.equal(plain.respell('bjˈen'), 'bee-en');
});

test('a phoneme is the unit, not a codepoint', () => {
  // Everything downstream of `syllabify` inherits its tokenisation, so counting
  // characters made /ts/ two consonants and /tɕʰ/ three. Italian *grazie* broke as
  // `grats-ie`, because /ts/ is not something Italian can *end* a syllable with --
  // and asking for a one-consonant onset tore /tɕʰ/ in half and left a bare `ʰ` to
  // be spelt on its own. All four rule tables reported it independently.
  const clusters = onsetClusters(['ɡrˈatsje', 'ˈtsa', 'ˈdʑa']);
  assert.ok(!clusters.has('ts'), '/ts/ is one phoneme, so it is not a cluster of two');
  const split = (/** @type {string} */ ipa) => syllabify(ipa, clusters)
    .map((y) => `${y.onset}|${y.nucleus}|${y.coda}`).join(' ');
  assert.equal(split('ɡrˈatsje'), 'ɡr|a| ts|je|');

  // And an aspirated affricate survives a one-consonant onset limit, because it
  // *is* one consonant.
  assert.equal(split('ˈtɕʰi'), 'tɕʰ|i|');
  assert.equal(syllabify('ˈtɕʰi', clusters, 1)[0].onset, 'tɕʰ');
});

test('a table can ask for every fixup, or just the first', () => {
  // The default is one per syllable, which is right where the fixups are
  // alternative repairs -- the English table's `ow` rules must not compose. A
  // transliteration chart is the other case: the kana table contracts an onset and
  // a coda in the same syllable, and could only reach it by precomposing nineteen
  // coda rules by hand.
  const chart = {
    ...rules,
    syllable_fixups: [{ match: 'k', out: 'K' }, { match: 'a', out: 'A' }],
  };
  const first = createRespeller({ rules: chart, targetIpa: ['ka', 'ka', 'ka'] }).respell('ka');
  const all = createRespeller({
    rules: { ...chart, policy: { ...rules.policy, fixups: 'all' } }, targetIpa: ['ka'],
  }).respell('ka');
  assert.equal(first, 'Ka');
  assert.equal(all, 'KA');
});

test('the inventory says where a phoneme occurs, not just whether', () => {
  // The difference between a phoneme and an allophone, and no test for bare
  // presence can see it. Korean's `ipa` carries `b d ɡ` from Revised Romanization
  // but never word-initially, because they are the intervocalic realisations of
  // the lenis series; Thai has 41 word-initial /b/, where it is contrastive. A
  // rule that spells the plain series voiced has to fire for the first and not the
  // second, so it asks `#b` rather than `b`.
  const korean = [syllabify('kaba'), syllabify('kaba'), syllabify('kaba')];
  const thai = [syllabify('baka'), syllabify('baka'), syllabify('baka')];
  assert.ok(phonemeInventory(korean).has('b'), 'Korean has the sound');
  assert.ok(!phonemeInventory(korean).has('#b'), 'but never to open a word');
  assert.ok(phonemeInventory(thai).has('#b'), 'Thai does');
});

test('the reader may name a cluster the target only has mid-word', () => {
  // Intersection alone could only subtract, so a reader whose own orthography
  // opens syllables with a prenasal could not be given one unless a target word
  // happened to *begin* that way. Swahili is the case: only Arabic has a
  // word-initial `mb`, so a nasal was split from its own obstruent on 735
  // boundaries -- exactly what BAKITA's division rules forbid.
  const ipa = ['ˈnamba', 'ˈnamba', 'ˈnamba', 'ˈtata'];
  assert.ok(!onsetClusters(ipa).has('mb'), 'no word here begins with /mb/');
  assert.ok(consonantRuns(ipa).has('mb'), 'but the language plainly has the sequence');

  const say = (/** @type {Record<string,any>} */ policy) => createRespeller({
    rules: { ...rules, policy: { ...rules.policy, stress: 'none', ...policy } },
    targetIpa: ipa,
  }).respell('ˈnamba');
  // `ah` rather than `a`, because this table spells an open /a/ that way -- the
  // point is where the /m/ lands.
  assert.equal(say({ max_onset: 2 }), 'nam-ba', 'unasked, the nasal closes the syllable');
  assert.equal(say({ max_onset: 2, reader_onsets: 'mb nd' }), 'nah-mba',
    'named, the prenasal opens the next one');

  // And the guard holds: a cluster the target does not have at all is not invented.
  assert.equal(say({ max_onset: 2, reader_onsets: 'pf' }), 'nam-ba');
});

test('a non-syllabic vowel joins the nucleus before it', () => {
  // U+032F says "this vowel is not a syllable", which makes it an offglide by
  // definition. Thai writes `ua̯ ia̯ ɯa̯` and each was splitting into two
  // syllables, inflating a monosyllabic language's syllable count on 152 rows.
  const clusters = onsetClusters(['tɕʰua̯j', 'tɕʰua̯j', 'tɕʰua̯j']);
  const split = (/** @type {string} */ ipa) => syllabify(ipa, clusters)
    .map((y) => `${y.onset}|${y.nucleus}|${y.coda}`).join(' ');
  assert.equal(split('tɕʰua̯j'), 'tɕʰ|ua̯j|');
  assert.equal(split('kʰɯa̯n'), 'kʰ|ɯa̯|n');
});

test('a cluster has to be legal for the reader as well as the target', () => {
  // `onsetClusters` answers "can this language open a word this way", which is not
  // "can my reader read it": a Spanish reader was shown `an-der-stánd` and
  // `hój-shtul`. Dropping to one consonant fixes those and costs the C+liquid
  // onsets Spanish does admit. Naming the reader's own list gets both.
  const ipa = ['ˈblanko', 'ˈblanko', 'ˈblanko', 'ˈstop', 'ˈstop', 'ˈstop',
    'proˈblema', 'ˈastop'];
  const table = (/** @type {Record<string,any>} */ policy) => createRespeller({
    rules: { ...rules, policy: { ...rules.policy, stress: 'none', ...policy } },
    targetIpa: ipa,
  });
  // Two consonants and no list: /bl/ and /st/ both open a syllable because the
  // target permits both, and `ah-stop` is the unreadable half -- no Spanish reader
  // begins a syllable /st/, and they will repair it unpredictably.
  const loose = table({ max_onset: 2 });
  assert.equal(loose.respell('proˈblema'), 'pro-bleh-ma');
  assert.equal(loose.respell('ˈastop'), 'ah-stop');
  // One consonant fixes /st/ and takes /bl/ with it, which is the trade the
  // Spanish table measured at 513 illegal onsets against 333 legal ones.
  const tight = table({ max_onset: 1 });
  assert.equal(tight.respell('ˈastop'), 'as-top');
  assert.equal(tight.respell('proˈblema'), 'prob-leh-ma');
  // The reader's own list gets both: /bl/ back, /st/ still split.
  const both = table({ max_onset: 2, reader_onsets: 'bl br pl pr tr kl kr ɡr fl' });
  assert.equal(both.respell('proˈblema'), 'pro-bleh-ma');
  assert.equal(both.respell('ˈastop'), 'as-top');
});

test('a diacritic device marks the head, wherever in the nucleus that is', () => {
  // Three positions, one rule. A rising diphthong is marked on its second element,
  // a falling one on its first, and a nucleus that both opens *and* closes with a
  // glide has its head in the middle -- /waɪ/ is spelt `uai`, where neither end is
  // the vowel, so marking the first letter put the accent on the /w/.
  const ipa = ['bjˈen', 'ˈɡeɪʃa', 'wˈaɪfaɪ', 'sˈɔːri'].flatMap((x) => [x, x, x]);
  const say = (/** @type {string} */ stress) => createRespeller({
    rules: withPolicy({ stress }), targetIpa: ipa,
  });
  const acute = say('acute');
  assert.match(acute.respell('ˈɡeɪʃa'), /gá/, 'falling: the first element');
  assert.match(acute.respell('wˈaɪfaɪ'), /wá/, 'glide on both sides: the middle');

  // And the grave is a device of its own, because `á í ú` occur in no Italian word.
  const grave = say('grave');
  assert.match(grave.respell('ˈɡeɪʃa'), /gà/, 'the same position, the other mark');
  assert.ok(!/á|é|í|ó|ú/.test(grave.respell('ˈɡeɪʃa')), 'and no acute anywhere');
});

test('a doubled vowel carries its mark on the first copy', () => {
  // Both devices land on the same letter, so whichever ran second used to win:
  // length doubled the vowel and then stress marked the *second* copy, giving
  // `saári` where Italian writes `sàari`. Stress runs first now, and the second
  // copy is the bare letter -- `àà` is a sequence no orthography writes.
  const table = {
    source: 'x',
    policy: { stress: 'grave', length: 'double', syllable_separator: '-' },
    phonemes: [
      { slot: 'any', ipa: 's', out: 's' }, { slot: 'any', ipa: 'r', out: 'r' },
      { slot: 'nucleus', ipa: 'ɔ', out: 'o' }, { slot: 'nucleus', ipa: 'i', out: 'i' },
      { slot: 'any', ipa: 'ː', out: '' },
    ],
  };
  const out = createRespeller({
    rules: table, targetIpa: ['sˈɔːri', 'sˈɔːri', 'sˈɔːri'],
  }).respell('sˈɔːri');
  const marks = [...out.normalize('NFD')].filter((c) => c === '̀');
  assert.equal(marks.length, 1, `one mark, got ${marks.length} in ${out}`);
  assert.match(out, /ò[a-z]/, `the mark belongs to the first copy, got ${out}`);
});

test('a rule can ask about the nucleus head, and about a whole next phoneme', () => {
  // `if_nucleus` is an exact match on the whole string, which is right when a rule
  // names one vowel and useless for "the following vowel is front" -- the Italian
  // table had to enumerate 112 nucleus strings across seventeen rules to ask it.
  // And `before_onset` compared one *character*, so a rule naming a two-character
  // aspirate could never fire and only looked as though it did.
  const table = {
    source: 'x',
    policy: { stress: 'none', syllable_separator: '-' },
    phonemes: [
      { slot: 'onset', ipa: 'k', out: 'c', if_nucleus_head: 'i e' },
      { slot: 'onset', ipa: 'k', out: 'k' },
      { slot: 'coda', ipa: 'n', out: 'N', before_onset: 'kʰ' },
      { slot: 'coda', ipa: 'n', out: 'n' },
      { slot: 'nucleus', ipa: 'i', out: 'i' }, { slot: 'nucleus', ipa: 'a', out: 'a' },
      { slot: 'any', ipa: 'ː', out: '' }, { slot: 'onset', ipa: 'kʰ', out: 'kh' },
    ],
  };
  const ipa = ['kiː', 'kaː', 'ankʰa', 'anka'].flatMap((x) => [x, x, x]);
  const r = createRespeller({ rules: table, targetIpa: ipa });
  assert.equal(r.respell('kiː'), 'ci', 'a front nucleus head takes the c');
  assert.equal(r.respell('kaː'), 'ka', 'a back one does not');
  assert.equal(r.respell('ankʰa'), 'aN-kha', 'the whole aspirate is the next phoneme');
  assert.equal(r.respell('anka'), 'an-ka', 'and a plain /k/ is not it');
});

test('a glide with a vowel on both sides opens the next syllable', () => {
  // The nucleus span grew greedily over glides and the two lax vowels, and only
  // retracted if it *ended* on a glide -- so `V glide V` collapsed into one nucleus
  // and the boundary between two syllables was lost. Four tables reported it
  // independently, all on Mandarin 借用 /tɕjɛjʊŋ/, which came out as one syllable
  // for a Japanese, Russian, Turkish and Indonesian reader alike.
  const clusters = onsetClusters(['tɕjɛjʊŋ', 'tɕjɛjʊŋ', 'tɕjɛjʊŋ']);
  const split = (/** @type {string} */ ipa) => syllabify(ipa, clusters)
    .map((s) => `${s.onset}|${s.nucleus}|${s.coda}`).join(' ');
  // Two syllables. The glide joins the *second* nucleus rather than opening it,
  // which is what a rising diphthong is and what every table spells correctly.
  assert.equal(split('tɕjɛjʊŋ'), 'tɕ|jɛ| |jʊ|ŋ');
  // The two the Russian and Turkish tables lost a vowel on.
  assert.equal(split('nʲijɪ'), 'nʲ|i| |jɪ|');
  assert.equal(split('mijim'), 'm|i| |ji|m');

  // A glide that genuinely closes a syllable still does, which is the half the old
  // retraction loop got right: nothing follows the /ɪ/ here.
  assert.equal(split('ˈkaɪt'), 'k|aɪ|t');
  // And a glide before a *consonant* closes its own syllable rather than moving.
  assert.equal(split('ˈajta'), '|aj| t|a|');
});

test('a rule can ask what vowel came before this syllable, not just which nucleus', () => {
  // `after_nucleus` is an exact match on the whole previous nucleus, which is as far
  // as an enumeration reaches: the Arabic hiatus seat and Thai's glide seat both
  // want "the vowel immediately before this onset", and both had lists of short
  // monophthongs because that is all an exact string can say. `after_nucleus_tail`
  // is the last phoneme of that nucleus -- the mirror of `if_nucleus_head` by
  // position rather than by name, which matters: the *head* of a rising diphthong is
  // its glide, so after Korean 돼 /wɛ/ the head asks about a labial consonant where
  // the vowel before the seat is front /ɛ/.
  const phonemes = (/** @type {any} */ first) => [
    first,
    { slot: 'nucleus', ipa: 'a', out: 'a' },
    { slot: 'nucleus', ipa: 'ɪ', out: 'i' }, { slot: 'nucleus', ipa: 'i', out: 'i' },
    { slot: 'nucleus', ipa: 'u', out: 'u' },
    { slot: 'any', ipa: 't', out: 't' }, { slot: 'any', ipa: 'w', out: 'w' },
    { slot: 'any', ipa: 'ː', out: '' }, { slot: 'any', ipa: '˥', out: '' },
  ];
  const words = ['taɪa', 'twia', 'ti˥a', 'tiːa', 'tua'];
  const respeller = (/** @type {any} */ first) => createRespeller({
    rules: { source: 'x', policy: { stress: 'none', syllable_separator: '-' }, phonemes: phonemes(first) },
    targetIpa: words.flatMap((w) => [w, w, w]),
  });

  const tail = respeller({ slot: 'nucleus', ipa: 'a', out: 'Y', after_nucleus_tail: 'ɪ i' });
  // A falling diphthong is classed by its offglide, which is the half Arabic's own
  // هَيْئَة spells a seat for, and a rising one by its vowel rather than its glide.
  assert.equal(tail.respell('taɪa'), 'tai-Y', '/aɪ/ ends in the front vowel');
  assert.equal(tail.respell('twia'), 'twi-Y', 'and /wi/ ends in one too, though it starts with /w/');
  // Length and tone belong to the vowel, so neither hides it. Thai keeps tone, and
  // its two fixups had been comparing `i` against `i˥` and firing on no Mandarin row.
  assert.equal(tail.respell('tiːa'), 'ti-Y', 'a long vowel is the same vowel');
  assert.equal(tail.respell('ti˥a'), 'ti-Y', 'so is a toned one');
  assert.equal(tail.respell('tua'), 'tu-a', 'and a back vowel is not in the class');

  const exact = respeller({ slot: 'nucleus', ipa: 'a', out: 'Y', after_nucleus: 'i' });
  assert.equal(exact.respell('ti˥a'), 'ti-a', 'which is what the exact form cannot say');
});
