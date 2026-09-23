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

/**
 * How long the attention light takes to go round once, in milliseconds.
 *
 * Slow enough to read as one thing moving rather than as a strobe, fast enough that
 * a passer-by glancing over sees it move. Nothing here flashes, so the three-per-
 * second limit that governs the SOS dot does not apply.
 */
const LAP = 2600;
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
 * The phone's own lamp, where the platform will lend it.
 *
 * A screen is what the reader has; a torch is what carries. The web reaches the lamp
 * only through the camera -- a rear-camera track whose capabilities include `torch`,
 * then `applyConstraints` to switch it -- so this asks for the camera, which is a
 * permission prompt the first time. In an SOS that is a fair ask. Where the platform
 * has no lamp, refuses the camera or does not expose `torch` (iOS Safari today), it
 * answers `null` and the screen flashes alone, exactly as before.
 *
 * Released with the beacon: a lamp left on after the screen has gone dark is the
 * worst of both.
 * @returns {Promise<{set:(on:boolean)=>void, release:()=>void}|null>}
 */
async function acquireTorch() {
  const media = globalThis.navigator?.mediaDevices;
  if (!media?.getUserMedia) return null;
  try {
    const stream = await media.getUserMedia({ video: { facingMode: 'environment' } });
    const track = stream.getVideoTracks()[0];
    const caps = /** @type {{torch?: boolean}} */ (track.getCapabilities?.() ?? {});
    if (!caps.torch) { track.stop(); return null; }
    return {
      set: (on) => { track.applyConstraints(/** @type {any} */ ({ advanced: [{ torch: on }] })).catch(() => {}); },
      release: () => track.stop(),
    };
  } catch {
    return null;
  }
}

/**
 * Run a beacon over the whole screen until it is dismissed.
 *
 * Takes over the display deliberately — it is not an indicator on a page, it is the
 * phone being used as a light. Tapping anywhere stops it, because someone who has
 * just been found should not have to hunt for a control.
 *
 * @param {object} config
 * @param {'sos'|'attention'|'morse'} config.mode  `morse` flashes `config.units`
 * @param {number[]} [config.units]  the unit list to flash: 1 and 3 lit, 0 dark
 * @param {number} [config.unitMs]   how long a unit lasts; SOS keeps its own
 * @param {string} config.label      the word to show, in the *listener's* language
 * @param {string} config.lang       that language, so a shared glyph is drawn its way
 * @param {'ltr'|'rtl'} config.dir   and which way its punctuation falls
 * @param {string} config.dismiss    how to stop it, in the owner's language
 * @param {(text: HTMLElement, box: HTMLElement) => void} [config.fit]
 *   Set the word as large as the screen allows. Passed in rather than imported: this
 *   module is a platform seam and has no business reaching into a view, and the
 *   fitter it wants is the one the message screen already uses -- which is what keeps
 *   the beacon's promise that no word is ever broken in half, however long that
 *   language's word for help turns out to be.
 * @param {() => void} [config.onStop]
 */
