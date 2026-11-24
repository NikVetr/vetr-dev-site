import { get, formatTime, readLocal, writeLocal } from './dom.js';
import { postureChangeSeconds, transferSeconds } from './core/plan.js';
import { locations } from './core/catalog.js';
import { renderMovement } from './demo.js';
import { movementCamera, blendCamera } from './camera.js';
import { speakerWithClips, stopClips } from './audio/voice.js';
import { changePosition, travelCues } from './audio/cues.js';

const player = get('player', 'dialog');
const stage = get('player-stage', 'div');
const scene = get('player-canvas', 'canvas');
const audio = get('audio', 'select');
const pausedButton = get('pause', 'button');
const shorter = get('shorten', 'button');
const longer = get('extend', 'button');
const back = get('previous', 'button');
const audioStatus = get('audio-status', 'output');
const travelControls = get('travel-controls', 'div');
const travelClock = get('travel-clock', 'span');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const cameraDialog = get('camera-settings', 'dialog');
const guided = get('camera-guided', 'input');
const fixed = get('camera-fixed', 'input');
const zoom = get('camera-zoom', 'input');
const rotation = get('camera-rotation', 'input');
const storedCamera = readLocal('camera', {});
guided.checked = storedCamera?.mode !== 'fixed';
fixed.checked = !guided.checked;
zoom.checked = storedCamera?.zoom !== false;
rotation.checked = storedCamera?.rotation !== false;
get('camera-movement', 'fieldset').disabled = fixed.checked;
const cameraTravelSeconds = 1.2;
/** @typedef {import('./camera.js').Camera} Camera */
/** @typedef {{move:(typeof import('./core/catalog.js').moves)[number], location:string, seconds:number, transition:number, reps?:number}} Step */
/** @typedef {{steps:Step[], location:string, onFinish:(ids:string[],location:string,usedLocations:string[])=>void, total:number,
 * index:number, elapsed:number, previous:number, transition:number, transferring:boolean, paused:boolean,
 * travelFrom:string|null, visited:Set<string>,
 * attempted:Set<string>, screenLock:WakeLockSentinel|null, lastDraw:number, lastDisplay:number,
 * cameraTarget:Camera, cameraFrom:Camera|null, cameraElapsed:number, displayCamera:Camera}} Session */
/** @type {Session|null} */
let session = null;
let frame = 0;
let context;
let spoken = -1;
/** @type {Session|null} */
let resumeAfterSettings = null;

/** @param {Parameters<typeof movementCamera>[0]} move */
export function sessionCamera(move) {
  return movementCamera(move, {zoom: guided.checked && zoom.checked, rotation: guided.checked && rotation.checked});
}

// A skip, including one partway through a pan, departs from the last rendered
// view. The transfer timer and the camera can finish at different times.
/** @param {Session} s @param {boolean} [animate] */
function aimCamera(s, animate = true) {
  s.cameraTarget = sessionCamera(s.steps[s.index].move);
  s.cameraFrom = animate && !motion.matches && guided.checked && (zoom.checked || rotation.checked)
    ? s.displayCamera : null;
  s.cameraElapsed = 0;
  s.lastDraw = 0;
}

/** @param {Session} s */
function drawCamera(s) {
  const progress = s.cameraElapsed / cameraTravelSeconds;
  if (progress >= 1) s.cameraFrom = null;
  s.displayCamera = s.cameraFrom ? blendCamera(s.cameraFrom, s.cameraTarget, progress) : s.cameraTarget;
  return s.displayCamera;
}

async function keepAwake() {
  const current = session;
  if (!current || current.paused || !('wakeLock' in navigator)) return;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (session !== current || current.paused) await lock.release();
    else current.screenLock = lock;
  } catch {
    /* The browser can decline when power saving is active. */
  }
}
function releaseScreen(current) {
  current.screenLock?.release().catch(() => {});
  current.screenLock = null;
}

function playTone(hertz, duration) {
  if (!context || context.state !== 'running') return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  oscillator.frequency.value = hertz;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(now + duration + 0.01);
}

