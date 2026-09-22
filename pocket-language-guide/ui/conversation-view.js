// Drawing a conversation board: the owner's grid, and the listener's message.
//
// The whole interaction is two surfaces and one rule about each. The grid is stable
// -- the same buttons in the same places, every time, never reordered by use -- and
// the message fills the screen and dismisses when you tap it anywhere.
//
// This module renders and reports; it holds no state. `ui/conversation.js` owns the
// `BoardState` from `core/conversation.js` and hands a fresh one here after every
// action, which is what makes "a message returns to the grid it was opened from" a
// property of a reducer rather than something to hope the DOM remembers.

import { t } from './i18n.js';

/** Below this, stop shrinking and let the text scroll instead. */
const MIN_MESSAGE_PX = 28;
/** And above this, stop growing: past it a short message reads as a poster. */
const MAX_MESSAGE_PX = 150;
/** Below this a grid label is no longer readable at arm's length; shorten it instead. */
const MIN_CELL_PX = 12;
/** And above this a three-word label starts to look like a headline. */
const MAX_CELL_PX = 40;
/** A pointer that travels further than this was a scroll or a drag, not a tap. */
const TAP_SLOP_PX = 10;

/**
 * The owner's grid: one node's buttons, in the order the board author wrote them.
 *
 * Order is the author's and nothing reorders it -- not usage, not recency, not
 * importance, not a solver. Someone who has learned that "stop" is bottom-left must
 * still find it bottom-left when they need it most, and that is worth more than any
 * ranking could be. This is also why the buttons carry `button.id` rather than an
 * array index: a placement survives an edit somewhere else on the board.
 *
 * @param {HTMLElement} root
 * @param {import('../core/conversation.js').BoardNode} node
 * @param {object} config
 * @param {(button:import('../core/conversation.js').BoardButton)=>string} config.label
 * @param {(button:import('../core/conversation.js').BoardButton)=>boolean} config.available
 * @param {(button:import('../core/conversation.js').BoardButton)=>void} config.onPick
 * @param {string} config.lang  the owner's language, which the labels are in
 * @param {string} [config.title]  a heading the buttons complete, owner-language
 */
export function renderGrid(root, node, { label, available, onPick, lang, title }) {
  root.replaceChildren();
  root.lang = lang;
  root.removeAttribute('aria-busy');

  // **A heading the buttons complete, and only the owner ever sees it.** Four rows
  // reading "Please focus on my shoulders / my back / my neck / my feet" spend most
  // of a small screen saying the same five words, and a reader scanning them is
  // reading the part that does not vary. Said once with an ellipsis, the buttons can
  // be the body part alone.
  //
  // This is a *presentation* choice in the owner's language and nothing more. The
  // listener is still shown one complete idiomatic sentence -- the board format
  // forbids assembling a message from parts, and Mandarin would not take the
  // template anyway, since 按摩背部 is idiomatic where 按摩背 is not. So the split
  // lives in the catalogue, where each language decides for itself whether its own
  // prompt divides that way, and never in the corpus.
  if (title) {
    const heading = document.createElement('p');
    heading.className = 'board-grid-title';
    heading.textContent = title;
    heading.lang = lang;
    root.append(heading);
  }

  for (const button of node.buttons) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'board-cell';
    cell.dataset.button = button.id;
    // **Colour says what a button *does*, not what it is about.** It was the five
    // section colours of a printed sheet, which made a handsome grid and a hard one
    // to read: five saturated fills behind white type, and the label -- the thing a
    // reader is actually looking for -- fighting its own background. Neutral cells
    // and dark text give the words the contrast, and the one distinction left worth
    // drawing is the one that changes what happens next: whether this message can be
    // answered, or only shown.
    if (button.kind === 'submenu') cell.classList.add('board-cell-more');
    else if (button.kind === 'beacon') cell.classList.add('board-cell-beacon');
    else if (button.replySetId) cell.classList.add('board-cell-asks');
    // The label is its own element so the fitter can size the text without touching
    // the cell, whose height is the grid's to decide.
    const text = document.createElement('span');
    text.className = 'board-cell-label';
    text.textContent = label(button);
    cell.append(text);
    // Reinforced with a mark, because colour alone is not a signal: roughly one man
    // in twelve cannot use it, and a tinted cell in bright sun is a white cell.
    if (button.kind !== 'submenu' && button.replySetId) {
      cell.append(answerMark());
      cell.title = t('board.canAnswer');
    }
    // **A button the corpus cannot supply is visibly unavailable, not missing.**
    // Removing it would move every button after it, and a grid that rearranges
    // itself when content is incomplete is the one thing the layout must never do.
    if (!available(button)) {
      cell.disabled = true;
      cell.classList.add('board-cell-off');
      cell.title = t('board.unavailable');
    }
    cell.addEventListener('click', () => onPick(button));
    root.append(cell);
  }
  watchCells(root);
}

