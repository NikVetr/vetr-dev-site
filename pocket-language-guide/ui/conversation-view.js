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
    // The sheet's own five section colours. Someone face down, reaching for `stop`,
    // is looking for a red rectangle and not reading at all.
    if (button.colour) cell.classList.add(`board-role-${button.colour}`);
    if (button.kind === 'submenu') cell.classList.add('board-cell-more');
    cell.textContent = label(button);
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
  fitCells(root);
}

/**
 * Shrink any label that does not fit its cell, and no further than it has to.
 *
 * The cells are a fixed grid so that the arrangement never moves, which means a long
 * label cannot be given more room -- it has to be given smaller type. CSS cannot ask
 * whether text overflows, so this measures, and only the cells that overflow pay.
 *
 * A floor rather than a fit at any cost: below it the label is no longer a thing
 * anyone can read across a dim room, and the honest answer is a shorter `labelKey`
 * in the board. `That's good -- keep it there` is exactly that case and has one.
 * @param {HTMLElement} root
 */
function fitCells(root) {
  const run = () => {
    for (const cell of root.querySelectorAll('.board-cell')) {
      const box = /** @type {HTMLElement} */ (cell);
      box.style.fontSize = '';
      let size = Number.parseFloat(getComputedStyle(box).fontSize);
      for (let i = 0; i < 12 && size > MIN_CELL_PX; i += 1) {
        if (box.scrollHeight <= box.clientHeight) break;
        size = Math.max(MIN_CELL_PX, size * 0.92);
        box.style.fontSize = `${size}px`;
      }
    }
  };
  run();
  // The labels are set in the interface face, which may not have arrived yet; a fit
  // against a fallback is a fit against the wrong advance widths.
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(run);
}

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
 */
export function renderMessage(stage, phrase, { onDismiss, onReply, replyLabel, incoming, colour }) {
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

  if (onReply) {
    const controls = document.createElement('div');
    controls.className = 'board-controls';
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
    stage.append(controls);
  }

  fitMessage(big, surface);
  surface.focus();
  return surface;
}

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
 * @param {{id:string, phrase:import('../core/conversation.js').ResolvedPhrase}[]} answers
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
  for (const { id, phrase } of answers) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'board-answer';
    // The listener's own reading of their own answer.
    choice.textContent = phrase.listener.text;
    choice.addEventListener('click', () => onAnswer(id));
    list.append(choice);
  }

  // Cancelling claims no answer at all, which is a different thing from answering
  // "I don't know" -- and both have to be reachable, because a listener who will
  // not use the board is not the same as a listener who is unsure.
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'board-control board-close';
  close.textContent = closeLabel;
  close.lang = question.listener.lang;
  close.dir = question.listener.dir;
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
    text.style.fontSize = '';
    let size = Number.parseFloat(getComputedStyle(text).fontSize);
    const fits = () => box.scrollHeight <= box.clientHeight;
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
  };
  run();
  if (document.fonts?.status !== 'loaded') document.fonts?.ready.then(run);
}
