import * as store from './platform/store.js';
// What a reader has made their own on a conversation board, and where it is kept.
//
// Two things live here and they are deliberately different shapes. A **phrase** is a
// sentence the owner wrote, which has no concept behind it and so has to carry its
// own text. A **placement** is the fact that some button sits on some node of some
// board, in some position. One phrase may have several placements, and removing a
// placement is not deleting a phrase — which is the distinction §5.2 asks for and the
// reason the two are not one record.
//
// **A board button is not a printed row.** `ui/io.js` keeps `plg.edits.<pair>`, which
// holds overrides and extras for a *sheet*, and its `include` flags decide what gets
// printed. Nothing here writes there. Creating a button to say "no peanuts" to a
// waiter must not silently add a row to every card the reader prints for that pair,
// and the only way to be sure of that is for the two to be different keys with
// different shapes. They can be brought together deliberately -- `fromSheetExtra`
// adapts one of the sheet's own custom entries onto a board -- but never by accident.
//
// Storage goes through `ui/platform/store.js` -- `localStorage` on the web, the
// native durable store in the app shell -- which is right for this: a bounded number of short
// text records, no binaries, no audio, no exports. The interface is async anyway,
// because the native build will put it on Capacitor Preferences and the callers
// should not have to change when it does.

/** Bumped when the stored shape changes; `migrate` is what reads an older one. */
const VERSION = 1;
const KEY = 'plg.boards';

/**
 * @typedef {Object} CustomPhrase
 * @property {string} id        stable, and referenced by placements
 * @property {string} label     the short thing on the button, owner's language
 * @property {string} owner     the complete sentence, owner's language
 * @property {string} listener  the complete sentence, listener's language
 * @property {string} pair      `target__source`, because a phrase is written for one
 * @property {string} created   ISO date, so an editor can order by age
 */

/**
 * @typedef {Object} BoardPersonal
 * @property {number} schemaVersion
 * @property {Record<string, CustomPhrase>} phrases
 * @property {Record<string, string[]>} placements  `board/node` -> phrase ids, in order
 */

/** @returns {BoardPersonal} */
const empty = () => ({ schemaVersion: VERSION, phrases: {}, placements: {} });

/**
 * Read an older shape forward, or refuse it.
 *
 * Returning `empty()` for an unknown version is the safe answer for a *newer* one:
 * a reader who used a later build on the same device has data this code cannot
 * understand, and guessing at it would corrupt it. It is not silently discarded --
 * `load` keeps the raw text so `read()` can report that something is there and
 * unreadable.
 * @param {any} raw
 */
function migrate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion === VERSION) {
    return {
      schemaVersion: VERSION,
      phrases: raw.phrases ?? {},
      placements: raw.placements ?? {},
    };
  }
  return null;
}

/**
 * Everything the reader has made, and whether reading it went wrong.
 *
 * `damaged` rather than a throw, and rather than a silent `empty()`. A reader whose
 * storage is corrupt has lost sentences they wrote by hand, possibly about an
 * allergy, and the one thing the app must not do is quietly present a blank editor
 * as though they had never written anything -- they would then type over it. The
 * caller shows the state; nothing here overwrites a record it could not parse.
 */
export function read() {
  let raw = null;
  try {
    raw = store.get(KEY);
  } catch {
    // Private mode, or storage disabled. Not damage: there is simply nothing.
    return { data: empty(), damaged: false };
  }
  if (!raw) return { data: empty(), damaged: false };
  try {
    const migrated = migrate(JSON.parse(raw));
    if (migrated) return { data: migrated, damaged: false };
  } catch {
    // Falls through: unparseable is the same problem as unrecognised.
  }
  return { data: empty(), damaged: true };
}

/**
 * The last write wins, and writes never overlap.
 *
 * Serialised through one promise chain because two rapid saves -- which is what an
 * editor with a live preview produces -- could otherwise land out of order and leave
 * the earlier one on disk. Cheap insurance; `localStorage` is synchronous today and
 * Capacitor Preferences will not be.
 * @type {Promise<void>}
 */
let queue = Promise.resolve();

/** @param {BoardPersonal} data */
export function write(data) {
  const done = queue.then(() => {
    try {
      store.set(KEY, JSON.stringify(data));
    } catch (err) {
      // Quota, or storage refused. Loud, because the reader thinks they just saved.
      throw new Error(`could not save your buttons: ${/** @type {Error} */ (err).message}`);
    }
  });
  // **The chain has to survive a failure.** Assigning the rejected promise back to
  // `queue` would poison it: every later write chains off a rejected promise and
  // rejects too, so one full disk would stop the reader saving anything ever again,
  // even after they freed space or shortened the sentence. The caller still gets the
  // rejection -- `done` is what is returned -- but the queue moves on.
  queue = done.catch(() => {});
  return done;
}

