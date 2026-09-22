// Being seen, when the words have stopped being the point.
//
// The rest of this app is about making one sentence legible to one person standing
// in front of you. This is the case where that has already failed: nobody is
// reading, and what is needed is for a phone to be **noticed** — from a road, from
// the far side of a dark car park, by someone who has not been spoken to yet.
//
// **This is the one place in the app that moves.** Everywhere else a transition
// would be decoration and the same information is better given statically. A beacon
// that does not move is not a beacon, so here the motion *is* the feature.
//
// Two modes, because they answer different situations. **SOS** is the one to use
// when the phone can be left somewhere, or waved: the international distress signal,
// three short, three long, three short, which a stranger may recognise even if they
// cannot read a word of the screen. **Attention** is the one to use when someone is
// looking and needs to be drawn closer: a word, very large, and a light running
// around the edge of the display, which reads as movement in the corner of an eye at
// a distance where text does not.
//
// **Timing is a safety constraint, not a style.** WCAG puts the photosensitive
// seizure threshold at three flashes per second; the dot below is 300ms, so the
// fastest this ever gets is a little under two. Do not shorten it.

/** Morse for SOS, in units: true is lit. Dot 1, dash 3, gap 1, letter gap 3. */
const DOT = 300;
const SOS = [
  1, 0, 1, 0, 1, 0, 0, 0,           // S: three dots, then a letter gap
  3, 0, 3, 0, 3, 0, 0, 0,           // O: three dashes
  1, 0, 1, 0, 1,                    // S
  0, 0, 0, 0, 0, 0, 0,              // the pause before it repeats
];

/** @type {{stop:()=>void}|null} the beacon now running, if any */
let live = null;

/** Stop whatever is running. Safe to call when nothing is. */
export function stopBeacon() {
  live?.stop();
  live = null;
}

/**
 * Run a beacon over the whole screen until it is dismissed.
 *
 * Takes over the display deliberately — it is not an indicator on a page, it is the
 * phone being used as a light. Tapping anywhere stops it, because someone who has
 * just been found should not have to hunt for a control.
 *
 * @param {object} config
 * @param {'sos'|'attention'} config.mode
 * @param {string} config.label      the word to show, in the owner's language
 * @param {string} config.dismiss    how to stop it, in the owner's language
 * @param {() => void} [config.onStop]
 */
export function startBeacon({ mode, label, dismiss, onStop }) {
  stopBeacon();
  const root = document.createElement('div');
  root.className = `beacon beacon-${mode}`;
  root.setAttribute('role', 'alert');

  const word = document.createElement('p');
  word.className = 'beacon-word';
  word.textContent = label;

  const hint = document.createElement('p');
  hint.className = 'beacon-hint';
  hint.textContent = dismiss;

  root.append(word, hint);
  if (mode === 'attention') {
    // Four edges rather than one border, so the light can travel around them. A
    // border cannot be lit in part; four absolutely-positioned bars can.
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const edge = document.createElement('span');
      edge.className = `beacon-edge beacon-edge-${side}`;
      edge.setAttribute('aria-hidden', 'true');
      root.append(edge);
    }
  }
  document.body.append(root);

  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  let at = 0;
  const step = () => {
    if (mode === 'sos') {
      const unit = SOS[at % SOS.length];
      root.classList.toggle('beacon-lit', unit > 0);
      at += 1;
      timer = setTimeout(step, DOT * Math.max(1, unit));
    } else {
      // One edge at a time, clockwise. Slower than the SOS dot and nowhere near the
      // flash threshold, because this one is a travelling light rather than a pulse.
      root.dataset.edge = String(at % 4);
      at += 1;
      timer = setTimeout(step, 420);
    }
  };
  step();

  const stop = () => {
    clearTimeout(timer);
    root.remove();
    onStop?.();
  };
  root.addEventListener('click', () => stopBeacon());
  live = { stop };
  return live;
}
