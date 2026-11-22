import { clipForText } from './cues.js';

let token = 0;
/** @type {AudioBufferSourceNode|null} */
let active = null;
/** Only a few short decoded cues are needed during a routine. @type {Map<string, AudioBuffer>} */
const decoded = new Map();
export function stopClips() {
  token++;
  if (active) {
    active.stop();
    active.disconnect();
    active = null;
  }
}

/** @param {AudioContext|undefined} context @param {string} text @param {()=>void} onError */
export function speakerWithClips(context, text, onError) {
  stopClips();
  const key = clipForText.get(text);
  if (!context || !key) return false;
  const playback = token;
  const loadAndPlay = async () => {
    let buffer = decoded.get(key);
    if (!buffer) {
      const response = await fetch(new URL('./clips/' + key + '.mp3', import.meta.url));
      if (!response.ok) throw new Error('Speech cue unavailable.');
      buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (token !== playback) return;
      const oldest = decoded.keys().next().value;
      if (decoded.size >= 8 && oldest !== undefined) decoded.delete(oldest);
      decoded.set(key, buffer);
    }
    if (token !== playback) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    active = source;
    source.onended = () => {
      if (active === source) {
        active = null;
        source.disconnect();
      }
    };
    source.start();
  };
  loadAndPlay().catch(() => {
    if (token === playback) onError();
  });
  return true;
}