/**
 * The width of the widest line this element actually draws.
 *
 * **Not `scrollWidth`.** On a block element whose width is fixed by its container,
 * `scrollWidth` reports the container's width even when a word paints past it — 154
 * against a 153.6px box, for `Emergency` at a size that then wrapped to
 * `Emergenc / y`. The box metric cannot see the overflow it is clamped to, so the
 * width test it backed was never able to fail.
 *
 * A `Range` over the text reports one rectangle per line box, measured from the ink
 * rather than from the box, which is the number the fitter needs: if the widest line
 * is wider than the room, the size is too big and a word is about to be broken.
 * @param {HTMLElement} el
 */
function widestLine(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  let widest = 0;
  for (const rect of range.getClientRects()) {
    if (rect.height > 0 && rect.width > widest) widest = rect.width;
  }
  return widest;
}

/**
 * The exact width a line of text has to fit in, in fractional pixels.
 *
 * **`clientWidth` will not do, and neither will a pixel of slack.** `clientWidth`
 * rounds — it says 154 for a box that is really 153.6 — and the old comparison added
 * a pixel on top of that to absorb integer `scrollWidth`. Between them they let a
 * line of 153.9 pass as fitting a box of 153.6, which is exactly the margin
 * `Emergency` was breaking in: measured as fitting, then wrapped by the browser.
 *
 * Both sides of the comparison are fractions now, so no slack is needed on the
 * width and none is given. Height keeps its pixel, because `scrollHeight` is still
 * an integer.
 * @param {HTMLElement} el
 */
function lineRoom(el) {
  const box = getComputedStyle(el);
  return el.getBoundingClientRect().width
    - Number.parseFloat(box.paddingLeft) - Number.parseFloat(box.paddingRight)
    - Number.parseFloat(box.borderLeftWidth) - Number.parseFloat(box.borderRightWidth);
}

/**
 * The mark on a cell the other person can answer.
 *
 * **Two overlapping speech bubbles, not a return arrow.** `↩` says "this goes back",
 * which is the opposite of what the cell does; two bubbles say a conversation, which
 * is exactly what it does. Drawn rather than set as a character, because there is no
 * glyph for this that every phone has and a missing one would render as tofu in the
 * corner of a button.
 *
 * Inline, and it is 500 bytes: a board is the one surface that has to work with no
 * preparation, and a sprite or an icon fetch is one more thing to have not arrived.
 */
function answerMark() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'board-cell-mark');
  svg.setAttribute('viewBox', '0 0 256 208');
  svg.setAttribute('aria-hidden', 'true');
  // The lower bubble is drawn in front and knocks a gap out of the upper one, so the
  // two read as separate at 14px instead of merging into a blob.
  const defs = document.createElementNS(SVG, 'defs');
  defs.innerHTML = `<path id="plg-b-up" d="${UPPER}"/><path id="plg-b-lo" d="${LOWER}"/>`
    + '<mask id="plg-b-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="208">'
    + '<rect width="256" height="208" fill="white"/>'
    + '<use href="#plg-b-lo" fill="black" stroke="black" stroke-width="10" stroke-linejoin="round"/>'
    + '</mask>';
  svg.append(defs);
  svg.insertAdjacentHTML('beforeend',
    '<use href="#plg-b-up" fill="currentColor" mask="url(#plg-b-cut)"/>'
    + '<use href="#plg-b-lo" fill="currentColor"/>');
  return svg;
}
const SVG = 'http://www.w3.org/2000/svg';
const UPPER = 'M38 8H127C143.6 8 157 21.4 157 38V86C157 102.6 143.6 116 127 116H60L23 144C20.4 146 18 '
  + '144.1 18.6 140.8L24 110C14 104 8 93 8 80V38C8 21.4 21.4 8 38 8Z';
