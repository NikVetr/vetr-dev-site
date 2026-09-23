// Reading a board's message aloud, where the device happens to have a voice for it.
//
// A conversation board is a *text* feature and this module is an accessory to it.
// Nothing here is awaited before a message is drawn, nothing here is fetched to open
// a board, and a phone with no voice for the listener's language shows the board
// exactly as well as any other phone. That ordering is the design: text first, audio
// if the platform can, and a plain "no voice" when it cannot.
//
// **No voice is an answer, not a failure to route around.** The one thing this
// module must never do is say a sentence in the wrong language. An English voice
// reading Mandarin -- or reading Klingon -- is not a degraded version of the
// feature; it is a defect that sounds like a working feature to everyone in the room
// except the person it was meant for. So `SPOKEN` below is an allow-list matched on
// subtag boundaries, and a language outside it resolves to nothing at all.
//
// **Two globals, taken as arguments.** `speechSynthesis` and
// `SpeechSynthesisUtterance` are the whole of the Web Speech API, so `createSpeech`
// takes both and the exported `speech` binds the real ones. Tests pass a fake, which
// is what makes the cancellation and stale-callback rules provable without an audio
// device; a native provider can be a second factory with the same four methods,
// which is the only seam this needs and a good deal less than a plugin framework.

/** @typedef {'local'|'remote'|'unknown'} Offline */

/**
 * Why speech is not available, when it is not.
 *
 * Both `loading` and `no-voice` mean nothing can be spoken now; they differ in
 * whether it is worth re-asking. `loading` is an engine that has not answered yet,
 * which on a machine with no speech service at all -- a CI container, a bare Linux
 * desktop -- it never will, so a caller shows the same unavailable state for both
 * and only uses the difference to decide whether to listen for a change.
 * @typedef {'unsupported'|'unmapped'|'loading'|'no-voice'|'remote-only'
 *   |'synthesis-failed'} SpeechReason
 */

/**
 * @typedef {Object} VoiceInfo
 * @property {string} id      stable across enumerations; store this, never an index
 * @property {string} name    as the platform names it, for a picker
 * @property {string} lang    the voice's own tag, which may be regional
 * @property {Offline} offline
 */

/**
 * @typedef {Object} Capabilities
 * @property {'web-speech'|'none'} provider
 * @property {string|null} locale   the spoken locale this language resolves to
 * @property {VoiceInfo[]} voices   only voices that may read *this* language
 * @property {Offline} offline      of the voice that would be used, honestly unknown
 * @property {SpeechReason} [reason] present exactly when nothing would be spoken
 */

/** @typedef {'normal'|'slow'} Rate */

/**
 * Rate as a name, not a number.
 *
 * Web Speech's `rate` is a multiplier over "this voice's normal", and normal differs
 * between engines and between two voices of the same engine. What a board needs is
 * "say that again, slower", which is a request about being understood rather than
 * about a multiplier, so the caller names the intent and each provider maps it --
 * the native bridge's scale will not be this one.
 * @type {Record<Rate, number>}
 */
// 0.5 rather than a gentler 0.7, because the control that reaches it is labelled
// `0.5x` and a button that names a number has to be that number.
const RATES = { normal: 1, slow: 0.5 };

/** Local first, then unknown, and a remote service only when it is asked for by id. */
const OFFLINE_RANK = { local: 0, unknown: 1, remote: 2 };

/**
 * Which spoken locale a board language is read in, where that is not just its code.
 *
 * All 53 languages in `data/registry/languages.csv` are keyed by a BCP-47 primary
 * subtag, so for 46 of them the spoken locale *is* that subtag and any voice tagged
 * with it qualifies: `es` takes es-MX or es-ES, `ar` takes any regional Arabic voice
 * for the corpus's Modern Standard text, `pt` takes pt-BR or pt-PT. Those need no
 * entry. Listed here are only the languages where the code and the tag a platform
 * actually ships disagree, and the two where the reviewed answer is no voice.
 *
 * Do not confuse this with the registry's `default_accent` column, which is the
 * reader accent a *respelling* is generated for -- `en-US` there means "spell it for
 * an American reader", not "speak it with an American voice", and `ar-MSA`,
 * `tlh-TA` and `qya-EX` are not locales any engine has heard of.
 *
 * `match` is an ordered allow-list, best first, compared on subtag boundaries by
 * `matchRank` -- and the boundary is load-bearing: a plain `startsWith('ha')` hands
 * Hausa to a `haw-US` Hawaiian voice.
 * @type {Record<string, {locale:string, match:string[]}|null>}
 */
