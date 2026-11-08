// Reuse autoCHAIR's own logo movie; the SVG supplies the scene timing and still.
export function prepare() {
  return new URL('../../agendamatic/assets/animation/logo_spin_128.webm', import.meta.url).href;
}

/** @param {HTMLElement} art @param {string} source */
export function create(art, source) {
  const host = art.querySelector('.logo-movie');
  if (!host) throw new Error('autoCHAIR preview has no movie host');
  const video = document.createElement('video');
  video.className = 'autochair-video';
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'auto';
  video.src = source;
  video.setAttribute('aria-hidden', 'true');
  host.append(video);
  let playing = false;
  let disposed = false;
  video.addEventListener('loadeddata', () => host.setAttribute('data-ready', ''));
  return {
    play() {
      playing = true;
      // A pause may arrive while the browser is resolving play(). Retain the video clock.
      video.play().then(() => { if (!playing || disposed) video.pause(); }).catch(error => {
        if (error.name !== 'AbortError') { host.removeAttribute('data-ready'); console.warn('autoCHAIR logo playback:', error.message); }
      });
    },
    pause() { playing = false; video.pause(); },
    destroy() { disposed = true; playing = false; video.pause(); video.removeAttribute('src'); video.load(); video.remove(); host.removeAttribute('data-ready'); },
  };
}
