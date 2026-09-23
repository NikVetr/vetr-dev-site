// Conversation boards: what a board is, what it resolves to, and where a tap goes.
//
// A board is a stable grid of short buttons labelled in the owner's language. One
// tap shows the whole message in the listener's language, very large; one tap on
// that message returns to the exact grid it came from. That is the entire
// interaction, and everything here exists to make those two sentences true.
//
// **This module is pure.** It reads a board definition and a corpus and returns
// text and state; it touches no DOM, fetches nothing, and stores nothing. The
// browser half lives in `ui/conversation*.js`, and the split is what lets the
// navigation table in the specification be a unit-test fixture rather than a
// Playwright script.
//
// **It does not typeset.** A board never builds a `SheetSpec`, never runs the
// solver, and never asks which rows survived a layout. `core/pack.js` is a 44KB
// data-only module -- it imports `core/csv.js` and nothing else -- so resolving a
// phrase costs a corpus join and no more. A board is a view over language content,
// not a small sheet.
//
// **Terms are indexed, not copied.** A button names a concept that already exists
// wherever one does: the spa board's comfort node points at
// `hotel-requests.another-towel-please` and its closing node at
// `social-basics.thank-you`, rather than either growing a spa-flavoured twin. Board
// nodes are subsections and they overlap freely -- the same concept may be reachable
// from several of them, on this board and on others. That is the point. An entry is
// a per-language realization of a language-independent concept, which is what keeps
// the corpus O(N) rather than O(N^2); a duplicated concept multiplies by fifty-three,
// has to be translated again, and drifts from its twin. New concepts are for
// meanings the corpus genuinely cannot say.

import { appliesTo } from './pack.js';
import { formatQuantity } from './quantity.js';
import { variantOf } from './speaker.js';

/** How many levels of submenu a board may nest. Deeper is a menu tree, not a board. */
const MAX_DEPTH = 3;
/** Buttons per node. Twelve is the specification's upper bound for one screen. */
const MAX_BUTTONS = 12;
/** @type {Set<string>} The sheet's five section-role colours, and no others. */
const COLOURS = new Set(['comm', 'money', 'move', 'stay', 'alert']);
/** @type {Set<string>} Units a structured answer may be counted in. */
const UNITS = new Set(['minute', 'hour', 'day']);
/** @type {Set<string>} The keypads a board may open. Each needs no translation. */
const ENTRIES = new Set(['duration', 'clock', 'count']);

/**
 * @typedef {Object} BoardButton
 * @property {string} id            stable placement, not a label and not an index
 * @property {'message'|'submenu'|'value'|'entry'|'beacon'} kind
 * @property {'sos'|'attention'} [beacon]  for `beacon`: which signal it runs. Not a
 *   phrase and not spoken -- the one button on a board that is about being *seen*
 *   rather than read, for when nobody is looking at the screen yet.
 * @property {import('./quantity.js').Quantity} [value]  for `value`: what it answers
 * @property {'duration'|'clock'|'count'} [entry]  for `entry`: which keypad it opens.
 *   A duration is *how long*, a clock is *when*, a count is a bare number -- a
 *   platform, a price, how many. All three are answers that need no translation,
 *   which is what makes a keypad worth having where a phrase would cost fifty-one
 *   rows.
 * @property {string} [nodeId]      for `submenu`: the child node
 * @property {PhraseRef} [phraseRef] for `message`: what it says
 * @property {string} [labelKey]    optional short interface wording, never spoken
 * @property {string} [replySetId]  for `message`: answers the listener may give
 * @property {ColourRole} [colour]  which of the sheet's five role colours it takes
 */

/**
 * The five colours a printed sheet already codes its sections with.
 *
 * Reused here rather than invented, so a reader who has seen a card meets the same
 * vocabulary: red is the thing you say when something is wrong, green is where you
 * want the work done. On a board it does more than it does on paper -- someone face
 * down, reaching for *stop*, is looking for a red rectangle and not reading at all.
 * @typedef {'comm'|'money'|'move'|'stay'|'alert'} ColourRole
 */

