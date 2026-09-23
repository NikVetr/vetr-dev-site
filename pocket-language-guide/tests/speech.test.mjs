// The speech adapter's contracts, against a synthesiser that does not exist.
//
// Every rule in section 6.2 that this file checks is a rule about *arbitration* --
// which voice, whose callback, in what order -- and none of them are rules about
// audio. A fake engine can be asked all of them in a millisecond, can be made to
// deliver a completion late or an error the specification spells `canceled`, and
// gives the same answer on a machine with fifty voices and on a CI container with
// none. A real engine could do none of that.
//
// What no test here can reach: whether a voice is intelligible, whether it comes out
// of the speaker or the headphones, and what a phone does with it on silent or when
// a call arrives. Those are the physical-device matrix in section 9.2 and they are
// not run.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeech, resolveSpokenLocale } from '../ui/platform/speech.js';

/** Flush the microtask queue, so an outcome that will arrive has arrived. */
const flush = () => new Promise((resolve) => { setImmediate(resolve); });

/**
 * @param {string} name @param {string} lang
 * @param {boolean|undefined} [localService] `undefined` is an engine that does not say
 * @param {boolean} [isDefault]
 */
const voice = (name, lang, localService = true, isDefault = false) => /** @type {any} */ ({
  voiceURI: `uri:${name}`, name, lang, localService, default: isDefault,
});

class FakeUtterance {
  /** @param {string} text */
  constructor(text) {
    this.text = text;
    this.lang = '';
    this.rate = 1;
    /** @type {any} */ this.voice = null;
    /** @type {((event:any) => void)|null} */ this.onend = null;
    /** @type {((event:any) => void)|null} */ this.onerror = null;
  }
}

/**
 * A synthesiser that only records. `cancel` reports `canceled` on the utterance it
 * throws away, as the browsers do, so the stale-callback paths are actually walked.
 * @param {any[]} voices
 */
function fakeSynth(voices = []) {
  /** @type {any} */
  const synth = {
    voices,
    /** @type {string[]} */ log: [],
    /** @type {FakeUtterance[]} */ spoken: [],
    /** @type {FakeUtterance|null} */ current: null,
    /** @type {Record<string, (() => void)[]>} */ listeners: {},
    quiet: false, // a cancel that reports nothing, which also happens
    getVoices: () => synth.voices,
    /** @param {string} type @param {() => void} fn */
    addEventListener: (type, fn) => { (synth.listeners[type] ??= []).push(fn); },
    /** @param {FakeUtterance} utterance */
    speak: (utterance) => {
      synth.log.push('speak');
      synth.spoken.push(utterance);
      synth.current = utterance;
    },
    cancel: () => {
      synth.log.push('cancel');
      const going = synth.current;
      synth.current = null;
      if (!synth.quiet) going?.onerror?.({ error: 'canceled' });
    },
    /** @param {any[]} list */
    arrive: (list) => {
      synth.voices = list;
      for (const fn of synth.listeners.voiceschanged ?? []) fn();
    },
    finish: () => { const going = synth.current; synth.current = null; going?.onend?.({}); },
    /** @param {string} error */
    fail: (error) => { const going = synth.current; synth.current = null; going?.onerror?.({ error }); },
  };
  return synth;
}

/** @param {any[]} [voices] */
function adapter(voices = []) {
  const synth = fakeSynth(voices);
  return { synth, speech: createSpeech(synth, /** @type {any} */ (FakeUtterance)) };
}

const say = { text: '请停下来', locale: 'zh-Hans' };

test('a language code is its own spoken locale, except where it is not', () => {
  // The 46 languages with no table entry: the registry's code is the BCP-47 subtag
  // and any regional voice for it reads the same language.
  assert.equal(resolveSpokenLocale('es'), 'es');
  assert.equal(resolveSpokenLocale('ar'), 'ar');
  // Script metadata resolved to a spoken locale, deliberately.
  assert.equal(resolveSpokenLocale('zh-Hans'), 'zh-CN');
  // And the two where the answer is nothing at all, which is not an oversight.
  assert.equal(resolveSpokenLocale('tlh'), null);
  assert.equal(resolveSpokenLocale('qya'), null);
});