export function startBeacon({ mode, label, lang, dir, dismiss, fit, onStop, units, unitMs }) {
  // SOS is Morse with its pattern and speed fixed; the signaller supplies its own.
  const flashing = mode === 'sos' || mode === 'morse';
  const pattern = mode === 'morse' && units ? units : SOS;
  const unit = mode === 'morse' && unitMs ? unitMs : DOT;
  stopBeacon();
  const root = document.createElement('div');
  root.className = `beacon beacon-${mode === 'morse' ? 'sos' : mode}`;
  root.setAttribute('role', 'alert');

  const word = document.createElement('p');
  word.className = 'beacon-word';
  word.textContent = label;
  // The word is in someone else's language, inside a page that is in the reader's.
  // Without these two the trailing `!` of `النجدة!` lands on the wrong end of it,
  // and a Han character shared with Japanese gets drawn in the wrong region's shape.
  word.lang = lang;
  word.dir = dir;

  const hint = document.createElement('p');
  hint.className = 'beacon-hint';
  hint.textContent = dismiss;

  root.append(word, hint);
  // One element travelling the perimeter. The four fixed bars this replaces could
  // only be switched on and off, which is a flash and not a travelling light.
  const light = document.createElement('span');
  light.className = 'beacon-light';
  light.setAttribute('aria-hidden', 'true');
  const light2 = document.createElement('span');
  light2.className = 'beacon-light beacon-light-2';
  light2.setAttribute('aria-hidden', 'true');
  if (mode === 'attention') root.append(light, light2);
  document.body.append(root);

  /** @type {ReturnType<typeof setTimeout>|undefined} */ let timer;
  /** @type {number|undefined} */ let frame;
  let at = 0;
  /** @type {{set:(on:boolean)=>void, release:()=>void}|null} */ let torch = null;
  const step = () => {
    const beat = pattern[at % pattern.length];
    root.classList.toggle('beacon-lit', beat > 0);
    torch?.set(beat > 0);
    at += 1;
    timer = setTimeout(step, unit * Math.max(1, beat));
  };

  /**
   * A light that travels the border, rather than four edges taking turns.
   *
   * Switching one edge on at a time read as a flash in the corner of the eye and as
   * four separate lights up close, which is not what a beacon looks like. One point
   * moving continuously round the perimeter is: the eye tracks it, and tracking is
   * what makes something noticeable at a distance where a word is not legible.
   *
   * Driven by `requestAnimationFrame` against the clock rather than by a timer, so
   * it runs at the display's own rate and a dropped frame costs smoothness instead
   * of putting the light in the wrong place. One lap takes `LAP` ms; there is no
   * flashing at all, so no rate limit applies.
   */
  const travel = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    // How far round, in pixels, one lap being the whole perimeter.
    let d = ((performance.now() % LAP) / LAP) * 2 * (w + h);
    // Which side that lands on, and where along it. Written as four subtractions
    // rather than as a modulo table because the four sides are genuinely four cases
    // and the arithmetic is easier to check than to compress.
    /** Where along the perimeter `d` px lands, and which way the streak points there. */
    const place = (/** @type {number} */ d) => {
      if (d < w) return { x: d, y: 0, rot: 0 };
      if ((d -= w) < h) return { x: w, y: d, rot: 90 };
      if ((d -= h) < w) return { x: w - d, y: h, rot: 180 };
      return { x: 0, y: h - (d - w), rot: 270 };
    };
    // The streak is placed by its own centre, so it straddles the edge it is on
    // instead of hanging off the inside of it. The second is half a lap behind.
    const one = place(d);
    const two = place((d + (w + h)) % (2 * (w + h)));
    root.style.setProperty('--beacon-x', String(one.x - light.offsetWidth / 2));
    root.style.setProperty('--beacon-y', String(one.y - light.offsetHeight / 2));
    root.style.setProperty('--beacon-rot', String(one.rot));
    root.style.setProperty('--beacon-x2', String(two.x - light.offsetWidth / 2));
    root.style.setProperty('--beacon-y2', String(two.y - light.offsetHeight / 2));
    root.style.setProperty('--beacon-rot2', String(two.rot));
    frame = requestAnimationFrame(travel);
  };

  // A fixed `vw` size is blind to how long the word is: three Han characters were
  // being set at 86px on a 390px screen with room for twice that, and a ten-letter
  // Ukrainian imperative would have broken across two lines at the same setting.
  fit?.(word, root);

  if (flashing) {
    step();
    // The screen starts at once; the lamp joins when the camera answers.
    acquireTorch().then((got) => { torch = got; });
  } else travel();

  const stop = () => {
    clearTimeout(timer);
    torch?.release();
    torch = null;
    if (frame !== undefined) cancelAnimationFrame(frame);
    root.remove();
    onStop?.();
  };
  root.addEventListener('click', () => stopBeacon());
  live = { stop };
  return live;
}
