// Coordinates are in a 960 × 540 view. Seeking a frame never advances shared state.
import { checkRequestKeys, invalidRequest } from '../shared/request.js';
import { mulberry32 } from '../shared/rng.js';
export const duration = 16;
const clamp = (x) => Math.max(0, Math.min(1, x));
function ease(time, start, end) {
  const x = clamp((time - start) / (end - start));
  return x * x * (3 - 2 * x);
}
// Integrating a sinusoidal speed gives a smooth push with parked endpoints.
function push(time, start, end) {
  return (1 - Math.cos(Math.PI * clamp((time - start) / (end - start)))) / 2;
}
function lastLetters(letters) {
  const historic = letters.join('').toUpperCase() === 'THE MONTGOMERY LAB';
  if (historic) {
    const go = letters.join('').toUpperCase().indexOf('GO');
    return [go, go + 1];
  }
  const mid = (letters.length - 1) / 2;
  const visible = letters.map((c, i) => c.trim() ? i : -1).filter(i => i >= 0);
  const pairs = visible.filter(i => letters[i + 1]?.trim());
  if (pairs.length) {
    const i = pairs.reduce((a, b) => Math.abs(a + .5 - mid) <= Math.abs(b + .5 - mid) ? a : b);
    return [i, i + 1];
  }
  return visible.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid)).slice(0, 1);
}
const columns = 84,
  rows = 30,
  dx = 960 / columns,
  dy = 540 / rows;
const finalZoom = 12;
const outlineScale = 0.78;
const closeupScale = 11.5;

