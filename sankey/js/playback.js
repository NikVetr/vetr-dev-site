/* Complete recorded trajectories, progressively revealed from left to right. Playback order is
 * display order, not chronology. Weighted paths without members remain grouped; no IDs or
 * end-to-end trajectories are reconstructed from marginal flow matrices. */
(function (root) {
  'use strict';
  const SK = /** @type {any} */ (root).SK;
  /** @typedef {{nodes: number[], weight: number, members?: {id: string, weight: number}[]}} RecordedPath */
  /** @typedef {{path: number, member: number, id: string|null, weight: number}} Unit */

  /** @param {RecordedPath[]} paths */
  function units(paths) {
    if (!Array.isArray(paths) || !paths.length) throw new SK.layout.SankeyError('Playback needs complete trajectories from a wide or long table.');
    const individual = paths.every(p => p.members && p.members.length);
    for (const p of paths) {
      if (!(Number.isFinite(p.weight) && p.weight > 0)) throw new SK.layout.SankeyError('Trajectory weights must be positive finite numbers.');
      if (p.members && (p.members.some(m => !(Number.isFinite(m.weight) && m.weight > 0)) ||
        Math.abs(p.members.reduce((sum,m)=>sum+m.weight,0)-p.weight) > 1e-9 * Math.max(1,p.weight))) {
        throw new SK.layout.SankeyError('Record weights must sum to their complete trajectory weight.');
      }
    }
    /** @type {Unit[]} */
    const items = [];
    if (individual) {
      // Interleave paths so the animation reveals the breadth of the records. The labels retain
      // the supplied IDs; this order makes no claim about when observations happened.
      const count = Math.max(...paths.map(p => p.members ? p.members.length : 0));
      for (let m = 0; m < count; m++) paths.forEach((p, path) => {
        const member = p.members && p.members[m];
        if (member) items.push({path, member:m, id:member.id, weight:member.weight});
      });
    } else {
      paths.forEach((p, path) => items.push({path, member:-1, id:null, weight:p.weight}));
    }
    return {kind: individual ? 'records' : 'paths', items};
  }

  /** @param {any} layout @param {RecordedPath[]} paths */
  function build(layout, paths) {
    const sequence = units(paths);
    if (!SK.paths.consistent(layout, paths)) throw new SK.layout.SankeyError('Playback needs trajectories that reproduce every flow value.');
    if (layout.flows.some((/** @type {any} */ f) => f.dir !== 1)) throw new SK.layout.SankeyError('Left-to-right playback needs forward flows.');
    const subs = SK.paths.substrands(layout, paths);
    const items = sequence.items.map(unit => {
      const geometry = SK.paths.tracePolygon(layout, subs, unit.path, {member:unit.member, fadeLabels:false});
      const xs = geometry.polygon.map((/** @type {number[]} */ p) => p[0]);
      return {...unit, geometry, x0:Math.min(...xs), x1:Math.max(...xs)};
    });
    return {kind:sequence.kind, items, weight:paths.reduce((sum,p)=>sum+p.weight,0)};
  }

  /** Fraction of one whole trajectory revealed at global progress [0,1].
   * @param {number} progress @param {number} index @param {number} total */
  function fraction(progress, index, total) {
    const travel = Math.max(0.14, 1 / total);
    const start = total > 1 ? index / (total - 1) * (1 - travel) : 0;
    // Compare the endpoint directly: subtracting it again can round just below one and
    // leave reduced-motion stepping stuck on an already completed record.
    if (progress >= start + travel) return 1;
    return Math.min(1, Math.max(0, (progress - start) / travel));
  }

  /** Browser controller. Geometry is built once per playback, then only clip widths and heads
   * change; playback never modifies the editable project or its history.
   * @param {SVGSVGElement} svg @param {() => any} drawing */
  function create(svg, drawing) {
    const playButton = /** @type {HTMLButtonElement} */ (document.querySelector('#trajectory-play'));
    const resetButton = /** @type {HTMLButtonElement} */ (document.querySelector('#trajectory-reset'));
    const slider = /** @type {HTMLInputElement} */ (document.querySelector('#trajectory-progress'));
    const status = /** @type {HTMLOutputElement} */ (document.querySelector('#trajectory-status'));
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let available = false, active = false, playing = false, progress = 0, completed = 0;
    let request = 0, previous = 0;
    /** @type {ReturnType<typeof build>|null} */
    let plan = null;
    /** @type {{clip: SVGRectElement, head: SVGCircleElement}[]} */
    let elements = [];
    let total = 0, kind = 'paths', noun = 'paths', reason = '';
    const snapshot = () => ({available, active, playing, progress, completed, total, kind, description:noun, reason});
    function controls() {
      playButton.disabled = !available;
      playButton.textContent = playing ? 'Pause paths' : reduced.matches ? 'Next path' : progress === 1 ? 'Replay paths' : 'Play paths';
      playButton.setAttribute('aria-pressed', String(playing));
      playButton.title = 'Reveal complete recorded trajectories in display order, not chronological order. Completed substrands remain filled. Editing resets playback.';
      resetButton.disabled = !active;
      slider.disabled = !available;
      slider.value = String(Math.round(progress * 1000));
      slider.setAttribute('aria-valuetext', `${completed} of ${total} ${noun}`);
      status.textContent = available ? `${completed} / ${total} ${noun}` : reason;
    }
    function pause() {
      playing = false;
      cancelAnimationFrame(request);
      controls();
      return snapshot();
    }
    function reset() {
      pause();
      active = false; progress = 0; completed = 0; plan = null; elements = [];
      svg.classList.remove('playback-active');
      svg.querySelector('.layer-playback')?.remove();
      controls();
      return snapshot();
    }
    function refresh() {
      const d = drawing();
      available = false; total = 0; reason = 'Load a table with complete paths';
      if (d.layout && d.paths) {
        try {
          const sequence = units(d.paths);
          if (!SK.paths.consistent(d.layout,d.paths)) throw new Error('Paths must match the flow values');
          if (d.layout.flows.some((/** @type {any} */ f)=>f.dir !== 1)) throw new Error('Playback needs forward flows');
          available = true; kind = sequence.kind; total = sequence.items.length;
          noun = kind === 'records' ? (d.illustrative ? 'illustrative patients' : 'records') : 'grouped paths (no IDs)';
          reason = '';
        } catch (error) { reason = error instanceof Error ? error.message : String(error); }
      }
      controls();
    }
    function prepare() {
      if (plan) return;
      refresh();
      if (!available) throw new SK.layout.SankeyError(reason);
      const d = drawing(), R = SK.render, C = SK.color;
      plan = build(d.layout,d.paths);
      const sx = (/** @type {number} */ x) => Number((d.frame.margin.left+x).toFixed(2));
      const sy = (/** @type {number} */ y) => Number((d.frame.margin.top+d.layout.view.height-y).toFixed(2));
      const line = (/** @type {number[][]} */ points) => points.map((p,i)=>`${i?'L':'M'}${sx(p[0])} ${sy(p[1])}`).join('')+'Z';
      let defs = '', shapes = '';
      const gradients = new Set();
      plan.items.forEach((item,i) => {
        if (!gradients.has(item.path)) {
          gradients.add(item.path);
          const stops = R.traceStops(d.layout,d.colors,d.style,item.geometry.flows).sort((/** @type {any} */ a,/** @type {any} */ b)=>a[0]-b[0]);
          defs += `<linearGradient id="playback-gradient-${item.path}" gradientUnits="userSpaceOnUse" x1="${sx(item.x0)}" y1="0" x2="${sx(item.x1)}" y2="0">` +
            stops.map((/** @type {any} */ [x,c])=>`<stop offset="${Math.min(1,Math.max(0,(x-item.x0)/(item.x1-item.x0)))*100}%" stop-color="${C.paint(C.flatten(c,d.colors.flatBg)).color}"/>`).join('')+'</linearGradient>';
        }
        defs += `<clipPath id="playback-clip-${i}"><rect x="${sx(item.x0)}" y="0" width="0" height="${d.frame.height}"/></clipPath>`;
        shapes += `<path class="playback-unit" data-unit="${i}" data-path="${item.path}" data-member="${item.member}" d="${line(item.geometry.polygon)}" fill="url(#playback-gradient-${item.path})" clip-path="url(#playback-clip-${i})"/>` +
          `<circle class="playback-head" data-unit="${i}" r="1.5" fill="${C.paint(C.opaque(d.colors.flow[item.geometry.flows[0].index])).color}" opacity="0"/>`;
      });
      const layer = document.createElementNS('http://www.w3.org/2000/svg','g');
      layer.setAttribute('class','layer-playback');
      layer.setAttribute('pointer-events','none');
      layer.innerHTML = `<defs>${defs}</defs>${shapes}`;
      svg.insertBefore(layer,svg.querySelector('.layer-labels'));
      elements = plan.items.map((_,i)=>({
        clip:/** @type {SVGRectElement} */ (layer.querySelector(`#playback-clip-${i} rect`)),
        head:/** @type {SVGCircleElement} */ (layer.querySelector(`.playback-head[data-unit="${i}"]`))
      }));
    }
    function render() {
      if (!plan) return;
      const d = drawing();
      active = true; completed = 0;
      svg.classList.add('playback-active');
      plan.items.forEach((item,i)=>{
        const t = fraction(progress,i,total), x = item.x0+(item.x1-item.x0)*t;
        elements[i].clip.setAttribute('width', String((item.x1-item.x0)*t));
        if (t >= 1) completed++;
        const moving = t>0 && t<1;
        elements[i].head.setAttribute('opacity', moving ? '1':'0');
        if (moving) {
          const y = (SK.layout.pointAtX(item.geometry.upper,x)[1]+SK.layout.pointAtX(item.geometry.lower,x)[1])/2;
          elements[i].head.setAttribute('cx',String(d.frame.margin.left+x));
          elements[i].head.setAttribute('cy',String(d.frame.margin.top+d.layout.view.height-y));
        }
      });
      controls();
    }
    /** @param {number} value */
    function seek(value) {
      if (!(Number.isFinite(value) && value >= 0 && value <= 1)) throw new SK.layout.SankeyError('Trajectory progress must be between 0 and 1.');
      pause(); prepare(); progress = value; render(); return snapshot();
    }
    /** @param {number} now */
    function tick(now) {
      if (!playing) return;
      progress = Math.min(1, progress+(now-previous)/12000); previous = now;
      render();
      if (progress === 1) pause(); else request = requestAnimationFrame(tick);
    }
    function play() {
      prepare();
      if (progress === 1) { progress = 0; completed = 0; }
      if (reduced.matches) {
        const travel = Math.max(0.14,1/total);
        const next = total>1 ? completed/(total-1)*(1-travel)+travel : 1;
        return seek(Math.min(1,Math.max(progress,next)));
      }
      playing = true; previous = performance.now(); render();
      cancelAnimationFrame(request); request = requestAnimationFrame(tick);
      return snapshot();
    }
    playButton.addEventListener('click',()=>{ if (playing) pause(); else play(); });
    resetButton.addEventListener('click',reset);
    slider.addEventListener('input',()=>seek(Number(slider.value)/1000));
    document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
    reduced.addEventListener('change',()=>{if(reduced.matches)pause();controls();});
    return {snapshot, refresh, reset, play, pause, seek};
  }

  SK.playback = {units, build, fraction, create};
  if (typeof module !== 'undefined' && module.exports) module.exports = SK;
})(typeof window !== 'undefined' ? window : globalThis);