const LOWER = 'M133 57H219C235 57 248 70 248 86V142C248 157.4 236.1 170 221 171L222 198C222.2 201.7 '
  + '218.1 203.3 215.6 200.6L188 171H133C117 171 104 158 104 142V86C104 70 117 57 133 57Z';

/**
 * Set every label as large as fits its own cell, in both directions.
 *
 * **Grows as well as shrinks, and each cell answers for itself.** The cells are a
 * fixed grid so the arrangement never moves, which means a label cannot be given
 * more room — only more or less type. A short label has no reason to wear the size a
 * long one was forced down to, so "Please stop" is set large and "That's good — keep
 * it there" is set smaller, and both fill their box.
 *
 * Both dimensions, because either can be the binding one: a long word overflows
 * sideways at a size three lines would have fitted vertically. Wrapping stays
 * natural — `overflow-wrap: anywhere` is the last resort for a word with no break in
 * it, and nothing here truncates, ellipsizes or clips. If a label genuinely cannot
 * be read at the floor, the answer is a shorter `labelKey` in the board, not a
 * smaller size.
 *
 * A binary search rather than a walk: the answer is anywhere in a 12–40px range and
 * eight probes settle it to under a pixel, where stepping by 8% took thirty layouts
 * to cross the same distance. Still the browser's own text layout throughout — the
 * print solver measures advance widths for paper and has no business here.
 * @param {HTMLElement} root
 */
function fitCells(root) {
  for (const node of root.querySelectorAll('.board-cell')) {
    const cell = /** @type {HTMLElement} */ (node);
    const label = /** @type {HTMLElement} */ (cell.querySelector('.board-cell-label'));
    if (!label) continue;
    // **Against the cell's content box, not the label's own size.** The label is a
    // block with `height: auto`, so it grows to hold whatever it is given and can
    // never overflow *itself* -- comparing it to its own `scrollHeight` said every
    // size fitted and set the whole grid at the ceiling. What is fixed is the cell,
    // whose height the grid decides; the room inside it is that minus its padding.
    const box = getComputedStyle(cell);
    // Physical padding, not the logical `paddingBlockStart` family: `getComputedStyle`
    // does not resolve those everywhere, and an empty string parses to `NaN`, which
    // makes every comparison below false and pins the whole grid at the floor. The
    // padding here is symmetric, so there is nothing for the logical names to buy.
    const room = {
      h: cell.clientHeight - Number.parseFloat(box.paddingTop)
        - Number.parseFloat(box.paddingBottom),
      w: cell.clientWidth - Number.parseFloat(box.paddingLeft)
        - Number.parseFloat(box.paddingRight),
    };
    if (!(room.h > 0 && room.w > 0)) continue;
    // A pixel of slack, because `scrollWidth` and `scrollHeight` are integers and the
    // room they are compared against is not: a label filling a 153.6px box reports
    // 154 and failed the test at every size, which pinned the grid at the floor.
    // **Measured with normal wrapping, so a size that would split a word counts as
    // too big.** `overflow-wrap: anywhere` lets any size "fit", because a word can
    // always be broken between two letters -- which is how "Comfort" came to be set
    // at the ceiling and drawn as "Comfor / t". Words break between words while a
    // size is being chosen; `anywhere` goes back on afterwards as the last resort
    // for a word that cannot fit even at the floor, because nothing here may clip.
    label.style.overflowWrap = 'normal';
    const fits = (/** @type {number} */ px) => {
      label.style.fontSize = `${px}px`;
      // Height from the box, width from the ink: see `widestLine`. Measuring width
      // with `scrollWidth` here reported the cell's own width whatever the text did,
      // so five of the eight topic labels were set at a size that broke a word.
      return label.scrollHeight <= room.h + 1 && widestLine(label) <= lineRoom(label);
    };
    let lo = MIN_CELL_PX;
    let hi = MAX_CELL_PX;
    if (!fits(hi)) {
      for (let i = 0; i < 8; i += 1) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      // `lo` is the last size known to fit; the loop may have left `hi` set.
      label.style.fontSize = `${lo}px`;
    }
    label.style.overflowWrap = '';
  }
}

