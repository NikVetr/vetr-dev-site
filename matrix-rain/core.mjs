// Coordinates are in a 960 × 540 view. Seeking a frame never advances shared state.
import { checkRequestKeys, invalidRequest } from '../shared/request.js';
import { mulberry32 } from '../shared/rng.js';
export const duration = 15.5;
const clamp = (x) => Math.max(0, Math.min(1, x));
function ease(time, start, end) {
  const x = clamp((time - start) / (end - start));
  return x * x * (3 - 2 * x);
}
// The two camera moves in Matrix_GreenRain.R use logistic curves.
const logistic = x => 1 / (1 + Math.exp(-x));
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
const rainLeadIn = 1.75;
const latestPortraitEnd = 4.75;

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
    const letter = letters[i - first] || '';
    const tailChoices = mode === 'opening' && letter ? 3 : 6;
    const lock = 8 + 3 * rand(),
      blink = 13 + 2 * rand(),
      length = Math.max(3 * (3 + Math.floor(rand() * tailChoices)), word.length + 5);
    return {
      word,
      wordPosition: placement(),
      lock,
      fade: blink,
      length,
      // The original adds floor(runif(.1, 1) * 60) to the *row*, not the time.
      // Bring planted columns into the first wave while the whole board is visible.
      offset: Math.floor(6 + (word.length ? 15 : 54) * rand()),
      speed: rows * (.25 + .25 * rand()),
      letter,
      bright: rand() < 0.5,
      sequence: Array.from({ length: 149 }, () => glyphs[Math.floor(rand() * glyphs.length)]),
    };
  });
  const lastFade = Math.max(...streams.filter(s => s.letter.trim()).map(s => s.fade));
  for (const [i, stream] of streams.entries()) {
    const survivor = survivors.indexOf(i - first);
    stream.fade = survivor < 0 ? stream.fade - .25 : lastFade + (survivor - .5) * .125;
  }
  return {
    title,
    mode,
    crt,
    streams,
    minimumRows: hiddenWords.length ? 2 + Math.max(...streams.map(s => s.word.length)) : 0,
    targetColumn: survivors.length ? first + .5 + (survivors[0] + survivors.at(-1)) / 2 : columns / 2,
    centerColumn: letters.length ? first + letters.length / 2 : columns / 2,
    letters: letters.filter((c) => c.trim()),
  };
}
/** @param {ReturnType<typeof makeScene>} scene @param {number} time */
export function frame(scene, time, aspect = 16 / 9) {
  if (!Number.isFinite(time) || time < 0 || time > 16)
    throw invalidRequest('time', 'Frame time must be between 0 and 16 seconds.');
  if (!Number.isFinite(aspect) || aspect <= 0) throw invalidRequest('aspect', 'Aspect ratio must be positive.');
  const viewHeight = 960 / aspect, midY = viewHeight / 2;
  const middleRow = Math.max(1, Math.round(midY / dy), Math.ceil(scene.minimumRows / 2));
  const rowCount = middleRow * 2, rowStep = midY / middleRow;
  // Leave room for the glyph and the early camera move at either end.
  const wordMargin = 1 + Math.floor(.005 * rowCount);
  const opening = scene.mode === 'opening';
  const titleZoom = Math.min(3, (columns - 4) / Math.max(1, [...scene.title].length));
  // Bound the highest possible pixel of any fitted upload, even a full opaque
  // rectangle. Before 4.75 s the camera is below 1.004× for every title.
  // Include a whole glyph and its glow above the edge of the portrait.
  const portraitTop = viewHeight * (1 - outlineScale * 1.004);
  const contactRow = Math.max(0, Math.ceil((portraitTop - 2 * dy) / rowStep));
  let portraitEnd = latestPortraitEnd;
  const approach = opening ? logistic(2 * (time - 8)) : 0;
  const intoTitle = opening ? logistic(4 * (time - 14.75)) : 0;
  const zoom = 1 + (titleZoom - 1) * approach + (finalZoom - titleZoom) * intoTitle;
  const center = columns / 2 + (scene.centerColumn - columns / 2) * approach +
    (scene.targetColumn - scene.centerColumn) * intoTitle;
  const glyphs = [];
  for (const [i, s] of scene.streams.entries()) {
    const period = rowCount + s.length;
    const speed = opening && s.letter ? (s.offset + period + middleRow) / (s.lock - rainLeadIn) : s.speed;
    const wordTop = wordMargin + Math.floor(s.wordPosition * (rowCount - 2 * wordMargin - s.word.length + 1));
    // Give every planted phrase a full pass before the camera crops the outer
    // columns. The second wave keeps its original clock for the title impacts.
    const readBy = i === 0 || i === columns - 1 ? 4.1 : 5.25;
    const firstSpeed = opening && s.word.length
      ? Math.max(speed, (s.offset + wordTop + s.word.length) / (readBy - rainLeadIn))
      : speed;
    if (opening) portraitEnd = Math.min(portraitEnd, rainLeadIn + (s.offset + contactRow) / firstSpeed - 1 / 60);
    const x = 480 + (i + 0.5 - center) * dx * zoom;
    if (x < -dx * zoom || x > 960 + dx * zoom) continue;
    const elapsed = time - (opening ? rainLeadIn : 0);
    let phase = Math.floor(elapsed * speed - s.offset);
    if (phase < period && firstSpeed > speed) phase = Math.min(period - 1, Math.floor(elapsed * firstSpeed - s.offset));
    if (phase < 0 || (opening && !s.letter && phase >= 2 * period)) continue;
    const locked = opening && s.letter && time >= s.lock;
    // A title stream makes one pass, then its next head lands on the title.
    // Subsequent tail glyphs are absorbed at that cell, never restarting below it.
    const head = locked ? middleRow + Math.floor((time - s.lock) * speed) : phase % period;
    const fade = locked ? 1 - clamp((time - s.fade) / .25) : 0;
    const rain = opening ? (1 - ease(time, 11, 12.25)) * (locked ? 1 - ease(time, s.lock, s.lock + .65) : 1) : 1;
    for (let tail = 0; rain > 0 && tail < s.length; tail++) {
      const row = head - tail;
      if (row < 0 || row >= rowCount || (locked && row >= middleRow)) continue;
      const y = midY + (row - middleRow) * rowStep * zoom;
      if (y < -dy * zoom || y > viewHeight + dy * zoom) continue;
      const glitch =
        Math.imul((i + 1) * 101 + (row + 1) * 787 + Math.floor(time * 4) * 1543, 2654435761) >>> 0;
      const char =
        s.word[row - wordTop] ??
        (scene.letters.length && glitch % 100 < 2
          ? scene.letters[glitch % scene.letters.length]
          : s.sequence[row % s.sequence.length]);
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
  const fadeStart = Math.min(rainLeadIn, portraitEnd - .25);
  const portrait = opening ? clamp((time - .25) / 1.25) * (1 - clamp((time - fadeStart) / (portraitEnd - fadeStart))) : 0;
  return {
    time,
    viewHeight,
    zoom,
    glyphs,
    crt: scene.crt,
    size: dy * zoom,
    rainSize: Math.min(dy, rowStep) * .84 * zoom,
    outlineAlpha: .62 * portrait * (1 - clamp((time - .25) / 1.25)),
    imageAlpha: portrait,
    cameraProgress: 0,
    blackout: opening ? Math.max(1 - ease(time, 0, .15), ease(time, 15.32, duration)) : 0,
    imageZoom: opening ? outlineScale * zoom : 1 / 8,
    maskPitch: 1.25 * zoom,
    rainAlpha: 1,
    rainBlur: 0,
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
  const rainFont = '500 ' + (f.rainSize ?? f.size) + 'px Futura, "Century Gothic", sans-serif';
  const titleFont = '600 ' + f.size + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = rainFont;
  for (const g of f.glyphs) {
    ctx.globalAlpha = g.alpha;
    ctx.fillStyle = g.hot ? '#d5fce7' : '#00ff41';
    ctx.shadowColor = '#43ff83';
    ctx.shadowBlur = g.hot ? 3 * f.crt : 0;
    if (g.kind === 'title') {
      ctx.font = titleFont;
      ctx.fillText(g.char, g.x, g.y);
      ctx.font = rainFont;
    } else ctx.fillText(g.char, g.x, g.y, .9 * dx * f.zoom);
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
    const tick = Math.floor(f.time * 2);
    const bandAlpha = phase => .0625 * f.crt * (1 + Math.sin(phase));
    ctx.fillStyle = '#001006';
    for (let i = 0; i < 24; i++) {
      ctx.globalAlpha = bandAlpha(i * 13.4 + tick * 1.7);
      ctx.fillRect(i * 40, 0, 40, stageHeight);
      ctx.globalAlpha = bandAlpha(i * 9.7 + tick * 4.1);
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
