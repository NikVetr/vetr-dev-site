// Everything this app knows about its reader, in one file they can carry away.
//
// There is no account and no server, which is the point — and it means the only
// copy of someone's own phrases is on one device. So there has to be a way to get
// them off it: onto a new phone, from the website into the app, or simply into a
// backup. That is what this builds and reads.
//
// **A package is inert.** It is JSON with text in it and nothing else: no URLs, no
// scripts, no templates, nothing that is fetched or evaluated on import. Every
// string in it is rendered into a text node. A file someone was sent by a stranger
// must not be able to do anything except add phrases they can read first.
//
// **It is validated whole, before anything is written.** A half-applied import is
// worse than a refused one, because the reader cannot tell which half. `readPackage`
// returns problems or a value, never both — and a package that references a board
// this build does not have is reported as such rather than imported into a state
// where the phrases exist and are on no screen.

/** The only shape this code writes. A newer one is refused, not guessed at. */
export const PACKAGE_VERSION = 1;

/**
 * The most a package may be, in bytes.
 *
 * Text only — the largest thing in here is a few hundred phrases of a couple of
 * sentences each — so two mebibytes is roughly a hundred times the realistic worst
 * case and still small enough that a malformed or hostile file cannot exhaust a
 * phone's memory before it is parsed.
 */
export const MAX_PACKAGE_BYTES = 2 * 1024 * 1024;

/** Deeper than this is not data anyone typed. */
const MAX_DEPTH = 8;

/** @typedef {import('../ui/board-store.js').BoardPersonal} BoardPersonal */

/**
 * @typedef {Object} PersonalPackage
 * @property {number} version
 * @property {string} created        ISO, so a reader can tell two files apart
 * @property {BoardPersonal} [boards]  phrases they wrote, and where they put them
 * @property {Record<string,string>} [speaker]  how they speak
 * @property {Record<string,unknown>} [edits]  per-pair sheet edits, keyed by pair
 */

/**
 * Gather the reader's own data into one value.
 *
 * Deliberately not "everything in storage": the studio's column widths and whether a
 * banner is dismissed are this device's preferences, not the reader's work, and
 * carrying them to another phone would be presumptuous rather than helpful.
 * @param {{boards?:BoardPersonal, speaker?:Record<string,string>,
 *          edits?:Record<string,unknown>}} parts
 * @returns {PersonalPackage}
 */
export function buildPackage(parts) {
  /** @type {PersonalPackage} */
  const out = { version: PACKAGE_VERSION, created: new Date().toISOString() };
  if (parts.boards && Object.keys(parts.boards.phrases ?? {}).length) out.boards = parts.boards;
  if (parts.speaker && Object.keys(parts.speaker).length) out.speaker = parts.speaker;
  if (parts.edits && Object.keys(parts.edits).length) out.edits = parts.edits;
  return out;
}

/**
 * Whether a value is a plain object we are willing to walk.
 * @param {unknown} v @returns {v is Record<string, unknown>}
 */
const plain = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Refuse anything that is not text, a number, a boolean, or a shallow container of
 * those. A package carries sentences; a function, a prototype or a ten-deep graph is
 * something else arriving in the shape of one.
 * @param {unknown} value @param {number} depth @param {string} at
 * @param {string[]} problems
 */
function checkShape(value, depth, at, problems) {
  if (depth > MAX_DEPTH) { problems.push(`${at}: nested deeper than ${MAX_DEPTH}`); return; }
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => checkShape(v, depth + 1, `${at}[${i}]`, problems));
    return;
  }
  if (!plain(value)) { problems.push(`${at}: not text or a plain value`); return; }
  for (const [key, v] of Object.entries(value)) {
    // `__proto__` and friends never appear in data someone typed, and they are the
    // classic way a JSON payload reaches past the object it is supposed to be.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      problems.push(`${at}: unsafe key ${key}`);
      continue;
    }
    checkShape(v, depth + 1, `${at}.${key}`, problems);
  }
}

/**
 * Read a package, or say everything wrong with it.
 *
 * `boards` is what this build can actually show: a placement naming a board or a node
 * that is not there would import a phrase onto no screen, and the plan is explicit
 * that an import must never report success for something that cannot be used. Pass
 * it and those placements are reported; omit it and they are accepted, which is what
 * a plain backup restore wants.
 * @param {string} text
 * @param {{boards?: Record<string, Set<string>>}} [known]  board id -> node ids
 * @returns {{ok:true, data:PersonalPackage} | {ok:false, problems:string[]}}
 */
