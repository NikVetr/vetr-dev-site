// Authored routes connect actual round assignments; they are presentation geometry,
// separate from the planner's table-center travel objective.
/** @typedef {{light:string,dark:string,fixed:boolean}} Guest */
/** @typedef {{x:number,y:number,scale:number,height:number,roundness:number}} Camera */
/** @typedef {{width:number,height:number,radius:number,samples:number,coordinateScale:number,encoding:string,tables:number[][],guests:Guest[],rounds:number[][][],transitions:string[],camera:{close:Camera,four:Camera,full:Camera}}} EncodedPlan */
/** @typedef {EncodedPlan & {paths:Float64Array[]}} Plan */
/** @type {Promise<Plan>|undefined} */
let loaded;
export function prepare() {
  loaded ??= fetch('assets/cards/seating-motion.json').then(async response => {
    if (!response.ok) throw new Error(`seating motion: HTTP ${response.status}`);
    const p = /** @type {EncodedPlan} */ (await response.json());
    if (p.rounds.length !== 5 || p.transitions.length !== 4 || p.samples < 2) throw new Error('Seating preview requires five real rounds');
    if (p.encoding !== 'delta-runs-v1') throw new Error('Unknown seating path encoding');
    const paths = p.transitions.map(encoded => decodeRoutes(encoded, p.guests.length, p.samples, p.coordinateScale));
    return { ...p, paths };
  });
  return loaded;
}

/** @param {string} encoded @param {number} guests @param {number} samples @param {number} scale */
export function decodeRoutes(encoded, guests, samples, scale) {
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  let cursor = 0;
  const get = () => {
    let value = 0, shift = 0;
    while (cursor < bytes.length && shift < 35) { const byte = bytes[cursor++]; value += (byte & 127) * 2 ** shift; if (!(byte & 128)) return value; shift += 7; }
    throw new Error('Truncated seating path data');
  };
  const signed = (/** @type {number} */ value) => value % 2 ? -(value + 1) / 2 : value / 2;
  const path = new Float64Array(guests * samples * 2);
  for (let guest = 0; guest < guests; guest++) {
    let x = get(), y = get(), frame = 0;
    const point = () => { const i = (guest * samples + frame++) * 2; path[i] = x / scale; path[i + 1] = y / scale; };
    point();
    while (frame < samples) {
      const command = get();
      if (command === 0) { const count = get(); if (!count || frame + count > samples) throw new Error('Invalid seating hold length'); for (let i = 0; i < count; i++) point(); }
      else { x += signed(command - 1); y += signed(get()); point(); }
    }
  }
  if (cursor !== bytes.length) throw new Error('Extra seating path data');
  return path;
}
const ease = (/** @type {number} */ t) => (1 - Math.cos(Math.PI * Math.max(0, Math.min(1, t)))) / 2;
/** @param {Camera} a @param {Camera} b @param {number} t */
const cameraBetween = (a, b, t) => ({ x: a.x + (b.x - a.x) * ease(t), y: a.y + (b.y - a.y) * ease(t), scale: a.scale + (b.scale - a.scale) * ease(t), height: a.height + (b.height - a.height) * ease(t), roundness: a.roundness + (b.roundness - a.roundness) * ease(t) });

/** Shared timeline, also seekable through the SVG's paused CSS clock in browser tests.
 * @param {Plan} p @param {number} seconds
 */
export function frameAt(p, seconds) {
  const t = seconds % 28;
  let leg = 0, progress = 0, opacity = 1;
  const starts = [2.9, 10, 15.2, 20.4];
  for (let i = 0; i < starts.length; i++) if (t >= starts[i]) { leg = i; progress = ease((t - starts[i]) / 4.2); }
  let camera = p.camera.close;
  // Establish the wider view before guests start moving between its tables.
  if (t >= 1.2) camera = cameraBetween(p.camera.close, p.camera.four, (t - 1.2) / 1.4);
  if (t >= 7.8) camera = cameraBetween(p.camera.four, p.camera.full, (t - 7.8) / 1.6);
  if (t > 25.5 && t < 26.2) opacity = 1 - (t - 25.5) / .7;
  if (t >= 26.2) { leg = 0; progress = 0; camera = p.camera.close; opacity = Math.min(1, (t - 26.2) / .8); }
  const round = `${leg + (progress > 0 ? 2 : 1)}`;
  return { leg, progress, camera, round, opacity };
}

/** Fade a whole circle before it crosses the camera edge, including the round close-up.
 * Distances are in preview pixels, so the soft margin stays consistent during zoom.
 * @param {Camera} camera @param {number} width @param {number} x @param {number} y @param {number} radius
 */
