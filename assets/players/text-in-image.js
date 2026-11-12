// Reveal actual word groups on the same retained CSS clock as the SVG camera.
// No canvas, re-layout or per-word animation is needed for the950-word example.
export function prepare() { return null; }

/** Number of whole words whose authored reveal time has arrived.
 * @param {number[]} times @param {number} milliseconds
 */
export function visibleWords(times, milliseconds) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid] <= milliseconds) lo = mid + 1; else hi = mid; }
  return lo;
}

/** @param {HTMLElement} art */
export function create(art) {
  const svg = art.querySelector('svg'), camera = /** @type {SVGElement|null} */ (art.querySelector('.camera')), clockNode = art.querySelector('.clock');
  if (!svg || !camera || !clockNode) throw new Error('Text in Image preview is incomplete');
  const words = [...art.querySelectorAll('.word')].map(word => /** @type {SVGElement} */ (word));
  const times = words.map(word => Number(word.dataset.reveal));
  const period = Number(svg.dataset.period) * 1000;
  const [zoom,tx,ty] = (camera.dataset.close??'').split(',').map(Number);
  if (![zoom,tx,ty].every(Number.isFinite)) throw new Error('Invalid close-up transform');
  if (!(period > 0) || times.some((time,i)=>!Number.isFinite(time) || (i>0 && time<times[i-1]))) throw new Error('Invalid word reveal timeline');
  let count = words.length, frame = 0, playing = false;
  const render = () => {
    const clock = clockNode.getAnimations()[0];
    const time = Number(clock?.currentTime ?? 0) % period;
    const progress = Math.max(0,Math.min(1,(time-1800)/(13320-1800)));
    const scale = zoom+(1-zoom)*progress;
    // SVG geometry invalidation keeps the filtered layer sharp during magnification;
    // CSS compositor scaling would enlarge a tiny cached bitmap of the glyphs.
    camera.setAttribute('transform',`matrix(${scale} 0 0 ${scale} ${tx*(1-progress)} ${ty*(1-progress)})`);
    const next = visibleWords(times, time);
    for (let i = Math.min(count,next); i < Math.max(count,next); i++) words[i].style.visibility = i < next ? 'visible' : 'hidden';
    count = next;
  };
  const tick = () => { render(); if (playing) frame = requestAnimationFrame(tick); };
  return {
    play() { if (playing) return; playing = true; tick(); },
    pause() { playing = false; cancelAnimationFrame(frame); render(); },
    destroy() { playing = false; cancelAnimationFrame(frame); for (const word of words) word.style.removeProperty('visibility'); camera.removeAttribute('transform'); },
  };
}
