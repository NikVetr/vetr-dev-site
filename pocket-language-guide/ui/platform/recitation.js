import { speech as browserSpeech } from './speech.js';

/** @typedef {{text:string, locale:string, voiceId?:string, rate?:number}} RecitationAudio */
/** @typedef {{id:string, audio:RecitationAudio[], delayMs:number}} RecitationStep */
/** @typedef {{steps:RecitationStep[], repeat:boolean}} RecitationPlan */
/** @typedef {{status:'preparing'|'playing'|'paused'|'stopped'|'ended'|'error', index:number,
 * id?:string, error?:string, prepared?:number, total?:number}} RecitationState */
/** @typedef {{speak:(audio:RecitationAudio)=>Promise<'completed'|'cancelled'>, stop:()=>void}} Speech */

/** Copy the timeline so a settings change cannot alter a session in progress.
 * @param {RecitationPlan} plan @returns {RecitationPlan} */
function timeline(plan) {
  if (!Array.isArray(plan.steps) || !plan.steps.length) throw new Error('Recitation has no steps');
  const steps = plan.steps.map((step) => {
    if (typeof step.id !== 'string' || !Array.isArray(step.audio)
      || !Number.isFinite(step.delayMs) || step.delayMs < 0) throw new Error('Invalid recitation step');
    const audio = step.audio.map((clip) => {
      if (!clip.text?.trim() || !clip.locale?.trim()
        || (clip.rate != null && (!Number.isFinite(clip.rate) || clip.rate <= 0))) {
        throw new Error('Invalid recitation audio');
      }
      return { ...clip };
    });
    return { ...step, audio };
  });
  if (plan.repeat && steps.every((step) => !step.audio.length && !step.delayMs)) {
    throw new Error('A repeating silent recitation needs a delay');
  }
  return { steps, repeat: Boolean(plan.repeat) };
}

/** Foreground playback; a hidden page pauses until the reader explicitly resumes.
 * @param {object} options
 * @param {Speech} [options.speech]
 * @param {(state:RecitationState)=>void} [options.onState]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 * @param {()=>number} [options.now]
 * @param {Document} [options.document]
 */
export function createWebRecitation({ speech = browserSpeech, onState = () => {},
  setTimer = setTimeout, clearTimer = clearTimeout, now = () => performance.now(),
  document: doc = globalThis.document } = {}) {
  /** @type {RecitationState} */ let state = { status: 'stopped', index: -1 };
  /** @type {RecitationPlan} */ let plan = { steps: [], repeat: false };
  /** @type {ReturnType<typeof setTimeout>|null} */ let timer = null;
  let token = 0;
  let clipIndex = 0;
  let phase = 'audio';
  let remaining = 0;
  let deadline = 0;
  let disposed = false;
  /** @param {RecitationState['status']} status @param {string} [error] */
  function report(status, error) {
    state = { status, index: state.index,
      ...(plan.steps[state.index] ? { id: plan.steps[state.index].id } : {}),
      ...(error ? { error } : {}) };
    onState({ ...state });
  }
  function cancel() {
    token++;
    if (timer !== null) clearTimer(timer);
    timer = null;
    speech.stop();
  }
  /** @param {number} mine */
  async function run(mine) {
    try {
      while (!disposed && mine === token && state.status === 'playing') {
        const step = plan.steps[state.index];
        if (phase === 'audio') {
          if (clipIndex < step.audio.length) {
            const outcome = await speech.speak(step.audio[clipIndex]);
            if (mine !== token || disposed) return;
            if (outcome === 'cancelled') { pause(); return; }
            clipIndex++;
            continue;
          }
          phase = 'delay';
          remaining = step.delayMs;
        }
        if (remaining > 0) {
          deadline = now() + remaining;
          timer = setTimer(() => {
            if (mine !== token || disposed) return;
            timer = null;
            remaining = 0;
            void run(mine);
          }, remaining);
          return;
        }
        if (state.index + 1 === plan.steps.length && !plan.repeat) { report('ended'); return; }
        state.index = (state.index + 1) % plan.steps.length;
        phase = 'audio';
        clipIndex = 0;
        report('playing');
      }
    } catch (error) {
      if (mine !== token || disposed) return;
      cancel();
      report('error', error instanceof Error ? error.message : String(error));
    }
  }
  function pause() {
    if (state.status !== 'playing') return;
    if (phase === 'delay' && timer !== null) remaining = Math.max(0, deadline - now());
    cancel();
    report('paused');
  }
  function resume() {
    if (disposed || state.status !== 'paused' || doc?.hidden) return;
    const mine = ++token;
    report('playing');
    void run(mine);
  }
  function stop() {
    cancel();
    state.index = -1;
    report('stopped');
  }
  const visibility = () => { if (doc.hidden) pause(); };
  doc?.addEventListener('visibilitychange', visibility);
  return {
    background: false,
    /** @param {RecitationPlan} next */
    start(next) {
      if (disposed) throw new Error('Recitation player is disposed');
      const validated = timeline(next);
      cancel();
      plan = validated;
      state.index = 0;
      clipIndex = 0;
      phase = 'audio';
      remaining = 0;
      report(doc?.hidden ? 'paused' : 'playing');
      if (state.status === 'playing') void run(token);
    },
    pause, resume, stop,
    getState: () => ({ ...state }),
    dispose() {
      if (disposed) return;
      disposed = true;
      doc?.removeEventListener('visibilitychange', visibility);
      stop();
    },
  };
}

/** Background sessions belong to the native service, not WebView timers.
 * @param {(state:RecitationState)=>void} onState
 * @param {{background:boolean}} options
 */
export async function createRecitationPlayer(onState, { background }) {
  const cap = /** @type {any} */ (globalThis).Capacitor;
  if (!background || !cap?.isNativePlatform?.()) return createWebRecitation({ onState });
  const plugin = cap.Plugins?.BackgroundRecitation;
  if (!plugin) throw new Error('Background recitation is unavailable');
  let disposed = false;
  let revision = 0;
  /** @type {RecitationState} */ let state = { status: 'stopped', index: -1 };
  /** @param {RecitationState} next */
  const receive = (next) => {
    if (disposed) return;
    revision++;
    state = { ...next };
    onState({ ...state });
  };
  const listener = await plugin.addListener('state', receive);
  /** @param {'start'|'pause'|'resume'|'stop'|'getState'} method @param {RecitationPlan} [request] */
  async function invoke(method, request) {
    if (disposed) throw new Error('Recitation player is disposed');
    const before = revision;
    const next = await plugin[method](...(request ? [request] : []));
    // A notification is newer than a method response captured before that event.
    if (revision === before && next?.status) receive(next);
    return { ...state };
  }
  try { await invoke('getState'); }
  catch (error) { await listener.remove(); throw error; }
  const doc = globalThis.document;
  const visibility = () => {
    if (doc.hidden) return;
    void invoke('getState').catch((error) => receive({ ...state, status: 'error',
      error: error instanceof Error ? error.message : String(error) }));
  };
  doc?.addEventListener('visibilitychange', visibility);
  return {
    background: true,
    /** @param {RecitationPlan} plan */
    start: (plan) => invoke('start', timeline(plan)),
    pause: () => invoke('pause'), resume: () => invoke('resume'), stop: () => invoke('stop'),
    getState: () => invoke('getState'),
    async dispose() {
      if (disposed) return;
      disposed = true;
      doc?.removeEventListener('visibilitychange', visibility);
      try { await plugin.stop(); }
      finally { await listener.remove(); }
    },
  };
}
