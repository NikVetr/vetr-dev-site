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
// a distance where text does not -- with three switches at its foot for the siren,
// the lamp, and the screen turning red and blue.
//
// **Timing is a safety constraint, not a style.** WCAG puts the photosensitive
// seizure threshold at three flashes per second; the dot below is 300ms, so SOS
// never gets faster than a little under two. Do not shorten it. A signaller may
// hand in its own unit, and that unit is clamped here -- `safeUnitMs`, 170ms at the
// least -- so this module is the one place the ceiling is enforced and no page's
// speed setting can be the thing that bypasses it.

import { safeUnitMs } from '../../core/morse.js';

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

/**
 * A siren, for Attention when the reader has asked for one: a wail sweeping between
 * about 650 and 1500 Hz and back, drawn by an oscillator so there is no file to fetch
 * or to have not arrived. Started inside the tap that raised the beacon, which is
 * the gesture a browser asks for before it makes a sound, and played through the
 * silent switch where Safari lets a page ask for that.
 * @returns {{stop:()=>void}|null}
 */
function startSiren() {
  const Audio = globalThis.AudioContext ?? /** @type {any} */ (globalThis).webkitAudioContext;
  if (!Audio) return null;
  const session = /** @type {any} */ (navigator).audioSession;
  if (session) session.type = 'playback';
  const ctx = new Audio();
  const tone = ctx.createOscillator();
  const sweep = ctx.createOscillator();
  const depth = ctx.createGain();
  const level = ctx.createGain();
  tone.type = 'square';
  tone.frequency.value = 1075;
  sweep.frequency.value = 0.6;
  depth.gain.value = 425;
  level.gain.value = 0.25;
  sweep.connect(depth).connect(tone.frequency);
  tone.connect(level).connect(ctx.destination);
  tone.start();
  sweep.start();
  return { stop: () => { tone.stop(); sweep.stop(); ctx.close(); } };
}

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

/** How long each colour holds on the red-and-blue screen. */
const LIGHTS_MS = 700;

/**
 * The attention screen's switches, drawn in the stroke of the app's other icons. The
 * waves and rays (`beacon-emit`) show only while a switch is on, and the lamp's
 * strike only once the phone has turned out to have none to lend.
 */
const SWITCH_ICONS = {
  siren: '<path d="M3 10v4h3l7 4V6l-7 4z"/>'
    + '<path class="beacon-emit" d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>',
  torch: '<path d="M7 7h10l-2 5H9zM9 12h6v10H9z"/><circle cx="12" cy="15.5" r="0.6"/>'
    + '<path class="beacon-emit" d="M12 1.5V4M6 3l1.5 1.5M18 3l-1.5 1.5"/>'
    + '<path class="beacon-strike" d="M3 3l18 18"/>',
  lights: '<path class="beacon-dome beacon-dome-red" d="M7 17v-4a5 5 0 0 1 5-5v9z"/>'
    + '<path class="beacon-dome beacon-dome-blue" d="M12 8a5 5 0 0 1 5 5v4h-5z"/>'
    + '<path d="M5 17h14v3H5z"/>'
    + '<path class="beacon-emit" d="M12 2v3M4.9 4.9 7 7M19.1 4.9 17 7"/>',
};

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
 * @param {(index: number) => void} [config.onBeat]  told which unit of the pattern is
 *   starting, so a caller can show which letter is on the light
 * @param {HTMLElement} [config.foot]  drawn at the foot, over the flash
 * @param {boolean} [config.fast]  the reader has been warned and has chosen a unit
 *   under the photosensitive ceiling; only then is it not clamped
 * @param {boolean} [config.siren]  the attention screen opens with its siren on
 * @param {{siren:string, torch:string, lights:string, noTorch:string}} [config.switches]
 *   the attention screen's switches, labelled in the owner's language
 */