test('a voice is matched on subtag boundaries, not on spelling', () => {
  const { speech } = adapter([voice('Hawaiian', 'haw-US'), voice('Anna', 'en-GB')]);
  // `haw-US` starts with `ha`. Hausa is not Hawaiian, and a prefix test would have
  // handed one to the other without anyone hearing about it.
  const hausa = speech.getCapabilities('ha');
  assert.deepEqual(hausa.voices, []);
  assert.equal(hausa.reason, 'no-voice');
  // A regional voice for the right language is the ordinary case.
  assert.equal(speech.getCapabilities('en').voices[0]?.lang, 'en-GB');
});

test('Simplified Chinese never takes a Cantonese voice', () => {
  const cantonese = [voice('Sinji', 'zh-HK'), voice('Yue', 'yue-HK')];
  const { speech } = adapter([...cantonese, voice('Meijia', 'zh-TW'), voice('Tingting', 'zh-CN')]);
  const caps = speech.getCapabilities('zh-Hans');
  // Putonghua first; Taiwan Mandarin present but last; Cantonese absent entirely.
  assert.deepEqual(caps.voices.map((v) => v.lang), ['zh-CN', 'zh-TW']);
  assert.equal(caps.locale, 'zh-CN');

  // With nothing but Cantonese installed, Simplified Chinese has no voice. That is
  // the answer, not a reason to use one of them.
  const { speech: only } = adapter(cantonese);
  assert.equal(only.getCapabilities('zh-Hans').reason, 'no-voice');
});

test('a retired ISO code still names the same language', () => {
  const { speech } = adapter([
    voice('Carmit', 'iw-IL'), voice('Damayanti', 'in-ID'), voice('Angelo', 'tl-PH'),
  ]);
  assert.equal(speech.getCapabilities('he').voices[0]?.name, 'Carmit');
  assert.equal(speech.getCapabilities('id').voices[0]?.name, 'Damayanti');
  assert.equal(speech.getCapabilities('fil').voices[0]?.name, 'Angelo');
});

test('a constructed language is text-only, even with a voice in the room', async () => {
  const { synth, speech } = adapter([voice('Samantha', 'en-US')]);
  for (const code of ['tlh', 'qya']) {
    const caps = speech.getCapabilities(code);
    assert.equal(caps.reason, 'unmapped');
    assert.equal(caps.locale, null);
    assert.deepEqual(caps.voices, []);
    // The provider is still there and working; this language simply has no voice.
    assert.equal(caps.provider, 'web-speech');
    await assert.rejects(
      speech.speak({ text: 'nuqneH', locale: code }),
      (/** @type {any} */ error) => error.reason === 'unmapped',
    );
  }
  // Nothing reached the engine. An English voice reading pIqaD is the defect.
  assert.deepEqual(synth.spoken, []);
});

test('voices that arrive late are waited for, and voices that never come are not', async () => {
  const { synth, speech } = adapter([]);
  let changes = 0;
  const off = speech.onVoicesChanged(() => { changes += 1; });

  // Chrome answers the first `getVoices()` with an empty array and fills it in when
  // the engine has loaded. Until it has said anything, "none yet" is the honest
  // report -- and speaking now fails with the same distinction rather than silently.
  assert.equal(speech.getCapabilities('zh-Hans').reason, 'loading');
  await assert.rejects(speech.speak(say), (/** @type {any} */ e) => e.reason === 'loading');

  synth.arrive([voice('Tingting', 'zh-CN')]);
  assert.equal(changes, 1);
  assert.equal(speech.getCapabilities('zh-Hans').voices.length, 1);

  // And an engine that announces an empty inventory has answered: no voice, ever.
  synth.arrive([]);
  assert.equal(speech.getCapabilities('zh-Hans').reason, 'no-voice');
  off();
  synth.arrive([voice('Tingting', 'zh-CN')]);
  assert.equal(changes, 2, 'unsubscribing stops the callbacks');
});