/**
 * What a button says, named by meaning rather than by string.
 *
 * `corpus` is a concept id and is the normal case. `custom` is one of the owner's
 * own phrases, which carries its text with it because no concept describes it.
 * @typedef {{kind:'corpus', id:string} | {kind:'custom', id:string}} PhraseRef
 */

/**
 * @typedef {Object} BoardNode
 * @property {BoardButton[]} buttons
 * @property {string} [titleKey]  a heading the node's buttons complete, in the
 *   owner's language -- see `renderGrid` for why only the owner ever sees a fragment
 */

/**
 * @typedef {Object} Board
 * @property {1} schemaVersion
 * @property {string} id
 * @property {string} titleKey
 * @property {string} rootNodeId
 * @property {Record<string, BoardNode>} nodes
 * @property {Record<string, {buttons:BoardButton[]}>} [replySets]
 */

/**
 * One side of a resolved message: the text, and what a renderer needs to draw it.
 * @typedef {Object} PhraseSide
 * @property {string} text
 * @property {string} lang
 * @property {'ltr'|'rtl'} dir
 * @property {string} [roman]  how to say it, in the reader's own letters
 * @property {string} [ipa]    the same, for a reader who reads IPA
 */

/**
 * @typedef {Object} ResolvedPhrase
 * @property {string} id
 * @property {PhraseSide} listener   the big text, in the language being spoken to
 * @property {PhraseSide} owner      the small confirmation, in the owner's language
 * @property {string} provenance     where the wording came from
 * @property {number} confidence     0-3, as everywhere else in the corpus
 * @property {boolean} custom        the owner wrote it, so it is unreviewed
 */

/**
 * The whole of a board session. Small on purpose.
 *
 * `path` is the stack of node ids, so returning from a message lands on the node it
 * was opened from rather than on the board's root -- which is the specification's
 * one hard navigation requirement and the reason this is a stack and not a field.
 *
 * There is deliberately no transcript. A board is a conversation aid, not a log of
 * a private exchange, and the specification is explicit that a cold launch restores
 * the board and not the last thing that was said.
 * @typedef {Object} BoardState
 * @property {string} boardId
 * @property {'grid'|'message'|'reply'|'answer'|'entry'} view
 * @property {string[]} path            node ids, deepest last; never empty
 * @property {string|null} buttonId     the message being shown, when there is one
 * @property {string|null} answerId     the reply chosen, in the `answer` view
 * @property {import('./quantity.js').Quantity|null} [answerValue]  a typed or tapped
 *   quantity, when the answer is one. Structured, never the text of one.
 * @property {boolean} replies          whether this session offers replies at all
 */

/**
 * Read a board definition, or say exactly what is wrong with it.
 *
 * Returns a list of problems rather than throwing on the first, because a board is
 * authored data and an author fixing six things wants to see six things. An empty
 * list means the board is structurally sound; it says nothing about whether the
 * corpus can supply its text, which is `missingPhrases`' question.
 * @param {any} board
 * @returns {string[]}
 */