export function startBeacon({ mode, label, lang, dir, dismiss, fit, onStop, units, unitMs, onBeat, foot, fast, siren, switches }) {
  // SOS is Morse with its pattern and speed fixed; the signaller supplies its own.
  const flashing = mode === 'sos' || mode === 'morse';
  const pattern = mode === 'morse' && units ? units : SOS;
  const unit = mode === 'morse' && unitMs ? (fast ? unitMs : safeUnitMs(unitMs)) : DOT;
  stopBeacon();
  const root = document.createElement('div');
  root.className = `beacon beacon-${mode === 'morse' ? 'sos' : mode}`;
  root.setAttribute('role', 'alert');
  // The unit actually running, so a test can read the ceiling off the element.
  root.dataset.unit = String(unit);

  const word = document.createElement('p');
  word.className = 'beacon-word';
  // A trailing mark hangs, as on the board, so the word itself is centred: `救命!`
  // set as three glyphs put the two that matter left of the middle.
  const trailing = /[\u3000-\u303f\uff01-\uff60]+$/u.exec(label);
  word.textContent = trailing ? label.slice(0, -trailing[0].length) : label;
  if (trailing) {
    const punct = document.createElement('span');
    punct.className = 'board-message-punct';
    punct.textContent = trailing[0];
    word.append(punct);
  }
  // The word is in someone else's language, inside a page that is in the reader's.
  // Without these two the trailing `!` of `النجدة!` lands on the wrong end of it,
  // and a Han character shared with Japanese gets drawn in the wrong region's shape.
  word.lang = lang;
  word.dir = dir;

  const hint = document.createElement('p');
  hint.className = 'beacon-hint';
  hint.textContent = dismiss;

  root.append(word, hint);
  if (foot) root.append(foot);
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
  let stopped = false;
  /** @type {{set:(on:boolean)=>void, release:()=>void}|null} */ let torch = null;
  // Started inside the tap that raised the beacon or pressed the switch, which is the
  // gesture a browser asks for before it makes a sound.
  /** @type {{stop:()=>void}|null} */ let sound = siren && mode === 'attention' ? startSiren() : null;
  const step = () => {
    onBeat?.(at % pattern.length);
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

  // **Three switches, not three screens.** What reaches a stranger depends on where the
  // reader is -- a siren carries round a corner, the lamp across a dark car park, and
  // red and blue read as "help is needed here" to someone already looking -- and a
  // reader who wants the sound as well as the light should not have to leave the
  // screen to get it. A tap on a switch is not a tap "anywhere", so it does not stop
  // the beacon.
  if (switches && mode === 'attention') {
    // **Red and blue, slowly.** A colour held for LIGHTS_MS before the other takes over
    // is under one change of colour a second -- far below the three-per-second
    // threshold at which a flash can bring on a seizure, the saturated-red one included.
    const turn = () => {
      root.classList.toggle('beacon-blue');
      timer = setTimeout(turn, LIGHTS_MS);
    };
    const lights = (/** @type {boolean} */ on) => {
      clearTimeout(timer);
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      root.className = `beacon beacon-${on ? 'lights' : 'attention'}`;
      if (on) turn(); else travel();
    };
    // The lamp is held on, steadily, until switched off or the beacon stops. The camera
    // answers late, so a lamp that arrives after the switch went off again, or after a
    // second press already lit one, is let go at once; a phone with no lamp to lend has
    // its switch struck out rather than left as a switch that does nothing.
    const lamp = (/** @type {boolean} */ on, /** @type {HTMLButtonElement} */ button) => {
      if (!on) { torch?.release(); torch = null; return; }
      acquireTorch().then((got) => {
        if (!got) {
          button.disabled = true;
          button.setAttribute('aria-pressed', 'false');
          button.title = switches.noTorch;
        } else if (stopped || torch || button.getAttribute('aria-pressed') !== 'true') got.release();
        else { torch = got; got.set(true); }
      });
    };
    const row = document.createElement('div');
    row.className = 'beacon-switches';
    row.addEventListener('click', (event) => event.stopPropagation());
    /** @param {'siren'|'torch'|'lights'} name @param {boolean} on @param {(on: boolean, button: HTMLButtonElement) => void} flip */
    const add = (name, on, flip) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `beacon-switch beacon-switch-${name}`;
      button.setAttribute('aria-pressed', String(on));
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${SWITCH_ICONS[name]}</svg>`;
      const text = document.createElement('span');
      text.textContent = switches[name];
      button.append(text);
      button.addEventListener('click', () => {
        const next = button.getAttribute('aria-pressed') !== 'true';
        button.setAttribute('aria-pressed', String(next));
        flip(next, button);
      });
      row.append(button);
    };
    add('siren', Boolean(sound), (on) => {
      sound?.stop();
      sound = on ? startSiren() : null;
    });
    add('torch', false, lamp);
    add('lights', false, lights);
    root.append(row);
  }

  // A fixed `vw` size is blind to how long the word is: three Han characters were
  // being set at 86px on a 390px screen with room for twice that, and a ten-letter
  // Ukrainian imperative would have broken across two lines at the same setting.
  fit?.(word, root);

  if (flashing) {
    step();
    // The screen starts at once; the lamp joins when the camera answers -- unless
    // the beacon has already been dismissed by then, when the camera is let go at
    // once. The first version assigned the late track to a closure `stop` had
    // already run over, and the lamp stayed on until the page died.
    acquireTorch().then((got) => {
      if (stopped) got?.release();
      else torch = got;
    });
  } else travel();

  // **Leaving is stopping.** A page put in the background has its timers throttled,
  // so the pattern it would flash is not Morse any more; a page being left has no
  // screen to flash. Either way the lamp must not be left lit with nothing
  // watching it, so both are the same tap.
  //
  // Any change of visibility, not only one that reads `hidden`: WebKit can suspend
  // the web process before it runs the hidden event and deliver it on return, when
  // the page reads visible again -- the iOS simulator caught a beacon still flashing
  // after a trip to Settings that way. A page cannot come back without having left.
  document.addEventListener('visibilitychange', stopBeacon);
  addEventListener('pagehide', stopBeacon);

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    torch?.release();
    torch = null;
    sound?.stop();
    if (frame !== undefined) cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', stopBeacon);
    removeEventListener('pagehide', stopBeacon);
    root.remove();
    onStop?.();
    // Whoever holds page reloads back for a running beacon can let go now.
    document.dispatchEvent(new Event('beacon-stop'));
  };
  root.addEventListener('click', () => stopBeacon());
  live = { stop };
  return live;
}