const SPOKEN = {
  // `Hans` is script metadata. The text is Simplified Mandarin, and a `zh-HK` or
  // `yue-*` voice is Cantonese -- a different language sharing the writing system,
  // which is precisely the silent substitution the specification forbids. Putonghua
  // first, Singapore next, Taiwan last: the same language read to a different
  // standard, acceptable only when nothing better is installed. A voice tagged bare
  // `zh` says which script it cannot read and is skipped as ambiguous.
  'zh-Hans': { locale: 'zh-CN', match: ['zh-CN', 'zh-SG', 'cmn', 'zh-Hans', 'zh-TW'] },
  // ISO 639 replaced `iw`, `in` and `jw` with `he`, `id` and `jv` in 1989. Java kept
  // the retired codes for compatibility, and Android's speech locales inherit them,
  // so a device can offer Hebrew as `iw-IL` and mean exactly `he-IL`.
  he: { locale: 'he', match: ['he', 'iw'] },
  id: { locale: 'id', match: ['id', 'in'] },
  jv: { locale: 'jv', match: ['jv', 'jw'] },
  // Filipino is the standardised register of Tagalog. Platforms tag it either way,
  // and a `tl-PH` voice reads `fil` text as its own language, not as a neighbour's.
  fil: { locale: 'fil', match: ['fil', 'tl'] },
  // **No voice, and that is the correct answer.** Both are constructed languages,
  // written here in pIqaD and Tengwar. No shipping engine has either, and the only
  // voice that would accept their text is one that would read it as something else.
  // `null` is reviewed, not missing; callers are told `unmapped` and show text.
  tlh: null,
  qya: null,
};

/** @param {string} code @returns {{locale:string, match:string[]}|null} */
function spokenFor(code) {
  return code in SPOKEN ? SPOKEN[code] : { locale: code, match: [code] };
}

/**
 * The spoken locale a board language resolves to, or `null` when it has none.
 * @param {string} code  a language code as `data/registry/languages.csv` writes it
 * @returns {string|null}
 */
export function resolveSpokenLocale(code) {
  return spokenFor(code)?.locale ?? null;
}

/**
 * How well a voice's own tag matches an allow-list: its index, or -1 for no match.
 *
 * Matching is on subtag boundaries, so `ha` accepts `ha-NG` and rejects `haw-US`,
 * and `zh-CN` accepts `zh-CN` but no part of `zh-HK`. Underscores are normalised
 * because engines bridged from Android report `en_US`.
 * @param {string} lang @param {string[]} tokens
 */
function matchRank(lang, tokens) {
  const tag = String(lang ?? '').replace(/_/g, '-').toLowerCase();
  return tokens.findIndex((token) => {
    const want = token.toLowerCase();
    return tag === want || tag.startsWith(`${want}-`);
  });
}

/**
 * A voice's identifier, stable enough to persist.
 *
 * `voiceURI` is the specified identifier and is what macOS and iOS give
 * (`com.apple.voice.compact.en-US.Samantha`); Chrome gives the display name. Either
 * survives a re-enumeration, which an array index does not -- the list is rebuilt
 * whenever the platform's voice inventory changes, and it is not ordered by anything
 * this module controls.
 * @param {SpeechSynthesisVoice} voice
 */
const idOf = (voice) => voice.voiceURI || voice.name;

/**
 * Whether a voice runs on the device.
 *
 * `localService` is the web's only offline signal and some engines do not set it, so
 * the third answer is `unknown` and it never rounds up to `local`. An unknown
 * service may still be chosen automatically -- refusing everywhere the field is
 * unimplemented would disable speech on whole platforms -- but it is never reported
 * as offline-capable, and a service known to be remote is used only when a caller
 * names it, which is the explicit user choice §6.3 requires before custom text
 * leaves the device.
 * @param {SpeechSynthesisVoice} voice @returns {Offline}
 */
function offlineOf(voice) {
  if (voice.localService === true) return 'local';
  if (voice.localService === false) return 'remote';
  return 'unknown';
}

/** @param {SpeechSynthesisVoice} voice @returns {VoiceInfo} */
const infoOf = (voice) => ({
  id: idOf(voice), name: voice.name, lang: voice.lang, offline: offlineOf(voice),
});

/**
 * @param {SpeechReason} reason @param {string} [locale] @param {string} [detail]
 * @returns {Error & {reason:SpeechReason, locale?:string, detail?:string}}
 */
const failure = (reason, locale, detail) => Object.assign(
  new Error(`speech ${reason}${locale ? ` for ${locale}` : ''}${detail ? `: ${detail}` : ''}`),
  { reason, locale, detail },
);

/**
 * One adapter over one speech API.
 *
 * @param {SpeechSynthesis} [synth]
 * @param {typeof SpeechSynthesisUtterance} [Utterance]
 */