export function validateBoard(board) {
  /** @type {string[]} */ const problems = [];
  if (!board || typeof board !== 'object') return ['not an object'];
  if (board.schemaVersion !== 1) problems.push(`schemaVersion ${board.schemaVersion} is not 1`);
  if (!board.id) problems.push('no id');
  const nodes = board.nodes && typeof board.nodes === 'object' ? board.nodes : null;
  if (!nodes) return [...problems, 'no nodes'];
  if (!nodes[board.rootNodeId]) problems.push(`rootNodeId ${board.rootNodeId} is not a node`);

  /** @type {Set<string>} */ const buttonIds = new Set();
  // **Reply sets are buttons too, and were not being checked.** This walked
  // `board.nodes` alone, so a reply carrying an unknown kind, a broken `phraseRef`
  // or a duplicate id passed validation and failed at the reader instead. They live
  // beside the nodes rather than inside them because they are reached from a message
  // and not from the grid -- which is a navigation fact, not a reason to trust them.
  const everyNode = Object.entries({
    ...nodes,
    ...Object.fromEntries(Object.entries(board.replySets ?? {})
      .map(([id, set]) => [`replySets/${id}`, set])),
  });
  for (const [nodeId, node] of everyNode) {
    const buttons = /** @type {any} */ (node)?.buttons;
    if (!Array.isArray(buttons) || !buttons.length) {
      problems.push(`${nodeId}: no buttons`);
      continue;
    }
    // Twelve is a design bound from the specification, not a technical one: past
    // that the cells are too small to hit and the answer is a submenu.
    if (buttons.length > MAX_BUTTONS) {
      problems.push(`${nodeId}: ${buttons.length} buttons, more than ${MAX_BUTTONS}`);
    }
    for (const button of buttons) {
      if (!button.id) { problems.push(`${nodeId}: a button with no id`); continue; }
      // Unique across the board, not merely within a node, because a placement is
      // what persistence and the editor both key on.
      const key = `${nodeId}/${button.id}`;
      if (buttonIds.has(key)) problems.push(`${key}: duplicate button id`);
      buttonIds.add(key);
      // An enum, so a board file cannot name a colour that is not on the card.
      if (button.colour && !COLOURS.has(button.colour)) {
        problems.push(`${key}: colour ${button.colour} is not one of ${[...COLOURS].join(', ')}`);
      }
      if (button.kind === 'value') {
        // A quantity, not a sentence: the one answer that needs no translation, and
        // therefore the one that has to be checked structurally instead. Only a
        // duration is worth presetting -- nobody offers six clock times on a grid --
        // so this is narrower than what a keypad may return.
        const v = button.value;
        if (!v || v.kind !== 'duration' || !Number.isInteger(v.amount) || v.amount < 1
          || !UNITS.has(v.unit)) {
          problems.push(`${key}: value must be a whole duration in ${[...UNITS].join(', ')}`);
        }
      } else if (button.kind === 'entry') {
        if (!ENTRIES.has(button.entry)) {
          problems.push(`${key}: entry ${button.entry} is not one of ${[...ENTRIES].join(', ')}`);
        }
      } else if (button.kind === 'submenu') {
        if (!nodes[button.nodeId]) problems.push(`${key}: submenu to unknown node ${button.nodeId}`);
      } else if (button.kind === 'beacon') {
        // Also an enum, and deliberately a short one. A board file naming its own
        // signal would be a board file describing behaviour, which is the line this
        // format does not cross.
        if (button.beacon !== 'sos' && button.beacon !== 'attention') {
          problems.push(`${key}: unknown beacon ${button.beacon}`);
        }
      } else if (button.kind === 'message') {
        const ref = button.phraseRef;
        if (!ref || (ref.kind !== 'corpus' && ref.kind !== 'custom') || !ref.id) {
          problems.push(`${key}: a message with no usable phraseRef`);
        }
      } else {
        // An enum, not an open set: the format carries no actions, no URLs and no
        // expressions, so a board file can never be a program.
        problems.push(`${key}: kind ${button.kind} is not one of message, submenu, `
          + 'value, entry or beacon');
      }
    }
  }

  // Reachability and depth in one walk from the root.
  /** @type {Map<string, number>} */ const depth = new Map([[board.rootNodeId, 0]]);
  const queue = [board.rootNodeId];
  while (queue.length) {
    const id = /** @type {string} */ (queue.shift());
    for (const button of nodes[id]?.buttons ?? []) {
      if (button.kind !== 'submenu' || !nodes[button.nodeId]) continue;
      if (depth.has(button.nodeId)) continue;
      depth.set(button.nodeId, /** @type {number} */ (depth.get(id)) + 1);
      queue.push(button.nodeId);
    }
  }
  for (const id of Object.keys(nodes)) {
    // An unreachable node is dead weight that still has to be translated and
    // reviewed, so it is a problem rather than a curiosity.
    if (!depth.has(id)) problems.push(`${id}: not reachable from the root`);
    else if (/** @type {number} */ (depth.get(id)) >= MAX_DEPTH) {
      problems.push(`${id}: nested ${depth.get(id)} deep, past ${MAX_DEPTH - 1}`);
    }
  }

  // **Reply sets are reachable in the other direction, and both directions bite.**
  // They are not in the walk above because a reply set is reached from a message
  // rather than from the grid -- but a button naming a set that does not exist offers
  // a Reply control that opens nothing, and a set nothing names is worse than dead:
  // `scripts/build_board_index.mjs` charges the board for every phrase in it, so an
  // orphan silently costs the board the languages that cannot say its answers. Both
  // were reachable states while this only looked at nodes, and one of them shipped.
  const sets = new Set(Object.keys(board.replySets ?? {}));
  /** @type {Set<string>} */ const called = new Set();
  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const button of /** @type {any} */ (node)?.buttons ?? []) {
      if (!button.replySetId) continue;
      called.add(button.replySetId);
      if (!sets.has(button.replySetId)) {
        problems.push(`${nodeId}/${button.id}: replySetId ${button.replySetId} is not a reply set`);
      }
    }
  }
  for (const id of sets) {
    if (!called.has(id)) problems.push(`replySets/${id}: no button offers it`);
  }
  return problems;
}