/**
 * Refit a grid whenever anything that could change the answer changes.
 *
 * Four things do, and each has to be watched separately. The **font** arrives late,
 * and a fit measured against a fallback is a fit against the wrong advance widths.
 * The **cell size** changes on rotation, on a window resize, and — the one that is
 * easy to miss — when the reader turns up their system text size, because that moves
 * `rem` and so moves the grid's own track sizes. A `ResizeObserver` on the grid sees
 * all three of those as one event. The **labels** change when the board navigates,
 * which is `renderGrid` calling this again.
 * @param {HTMLElement} root
 */
function watchCells(root) {
  fitCells(root);
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(() => fitCells(root));
  // One observer per grid element, replaced when the grid is re-rendered into the
  // same node -- otherwise every navigation would leave another one behind.
  observer?.disconnect();
  observer = new ResizeObserver(() => fitCells(root));
  observer.observe(root);
}
/** @type {ResizeObserver|null} */ let observer = null;

/**
 * The listener's message, filling the screen.
 *
 * A `<button>` carrying the text, with the controls as siblings rather than children
 * -- a button inside a button is invalid and, worse, ambiguous about which one a tap
 * meant. So Reply and Speak sit beside the surface and their clicks never pass
 * through it.
 *
 * There is no visible Back control and no instruction paragraph, which is a product
 * decision and not an omission. The surface's own accessible name carries the return
 * action for a screen reader, so nothing is lost to someone who cannot see that the
 * whole card is tappable.
 *
 * @param {HTMLElement} stage
 * @param {import('../core/conversation.js').ResolvedPhrase} phrase
 * @param {object} config
 * @param {()=>void} config.onDismiss
 * @param {(()=>void)|null} config.onReply   null when this session shows only
 * @param {string} config.replyLabel         in the *listener's* language
 * @param {boolean} [config.incoming]        an answer coming back the other way
 * @param {import('../core/conversation.js').ColourRole} [config.colour]
 * @param {(()=>void|Promise<unknown>)|null} [config.onSpeak]  null where no voice
 *   can say this. A rejection is reported rather than swallowed, so the promise is
 *   handed on rather than caught by the caller.
 * @param {string} [config.speakLabel]        in the *owner's* language
 * @param {(reason:string)=>string} [config.speakError]  a speech failure's `reason`
 *   in the owner's words
 */