export function makeScene({
  title = 'The Correlation Matrix',
  hiddenWords = [],
  alphabet = 'ACGT',
  seed = 777,
  mode = 'opening',
  crt = 0.76,
} = {}) {
  if (
    typeof title !== 'string' ||
    [...title].length > 40 ||
    typeof alphabet !== 'string' ||
    !alphabet.trim() ||
    [...alphabet].length > 64 ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !['opening', 'rain'].includes(mode) ||
    !Number.isFinite(crt) ||
    crt < 0 ||
    crt > 1
  )
    throw invalidRequest(
      '$',
      'Use a title of up to 40 characters, a nonempty alphabet of up to 64 characters, a 32-bit unsigned seed, a known mode and CRT strength 0–1.',
    );
  if (
    !Array.isArray(hiddenWords) ||
    hiddenWords.length > columns ||
    hiddenWords.some(
      (word) =>
        typeof word !== 'string' ||
        !word.trim() ||
        /[\r\n]/.test(word) ||
        [...word.trim().normalize('NFC')].length > rows,
    )
  )
    throw invalidRequest('hiddenWords', 'Enter up to 84 words or names, with 1–30 characters per line.');
  // Assign every entry a column before distributing a second copy. A separate
  // seed keeps the background streams stable while editing the list.
  const order = Array.from({ length: columns }, (_, i) => i);
  const placement = mulberry32(seed ^ 0x4d415452);
  for (let i = columns - 1; i > 0; i--) {
    const j = Math.floor(placement() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const planted = new Map();
  for (let n = 0; n < Math.min(columns, hiddenWords.length * 2); n++)
    planted.set(order[n], [...hiddenWords[n % hiddenWords.length].trim().normalize('NFC')]);
  const rand = mulberry32(seed);
  const letters = [...title],
    glyphs = [...alphabet];
  const first = Math.floor((columns - letters.length) / 2);
  const survivors = lastLetters(letters);
  const streams = Array.from({ length: columns }, (_, i) => {
    const word = planted.get(i) ?? [];
    const lock = 7.1 + 3.2 * rand(),
      blink = 11.45 + 0.64 * rand(),
      length = Math.max(9 + Math.floor(rand() * 16), word.length + 5);
    const start = 0.1 + rand() * 0.9,
      period = rows + length + 4;
    const letter = letters[i - first] || '';
    const speed = mode === 'opening' && letter ? (period + rows / 2) / (lock - start) : 7.5 + 7.5 * rand();
    return {
      word,
      lock,
      fade: survivors.includes(i - first) ? 12.43 + .16 * survivors.indexOf(i - first) : blink,
      length,
      start,
      speed,
      period,
      letter,
      bright: rand() < 0.5,
      sequence: Array.from({ length: 149 }, () => glyphs[Math.floor(rand() * glyphs.length)]),
    };
  });
  return {
    title,
    mode,
    crt,
    streams,
    targetColumn: survivors.length ? first + .5 + (survivors[0] + survivors.at(-1)) / 2 : columns / 2,
    centerColumn: letters.length ? first + letters.length / 2 : columns / 2,
    letters: letters.filter((c) => c.trim()),
  };
}
/** @param {ReturnType<typeof makeScene>} scene @param {number} time */
export function frame(scene, time, aspect = 16 / 9) {
  if (!Number.isFinite(time) || time < 0 || time > duration)
    throw invalidRequest('time', 'Frame time must be between 0 and 16 seconds.');
  if (!Number.isFinite(aspect) || aspect <= 0) throw invalidRequest('aspect', 'Aspect ratio must be positive.');
  const viewHeight = 960 / aspect, midY = viewHeight / 2;
  const middleRow = Math.max(1, Math.round(midY / dy));
  const rowCount = middleRow * 2, rowStep = midY / middleRow;
  const opening = scene.mode === 'opening';
  const titleZoom = Math.min(3, (columns - 4) / Math.max(1, [...scene.title].length));
  const focus = opening ? ease(time, 13.5, 14.75) : 0;
  const approach = opening ? push(time, 5.4, 10.5) : 0;
  const intoTitle = opening ? push(time, 11.28, 12.83) : 0;
  const travel = opening ? push(time, 13.5, 15.55) : 0;
  const drift = opening ? 0.32 * Math.min(time / 10.5, 1) : 0;
  const titleCamera = 1 + drift + (titleZoom - 1.32) * approach;
  const lastZoom = 7.5;
  const zoom = titleCamera + (lastZoom - titleZoom) * intoTitle + (finalZoom - lastZoom) * travel;
  const glassZoom = zoom * (closeupScale / outlineScale * lastZoom / finalZoom) ** travel;
  const center = columns / 2 + (scene.centerColumn - columns / 2) * approach +
    (scene.targetColumn - scene.centerColumn) * intoTitle;
  const glyphs = [];
  for (const [i, s] of scene.streams.entries()) {
    const x = 480 + (i + 0.5 - center) * dx * zoom;
    if (x < -dx * zoom || x > 960 + dx * zoom) continue;
    const period = rowCount + s.length + 4;
    const speed = opening && s.letter ? (period + middleRow) / (s.lock - s.start) : s.speed;
    const phase = (time - s.start) * speed;
    if (phase < 0) continue;
    const locked = opening && s.letter && time >= s.lock;
    // A title stream makes one pass, then its next head lands on the title.
    // Subsequent tail glyphs are absorbed at that cell, never restarting below it.
    const head = locked ? middleRow + (time - s.lock) * speed : phase % period;
    const fade = locked ? 1 - ease(time, s.fade, s.fade + .12) : 0;
    const rain = opening ? (1 - ease(time, 10.22, 10.85)) * (locked ? 1 - ease(time, s.lock, s.lock + .65) : 1) : 1;
    for (let tail = 0; rain > 0 && tail < s.length; tail++) {
      const row = head - tail;
      if (row < 0 || row >= rowCount || (locked && row >= middleRow - .001)) continue;
      const y = midY + (row - middleRow) * rowStep * zoom;
      if (y < -dy * zoom || y > viewHeight + dy * zoom) continue;
      const index = (Math.floor(phase) - tail + Math.floor(time * 3 + i * 0.37)) % s.sequence.length;
      const glitch =
        Math.imul((i + 1) * 101 + (Math.floor(row) + 1) * 787 + Math.floor(time * 4) * 1543, 2654435761) >>> 0;
      const wordIndex = s.word.length - tail; // read downwards, one glyph behind the head
      const char =
        s.word[wordIndex] ??
        (scene.letters.length && glitch % 100 < 2
          ? scene.letters[glitch % scene.letters.length]
          : s.sequence[index]);
      glyphs.push({
        x,
        y,
        char,
        alpha: (1 - tail / s.length) * rain,
        kind: 'rain', column: i,
        hot: tail === 0 && s.bright,
      });
    }
    if (locked && fade > 0) glyphs.push({ x, y: midY, char: s.letter, alpha: fade, hot: true, kind: 'title', column: i });
  }
  return {
    time,
    viewHeight,
    zoom,
    glyphs,
    crt: scene.crt,
    size: dy * zoom,
    outlineAlpha: opening ? 0.62 * ease(time, 12.8, 13.42) * (1 - focus) : 0,
    imageAlpha: focus,
    cameraProgress: travel,
    blackout: opening ? Math.max(1 - ease(time, 0, .15), ease(time, 15.55, 15.92)) : 0,
    imageZoom: opening ? (glassZoom / lastZoom) * outlineScale : 1 / 8,
    maskPitch: 1.25 * glassZoom,
    rainAlpha: 1 - 0.84 * focus,
    rainBlur: 8 * focus,
  };
}

// Prepare each decoded reflection at a bounded working resolution.
const reflections = new WeakMap();
export function prepareReflection(image) {
  if (reflections.has(image)) return reflections.get(image);
  const canvas = document.createElement('canvas');
  const ratio = Math.min(1, 960 / Math.max(image.width, image.height));
  const w = (canvas.width = Math.max(1, Math.round(image.width * ratio)));
  const h = (canvas.height = Math.max(1, Math.round(image.height * ratio)));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, w, h);
  const pixels = ctx.getImageData(0, 0, w, h);
  const ink = pixels.data;
  const luma = new Float32Array(w * h);
  const opacity = new Uint8Array(w * h);
  let translucent = false;
  for (let i = 0; i < luma.length; i++) {
    opacity[i] = ink[4 * i + 3];
    if (opacity[i] < 255) translucent = true;
    luma[i] = ((0.2126 * ink[4 * i] + 0.7152 * ink[4 * i + 1] + 0.0722 * ink[4 * i + 2]) * opacity[i]) / 255;
  }
  function sobel(channel, i) {
    const gx =
      channel[i - w + 1] +
      2 * channel[i + 1] +
      channel[i + w + 1] -
      channel[i - w - 1] -
      2 * channel[i - 1] -
      channel[i + w - 1];
    const gy =
      channel[i + w - 1] +
      2 * channel[i + w] +
      channel[i + w + 1] -
      channel[i - w - 1] -
      2 * channel[i - w] -
      channel[i - w + 1];
    return Math.hypot(gx, gy);
  }
  ink.fill(0);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      ink[4 * i] = 140;
      ink[4 * i + 1] = 255;
      ink[4 * i + 2] = 186;
      ink[4 * i + 3] = 1.3 * Math.max(sobel(luma, i), translucent ? sobel(opacity, i) : 0);
    }
  ctx.putImageData(pixels, 0, 0);
  const reflection = { outline: canvas, cutout: translucent };
  reflections.set(image, reflection);
  return reflection;
}
function drawGlyphs(ctx, f) {
  ctx.font = '600 ' + f.size + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const g of f.glyphs) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = g.hot ? '#d5fce7' : '#00ff41';
    ctx.shadowColor = '#43ff83';
    ctx.shadowBlur = g.hot ? 3 * f.crt : 0;
    ctx.fillText(g.char, g.x, g.y);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}
