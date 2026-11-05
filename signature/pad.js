// The signing pad: pointer capture (mouse, trackpad, pen, touch), undo, clear
// and replay, drawn on a canvas. Points are kept in the signature's own
// coordinates; the pad shows them through a fitted view, and new strokes are
// mapped back through the same view, so drawing over an imported signature
// adds to it; undo restores the view along with the strokes. Times are
// milliseconds from the first point; pressure is kept only when a pen
// reported every point.

/**
 * @typedef {import('./core/resample.js').RawPoint} RawPoint
 * @typedef {RawPoint & { pen?: boolean }} PadPoint
 */

const FRAME_W = 1000; // the pad's own units across; its height follows its aspect

export class Pad {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ onChange: () => void, colors: () => { ink: string, guide: string, background: string } }} opts
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    /** @type {PadPoint[][]} */
    this.strokes = [];
    /**
     * What undo returns to: the strokes and the view they were shown in.
     * @type {{ strokes: PadPoint[][], view: { s: number, ox: number, oy: number } }[]}
     */
    this.history = [];
    this.view = { s: 1, ox: 0, oy: 0 };
    /** @type {PadPoint[] | null} */
    this.drawing = null;
    this.base = 0;
    this.drawingSince = false; // whether this.base is set for strokes drawn since the last load, undo or clear
    this.untimedReplay = false;
    this.replayStop = /** @type {null | (() => void)} */ (null);
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        this.undo();
      }
    });
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  /** The pad's height in its own units. */
  frameH() {
    const r = this.canvas.getBoundingClientRect();
    return r.width ? (FRAME_W * r.height) / r.width : FRAME_W / 2;
  }

  /** Signature coordinates of a pointer event. @param {PointerEvent} e */
  toContent(e) {
    const r = this.canvas.getBoundingClientRect();
    const k = FRAME_W / r.width;
    return { x: ((e.clientX - r.left) * k - this.view.ox) / this.view.s, y: ((e.clientY - r.top) * k - this.view.oy) / this.view.s };
  }

  /** @param {PointerEvent} e */
  down(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.stopReplay();
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    if (!this.strokes.length) this.base = e.timeStamp;
    else if (!this.drawingSince) {
      const last = this.strokes.flat().reduce((m, p) => Math.max(m, p.t ?? 0), 0);
      this.base = e.timeStamp - last - 300;
    }
    this.drawingSince = true;
    this.drawing = [];
    this.add(e);
  }

  /** @param {PointerEvent} e */
  move(e) {
    if (!this.drawing) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) this.add(ev);
    this.draw();
  }

  /** @param {PointerEvent} e */
  add(e) {
    const p = /** @type {PadPoint} */ ({ ...this.toContent(e), t: Math.max(0, e.timeStamp - this.base) });
    const prev = this.drawing?.[this.drawing.length - 1];
    if (prev && /** @type {number} */ (p.t) < /** @type {number} */ (prev.t)) p.t = prev.t;
    if (e.pointerType === 'pen') {
      p.pressure = e.pressure;
      p.pen = true;
    }
    this.drawing?.push(p);
  }

  /** @param {PointerEvent} e */
  up(e) {
    if (!this.drawing) return;
    if (e.type === 'pointerup') this.add(e);
    const stroke = this.drawing;
    this.drawing = null;
    this.remember();
    this.strokes = [...this.strokes, stroke];
    this.draw();
    this.opts.onChange();
  }

  /** Keeps what the pad shows now, strokes and view, for undo. */
  remember() {
    this.history.push({ strokes: this.strokes, view: this.view });
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;
    this.strokes = last.strokes;
    this.view = last.view;
    this.drawingSince = false;
    this.draw();
    this.opts.onChange();
  }

  clear() {
    if (!this.strokes.length) return;
    this.remember();
    this.strokes = [];
    this.view = { s: 1, ox: 0, oy: 0 };
    this.drawingSince = false;
    this.draw();
    this.opts.onChange();
  }

  /** Shows a signature, fitted to the pad; undo returns to what was there. @param {RawPoint[][]} strokes */
  load(strokes) {
    this.stopReplay();
    this.remember();
    this.strokes = strokes.map((s) => s.map((p) => ({ ...p })));
    this.fit();
    this.drawingSince = false;
    this.draw();
    this.opts.onChange();
  }

  fit() {
    const pts = this.strokes.flat();
    if (!pts.length) {
      this.view = { s: 1, ox: 0, oy: 0 };
      return;
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const H = this.frameH();
    const s = Math.min((FRAME_W * 0.88) / Math.max(x1 - x0, 1e-9), (H * 0.8) / Math.max(y1 - y0, 1e-9));
    this.view = { s, ox: FRAME_W / 2 - s * (x0 + x1) / 2, oy: H / 2 - s * (y0 + y1) / 2 };
  }

  /**
   * The signature as request strokes: times only if every point has one,
   * pressure only if a pen reported every point.
   * @returns {RawPoint[][]}
   */
  getStrokes() {
    const pts = this.strokes.flat();
    const timed = pts.every((p) => p.t !== undefined);
    const pressed = pts.length > 0 && pts.every((p) => p.pressure !== undefined);
    return this.strokes.map((s) => s.map((p) => {
      /** @type {RawPoint} */
      const out = { x: p.x, y: p.y };
      if (timed) out.t = p.t;
      if (pressed) out.pressure = p.pressure;
      return out;
    }));
  }

  /** Draws the strokes, or those up to time `until` while replaying. @param {number} [until] */
  draw(until = Infinity) {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) {
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }
    const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const col = this.opts.colors();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = col.background;
    ctx.fillRect(0, 0, c.width, c.height);
    const k = c.width / FRAME_W;
    // the signing line
    ctx.strokeStyle = col.guide;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(c.width * 0.06, c.height * 0.72);
    ctx.lineTo(c.width * 0.94, c.height * 0.72);
    ctx.stroke();
    ctx.setTransform(k * this.view.s, 0, 0, k * this.view.s, k * this.view.ox, k * this.view.oy);
    ctx.strokeStyle = col.ink;
    ctx.fillStyle = col.ink;
    ctx.lineWidth = (2.2 * dpr) / (k * this.view.s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = this.drawing ? [...this.strokes, this.drawing] : this.strokes;
    for (const s of all) {
      const pts = s.filter((p) => (p.t ?? 0) <= until);
      if (!pts.length) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      if (pts.length === 1) ctx.lineTo(pts[0].x + 1e-3, pts[0].y);
      ctx.stroke();
    }
  }

  /**
   * Redraws the signature as it was drawn, in real time (or at a steady pace
   * for untimed input); `onEnd` is called when it finishes or is stopped.
   * @param {() => void} onEnd
   */
  replay(onEnd) {
    this.stopReplay();
    const pts = this.strokes.flat();
    if (!pts.length) return;
    // untimed input replays at 0.6 pad units per millisecond along the strokes
    if (!pts.every((p) => p.t !== undefined)) {
      let clock = 0;
      for (const s of this.strokes) {
        s.forEach((p, i) => {
          if (i) clock += Math.hypot(p.x - s[i - 1].x, p.y - s[i - 1].y) * this.view.s / 0.6;
          p.t = clock;
        });
        clock += 250;
      }
      this.untimedReplay = true;
    }
    const end = pts.reduce((m, p) => Math.max(m, /** @type {number} */ (p.t)), 0);
    const start = performance.now();
    let id = 0;
    const frame = () => {
      const now = performance.now() - start;
      this.draw(now);
      if (now < end) id = requestAnimationFrame(frame);
      else this.stopReplay();
    };
    this.replayStop = () => {
      cancelAnimationFrame(id);
      if (this.untimedReplay) for (const p of this.strokes.flat()) delete p.t;
      this.untimedReplay = false;
      this.replayStop = null;
      this.draw();
      onEnd();
    };
    id = requestAnimationFrame(frame);
  }

  stopReplay() {
    this.replayStop?.();
  }
}