export function renderMessage(stage, phrase,
  { onDismiss, onReply, replyLabel, incoming, colour, onSpeak, speakLabel = '', speakError }) {
  stage.replaceChildren();
  stage.hidden = false;
  stage.className = 'board-stage';
  stage.classList.toggle('board-stage-incoming', Boolean(incoming));
  // **The same colour the button was, filling the screen.** That is what makes it
  // colour *coding* rather than decoration: the red rectangle the owner pressed is
  // the red screen they are now holding up, so they can see they pressed the right
  // one without reading their own language back. White type on all five, which is
  // also why the roles are the printed sheet's -- those hexes were already chosen
  // dark enough to carry it.
  if (colour) stage.classList.add(`board-role-${colour}`);

  const surface = document.createElement('button');
  surface.type = 'button';
  surface.className = 'board-message';
  // The name is the return action, not the text: a screen reader already reads the
  // text from the elements below, and repeating it here would say everything twice.
  surface.setAttribute('aria-label', t('board.dismiss'));

  const big = document.createElement('p');
  big.className = 'board-message-text';
  big.textContent = phrase.listener.text;
  big.lang = phrase.listener.lang;
  big.dir = phrase.listener.dir;

  // The owner's own wording, small and secondary: it is a confirmation that the
  // right button was pressed, not part of what is being said to anyone. Its own
  // `lang` and `dir`, because the two languages routinely run opposite ways.
  const small = document.createElement('p');
  small.className = 'board-message-gloss';
  small.textContent = phrase.owner.text;
  small.lang = phrase.owner.lang;
  small.dir = phrase.owner.dir;

  surface.append(big, small);
  stage.append(surface);

  // **A scroll is not a tap.** A long message scrolls inside the surface, and the
  // gesture that scrolls it ends with a click on most touch platforms. Comparing
  // where the pointer went down with where it came up -- and whether the surface
  // scrolled underneath it -- separates the two without a timer and without
  // swallowing a genuine tap.
  let origin = /** @type {{x:number, y:number, top:number}|null} */ (null);
  surface.addEventListener('pointerdown', (event) => {
    origin = { x: event.clientX, y: event.clientY, top: surface.scrollTop };
  });
  surface.addEventListener('click', (event) => {
    const moved = origin && (Math.abs(event.clientX - origin.x) > TAP_SLOP_PX
      || Math.abs(event.clientY - origin.y) > TAP_SLOP_PX
      || surface.scrollTop !== origin.top);
    origin = null;
    // A keyboard activation reports 0,0 and has no origin, which reads as "did not
    // move" and dismisses -- which is what Enter on a focused surface should do.
    if (!moved) onDismiss();
  });

  const controls = document.createElement('div');
  controls.className = 'board-controls';

  // **Speak is the owner's control, and Reply is the listener's.** They sit side by
  // side and are labelled from different catalogues for that reason: the owner
  // presses Speak, so it is in their language; the listener presses Reply, so it is
  // in theirs. Audio is off until pressed -- nothing is spoken on open, on restore,
  // or on changing a setting -- and a device with no voice for this language simply
  // has no button, because text has to work regardless.
  // **A voice that fails has to say so.** The button's presence is a claim that the
  // device can read this out, and it is made before anything is tried -- so when the
  // engine then refuses, silence leaves the owner tapping a dead control in front of
  // someone who is waiting. One line, next to the button, in the owner's language,
  // because the owner is the one who pressed it and the one who can do something
  // about it. Cleared on the next attempt, so a retry that works looks like it did.
  const trouble = document.createElement('p');
  trouble.className = 'board-speech-trouble';
  trouble.setAttribute('role', 'status');

  if (onSpeak) {
    const speakButton = document.createElement('button');
    speakButton.type = 'button';
    speakButton.className = 'board-control board-speak';
    speakButton.textContent = speakLabel;
    speakButton.addEventListener('click', () => {
      trouble.textContent = '';
      Promise.resolve(onSpeak()).catch((err) => {
        trouble.textContent = speakError?.(err?.reason ?? 'synthesis-failed') ?? '';
      });
    });
    controls.append(speakButton);
  }

  if (onReply) {
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'board-control';
    // The listener is the one reading this, so it is in their language and carries
    // their direction. The owner never needs to read it.
    reply.textContent = replyLabel;
    reply.lang = phrase.listener.lang;
    reply.dir = phrase.listener.dir;
    reply.addEventListener('click', onReply);
    controls.append(reply);
  }
  // A sibling of the surface, never a child: a button inside a button is invalid,
  // and being a sibling is what structurally stops a control's click reaching the
  // dismiss handler.
  if (controls.childElementCount) stage.append(controls, trouble);
  // In the margin, and not in that row: Speak and Reply are part of the exchange and
  // this is a control over how the screen is drawn. It is also the only one of the
  // three that is always there, so keeping it separate is what lets a message with
  // nothing to say back have no controls at all.
  stage.append(turnControl(stage, surface, big));

  watchMessage(big, surface);
  surface.focus();
  return surface;
}

/**
 * Whether the stage is turned sideways. Module state, deliberately.
 *
 * Someone showing phrases in a verbose language wants every one of them turned, not
 * one, so the choice outlives the message it was made on. It does not outlive the
 * page: a preference this cheap to re-make is not worth a stored key, and a board
 * that opened sideways after a restart would be a surprise nobody asked for.
 */
let turned = false;

/**
 * The control that turns the message sideways, and the reason it is a control.
 *
 * A long sentence in a portrait window runs out of *width* first and is set small
 * with the screen's long axis unused. Turning it is worth roughly double the type
 * size — but which way round the phone should be is the owner's call, made in front
 * of the person they are showing it to, so it is a button and not a measurement. A
 * semicircular arrow says "turn this" in no language.
 *
 * @param {HTMLElement} stage @param {HTMLElement} surface @param {HTMLElement} text
 */
