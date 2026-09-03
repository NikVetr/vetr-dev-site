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
  createRespeller, onsetClusters, phonemeInventory, syllabify,
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

test('a syllable may open with whatever can open a word, and no more', () => {
  // The whole phonotactic table for a language, from the language itself. Spanish
  // gets /bl/ and does not get /st/, which is the difference between `ah-BLAR`
  // and `ahb-LAR`, and between `es-TA` and `e-STA`.
  const clusters = onsetClusters(Object.keys(SPANISH));
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
  const es = createRespeller({ rules, targetIpa: Object.keys(SPANISH) });
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
  const spanish = createRespeller({ rules, targetIpa: Object.keys(SPANISH) });
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
  const es = createRespeller({ rules, targetIpa: Object.keys(SPANISH) });
  assert.equal(rules.policy.stress, 'caps');
  const out = es.respell('esˈta');
  assert.ok(/[A-Z]/.test(out), `expected a capitalised syllable, got ${out}`);
  assert.ok(/[a-z]/.test(out), 'and an uncapitalised one');

  // A one-syllable word gets none, because a card that shouts every monosyllable
  // has stopped saying anything.
  const one = createRespeller({ rules, targetIpa: ['ˈsi'] }).respell('ˈsi');
  assert.equal(one, one.toLowerCase(), `a monosyllable takes no capitals, got ${one}`);
});

test('a reader who does not want vowel length gets the plain form', () => {
  // Length is a policy switch rather than data, because the respelling is
  // generated. The Japanese sheet invented this convention by hand, doubling a
  // letter on 285 of its 286 long-vowel rows.
  const plain = createRespeller({ rules, targetIpa: ['doːzo'] }).respell('doːzo');
  const doubled = createRespeller({
    rules: { ...rules, policy: { ...rules.policy, length: 'double' } },
    targetIpa: ['doːzo'],
  }).respell('doːzo');
  assert.notEqual(plain, doubled);
  assert.ok(doubled.length > plain.length, `${doubled} should be longer than ${plain}`);
});

test('an unmapped symbol survives to the page instead of vanishing', () => {
  // A gap in the table has to be visible. Silently dropping a phoneme shortens a
  // word, which is worse than printing something odd: the reader cannot tell.
  const out = createRespeller({ rules, targetIpa: ['ˈkaʘa'] }).respell('ˈkaʘa');
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
  const a = createRespeller({ rules, targetIpa: Object.keys(SPANISH) });
  const b = createRespeller({ rules, targetIpa: Object.keys(SPANISH) });
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
    rules: withPolicy(patch), targetIpa: Object.keys(SPANISH),
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
    rules: withPolicy({ stress: 'acute' }), targetIpa: ['bjˈen', 'ˈbjen'],
  });
  assert.equal(es.respell('bjˈen'), 'bee-én');
  // Two letters in one nucleus, marked once and at the end.
  const oo = createRespeller({ rules: withPolicy({ stress: 'acute' }), targetIpa: ['ˈkwanto'] });
  assert.equal(oo.respell('ˈkwanto'), 'kwán-toh');
});

test('a falling diphthong takes the mark on its first element, not its last', () => {
  // The other half of the same rule, and the half that is easy to miss: Spanish
  // writes `bién` but `géisha`, because the nucleus head moves. Marking the last
  // letter throughout gave `he-loú` for `hello`, which reads as a stressed /u/ in
  // a third syllable that is not there.
  const ipa = ['hɛˈloʊ', 'ɛɾlˈaʊpt', 'tʃˈaɪna', 'pˈeɪpa'];
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
  const out = createRespeller({ rules: table, targetIpa: ['esˈte'] }).respell('esˈte');
  // Both `e`s are the table's own; neither has gained a second mark.
  assert.equal(out, 'és-té');
  const marks = [...out.normalize('NFD')].filter((c) => c === '\u0301');
  assert.equal(marks.length, 2, `one acute per vowel, got ${marks.length} in ${out}`);
});

test('vowel length is written the way the reader writes it', () => {
  const say = (/** @type {string} */ length) => createRespeller({
    rules: withPolicy({ length }), targetIpa: ['doːzo'],
  }).respell('doːzo');
  // Turkish reads a doubled vowel as two syllables, so it takes a colon instead.
  assert.notEqual(say('colon'), say('double'));
  assert.match(say('colon'), /:/);
  assert.equal(say('none'), createRespeller({ rules, targetIpa: ['doːzo'] }).respell('doːzo'));
});

test('onset maximisation is the reader decision, not the target', () => {
  // The TDK prescribes `prog-ram` over `pro-gram` for exactly the Western
  // vocabulary this corpus is full of, so a Turkish reader shown `pro-gram` is
  // being shown a syllabification their own orthography rejects. Nothing about
  // the *target* changes between these two calls.
  // The sample has to contain a /gr/-initial word for /gr/ to be a cluster at all,
  // which is the point of `onsetClusters` -- `ˈgɾande` supplies it.
  const ipa = [...Object.keys(SPANISH), 'proˈgɾama'];
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
  const out = createRespeller({ rules, targetIpa: ['ɡiː'] }).respell('ɡiː');
  assert.equal(out, 'ghee', `expected the capture to be substituted, got ${out}`);
  assert.ok(!out.includes('\\'), 'and no backslash to survive to the page');
});

test('a rising diphthong is split whether or not stress is marked', () => {
  // These are two independent decisions -- an English reader cannot read /sja/
  // inside an onset regardless of whether the syllable is capitalised -- and
  // gating one on the other dropped the split for every reader whose policy marks
  // no stress at all.
  const ipa = ['bjˈen', 'ˈbjen'];
  const marked = createRespeller({ rules: withPolicy({ stress: 'caps' }), targetIpa: ipa });
  const plain = createRespeller({ rules: withPolicy({ stress: 'none' }), targetIpa: ipa });
  assert.equal(marked.respell('bjˈen'), 'bee-EN');
  assert.equal(plain.respell('bjˈen'), 'bee-en');
});
