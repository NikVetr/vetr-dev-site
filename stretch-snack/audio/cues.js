import { moves } from '../core/catalog.js';

export const changePosition = 'Change position at your own pace. Pause if you need more time.';
/** @type {Map<string,string>} */
export const cues = new Map([['transition', changePosition]]);
/** A cue may be requested on its own when restarting after a change of posture. */
export const clipForText = new Map([[changePosition, 'transition']]);
for (let n = 1; n <= 5; n++) {
  const key = 'count-' + n;
  cues.set(key, String(n));
  clipForText.set(String(n), key);
}
for (const move of moves) {
  const phrase = move.name + '. ' + move.cue;
  const key = clipForText.get(phrase) ?? move.id;
  cues.set(key, phrase);
  clipForText.set(phrase, key);
  clipForText.set(move.cue, key);
  clipForText.set(move.name + '. ' + changePosition, 'transition');
}
