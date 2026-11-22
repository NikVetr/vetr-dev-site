// The bundle ID in each stem changes whenever either the clip or its stills change.
/** @typedef {{id:string,label:string,media:string,source:string,frames:number[]}} Sign */
/** @typedef {{title:string,entries:Sign[]}} SignGroup */
export const signRoot = 'data/signs/ase-cafe/';
/** @param {Sign} sign @param {'mp4'|'1.jpg'|'2.jpg'} part */
export const mediaUrl = (sign, part) => signRoot + sign.media + '.' + part;

/** Fetch a complete clip. The blob URL handles byte-range playback locally on iOS,
 * including when a service worker serves the original file from the offline pack.
 * @param {HTMLElement} parent @param {Sign} sign @param {AbortSignal} lifetime */
export function showSign(parent, sign, lifetime) {
  const player = document.createElement('div');
  player.className = 'sign-player';
  const video = document.createElement('video');
  video.className = 'sign-film';
  video.controls = true;
  video.playsInline = true;
  video.muted = true;
  video.poster = mediaUrl(sign, '1.jpg');
  video.setAttribute('aria-label', 'Animated 3D ASL demonstration');
  const frames = document.createElement('div');
  frames.className = 'sign-frames';
  frames.hidden = true;
  for (const part of /** @type {const} */ (['1.jpg', '2.jpg'])) {
    const image = new Image();
    image.src = mediaUrl(sign, part);
    image.alt = part === '1.jpg' ? 'First frame of the sign' : 'Second frame of the sign';
    frames.append(image);
  }
  const tools = document.createElement('div');
  tools.className = 'sign-actions';
  const replay = document.createElement('button');
  replay.textContent = 'Replay';
  replay.disabled = true;
  const speedLabel = document.createElement('label');
  speedLabel.textContent = 'Speed ';
  const speed = document.createElement('select');
  speed.add(new Option('Normal', '1'));
  speed.add(new Option('Slow (½×)', '0.5'));
  speed.onchange = () => { video.defaultPlaybackRate = video.playbackRate = Number(speed.value); };
  speedLabel.append(speed);
  const notice = document.createElement('span');
  notice.setAttribute('role', 'status');
  const toggle = document.createElement('button');
  toggle.textContent = 'Show stills';
  toggle.onclick = () => {
    const showFrames = frames.hidden;
    if (showFrames) video.pause();
    frames.hidden = !showFrames;
    video.hidden = replay.hidden = speedLabel.hidden = showFrames;
    toggle.textContent = showFrames ? 'Show video' : 'Show stills';
  };
  let url = '';
  lifetime.addEventListener('abort', () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (url) URL.revokeObjectURL(url);
  }, { once:true });
  const play = async () => {
    try { await video.play(); }
    catch (err) {
      if (!lifetime.aborted && !(err instanceof DOMException && err.name === 'AbortError')) {
        notice.textContent = 'Tap the video to play.';
      }
    }
  };
  replay.onclick = () => { video.currentTime = 0; void play(); };
  video.onplay = () => { notice.textContent = ''; };
  video.onerror = () => { if (!lifetime.aborted) notice.textContent = 'This clip could not be played.'; };
  tools.append(toggle, replay, speedLabel, notice);
  player.append(video, frames, tools);
  parent.append(player);
  void (async () => {
    try {
      const response = await fetch(mediaUrl(sign, 'mp4'), { signal:lifetime });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const blob = await response.blob();
      if (lifetime.aborted) return;
      url = URL.createObjectURL(blob);
      video.src = url;
      replay.disabled = false;
      if (frames.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) await play();
    } catch (err) {
      if (!lifetime.aborted) notice.textContent = 'Clip unavailable. ' + String(err);
    }
  })();
}
