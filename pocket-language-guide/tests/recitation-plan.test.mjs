import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRecitation, recitationPlan, validateRecitation } from '../ui/recitation-plan.js';

/** @type {import('../core/types.js').Block[]} */
const blocks = [{ kind: 'items', sectionId: 'greetings', colorRole: 'comm', stretch: 1, rows: [
  { conceptId: 'hello', weight: .9, values: { script: '你好', gloss: 'Hello', ipa: 'ni˧˥ xau˨˩˦', respell: 'nee how' } },
  { conceptId: 'bye', weight: .4, values: { script: '再见', gloss: 'Goodbye' } },
] }];
/** @type {import('../core/types.js').Block[]} */
const reverse = [{ ...blocks[0], rows: [{ conceptId: 'hello', weight: .9,
  values: { script: 'Hello', ipa: 'həˈləʊ', literal: '你好' } }] }];
const pair = { source: 'en', target: 'zh-Hans' };

test('full-auto orders both languages and puts each delay after its own phase', () => {
  const plan = recitationPlan(blocks, reverse, pair, defaultRecitation());
  assert.equal(plan.phrases, 2);
  assert.deepEqual(plan.steps.map((s) => [s.id, s.audio[0].text, s.audio[0].locale, s.delayMs]), [
    ['hello:0', 'Hello', 'en', 5000], ['hello:1', '你好', 'zh-CN', 3000],
    ['bye:0', 'Goodbye', 'en', 5000], ['bye:1', '再见', 'zh-CN', 3000],
  ]);
});

test('phonetics display exactly, speak native text once, and source IPA comes from the reverse pair', () => {
  const config = defaultRecitation();
  config.phases = [{ screen: ['source:ipa', 'target:ipa'], audio: ['target:ipa', 'target:respell', 'source:ipa'], delayMs: 200 }];
  const plan = recitationPlan(blocks, reverse, pair, config);
  assert.equal(plan.phrases, 1);
  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.steps[0].screen.map((c) => c.text), ['həˈləʊ', 'ni˧˥ xau˨˩˦']);
  assert.deepEqual(plan.steps[0].audio.map((a) => a.text), ['你好', 'Hello']);
});

test('depth filters independently of representations and preserves the board colour', () => {
  const config = defaultRecitation(); config.floor = .65;
  const plan = recitationPlan(blocks, reverse, pair, config);
  assert.equal(plan.phrases, 1);
  assert.equal(plan.skipped, 0);
  assert.equal(plan.steps[0].colorRole, 'comm');
});

test('screen-only permits an unmapped speech language, audio rejects it', () => {
  const config = defaultRecitation();
  config.phases = [{ screen: ['target:script'], audio: [], delayMs: 100 }];
  assert.equal(recitationPlan(blocks, [], { ...pair, target: 'qya' }, config).phrases, 2);
  config.phases[0].audio = ['target:script'];
  assert.throws(() => recitationPlan(blocks, [], { ...pair, target: 'qya' }, config), /No speech language/);
});

test('malformed settings and a zero-delay silent loop fail before playback', () => {
  for (const value of [null, {}, { ...defaultRecitation(), rate: NaN },
    { ...defaultRecitation(), phases: [{ screen: ['target:script'], audio: [], delayMs: 0 }] },
    { ...defaultRecitation(), phases: [{ screen: ['target:unknown'], audio: [], delayMs: 100 }] }]) {
    assert.throws(() => validateRecitation(value));
  }
});