test('a local voice is preferred, and a remote service is used only by name', async () => {
  const remote = voice('Google 普通话', 'zh-CN', false, true);
  const local = voice('Tingting', 'zh-CN', true);
  const { synth, speech } = adapter([remote, local]);

  // The remote one is the platform default and comes first in the list; the on-device
  // one still wins, because custom text must not leave the device by accident.
  const caps = speech.getCapabilities('zh-Hans');
  assert.equal(caps.offline, 'local');
  assert.deepEqual(caps.voices.map((v) => v.offline), ['local', 'remote']);
  // The utterance reaches the engine synchronously, so nothing here waits on audio.
  speech.speak(say).catch(() => {});
  assert.equal(synth.spoken[0]?.voice.name, 'Tingting');

  // With only the remote service installed, speech is reported available and
  // off-device, and a bare Speak refuses: sending the text is the reader's decision.
  const { synth: alone, speech: second } = adapter([remote]);
  const only = second.getCapabilities('zh-Hans');
  assert.equal(only.offline, 'remote');
  assert.equal(only.reason, 'remote-only');
  assert.equal(only.voices.length, 1, 'still offered, so it can be chosen');
  await assert.rejects(second.speak(say), (/** @type {any} */ e) => e.reason === 'remote-only');
  assert.deepEqual(alone.spoken, []);

  // Named explicitly, it speaks. That is the explicit choice the rule asks for.
  second.speak({ ...say, voiceId: only.voices[0].id }).catch(() => {});
  assert.equal(alone.spoken[0]?.voice.name, 'Google 普通话');
});

test('a modified voice never beats the voice it modifies', () => {
  // **Reported as "the English voice sounds like a demonic whisper".** A desktop
  // Linux box exposes 8612 voices, because speech-dispatcher lists every espeak
  // variant separately: `English (America)` and then a hundred of
  // `English (America)+Andrea`, `+croak`, `+whisper`. All local, all matching `en`
  // equally, none flagged default -- so every term in the sort tied and the pick
  // fell through to alphabetical order, which has no opinion about whether a voice
  // sounds like a person.
  const base = voice('English (America)', 'en-US');
  const whisper = voice('English (America)+whisper', 'en-US');
  const croak = voice('English (America)+croak', 'en-US');
  // Deliberately listed with the variants first and one of them sorting before the
  // base, so neither input order nor the alphabet can be what produces the answer.
  const { synth, speech } = adapter([croak, whisper, base]);

  speech.speak({ text: 'hello', locale: 'en' }).catch(() => {});
  assert.equal(synth.spoken[0]?.voice.name, 'English (America)');

  // The variants are still offered -- a reader who wants a croak may pick one.
  assert.equal(speech.getCapabilities('en').voices.length, 3);

  // And on a platform with no such convention nothing moves: no name has a `+`,
  // every voice scores the same, and the order is what it always was.
  const plain = adapter([voice('Bravo', 'en-US'), voice('Alpha', 'en-US')]);
  plain.speech.speak({ text: 'hello', locale: 'en' }).catch(() => {});
  assert.equal(plain.synth.spoken[0]?.voice.name, 'Alpha');
});

test('an engine that will not say where it runs is unknown, never local', () => {
  // No `localService` at all, which is what an engine that does not implement the
  // field looks like from here.
  const { speech } = adapter([{ voiceURI: 'uri:Mystery', name: 'Mystery', lang: 'zh-CN' }]);
  const caps = speech.getCapabilities('zh-Hans');
  assert.equal(caps.offline, 'unknown');
  assert.equal(caps.voices[0]?.offline, 'unknown');
  // Usable -- refusing every engine that omits the field would disable speech on
  // whole platforms -- but never counted as an offline capability.
  assert.equal(caps.reason, undefined);
});

test('a stored voice is found by id and never crosses into another language', async () => {
  const tingting = voice('Tingting', 'zh-CN');
  const kyoko = voice('Kyoko', 'ja-JP');
  const { synth, speech } = adapter([tingting, voice('Meijia', 'zh-TW'), kyoko]);
  const stored = speech.getCapabilities('zh-Hans').voices
    .find((v) => v.name === 'Meijia')?.id ?? '';
  assert.ok(stored, 'a voice has a stable identifier of its own');

  speech.speak({ ...say, voiceId: stored }).catch(() => {});
  assert.equal(synth.spoken.at(-1)?.voice.name, 'Meijia');

  // Uninstalled between sessions: another voice for the same language, which is the
  // one substitution that is not a lie about what is being said.
  synth.arrive([tingting, kyoko]);
  speech.speak({ ...say, voiceId: stored }).catch(() => {});
  assert.equal(synth.spoken.at(-1)?.voice.name, 'Tingting');

  // A choice saved on another board does not follow the reader here.
  speech.speak({ text: 'こんにちは', locale: 'ja', voiceId: stored }).catch(() => {});
  assert.equal(synth.spoken.at(-1)?.voice.name, 'Kyoko');
});