function stopSpeech() {
  stopClips();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function speak(text) {
  if (audio.value !== 'voice') return false;
  stopSpeech();
  const voice =
    'speechSynthesis' in window &&
    speechSynthesis.getVoices().find((v) => v.localService && v.lang.toLowerCase().startsWith('en'));
  if (voice) {
    const msg = new SpeechSynthesisUtterance(text);
    msg.voice = voice;
    msg.lang = voice.lang;
    speechSynthesis.speak(msg);
    return true;
  }
  const fallback = () => {
    audioStatus.textContent = 'Speech unavailable. Using countdown tones.';
    playTone(420, 0.1);
  };
  return speakerWithClips(context, text, fallback);
}

function currentInstruction() {
  if (!session) return '';
  const current = session.steps[session.index];
  if (session.transferring) return session.travelFrom ? travelCues[current.location] : changePosition;
  return current.move.name + '. ' + current.move.cue;
}

function prepareAudio() {
  audioStatus.textContent = '';
  if (audio.value === 'silent') return;
  const Audio = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
  if (!Audio) {
    audioStatus.textContent = 'Countdown tones are unavailable in this browser.';
    return;
  }
  if (!context) context = new Audio();
  context.resume().catch(() => {
    audioStatus.textContent = 'Allow audio on this page to hear the countdown.';
  });
}

/** @param {Session} s */
function showStep(s) {
  const current = s.steps[s.index];
  get('player-progress', 'span').textContent = 'Movement ' + (s.index + 1) + ' of ' + s.steps.length;
  get('player-name', 'h2').textContent = current.move.name;
  const place = get('player-place', 'p');
  place.hidden = s.steps.every(step => step.location === s.location);
  place.textContent = locations[current.location];
  s.transferring = Boolean(s.transition);
  aimCamera(s);
  back.disabled = s.index === 0;
  const cue =
    current.move.cue + (current.reps ? ' A comfortable target is ' + current.reps + ' repetitions.' : '');
  travelControls.hidden = !s.travelFrom;
  get('player-cue', 'p').textContent = s.transferring ? currentInstruction() : cue;
  const next = s.steps[s.index + 1];
  get('player-next', 'p').textContent = next
    ? 'Up next · ' + next.move.name + (next.location !== current.location ? ' · ' + locations[next.location] : '')
    : 'Final movement';
  get('skip', 'button').textContent = next ? 'Next' : 'Finish';
  if (!s.paused && audio.value !== 'silent' && !speak(currentInstruction())) playTone(660, 0.2);
  spoken = -1;
  s.lastDisplay = -1;
}

// Replace the forward sequence’s transfer allowance with the one needed on this visit.
function visitSeconds(s) {
  const step = s.steps[s.index];
  return step.seconds - step.transition + s.transition;
}

function draw() {
  cancelAnimationFrame(frame);
  frame = 0;
  const s = session;
  if (!s) return;
  const now = performance.now();
  if (!s.paused) {
    const delta = (now - s.previous) / 1000;
    s.elapsed += delta;
    if (s.cameraFrom) s.cameraElapsed += delta;
  }
  s.previous = now;
  const step = s.steps[s.index];
  const duration = visitSeconds(s);
  if (s.elapsed >= duration && !s.paused) {
    navigate(1, s.elapsed - duration);
    return;
  }
  if (s.transferring && s.elapsed >= s.transition) {
    s.transferring = false;
    s.travelFrom = null;
    travelControls.hidden = true;
    s.lastDraw = 0;
    const cue = step.move.cue + (step.reps ? ' A comfortable target is ' + step.reps + ' repetitions.' : '');
    get('player-cue', 'p').textContent = cue;
    if (!s.paused && audio.value === 'voice') speak(currentInstruction());
  }
  const remain = Math.max(0, Math.ceil(duration - s.elapsed));
  if (remain !== s.lastDisplay) {
    if (s.travelFrom) travelClock.textContent = formatTime(Math.ceil(s.transition - s.elapsed)) + ' to change places';
    shorter.disabled = remain <= 10 || duration - s.transition - 10 < 5;
    longer.disabled = Math.max(duration, step.seconds) + 10 > 180;
    get('step-clock', 'strong').textContent = formatTime(remain);
    const remainingTotal = remain + s.steps.slice(s.index + 1).reduce((sum, item) => sum + item.seconds, 0);
    get('total-clock', 'span').textContent = formatTime(remainingTotal) + ' total left';
    const total = s.total + s.transition - step.transition;
    get('progress-fill', 'i').style.width = ((total - remainingTotal) / total) * 100 + '%';
    s.lastDisplay = remain;
    if (!s.paused && remain > 0 && remain <= 5 && remain !== spoken) {
      spoken = remain;
      if (audio.value !== 'silent' && !speak(String(remain))) playTone(420, 0.1);
    }
  }
  if (!s.lastDraw || (!motion.matches && (!s.transferring || s.cameraFrom) && now - s.lastDraw >= 1000 / 30 - 1) || s.paused) {
    renderMovement(
      scene,
      step.move,
      s.transferring ? 0 : motion.matches ? 2 : Math.max(0, s.elapsed - s.transition),
      { location: step.location, dark: document.documentElement.dataset.theme === 'dark', camera: drawCamera(s) },
    );
    s.lastDraw = now;
  }
  if (!s.paused) frame = requestAnimationFrame(draw);
}

function pause() {
  if (!session || session.paused) return;
  const delta = (performance.now() - session.previous) / 1000;
  session.elapsed = Math.min(visitSeconds(session), session.elapsed + delta);
  if (session.cameraFrom) session.cameraElapsed += delta;
  session.paused = true;
  releaseScreen(session);
  pausedButton.textContent = 'Resume';
  stopSpeech();
  cancelAnimationFrame(frame);
  draw();
}
function recordAttempt(s) {
  if (s.elapsed >= s.transition + 1) {
    const step = s.steps[s.index];
    s.attempted.add(step.move.id);
    s.visited.add(step.location);
  }
}
function navigate(offset, carrySeconds = 0) {
  const s = session;
  if (!s || s.index + offset < 0) return;
  if (s.index + offset === s.steps.length) {
    finish();
    return;
  }
  cancelAnimationFrame(frame);
  stopSpeech();
  recordAttempt(s);
  const from = s.steps[s.index];
  s.index += offset;
  const next = s.steps[s.index];
  if (s.travelFrom && next.location === s.travelFrom) {
    // Turning back just after departure shouldn't cost a second full trip.
    s.transition = Math.min(s.transition, Math.ceil(s.elapsed));
    s.travelFrom = s.transition ? from.location : null;
  } else if (s.travelFrom && from.location === next.location) {
    // Skipping an exercise en route doesn't put the traveler at the destination.
    s.transition = Math.max(0, Math.ceil(s.transition - s.elapsed));
    if (!s.transition) s.travelFrom = null;
  } else {
    const transfer = transferSeconds(s.location, from.location, next.location, from.move.pose, next.move.pose);
    s.transition = s.transferring ? Math.max(transfer, postureChangeSeconds) : transfer;
    s.travelFrom = from.location !== next.location ? from.location : null;
  }
  s.elapsed = carrySeconds;
  s.previous = performance.now();
  s.lastDraw = 0;
  showStep(s);
  s.cameraElapsed = carrySeconds;
  draw();
}
function finish() {
  const s = session;
  if (!s) return;
  recordAttempt(s);
  cancelAnimationFrame(frame);
  stopSpeech();
  // Leave the dialog managed by the browser's top layer. It also fills iOS viewports without the Fullscreen API.
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  releaseScreen(s);
  player.close();
  session = null;
  s.onFinish([...s.attempted], s.location, [...s.visited]);
}

/** @param {(Omit<Step,'location'> & {location?:string})[]} steps @param {string} location @param {Session['onFinish']} onFinish */
export function startSession(steps, location, onFinish) {
  if (!steps.length || session) return;
  audio.value = readLocal('audio', 'silent');
  const total = steps.reduce((sum, item) => sum + item.seconds, 0);
  const overview = movementCamera(steps[0].move, {zoom:false, rotation:false});
  session = {
    steps: steps.map(step => ({...step, location:step.location ?? location})),
    transition: steps[0].transition,
    travelFrom: steps[0].location && steps[0].location !== location ? location : null,
    visited: new Set(),
    location,
    onFinish,
    total,
    index: 0,
    elapsed: 0,
    previous: performance.now(),
    paused: false,
    transferring: false,
    screenLock: null,
    displayCamera: overview,
    cameraTarget: overview,
    cameraFrom: null,
    cameraElapsed: 0,
    attempted: new Set(),
    lastDraw: 0,
    lastDisplay: -1,
  };
  pausedButton.textContent = 'Pause';
  player.showModal();
  // Fullscreen the session content. Promoting the root above a modal can paint the planner over it.
  if (document.fullscreenEnabled) stage.requestFullscreen().catch(() => {});
  keepAwake();
  prepareAudio();
  showStep(session);
  draw();
  pausedButton.focus();
}

function resume() {
  if (!session?.paused) return;
  session.paused = false;
  session.previous = performance.now();
  pausedButton.textContent = 'Pause';
  keepAwake();
  prepareAudio();
  if (audio.value === 'voice') speak(currentInstruction());
  draw();
}
pausedButton.addEventListener('click', () => session?.paused ? resume() : pause());
get('arrived', 'button').addEventListener('click', () => {
  if (!session?.travelFrom) return;
  session.elapsed = session.transition;
  session.previous = performance.now();
  draw();
  pausedButton.focus();
});
function adjustTime(seconds) {
  const s = session;
  if (!s) return;
  const step = s.steps[s.index];
  if ((seconds < 0 && shorter.disabled) || (seconds > 0 && longer.disabled)) return;
  cancelAnimationFrame(frame);
  if (spoken > 0) stopSpeech();
  spoken = -1;
  step.seconds += seconds;
  s.total += seconds;
  s.lastDisplay = -1;
  draw();
}
shorter.addEventListener('click', () => adjustTime(-10));
longer.addEventListener('click', () => adjustTime(10));
back.addEventListener('click', () => navigate(-1));
get('skip', 'button').addEventListener('click', () => navigate(1));
get('finish', 'button').addEventListener('click', finish);
player.addEventListener('cancel', (e) => {
  if (e.target !== player) return;
  e.preventDefault();
  pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    resumeAfterSettings = null;
    pause();
  }
});
function refreshScene() {
  if (session) {
    session.lastDraw = 0;
    if (session.paused) draw();
  }
}
window.addEventListener('resize', refreshScene);
motion.addEventListener('change', () => {
  get('camera-hint', 'p').hidden = !motion.matches;
  if (session) aimCamera(session, !session.paused);
  refreshScene();
});
document.addEventListener('themechange', refreshScene);
document.addEventListener('stretchbodychange', refreshScene);