const rainLayers = new WeakMap();
const masks = new WeakMap();
function slotMask(ctx) {
  if (!masks.has(ctx)) {
    const tile = document.createElement('canvas');
    tile.width = 20;
    tile.height = 72;
    const g = tile.getContext('2d');
    g.fillStyle = '#000804';
    for (let row = 0; row < 2; row++) {
      g.fillRect(0, 36 * row, 20, 6);
      g.fillRect(row * 10, 36 * row + 6, 3, 30);
    }
    masks.set(ctx, ctx.createPattern(tile, 'repeat'));
  }
  return masks.get(ctx);
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof frame>} f @param {HTMLImageElement | null} image */
export function paint(ctx, f, image, focalPoint = { x: 0.557, y: 0.3 }) {
  const { width, height } = ctx.canvas;
  const stageHeight = f.viewHeight ?? 540, midY = stageHeight / 2;
  ctx.save();
  ctx.scale(width / 960, height / stageHeight);
  ctx.fillStyle = '#010704';
  ctx.fillRect(0, 0, 960, stageHeight);
  if (f.glyphs.length && f.rainBlur > 0.1) {
    // Defocus the entire glyph plane once; the reflected image stays sharp.
    let layer = rainLayers.get(ctx);
    if (!layer) {
      const c = document.createElement('canvas');
      c.width = 480;
      c.height = 270;
      layer = c.getContext('2d');
      rainLayers.set(ctx, layer);
    }
    layer.clearRect(0, 0, 480, 270);
    layer.save();
    layer.scale(0.5, 0.5);
    drawGlyphs(layer, f);
    layer.restore();
    ctx.save();
    ctx.globalAlpha = f.rainAlpha;
    ctx.filter = 'blur(' + (f.rainBlur * width) / 960 + 'px)';
    ctx.drawImage(layer.canvas, 0, 0, 960, stageHeight);
    ctx.restore();
  } else drawGlyphs(ctx, f);
  let glassX = 480,
    glassY = midY;
  if (image && (f.outlineAlpha > 0 || f.imageAlpha > 0)) {
    const reflection = prepareReflection(image);
    const fit = Math.min(960 / image.width, stageHeight / image.height);
    const w = image.width * fit * f.imageZoom,
      h = image.height * fit * f.imageZoom;
    // Track one point on the photographed glass from its original position to
    // screen center. A shallow arc gives the push a little lateral movement.
    const startX = (focalPoint.x - 0.5) * image.width * fit * outlineScale;
    const startY = midY - (1 - focalPoint.y) * image.height * fit * outlineScale;
    const progress = f.cameraProgress;
    const arc = Math.sin(Math.PI * progress) ** 2;
    const targetX = 480 + startX * (1 - progress) + 24 * arc;
    const targetY = midY + startY * (1 - progress) - 10 * arc;
    const x = targetX - focalPoint.x * w,
      y = targetY - focalPoint.y * h;
    glassX = targetX - (startX * f.imageZoom) / outlineScale;
    glassY = targetY - (startY * f.imageZoom) / outlineScale;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (f.outlineAlpha > 0) {
      ctx.globalAlpha = f.outlineAlpha;
      ctx.drawImage(reflection.outline, x, y, w, h);
    }
    if (f.imageAlpha > 0) {
      // Honor a cutout's opaque areas, including the black lenses. A full
      // photo still blends into the glass across its rectangular background.
      if (reflection.cutout) ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = f.imageAlpha;
      ctx.drawImage(image, x, y, w, h);
    }
    ctx.restore();
  }
  if (f.crt > 0) {
    ctx.save();
    ctx.translate(glassX, glassY);
    const scale = f.maskPitch / 20;
    ctx.scale(scale, scale);
    ctx.fillStyle = slotMask(ctx);
    ctx.globalAlpha = 0.58 * f.crt * (1 - 0.4 * f.imageAlpha);
    ctx.fillRect(-glassX / scale, -glassY / scale, 960 / scale, stageHeight / scale);
    ctx.restore();
    // The old CRT also had independent, low-alpha row and column intensity drift.
    ctx.save();
    ctx.translate(glassX, glassY);
    ctx.scale(f.maskPitch / 1.25, f.maskPitch / 1.25);
    ctx.translate(-480, -midY);
    const tick = Math.floor(f.time * 5);
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = f.crt * (0.02 + 0.025 * (1 + Math.sin(i * 13.4 + tick * 1.7)));
      ctx.fillStyle = '#001006';
      ctx.fillRect(i * 40, 0, 40, stageHeight);
      ctx.fillRect(0, i * stageHeight / 24, 960, stageHeight / 24);
    }
    ctx.restore();
    const vignette = ctx.createRadialGradient(480, midY, Math.min(140, midY * .55), 480, midY, Math.hypot(480, midY));
    vignette.addColorStop(0, 'transparent');
    vignette.addColorStop(1, 'rgba(0,4,2,' + 0.75 * f.crt + ')');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 960, stageHeight);
  }
  if (f.blackout > 0) {
    ctx.globalAlpha = f.blackout;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 960, stageHeight);
  }
  ctx.restore();
}
export function submit(input) {
  checkRequestKeys(input, ['time', 'title', 'alphabet', 'hiddenWords', 'seed', 'mode', 'crt']);
  const { time = 4, ...options } = input;
  return frame(makeScene(options), time);
}