/** A phrase id that will not collide and does not encode anything about its content. */
const newId = () => `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Add a phrase and put it on a node.
 *
 * **Never translated here, and the editor has to say so.** The app has no translation
 * backend and §5.2 forbids inventing one; a reader typing an English sentence gets
 * an empty listener side until they fill it, paste it, or take the external handoff.
 * Storing a half-written phrase is correct -- they may be coming back to it -- and
 * `resolvePhrase` already refuses to show one, so it cannot reach a listener.
 * @param {BoardPersonal} data
 * @param {{label:string, owner:string, listener:string, pair:string}} phrase
 * @param {string} at  `board/node`
 */
export function addPhrase(data, phrase, at) {
  const id = newId();
  const next = {
    ...data,
    phrases: { ...data.phrases, [id]: { id, created: new Date().toISOString(), ...phrase } },
    placements: { ...data.placements, [at]: [...(data.placements[at] ?? []), id] },
  };
  return { data: next, id };
}

/**
 * Change a phrase's wording, everywhere it is placed.
 *
 * One record, so an edit reaches every board it sits on -- which is what a reader
 * means by fixing a typo. Any prerecorded audio keyed to the old wording is stale by
 * definition and the caller must drop it; §6.4 is explicit that a clip must never
 * play against words that have changed.
 * @param {BoardPersonal} data @param {string} id @param {Partial<CustomPhrase>} patch
 */
export function editPhrase(data, id, patch) {
  if (!data.phrases[id]) return data;
  return { ...data, phrases: { ...data.phrases, [id]: { ...data.phrases[id], ...patch } } };
}

/**
 * Take a button off one node, leaving the phrase alone.
 *
 * The common case, and the one that must not lose anything: a reader tidying a board
 * has not asked to destroy a sentence they wrote, and may have it on another board.
 * @param {BoardPersonal} data @param {string} id @param {string} at
 */
export function removePlacement(data, id, at) {
  return {
    ...data,
    placements: { ...data.placements, [at]: (data.placements[at] ?? []).filter((p) => p !== id) },
  };
}

/** Everywhere a phrase is placed, so a delete can say what it is about to break.
 * @param {BoardPersonal} data @param {string} id */
export function placementsOf(data, id) {
  return Object.entries(data.placements)
    .filter(([, ids]) => ids.includes(id)).map(([at]) => at);
}

/**
 * Delete the phrase itself, and every placement of it.
 *
 * Destructive on purpose and separate from `removePlacement` on purpose. The caller
 * is expected to have shown `placementsOf` first: deleting a sentence that is on
 * three boards from a screen showing one of them is a surprise, and §5.2 asks for
 * the warning rather than for the operation to be forbidden.
 * @param {BoardPersonal} data @param {string} id
 */
export function deletePhrase(data, id) {
  const phrases = { ...data.phrases };
  delete phrases[id];
  /** @type {Record<string,string[]>} */ const placements = {};
  for (const [at, ids] of Object.entries(data.placements)) {
    placements[at] = ids.filter((p) => p !== id);
  }
  return { ...data, phrases, placements };
}

/**
 * Move a button within its node.
 *
 * Explicit, and the only thing that ever reorders a board. Nothing sorts by use,
 * recency or importance -- someone who has put "no peanuts" bottom-left must find it
 * bottom-left, and that is worth more than any ranking could be.
 * @param {BoardPersonal} data @param {string} at @param {string} id @param {-1|1} by
 */
export function movePlacement(data, at, id, by) {
  const ids = [...(data.placements[at] ?? [])];
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return data;
  ids.splice(to, 0, ...ids.splice(from, 1));
  return { ...data, placements: { ...data.placements, [at]: ids } };
}

/** The phrases placed on one node, in the reader's own order.
 * @param {BoardPersonal} data @param {string} at @param {string} pair */
export function placedOn(data, at, pair) {
  return (data.placements[at] ?? [])
    .map((id) => data.phrases[id])
    // A phrase written for another pair stays stored and stays off this board: the
    // listener text is in a language nobody here reads.
    .filter((p) => p && p.pair === pair);
}

/**
 * One of the sheet's own custom entries, as a board phrase.
 *
 * The deliberate bridge between the two stores, and the only one. A reader who
 * already typed a sentence into the studio should not have to type it again -- but
 * it is *copied* onto the board rather than shared with it, so that editing the
 * board copy does not silently rewrite what their card prints, and removing the
 * button does not remove the row.
 * @param {{concept_id?:string, script?:string, gloss?:string}} extra
 * @param {string} pair
 */
export function fromSheetExtra(extra, pair) {
  return {
    label: (extra.gloss ?? '').slice(0, 40),
    owner: extra.gloss ?? '',
    listener: extra.script ?? '',
    pair,
  };
}