for (const trigger of document.querySelectorAll('[data-camera-settings]')) {
  trigger.addEventListener('click', () => {
    resumeAfterSettings = session && !session.paused ? session : null;
    if (resumeAfterSettings) pause();
    // Fullscreen can restrict the top layer to descendants of player-inner.
    (session ? stage : document.body).append(cameraDialog);
    get('camera-hint', 'p').hidden = !motion.matches;
    cameraDialog.showModal();
  });
}
cameraDialog.addEventListener('change', event => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'trainer-body') return;
  get('camera-movement', 'fieldset').disabled = fixed.checked;
  writeLocal('camera', {mode: fixed.checked ? 'fixed' : 'guided', zoom: zoom.checked, rotation: rotation.checked});
  if (session) {
    aimCamera(session, !session.paused);
    refreshScene();
  }
  document.dispatchEvent(new Event('stretchcamerachange'));
});
cameraDialog.addEventListener('close', () => {
  if (resumeAfterSettings && resumeAfterSettings === session && !document.hidden) resume();
  resumeAfterSettings = null;
});
audio.addEventListener('change', () => {
  writeLocal('audio', audio.value);
  stopSpeech();
  prepareAudio();
  if (session && !session.paused && audio.value === 'voice') {
    speak(currentInstruction());
  }
});
if ('speechSynthesis' in window) speechSynthesis.getVoices();
