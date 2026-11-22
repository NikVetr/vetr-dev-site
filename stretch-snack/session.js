import { get, formatTime, readLocal, writeLocal } from './dom.js';
import { postureChangeSeconds } from './core/plan.js';
import { renderMovement } from './demo.js';
import { speakerWithClips, stopClips } from './audio/voice.js';
import { changePosition } from './audio/cues.js';

const player = get('player', 'dialog');
const scene = get('player-canvas', 'canvas');
const audio = get('audio', 'select');
const pausedButton = get('pause', 'button');
const shorter = get('shorten', 'button');
const longer = get('extend', 'button');
const back = get('previous', 'button');
const audioStatus = get('audio-status', 'output');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let session = null;
let frame = 0;
let context;
let spoken = -1;

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
  return session.transferring ? changePosition : current.move.name + '. ' + current.move.cue;
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

function showStep() {
  const s = session,
    current = s.steps[s.index];
  get('player-progress', 'span').textContent = 'Movement ' + (s.index + 1) + ' of ' + s.steps.length;
  get('player-name', 'h2').textContent = current.move.name;
  s.transferring = Boolean(s.transition);
  back.disabled = s.index === 0;
  const cue =
    current.move.cue + (current.reps ? ' A comfortable target is ' + current.reps + ' repetitions.' : '');
  const message = s.transferring ? changePosition : cue;
  get('player-cue', 'p').textContent = message;
  const next = s.steps[s.index + 1];
  get('player-next', 'p').textContent = next ? 'Up next · ' + next.move.name : 'Final movement';
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
  frame = 0;
  const s = session;
  if (!s) return;
  const now = performance.now();
  if (!s.paused) s.elapsed += (now - s.previous) / 1000;
  s.previous = now;
  const step = s.steps[s.index];
  const duration = visitSeconds(s);
  if (s.elapsed >= duration && !s.paused) {
    navigate(1);
    return;
  }
  if (s.transferring && s.elapsed >= s.transition) {
    s.transferring = false;
    const cue = step.move.cue + (step.reps ? ' A comfortable target is ' + step.reps + ' repetitions.' : '');
    get('player-cue', 'p').textContent = cue;
    if (!s.paused && audio.value === 'voice') speak(currentInstruction());
  }
  const remain = Math.max(0, Math.ceil(duration - s.elapsed));
  if (remain !== s.lastDisplay) {
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
  if (!s.lastDraw || (!motion.matches && !s.transferring && now - s.lastDraw >= 46) || s.paused) {
    renderMovement(
      scene,
      step.move,
      motion.matches || s.transferring ? 1 : Math.max(0, s.elapsed - s.transition),
      { location: s.location, dark: document.documentElement.dataset.theme === 'dark' },
    );
    s.lastDraw = now;
  }
  if (!s.paused) frame = requestAnimationFrame(draw);
}

function pause() {
  if (!session || session.paused) return;
  session.elapsed = Math.min(
    visitSeconds(session),
    session.elapsed + (performance.now() - session.previous) / 1000,
  );
  session.paused = true;
  releaseScreen(session);
  pausedButton.textContent = 'Resume';
  stopSpeech();
  cancelAnimationFrame(frame);
  draw();
}
function recordAttempt(s) {
  if (s.elapsed >= s.transition + 1) s.attempted.add(s.steps[s.index].move.id);
}
function navigate(offset) {
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
  // A skip during a transfer can leave the traveler between postures.
  s.transition = from.move.pose !== next.move.pose || s.transferring ? postureChangeSeconds : 0;
  s.elapsed = 0;
  s.previous = performance.now();
  s.lastDraw = 0;
  showStep();
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
  s.onFinish([...s.attempted], s.location);
}

export function startSession(steps, location, onFinish) {
  if (!steps.length || session) return;
  audio.value = readLocal('audio', 'silent');
  const total = steps.reduce((sum, item) => sum + item.seconds, 0);
  session = {
    steps: steps.map(step => ({...step})),
    transition: 0,
    location,
    onFinish,
    total,
    index: 0,
    elapsed: 0,
    previous: performance.now(),
    paused: false,
    attempted: new Set(),
    lastDraw: 0,
    lastDisplay: -1,
  };
  pausedButton.textContent = 'Pause';
  player.showModal();
  // Fullscreen the session content. Promoting the root above a modal can paint the planner over it.
  if (document.fullscreenEnabled) player.firstElementChild.requestFullscreen().catch(() => {});
  keepAwake();
  prepareAudio();
  showStep();
  draw();
  pausedButton.focus();
}

pausedButton.addEventListener('click', () => {
  if (!session) return;
  if (!session.paused) {
    pause();
    return;
  }
  session.paused = false;
  session.previous = performance.now();
  pausedButton.textContent = 'Pause';
  keepAwake();
  prepareAudio();
  if (audio.value === 'voice') speak(currentInstruction());
  draw();
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
  e.preventDefault();
  pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});
window.addEventListener('resize', () => {
  if (session) {
    session.lastDraw = 0;
    if (session.paused) draw();
  }
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