function turnControl(stage, surface, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'board-control board-turn';
  button.setAttribute('aria-label', t('board.turn'));
  button.setAttribute('aria-pressed', String(turned));
  button.title = t('board.turn');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = '<path d="M5 14a7 7 0 0 1 14 0"/><path d="M15.8 11.6 19 14.8l3.2-3.2"/>';
  button.append(svg);
  stage.classList.toggle('board-stage-turned', turned);
  button.addEventListener('click', () => {
    turned = !turned;
    button.setAttribute('aria-pressed', String(turned));
    stage.classList.toggle('board-stage-turned', turned);
    // The box is a different shape now, so the size that filled the old one is the
    // wrong answer. The observer would catch this too; doing it here means the text
    // is never drawn at the stale size for a frame.
    fitMessage(text, surface);
  });
  return button;
}

/**
 * Refit a message whenever the box it is in changes shape.
 *
 * Fitting once was a gap, not a decision: turning the phone over changes both axes
 * and left a message set for the other orientation — small in landscape, overflowing
 * in portrait. The same observer covers the turn control and a system text-size
 * change, for the same reason the grid has one.
 * @param {HTMLElement} text @param {HTMLElement} box
 */
function watchMessage(text, box) {
  fitMessage(text, box);
  shape?.disconnect();
  // A dismissed stage is `display: none`, which reports a 0x0 box and would send
  // the fitter down thirty pointless steps to the floor on every dismissal.
  shape = new ResizeObserver(() => { if (box.clientHeight > 0) fitMessage(text, box); });
  shape.observe(box);
}
/** @type {ResizeObserver|null} */ let shape = null;

/**
 * The listener's answers, over the question they are answering.
 *
 * The question stays on screen. Someone being asked "does this contain peanuts?"
 * should not have to remember the question while choosing between four answers, and
 * a reply board that replaces the question is a reply board that gets the wrong
 * answer.
 *
 * @param {HTMLElement} stage
 * @param {import('../core/conversation.js').ResolvedPhrase} question
 * @param {{id:string, phrase:import('../core/conversation.js').ResolvedPhrase, entry?:boolean}[]} answers
 * @param {object} config
 * @param {(id:string)=>void} config.onAnswer
 * @param {()=>void} config.onCancel
 * @param {string} config.closeLabel  in the listener's language
 * @param {import('../core/conversation.js').ColourRole} [config.colour]
 */
export function renderReply(stage, question, answers, { onAnswer, onCancel, closeLabel, colour }) {
  stage.replaceChildren();
  stage.hidden = false;
  stage.className = 'board-stage';
  // The question's own colour, so the answers read as part of the same exchange
  // rather than as a new screen that happens to have appeared.
  if (colour) stage.classList.add(`board-role-${colour}`);

  const asked = document.createElement('p');
  asked.className = 'board-asked';
  asked.textContent = question.listener.text;
  asked.lang = question.listener.lang;
  asked.dir = question.listener.dir;

  const list = document.createElement('div');
  list.className = 'board-answers';
  list.lang = question.listener.lang;
  list.dir = question.listener.dir;
  for (const { id, phrase, entry } of answers) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'board-answer';
    // The one that opens a keypad is marked, because it is the only answer here
    // that does not answer anything by itself.
    if (entry) choice.classList.add('board-answer-entry');
    // The listener's own reading of their own answer -- including a quantity, which
    // is formatted from a number rather than stored as a sentence.
    choice.textContent = phrase.listener.text;
    choice.addEventListener('click', () => onAnswer(id));
    list.append(choice);
  }

  // Cancelling claims no answer at all, which is a different thing from answering
  // "I don't know" -- and both have to be reachable, because a listener who will
  // not use the board is not the same as a listener who is unsure.
  // **Small, and in the corner.** It was a centred control the size of an answer,
  // which put a way *out* of the question among the ways to answer it -- and the
  // listener's eye goes to the middle. An arrow plus the word, at the lower inline
  // start, reads as "back" rather than as a thirteenth option. `inline-start`, not
  // left, so an Arabic or Hebrew board puts it under the edge that reader starts
  // from. Still the listener's language: they are the one pressing it.
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'board-back';
  close.lang = question.listener.lang;
  close.dir = question.listener.dir;
  const arrow = document.createElement('span');
  arrow.className = 'board-back-arrow';
  arrow.textContent = '\u2190';
  arrow.setAttribute('aria-hidden', 'true');
  close.append(arrow, document.createTextNode(` ${closeLabel}`));
  close.addEventListener('click', onCancel);

  stage.append(asked, list, close);
  /** @type {HTMLElement|null} */ (list.querySelector('button'))?.focus();
}