/** Every phrase a board can ask for, including its reply sets. @param {Board} board */
export function phrasesOf(board) {
  /** @type {PhraseRef[]} */ const refs = [];
  const sets = Object.values(board.replySets ?? {});
  for (const node of [...Object.values(board.nodes), ...sets]) {
    for (const button of node.buttons) if (button.phraseRef) refs.push(button.phraseRef);
  }
  // Deduplicated on the way out, because indexing the same term into two
  // subsections is the intended usage and must not look like two dependencies.
  const seen = new Set();
  return refs.filter((r) => !seen.has(`${r.kind}:${r.id}`) && seen.add(`${r.kind}:${r.id}`));
}

/**
 * One button's text, in both languages, or `null` if the corpus cannot supply it.
 *
 * `null` rather than a partial result or an English stand-in. A board that shows the
 * owner's own language to the listener has not degraded gracefully, it has failed
 * silently in the one place where failing silently is worst -- and the specification
 * says so twice. `missingPhrases` is how a caller finds out *before* the board opens,
 * so a reader never meets a dead button.
 *
 * Scope is checked with `appliesTo`, the same helper the sheet uses, so a concept
 * scoped away from this target is unavailable here too rather than quietly resolving
 * to a gloss row that happens to exist.
 *
 * `incoming` says whose sentence this is, and it is the whole of the speaker-profile
 * rule: an outgoing message is the owner speaking, so it takes whatever wording they
 * have said is theirs, and a reply the *listener* taps is not the owner's to inflect.
 * `variantOf` enforces the refusal, so a caller cannot break it by forgetting.
 * @param {PhraseRef} ref
 * @param {ResolveContext} ctx
 * @param {boolean} [incoming] true for a reply the listener taps, false for a message
 * @returns {ResolvedPhrase|null}
 */
export function resolvePhrase(ref, ctx, incoming = false) {
  if (ref.kind === 'custom') {
    const own = ctx.custom?.[ref.id];
    if (!own?.listener || !own?.owner) return null;
    return {
      id: ref.id,
      listener: { text: own.listener, lang: ctx.listener, dir: ctx.listenerDir },
      owner: { text: own.owner, lang: ctx.owner, dir: ctx.ownerDir },
      provenance: 'custom',
      confidence: 0,
      custom: true,
    };
  }
  const concept = ctx.corpus.concepts[ref.id];
  if (!concept || !appliesTo(concept, ctx.listener)) return null;
  const base = { listener: ctx.listenerRows[ref.id], owner: ctx.ownerRows[ref.id] };
  if (!base.listener?.text || !base.owner?.text) return null;
  const listener = say(ctx.listenerVoice, ref.id, base.listener, incoming);
  const owner = say(ctx.ownerVoice, ref.id, base.owner, incoming);
  return {
    id: ref.id,
    // **The pronunciation rides with the sentence, from the same row.** Taking it
    // here rather than looking it up again in the view is what keeps it correct
    // under a speaker variant: `say` has already swapped the row for the reader's
    // own gender where that matters, and Hebrew's "I am sick" is the case that
    // proves it -- the script is identical for both genders and the romanisation
    // and the IPA are not.
    listener: {
      text: listener.text,
      lang: ctx.listener,
      dir: ctx.listenerDir,
      roman: (ctx.listenerRoman && listener[`romanization_${ctx.listenerRoman}`]) || '',
      ipa: listener.ipa || '',
    },
    owner: { text: owner.text, lang: ctx.owner, dir: ctx.ownerDir },
    provenance: listener.provenance ?? '',
    confidence: Number(listener.confidence ?? 0),
    custom: false,
  };
}