export function readPackage(text, known = {}) {
  /** @type {string[]} */ const problems = [];
  // Bytes, not characters: the cap is about memory, and one emoji is four bytes.
  const size = new TextEncoder().encode(text).length;
  if (size > MAX_PACKAGE_BYTES) {
    return { ok: false, problems: [`${Math.round(size / 1024)}KB is over the ${MAX_PACKAGE_BYTES / 1024}KB limit`] };
  }
  /** @type {any} */ let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { ok: false, problems: [`not readable as JSON: ${/** @type {Error} */ (err).message}`] };
  }
  if (!plain(raw)) return { ok: false, problems: ['not a package'] };
  if (raw.version !== PACKAGE_VERSION) {
    // A *newer* version is the important case: it was written by a later build and
    // this one cannot know what it left out. Guessing would lose the difference.
    return { ok: false, problems: [`version ${raw.version}, and this build reads ${PACKAGE_VERSION}`] };
  }
  checkShape(raw, 0, 'package', problems);
  if (problems.length) return { ok: false, problems };

  if (raw.boards !== undefined && !plain(raw.boards)) {
    // `boards: 123` used to pass: truthy, so it was walked, and `.phrases ?? {}` made
    // an empty store of it that then replaced the reader's own. A number is not a
    // store and is said to be one.
    problems.push('boards: not a set of phrases');
  } else if (raw.boards) {
    const held = /** @type {any} */ (raw.boards);
    const phrases = held.phrases ?? {};
    const placements = held.placements ?? {};
    if (!plain(phrases) || !plain(placements)) {
      problems.push('boards: phrases and placements must both be objects');
    } else {
      for (const [id, phrase] of Object.entries(phrases)) {
        const p = /** @type {any} */ (phrase);
        if (!plain(p)) { problems.push(`phrase ${id}: not a phrase`); continue; }
        // Every field is text, checked as a type before it is read as a value: a
        // numeric owner used to reach `.trim()` and throw out of the import handler,
        // which left the reader with no message and a file input that would not
        // take the next file.
        for (const field of ['id', 'label', 'owner', 'listener', 'pair']) {
          if (typeof p[field] !== 'string') problems.push(`phrase ${id}: ${field} is not text`);
        }
        if (typeof p.id === 'string' && p.id !== id) problems.push(`phrase ${id}: its own id says ${p.id}`);
        // A half-written phrase travels. It is a legitimate saved state -- the reader
        // may be coming back to it -- and `resolvePhrase` refuses to show one, so it
        // arrives exactly as it left: stored, on its screens, and not yet shown.
        // Refusing it refused the whole copy for one unfinished line.
        if (typeof p.pair === 'string' && !/^[\w-]+__[\w-]+$/.test(p.pair)) {
          problems.push(`phrase ${id}: ${p.pair} is not a language pair`);
        }
      }
      for (const [at, ids] of Object.entries(held.hidden ?? {})) {
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) problems.push(`hidden ${at}: not a list of button ids`);
      }
      for (const [at, ids] of Object.entries(placements)) {
        if (!Array.isArray(ids)) { problems.push(`placement ${at}: not a list`); continue; }
        if (new Set(ids).size !== ids.length) problems.push(`placement ${at}: the same phrase twice`);
        for (const id of ids) {
          if (!phrases[id]) problems.push(`placement ${at}: no phrase ${id} in this package`);
        }
        const [board, node] = at.split('/');
        if (known.boards && !known.boards[board]) {
          problems.push(`placement ${at}: this build has no board "${board}"`);
        } else if (known.boards && node && !known.boards[board].has(node)) {
          problems.push(`placement ${at}: board "${board}" has no screen "${node}"`);
        }
      }
    }
  }
  if (raw.speaker !== undefined && !plain(raw.speaker)) problems.push('speaker: not a set of answers');
  else if (raw.speaker) {
    for (const [axis, value] of Object.entries(raw.speaker)) {
      if (typeof value !== 'string') problems.push(`speaker ${axis}: not text`);
    }
  }
  if (raw.edits !== undefined && !plain(raw.edits)) problems.push('edits: not a set of pairs');
  else if (raw.edits) {
    for (const [pair, value] of Object.entries(raw.edits)) {
      if (!plain(value)) problems.push(`edits ${pair}: not a set of edits`);
    }
  }

  return problems.length
    ? { ok: false, problems }
    : { ok: true, data: /** @type {PersonalPackage} */ (raw) };
}