export function createSpeech(
  synth = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
) {
  /**
   * The request token. Every `speak` claims a new one and every callback checks the
   * one it captured, so a voice lookup or an `onend` belonging to a superseded
   * utterance can neither start speech nor report an outcome for the live one.
   */
  let token = 0;
  /** Settles the outstanding `speak` as cancelled without waiting for the engine. */
  let cancelPending = /** @type {(() => void)|null} */ (null);
  /**
   * Whether the voice list has ever been heard from.
   *
   * `getVoices()` is empty on the first call in Chrome and fills in when the engine
   * has loaded its inventory, which is why "none yet" and "none at all" are separate
   * answers: only the first is worth listening for a change on.
   */
  let settled = false;
  /** @type {Set<() => void>} */
  const watchers = new Set();

  /** @returns {SpeechSynthesisVoice[]} */
  function enumerate() {
    // Asked fresh every time rather than cached. The list is the platform's, it
    // changes when someone installs or removes a voice in system settings, and
    // `getVoices` is a synchronous read of an array the engine already holds.
    const list = synth?.getVoices?.() ?? [];
    if (list.length) settled = true;
    return list;
  }

  /**
   * The voices that may read this language, best first.
   * @param {{locale:string, match:string[]}} spoken
   */
  function matching(spoken) {
    return enumerate()
      .filter((voice) => matchRank(voice.lang, spoken.match) >= 0)
      .sort((a, b) => OFFLINE_RANK[offlineOf(a)] - OFFLINE_RANK[offlineOf(b)]
        || matchRank(a.lang, spoken.match) - matchRank(b.lang, spoken.match)
        || (b.default ? 1 : 0) - (a.default ? 1 : 0)
        || variantRank(a) - variantRank(b)
        || a.name.localeCompare(b.name));
  }

  /**
   * A modified voice, behind the voice it modifies.
   *
   * **A desktop Linux box offers eight thousand voices**, because speech-dispatcher
   * exposes every espeak variant as an entry of its own: `English (America)` and
   * then `English (America)+Andrea`, `+Boris`, `+croak`, `+whisper` and a hundred
   * more, all of them local, all of them matching `en` equally well. Every term
   * above this one ties, so the pick fell through to alphabetical order -- which
   * has no opinion about whether a voice sounds like a person, and cheerfully
   * hands back a croak or a whisper.
   *
   * `+` is espeak's own separator between a base voice and the variant applied to
   * it, so this costs nothing on a platform that does not use the convention: no
   * name contains one, every voice scores 0, and the order is exactly what it was.
   * @param {SpeechSynthesisVoice} voice
   */
  const variantRank = (voice) => (voice.name.includes('+') ? 1 : 0);

  /** The voice a bare Speak would use: the best one that is not a remote service. */
  const autoPick = (/** @type {SpeechSynthesisVoice[]} */ voices) => voices
    .find((voice) => offlineOf(voice) !== 'remote');

  /**
   * What this device can say in this language, right now.
   *
   * Synchronous, and safe to call while drawing. It reports the present state and
   * never waits for one -- a caller renders the board, renders Speak from whatever
   * this says, and re-asks from `onVoicesChanged` if the inventory arrives late.
   * Making this a promise would invite someone to await it before painting text.
   * @param {string} code @returns {Capabilities}
   */
  function getCapabilities(code) {
    if (!synth || !Utterance) {
      return { provider: 'none', locale: null, voices: [], offline: 'unknown', reason: 'unsupported' };
    }
    const spoken = spokenFor(code);
    if (!spoken) {
      return { provider: 'web-speech', locale: null, voices: [], offline: 'unknown', reason: 'unmapped' };
    }
    const voices = matching(spoken);
    const auto = autoPick(voices);
    const common = { provider: /** @type {const} */ ('web-speech'), locale: spoken.locale, voices: voices.map(infoOf) };
    if (auto) return { ...common, offline: offlineOf(auto) };
    // Remote voices exist but none may be used without being asked for by name, so
    // the honest report is that speech is available and off-device, not that it is
    // missing: the reader is the one who decides whether to send text to it.
    if (voices.length) return { ...common, offline: 'remote', reason: 'remote-only' };
    return { ...common, offline: 'unknown', reason: settled ? 'no-voice' : 'loading' };
  }

  /**
   * Cancel whatever is speaking or queued.
   *
   * Settles the outstanding `speak` as `cancelled` itself rather than trusting the
   * engine to deliver an event for an utterance it has just thrown away, so a caller
   * awaiting an outcome is never left holding a promise nothing will resolve.
   */
  function stop() {
    token += 1;
    const settle = cancelPending;
    cancelPending = null;
    settle?.();
    synth?.cancel?.();
  }

  /**
   * Say one message, having cancelled anything already saying something else.
   *
   * Resolves `completed` or `cancelled`; a failure **rejects**, with a `reason` on
   * the error, because "we stopped it" and "this device could not say it" call for
   * different things on screen and a single return value blurs them.
   *
   * Nothing is awaited on the way to `synth.speak`: the voice lookup is synchronous
   * and the engine is handed the utterance inside the promise's executor, so this
   * still runs within the click that called it. Safari ties the first utterance of a
   * page to a user gesture, and an `await` anywhere above here would spend it.
   *
   * @param {object} request
   * @param {string} request.text     the full message, and nothing else
   * @param {string} request.locale   a board language code, not a voice tag
   * @param {string} [request.voiceId] a previously stored `VoiceInfo.id`
   * @param {Rate} [request.rate]
   * @returns {Promise<'completed'|'cancelled'>}
   */
  function speak({ text, locale, voiceId, rate = 'normal' }) {
    // **Cancel first, always.** `speechSynthesis` is a queue: speaking without
    // cancelling means the gentler request the reader just replaced plays through
    // before the stop they replaced it with, which on a massage table is the exact
    // opposite of what the tap meant.
    stop();
    const mine = token;

    if (!synth || !Utterance) return Promise.reject(failure('unsupported'));
    const spoken = spokenFor(locale);
    if (!spoken) return Promise.reject(failure('unmapped', locale));

    const voices = matching(spoken);
    // A stored id is looked up only among the voices for *this* language, so a
    // choice saved for one board cannot follow the reader onto another and read
    // Japanese with a Spanish voice. A voice uninstalled since it was chosen falls
    // back to the automatic pick -- a different voice for the same language, which
    // is the one substitution that is not a lie.
    const chosen = (voiceId && voices.find((voice) => idOf(voice) === voiceId))
      || autoPick(voices);
    if (!chosen) {
      return Promise.reject(failure(
        voices.length ? 'remote-only' : settled ? 'no-voice' : 'loading', locale,
      ));
    }

    return new Promise((resolve, reject) => {
      cancelPending = () => resolve('cancelled');
      const utterance = new Utterance(text);
      utterance.voice = chosen;
      // The voice's own tag rather than the requested one: engines take `lang` as a
      // hint about the text, and disagreeing with the voice they were also handed
      // has been known to cost the voice.
      utterance.lang = chosen.lang || spoken.locale;
      utterance.rate = RATES[rate];
      utterance.onend = () => {
        if (mine !== token) { resolve('cancelled'); return; }
        cancelPending = null;
        resolve('completed');
      };
      utterance.onerror = (event) => {
        // A superseded utterance reports its own death as an error. It is not one,
        // and it must not surface as a failure banner over the newer message.
        if (mine !== token) { resolve('cancelled'); return; }
        cancelPending = null;
        const error = String(event?.error ?? '');
        if (error === 'canceled' || error === 'interrupted') resolve('cancelled');
        else reject(failure('synthesis-failed', locale, error));
      };
      synth.speak(utterance);
    });
  }

  /**
   * Say the message a board is showing.
   *
   * The primary side, always: `phrase.listener` is the large idiomatic sentence the
   * person being spoken to is reading, and the button label, the owner's gloss, the
   * romanisation and the IPA are all things that must never be read aloud. Taking
   * the phrase rather than a string is what makes that a property of this module
   * instead of a rule every call site has to remember.
   *
   * The answer view swaps the two sides before rendering, so passing the phrase it
   * drew speaks the owner's language there -- audio follows the message on screen.
   * @param {import('../../core/conversation.js').ResolvedPhrase} phrase
   * @param {{voiceId?:string, rate?:Rate}} [options]
   */
  function speakPhrase(phrase, options = {}) {
    return speak({ text: phrase.listener.text, locale: phrase.listener.lang, ...options });
  }

  /**
   * Run `listener` whenever the platform's voice inventory changes. Returns an
   * unsubscribe. The capability object is a snapshot; this is how a caller learns to
   * take another one.
   * @param {() => void} listener
   */
  function onVoicesChanged(listener) {
    watchers.add(listener);
    return () => watchers.delete(listener);
  }

  synth?.addEventListener?.('voiceschanged', () => {
    // An empty list after this event means empty, not pending.
    settled = true;
    for (const watcher of watchers) watcher();
  });

  const doc = globalThis.document;
  if (doc) {
    // Backgrounding stops speech (§4.5). Owned here rather than by each page because
    // it is a fact about audio and nothing else, and because a board left talking
    // into a pocket is the failure nobody remembers to write the listener for.
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) stop(); });
    // Chrome's synthesiser outlives the document that started it, so a navigation
    // away from a speaking board keeps speaking into the next page.
    globalThis.addEventListener('pagehide', () => stop());
  }

  return { getCapabilities, speak, speakPhrase, stop, onVoicesChanged };
}

/**
 * The page's adapter, over the real browser API.
 *
 * Nothing is spoken by creating it, by enumerating voices, or by a setting changing
 * -- `speak` is the only thing here that makes a sound, and only a reader's tap
 * calls it.
 */
export const speech = createSpeech();