/**
 * One side's row as the owner says it. Factored out because both sides take the
 * same treatment and the `incoming` refusal has to be the same one on each.
 * @param {SpeakerVoice|undefined} voice
 * @param {string} conceptId
 * @param {Record<string,string>} row
 * @param {boolean} incoming
 */
function say(voice, conceptId, row, incoming) {
  if (!voice?.key) return row;
  return variantOf({ conceptId, row, variants: voice.variants, key: voice.key, incoming }).row;
}

/**
 * How one language's rows are bent to the person holding the phone: the key their
 * settings resolve to, and that language's sparse variant table. Absent for every
 * language with no declared axis, and for every reader who has answered nothing.
 * @typedef {Object} SpeakerVoice
 * @property {string|null} key
 * @property {import('./speaker.js').VariantTable} variants
 */

/**
 * @typedef {Object} ResolveContext
 * @property {{concepts:Record<string,any>}} corpus
 * @property {Record<string,Record<string,string>>} listenerRows
 * @property {Record<string,Record<string,string>>} ownerRows
 * @property {string} listener
 * @property {string} owner
 * @property {'ltr'|'rtl'} listenerDir
 * @property {'ltr'|'rtl'} ownerDir
 * @property {Record<string,{owner:string, listener:string}>} [custom]
 * @property {string} [listenerRoman]  which `romanization_*` column to read, if any
 * @property {SpeakerVoice} [listenerVoice]
 * @property {SpeakerVoice} [ownerVoice]
 */

/**
 * A quantity, said to both people at once.
 *
 * The shape of a `ResolvedPhrase`, so the views that draw a message do not need to
 * know whether it came from the corpus or from a keypad — but built from a number
 * and a unit rather than from any stored text. Both sides are formatted at the
 * moment of display, which is why one structured value serves fifty-one languages
 * and none of them needs a row: `Intl` carries the plural rules, and Bengali gets
 * Bengali numerals without anyone writing them down.
 *
 * `null` where either language has no formatter, exactly as `resolvePhrase` returns
 * `null` rather than half an answer. The two constructed languages are that case,
 * and a board for one of them simply cannot offer a quantity.
 * @param {import('./quantity.js').Quantity} value
 * @param {ResolveContext} ctx
 * @returns {ResolvedPhrase|null}
 */
export function resolveValue(value, ctx) {
  const listener = formatQuantity(value, ctx.listener);
  const owner = formatQuantity(value, ctx.owner);
  if (!listener || !owner) return null;
  return {
    id: value.kind === 'clock' ? `clock:${value.hour}:${value.minute}`
      : value.kind === 'count' ? `count:${value.amount}`
        : `duration:${value.amount}:${value.unit}`,
    listener: { text: listener, lang: ctx.listener, dir: ctx.listenerDir },
    owner: { text: owner, lang: ctx.owner, dir: ctx.ownerDir },
    // CLDR, through the runtime. Not a translation anybody made, and not one that
    // can go stale -- which is the whole reason this is a number and not a sentence.
    provenance: 'cldr',
    confidence: 3,
    custom: false,
  };
}

/**
 * Which of a board's phrases this pair cannot say. Empty means the board is usable.
 * @param {Board} board @param {ResolveContext} ctx
 */