test('every utterance cancels the one before it', async () => {
  const { synth, speech } = adapter([voice('Tingting', 'zh-CN')]);
  const gentle = speech.speak({ ...say, text: '轻一点' });
  const stop = speech.speak({ ...say, text: '请停下来' });

  // Cancel before speak, both times. Queueing instead would play "gentler" through
  // to the end and only then say "stop", in that order, which is the wrong one.
  assert.deepEqual(synth.log, ['cancel', 'speak', 'cancel', 'speak']);
  assert.equal(await gentle, 'cancelled');
  synth.finish();
  assert.equal(await stop, 'completed');
  assert.deepEqual(synth.spoken.map((/** @type {any} */ u) => u.text), ['轻一点', '请停下来']);
});

test('a late callback cannot answer for a newer utterance', async () => {
  const { synth, speech } = adapter([voice('Tingting', 'zh-CN')]);
  const first = speech.speak({ ...say, text: 'one' });
  const second = speech.speak({ ...say, text: 'two' });
  assert.equal(await first, 'cancelled');

  // The engine gets round to reporting the first utterance after the second has
  // started. Without the request token it would resolve as a completion, and -- worse
  // -- it would clear the newer request's bookkeeping on the way past.
  synth.spoken[0].onend?.({});
  /** @type {string|null} */ let outcome = null;
  second.then((value) => { outcome = value; });
  speech.stop();
  await flush();
  assert.equal(outcome, 'cancelled', 'the live request still settles');
});

test('stop settles the outstanding request even when the engine says nothing', async () => {
  const { synth, speech } = adapter([voice('Tingting', 'zh-CN')]);
  synth.quiet = true; // an engine that drops a cancelled utterance without an event
  /** @type {string|null} */ let outcome = null;
  speech.speak(say).then((value) => { outcome = value; });
  speech.stop();
  await flush();
  assert.equal(outcome, 'cancelled');
});

test('an interrupted utterance was cancelled; a broken one is a failure', async () => {
  const { synth, speech } = adapter([voice('Tingting', 'zh-CN')]);
  // The specification spells it `canceled`, and an interruption by the platform is
  // the same event. Neither is an error to put on screen.
  const interrupted = speech.speak(say);
  synth.fail('interrupted');
  assert.equal(await interrupted, 'cancelled');

  // Anything else is reported separately from both outcomes, with the engine's own
  // word for it, so a caller can show a small unavailable state and move on.
  const broken = speech.speak(say);
  synth.fail('audio-busy');
  await assert.rejects(broken, (/** @type {any} */ error) => error.reason === 'synthesis-failed'
    && error.detail === 'audio-busy');
});

test('what is spoken is the message, not the label or the gloss', () => {
  const { synth, speech } = adapter([voice('Tingting', 'zh-CN', true)]);
  /** @type {any} */
  const phrase = {
    id: 'hotel-requests.another-towel-please',
    listener: { text: '请再给我一条毛巾', lang: 'zh-Hans', dir: 'ltr' },
    owner: { text: 'Another towel, please', lang: 'en', dir: 'ltr' },
    provenance: 'fixture', confidence: 3, custom: false,
  };
  speech.speakPhrase(phrase, { rate: 0.5 }).catch(() => {});
  const spoken = synth.spoken[0];
  assert.equal(spoken.text, phrase.listener.text);
  // The voice's own regional tag, not the code the board asked in.
  assert.equal(spoken.lang, 'zh-CN');
  // Rate is a number the caller chose from the speed control, handed straight to
  // the voice: no name in between to drift from the numeral on the button.
  assert.equal(spoken.rate, 0.5);
});

test('a browser with no speech at all still answers every question', async () => {
  const speech = createSpeech(undefined, undefined);
  const caps = speech.getCapabilities('zh-Hans');
  assert.equal(caps.provider, 'none');
  assert.equal(caps.reason, 'unsupported');
  assert.deepEqual(caps.voices, []);
  await assert.rejects(speech.speak(say), (/** @type {any} */ e) => e.reason === 'unsupported');
  speech.stop(); // and nothing thrown at a caller who is only tidying up
});

test('asking what the device can do never makes a sound', () => {
  const { synth, speech } = adapter([voice('Tingting', 'zh-CN')]);
  speech.getCapabilities('zh-Hans');
  speech.onVoicesChanged(() => {});
  synth.arrive([voice('Tingting', 'zh-CN'), voice('Samantha', 'en-US')]);
  speech.stop();
  assert.deepEqual(synth.spoken, [], 'only a reader\'s tap speaks');
});