/** Put the stage away. @param {HTMLElement} stage */
export function clearStage(stage) {
  stage.hidden = true;
  stage.replaceChildren();
}

/**
 * Make the message as large as it can be without clipping.
 *
 * Browser text layout, not the print solver: this is a `<p>` in a box, and the sheet
 * engine's business is advance widths on paper. CSS does most of it through a
 * viewport-relative clamp; this only closes the gap when a long custom phrase would
 * otherwise overflow, and it stops at a floor rather than shrinking to fit.
 *
 * Below the floor the text scrolls, which is the honest failure: **nothing here may
 * clip, ellipsize or drop a word.** A message that loses its negation is worse than
 * a message that has to be scrolled, and by some distance.
 * @param {HTMLElement} text @param {HTMLElement} box
 */
export function fitMessage(text, box) {
  // Measured after the font that will draw it has arrived. A fit computed against a
  // fallback face is a fit against the wrong advance widths, and the correction
  // lands as a visible jump just as the reader starts reading.
  const run = () => {
    // **Measured with the turn undone.** `getClientRects` reports viewport space, so
    // on a turned stage every line comes back with its length in `height` and its
    // thickness in `width` -- which read as a line far too wide for its box at every
    // size, and pinned the text at the floor. The turn is a paint-time rotation and
    // changes no layout, so dropping it for the measurement measures exactly the box
    // the text will occupy, and restoring it in the same synchronous block means
    // nothing is ever painted untured.
    const stage = box.parentElement?.classList.contains('board-stage-turned')
      ? box.parentElement : null;
    if (stage) stage.style.rotate = 'none';
    text.style.fontSize = '';
    let size = Number.parseFloat(getComputedStyle(text).fontSize);
    // **Both axes, and the second one is the bug this was written to fix.** The test
    // used to be height alone, and with `overflow-wrap: anywhere` growing the text
    // never overflowed sideways -- the browser just broke a word instead. So the
    // loop happily grew until `supervisor` was set across two lines as
    // `supervis / or`, which is what a phone actually showed a stranger.
    //
    // Measuring against `normal` is what makes the width test mean something: with
    // any breaking allowed, an over-long word is silently absorbed and `scrollWidth`
    // never exceeds `clientWidth`. Forbidding it for the measurement lets the word
    // overflow, which is the signal to stop growing. The CSS keeps `break-word` for
    // the real render, so a word longer than the whole line still breaks rather than
    // running off the screen -- but only after the fitter has failed to avoid it.
    const fits = () => {
      const held = text.style.overflowWrap;
      text.style.overflowWrap = 'normal';
      // Height from the box that clips, width from the ink -- the same asymmetry
      // `widestLine` exists for, and for the same reason: no box metric on a
      // container-width element can report the word hanging out of it.
      const ok = box.scrollHeight <= box.clientHeight
        && widestLine(text) <= lineRoom(text);
      text.style.overflowWrap = held;
      return ok;
    };
    // **It grows as well as shrinks.** The CSS clamp is in `vw`, which is the right
    // unit for not overflowing sideways and blind to the other axis -- so on a tall
    // phone a four-character message was set at 43px in 844px of screen. The whole
    // promise of this view is that the message is large enough to read from across a
    // room, and half of that is filling the height a width-based rule cannot see.
    //
    // Bounded walks in both directions rather than a binary search: from the clamp's
    // own value the answer is a handful of steps away, and a loop that cannot run
    // more than thirty times cannot become a frame-rate problem on a slow phone.
    if (fits()) {
      for (let i = 0; i < 30 && size < MAX_MESSAGE_PX; i += 1) {
        const bigger = Math.min(MAX_MESSAGE_PX, size * 1.08);
        text.style.fontSize = `${bigger}px`;
        // One step too far, so step back and keep the last size that fitted.
        if (!fits()) { text.style.fontSize = `${size}px`; break; }
        size = bigger;
      }
    } else {
      for (let i = 0; i < 30 && size > MIN_MESSAGE_PX; i += 1) {
        size = Math.max(MIN_MESSAGE_PX, size * 0.92);
        text.style.fontSize = `${size}px`;
        if (fits()) break;
      }
    }
    box.classList.toggle('board-message-scrolls', box.scrollHeight > box.clientHeight + 1);
    if (stage) stage.style.rotate = '';
  };
  run();
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(run);
}