export function missingPhrases(board, ctx) {
  return phrasesOf(board).filter((ref) => !resolvePhrase(ref, ctx)).map((ref) => ref.id);
}

/**
 * Where a tap goes.
 *
 * The whole navigation table from the specification, as one total function over the
 * state above. A reducer rather than handlers on elements, because "tapping the
 * message returns to the grid it was opened from" is a statement about state and
 * proving it by clicking through a browser is slower and weaker than proving it
 * here.
 *
 * Unknown actions return the state unchanged rather than throwing: a stray event
 * during a transition should do nothing, which is also what makes a second tap
 * arriving with the first harmless.
 * @param {BoardState} state
 * @param {{type:'open', buttonId:string, kind:string, nodeId?:string}
 *   | {type:'dismiss'} | {type:'up'} | {type:'reply'}
 *   | {type:'answer', answerId:string, value?:import('./quantity.js').Quantity}
 *   | {type:'cancelReply'} | {type:'enter', answerId:string} | {type:'cancelEntry'}
 *   | {type:'confirmEntry', value:import('./quantity.js').Quantity}} action
 * @returns {BoardState}
 */
export function reduce(state, action) {
  switch (action.type) {
    case 'open':
      if (state.view !== 'grid') return state;
      return action.kind === 'submenu' && action.nodeId
        ? { ...state, path: [...state.path, action.nodeId] }
        : { ...state, view: 'message', buttonId: action.buttonId };

    case 'dismiss':
      // From either message view, straight back to the grid the message was opened
      // from -- `path` was never popped, so it is still exactly that grid. An
      // answer dismisses to the owner's originating grid too, completing the
      // exchange rather than unwinding through the question.
      if (state.view !== 'message' && state.view !== 'answer') return state;
      return {
        ...state, view: 'grid', buttonId: null, answerId: null, answerValue: null,
      };

    case 'up':
      // Grid-level only, and never off the root. Message views have no Back
      // control by design; Escape and the system Back gesture route to `dismiss`.
      if (state.view !== 'grid' || state.path.length < 2) return state;
      return { ...state, path: state.path.slice(0, -1) };

    case 'reply':
      if (state.view !== 'message' || !state.replies) return state;
      return { ...state, view: 'reply' };

    case 'cancelReply':
      // Back to the question, which is still on screen behind the answers, rather
      // than to the grid: cancelling is "I have not answered", not "we are done".
      if (state.view !== 'reply') return state;
      return { ...state, view: 'message' };

    case 'answer':
      if (state.view !== 'reply') return state;
      return {
        ...state, view: 'answer', answerId: action.answerId, answerValue: action.value ?? null,
      };

    case 'enter':
      // The keypad. Reached only from the reply grid, so cancelling has somewhere
      // unambiguous to go back to -- and it records *which* keypad was tapped,
      // because a set may offer more than one: a departure can be answered in
      // minutes from now or at a time, and those are two cells and two keyboards.
      if (state.view !== 'reply') return state;
      return { ...state, view: 'entry', answerId: action.answerId };

    case 'cancelEntry':
      // Back to the answers, not to the question and not to the grid: someone who
      // opened the keypad by mistake wanted the list they were just looking at.
      if (state.view !== 'entry') return state;
      return { ...state, view: 'reply' };

    case 'confirmEntry':
      if (state.view !== 'entry') return state;
      // The value travels; no text is stored, so nothing can disagree with itself
      // in the two languages it is about to be shown in.
      return { ...state, view: 'answer', answerId: null, answerValue: action.value };

    default:
      return state;
  }
}

/** A session opened on a board's root grid. @param {Board} board @param {boolean} replies */
export function openBoard(board, replies = false) {
  return /** @type {BoardState} */ ({
    boardId: board.id,
    view: 'grid',
    path: [board.rootNodeId],
    buttonId: null,
    answerId: null,
    answerValue: null,
    replies,
  });
}

/** The node currently on screen. @param {Board} board @param {BoardState} state */
export function currentNode(board, state) {
  return board.nodes[state.path[state.path.length - 1]];
}
