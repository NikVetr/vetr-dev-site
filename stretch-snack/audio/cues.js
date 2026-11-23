import { moves } from '../core/catalog.js';

export const changePosition = 'Change position at your own pace. Pause if you need more time.';
/** @type {Record<string,string>} */
export const travelCues = {
  'plane-seat': 'Go to your airplane seat.',
  'train-seat': 'Go to your train or bus seat.',
  'roomy-seat': 'Go to the chair with room around it.',
  'plane-lavatory': 'Go to the airplane lavatory.',
  stall: 'Go to the bathroom stall.',
  'open-area': 'Go to the open, stationary space.',
};
/** @type {Map<string,string>} */
export const cues = new Map([['transition', changePosition]]);
/** A cue may be requested on its own when restarting after a change of posture. */
export const clipForText = new Map([[changePosition, 'transition']]);
for (const [location,text] of Object.entries(travelCues)) {
  const key = 'go-to-' + location;
  cues.set(key, text);
  clipForText.set(text, key);
}
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
