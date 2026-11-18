import { makeScene, frame, paint, duration, submit } from './core.mjs';
const el = (id) => document.getElementById(id);
const input = (id) => /** @type {HTMLInputElement} */ (el(id));
const canvas = /** @type {HTMLCanvasElement} */ (el('screen'));
const ctx = canvas.getContext('2d');
const status = el('status'),
  play = /** @type {HTMLButtonElement} */ (el('play'));
const video = /** @type {HTMLButtonElement} */ (el('video'));
let scene,
  picture,
  playing = false,
  start = 0,
  raf = 0,
  recorder,
  pendingImage = 0,
  imageLoading = false;
function show(t) {
  input('time').value = t.toFixed(2);
  el('clock').textContent = t.toFixed(2) + ' / ' + duration + ' s';
  paint(ctx, frame(scene, t), picture);
}
function configure() {
  try {
    scene = makeScene({
      title: input('title').value,
      alphabet: input('alphabet').value,
      seed: input('seed').valueAsNumber,
      hiddenWords: input('words')
        .value.split(/\r?\n/)
        .map((w) => w.trim())
        .filter(Boolean),
      mode: input('mode').value,
      crt: input('crt').valueAsNumber,
    });
    const rainOnly = scene.mode === 'rain';
    input('title').disabled = rainOnly;
    input('image').disabled = rainOnly;
    input('reset-image').disabled = rainOnly;
    status.textContent = '';
    show(input('time').valueAsNumber);
    play.disabled = false;
    input('still').disabled = false;
    video.disabled = !mime || imageLoading;
  } catch (e) {
    stop();
    status.textContent = e.message;
    play.disabled = true;
    video.disabled = true;
    input('still').disabled = true;
  }
}
function stop() {
  playing = false;
  cancelAnimationFrame(raf);
  play.textContent = 'Play';
  if (recorder?.state === 'recording') recorder.stop();
}
let last = 0;
function tick(now) {
  if (!playing) return;
  const t = Math.min(duration, (now - start) / 1000);
  if (now - last >= 1000 / 30 || t === duration) {
    show(t);
    last = now;
  }
  if (t === duration) stop();
  else raf = requestAnimationFrame(tick);
}
function begin(t) {
  show(t);
  start = performance.now() - t * 1000;
  last = 0;
  playing = true;
  play.textContent = 'Pause';
  raf = requestAnimationFrame(tick);
}
play.onclick = () =>
  playing ? stop() : begin(input('time').valueAsNumber === duration ? 0 : input('time').valueAsNumber);
input('time').oninput = () => {
  stop();
  show(input('time').valueAsNumber);
};
for (const key of ['title', 'alphabet', 'words', 'mode', 'seed', 'crt']) input(key).oninput = configure;
async function loadImage(url) {
  const id = ++pendingImage;
  imageLoading = true;
  video.disabled = true;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
    if (id === pendingImage) {
      picture = img;
      el('reset-image').hidden = url === demo;
      show(input('time').valueAsNumber);
      status.textContent = '';
    }
  } catch {
    if (id === pendingImage) status.textContent = 'This image could not be decoded.';
  } finally {
    if (id === pendingImage) {
      imageLoading = false;
      video.disabled = !mime || play.disabled;
    }
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
const demo = './nik-reflection.webp';
const labNames =
  'NATHAN OLIVIA MARIANNE TIFFANY NICOLE MIKE PAGÉ EMILY TANNER STEPHEN DANIEL KAMERON JAROD KEVIN NIKKI RACHEL NIKOLAI'.split(
    ' ',
  );
el('lab-names').onclick = () => {
  const words = input('words');
  const existing = words.value
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean);
  words.value = [...new Set([...existing, ...labNames])].join('\n');
  configure();
};
el('reset-image').onclick = () => {
  input('image').value = '';
  return loadImage(demo);
};
input('image').onchange = () => {
  const file = input('image').files[0];
  return loadImage(file ? URL.createObjectURL(file) : demo);
};
function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
el('still').onclick = () =>
  canvas.toBlob((blob) => {
    if (blob) save(blob, 'matrix-frame.png');
    else status.textContent = 'The frame could not be encoded.';
  });
const mime =
  typeof MediaRecorder !== 'undefined' &&
  typeof canvas.captureStream === 'function' &&
  ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
video.title = mime ? 'Record the full 16-second sequence' : 'Video recording is unavailable in this browser';
video.onclick = () => {
  stop();
  let stream;
  const lock = (disabled) => {
    for (const id of ['settings', 'time', 'video', 'play']) input(id).disabled = disabled;
  };
  try {
    stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream, { mimeType: mime });
    let failed = false;
    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      lock(false);
      if (failed) return;
      if (chunks.length) {
        save(new Blob(chunks, { type: mime }), 'matrix-opening.' + (mime.includes('mp4') ? 'mp4' : 'webm'));
        status.textContent = 'Recording saved.';
      } else status.textContent = 'The recorder produced no frames.';
    };
    recorder.onerror = () => {
      failed = true;
      status.textContent = 'Video recording failed.';
      stop();
    };
    show(0);
    recorder.start();
    lock(true);
    status.textContent = 'Recording the 16-second sequence…';
    begin(0);
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    lock(false);
    status.textContent = e.message;
  }
};
Object.assign(window, { MatrixRain: { submit, paint } });
configure();
loadImage(demo);
