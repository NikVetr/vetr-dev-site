// The original transparent chair turn, sampled into a lossless sprite. The agenda's
// CSS clock selects its frame, so checkpoints and pause/resume share one clock.
export async function prepare() {
  const source = new URL('../cards/autochair-turn.webp', import.meta.url).href;
  const image = new Image();
  image.src = source;
  await image.decode();
  if (image.naturalWidth !== 3072 || image.naturalHeight !== 216) throw new Error('Invalid autoCHAIR turn sprite');
  return source;
}

/** @param {HTMLElement} art @param {string} source */
export function create(art, source) {
  const host = art.querySelector('.logo-turn');
  const marker = art.querySelector('.marker');
  const checkpoints = (host?.getAttribute('data-checkpoints') ?? '').split(',').map(Number);
  if (!host || !marker || !checkpoints.length || checkpoints.some(t => !Number.isFinite(t) || t <= 0)) {
    throw new Error('autoCHAIR preview has no checkpoint clock');
  }
  const sprite = document.createElementNS('http://www.w3.org/2000/svg','g');
  sprite.classList.add('autochair-frames');
  for (const [theme, y] of [['light',0],['dark',-108]]) {
    const image = document.createElementNS('http://www.w3.org/2000/svg','image');
    image.classList.add(`logo-${theme}`);
    image.setAttribute('href',source);
    image.setAttribute('width','3072'); image.setAttribute('height','216');
    image.setAttribute('y',String(y)); sprite.append(image);
  }
  host.append(sprite);
  const turn = 0.65;
  let playing = false, disposed = false, frame = 0;
  const tick = () => {
    if (!playing || disposed) return;
    const clock = marker.getAnimations().find(a => 'animationName' in a && a.animationName === 'agendamatic-marker');
    if (clock?.effect && typeof clock.currentTime === 'number') {
      const period = Number(clock.effect.getTiming().duration) / 1000;
      const phase = clock.currentTime / 1000 % period;
      const index = checkpoints.reduce((last, t, i) => phase >= t ? i : last, -1);
      const age = index < 0 ? Infinity : phase - checkpoints[index];
      if (age < turn) {
        const current = Math.min(23, Math.floor(age / turn * 24));
        sprite.setAttribute('transform', `translate(${-128 * current} 0)`);
        sprite.setAttribute('data-frame', String(current));
        host.setAttribute('data-ready','');
      } else host.removeAttribute('data-ready');
    }
    frame = requestAnimationFrame(tick);
  };
  return {
    play() { if (!playing) { playing = true; frame = requestAnimationFrame(tick); } },
    pause() { playing = false; cancelAnimationFrame(frame); },
    destroy() {
      disposed = true; playing = false; cancelAnimationFrame(frame);
      sprite.remove(); host.removeAttribute('data-ready');
    },
  };
}