export function edgeOpacity(camera, width, x, y, radius) {
  const r = camera.roundness;
  const qx = Math.abs(x - camera.x) * camera.scale - (width / 2 - r);
  const qy = Math.abs(y - camera.y) * camera.scale - (camera.height / 2 - r);
  const inside = r - Math.hypot(Math.max(0, qx), Math.max(0, qy)) - Math.min(Math.max(qx, qy), 0);
  const t = Math.max(0, Math.min(1, (inside - radius * camera.scale - 1.5) / 3));
  return t * t * (3 - 2 * t);
}

/** @param {HTMLElement} art @param {Plan} p */
export function create(art, p) {
  const canvas = document.createElement('canvas');
  canvas.className = 'card-player';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seating preview needs a canvas');
  let playing = false, raf = 0, elapsed = 0;
  /** @type {number|null} */ let last = null;
  const redraw = () => paint(/** @type {CanvasRenderingContext2D} */ (ctx), canvas, art, p, elapsed / 1000);
  art.append(canvas);
  redraw();
  const resize = new ResizeObserver(redraw);
  resize.observe(art);
  document.addEventListener('themechange', redraw);
  /** @param {number} now */
  const tick = now => {
    if (!playing) return;
    if (last !== null) elapsed += now - last;
    last = now;
    const clock = art.getAnimations({ subtree: true }).find(animation => /** @type {Element|null} */ (/** @type {KeyframeEffect} */ (animation.effect)?.target)?.classList.contains('seating-clock'));
    if (typeof clock?.currentTime === 'number') elapsed = clock.currentTime;
    redraw();
    raf = requestAnimationFrame(tick);
  };
  const pause = () => { playing = false; last = null; cancelAnimationFrame(raf); };
  return {
    play() { if (playing) return; playing = true; last = null; raf = requestAnimationFrame(tick); },
    pause,
    destroy() { pause(); resize.disconnect(); document.removeEventListener('themechange', redraw); canvas.remove(); },
  };
}

/** @param {CanvasRenderingContext2D} ctx @param {HTMLCanvasElement} canvas @param {HTMLElement} art @param {Plan} p @param {number} seconds */
function paint(ctx, canvas, art, p, seconds) {
  const dpr = devicePixelRatio || 1, w = art.clientWidth, h = art.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const style = getComputedStyle(art);
  const ink = style.getPropertyValue('--art-ink').trim() || '#20252b';
  const paper = style.getPropertyValue('--art-paper').trim() || '#f3f5f8';
  const surface = style.getPropertyValue('--surface').trim() || '#ffffff';
  const line = style.getPropertyValue('--art-line').trim() || '#d0d6df';
  const s = Math.min(w / p.width, h / p.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w - p.width * s) / 2, dpr * (h - p.height * s) / 2);
  ctx.fillStyle = paper; ctx.fillRect(0, 0, p.width, p.height);
  const f = frameAt(p, seconds);
  canvas.dataset.round = f.round;
  ctx.globalAlpha = f.opacity;
  ctx.fillStyle = ink; ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`Round ${f.round}`, 8, 13);
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 26 + (p.height - 26 - f.camera.height) / 2, p.width, f.camera.height, f.camera.roundness); ctx.clip();
  ctx.translate(p.width / 2, 26 + (p.height - 26) / 2); ctx.scale(f.camera.scale, f.camera.scale); ctx.translate(-f.camera.x, -f.camera.y);
  ctx.fillStyle = surface; ctx.strokeStyle = line; ctx.lineWidth = .5;
  for (const [x, y, radius] of p.tables) {
    const opacity = edgeOpacity(f.camera, p.width, x, y, radius + .25);
    if (!opacity) continue;
    ctx.globalAlpha = f.opacity * opacity;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  const at = f.progress * (p.samples - 1), a = Math.min(p.samples - 2, Math.floor(at)), mix = at - a;
  const route = p.paths[f.leg];
  for (const [i, guest] of p.guests.entries()) {
    const k = (i * p.samples + a) * 2;
    const x = route[k] + (route[k + 2] - route[k]) * mix, y = route[k + 1] + (route[k + 3] - route[k + 1]) * mix;
    const opacity = edgeOpacity(f.camera, p.width, x, y, p.radius + .2);
    if (!opacity) continue;
    ctx.globalAlpha = f.opacity * opacity;
    ctx.beginPath(); ctx.arc(x, y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = theme === 'dark' ? guest.dark : guest.light; ctx.fill();
    ctx.lineWidth = guest.fixed ? .4 : .3; ctx.strokeStyle = ink; ctx.stroke();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}