/**
 * The keypad, for an answer the grid did not offer.
 *
 * **The question stays on screen throughout**, exactly as it does behind the answer
 * list — someone typing a number should not have to remember what they are
 * answering. Confirm and Cancel are both present and both say what they do; cancel
 * goes back to the answers, because a listener who opened this by mistake wanted the
 * list they were just looking at.
 *
 * What is confirmed is a **number and a unit**, never a string. The owner's reading
 * of it is formatted from that value in their own language, so the two sides cannot
 * drift and no wording has to exist for it in any of the fifty-one.
 *
 * @param {HTMLElement} stage
 * @param {import('../core/conversation.js').ResolvedPhrase} question
 * @param {object} config
 * @param {(value:import('../core/duration.js').Duration)=>void} config.onConfirm
 * @param {()=>void} config.onCancel
 * @param {(raw:string, unit:'minute'|'hour'|'day')=>string|null} config.check
 *   validates and returns the listener's reading of it, or null
 * @param {Record<string,string>} config.words  labels, in the listener's language
 * @param {import('../core/conversation.js').ColourRole} [config.colour]
 */
export function renderEntry(stage, question, { onConfirm, onCancel, check, words, colour }) {
  stage.replaceChildren();
  stage.hidden = false;
  stage.className = 'board-stage board-stage-entry';
  if (colour) stage.classList.add(`board-role-${colour}`);

  const asked = document.createElement('p');
  asked.className = 'board-asked';
  asked.textContent = question.listener.text;
  asked.lang = question.listener.lang;
  asked.dir = question.listener.dir;

  const amount = document.createElement('input');
  // `inputmode` rather than `type="number"`, which brings spinners nobody wants on a
  // phone and a locale-dependent parse. The value is validated as digits anyway.
  amount.type = 'text';
  amount.inputMode = 'numeric';
  amount.className = 'board-entry-amount';
  amount.setAttribute('aria-label', words.amount);

  /** @type {'minute'|'hour'|'day'} */ let unit = 'minute';
  const units = document.createElement('div');
  units.className = 'board-entry-units';
  units.setAttribute('role', 'group');
  units.setAttribute('aria-label', words.unit);
  /** @type {HTMLButtonElement[]} */ const unitButtons = [];
  for (const which of /** @type {const} */ (['minute', 'hour', 'day'])) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'board-entry-unit';
    b.textContent = words[which];
    b.dataset.unit = which;
    b.addEventListener('click', () => {
      unit = which;
      for (const other of unitButtons) {
        other.classList.toggle('board-entry-unit-on', other.dataset.unit === which);
      }
      sync();
    });
    unitButtons.push(b);
    units.append(b);
  }
  unitButtons[0].classList.add('board-entry-unit-on');

  // The exact text the owner will be shown, updating as it is typed. The same rule
  // the custom-phrase editor follows: a preview that is not the thing itself has
  // misled whoever read it.
  const preview = document.createElement('p');
  preview.className = 'board-entry-preview';
  preview.lang = question.listener.lang;
  preview.dir = question.listener.dir;

  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.className = 'board-control board-entry-confirm';
  confirm.textContent = words.confirm;

  const sync = () => {
    const said = check(amount.value, unit);
    preview.textContent = said ?? words.invalid;
    preview.classList.toggle('board-entry-preview-empty', !said);
    confirm.disabled = !said;
  };
  amount.addEventListener('input', sync);
  sync();

  confirm.addEventListener('click', () => {
    if (check(amount.value, unit)) onConfirm({ amount: Number(amount.value.trim()), unit });
  });
  // Enter confirms, which is what a numeric keypad's own key will send.
  amount.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !confirm.disabled) confirm.click();
  });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'board-control board-close';
  cancel.textContent = words.cancel;
  cancel.addEventListener('click', onCancel);

  const row = document.createElement('div');
  row.className = 'board-entry-row';
  row.lang = question.listener.lang;
  row.dir = question.listener.dir;
  row.append(amount, units);

  const actions = document.createElement('div');
  actions.className = 'board-controls';
  actions.append(cancel, confirm);

  stage.append(asked, row, preview, actions);
  amount.focus();
}
