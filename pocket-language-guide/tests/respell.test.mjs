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
