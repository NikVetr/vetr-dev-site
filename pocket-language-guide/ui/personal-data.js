// The storage half of the portable copy, in one place because three pages offer it.
//
// `core/personal.js` decides what a package is and whether one is acceptable;
// `ui/speaker-settings.js` draws the three buttons. This is the part in between —
// which keys are read, which are written, and what happens after — and it is its own
// module so that the gallery does not pull the board store and the sheet editor in
// just to know the reader's language.
//
// Every page passes `onChanged`, because what "reload" means differs: the board has
// the new phrases in front of the reader and repaints, while a sheet page has a
// solved layout built from the old edits and has to start again.

import { read as readPersonal, replaceAll, forgetAll } from './board-store.js';
import { allEdits, restoreEdits, forgetEdits } from './io.js';
import { readProfile, writeProfile } from './speaker-settings.js';
import { buildPackage, readPackage } from '../core/personal.js';

/**
 * The five things `personalSection` needs, wired to this app's own storage.
 *
 * @param {object} config
 * @param {() => void} config.onChanged   after an import or a delete has landed
 * @param {(blob:Blob, name:string) => void} config.save
 * @param {Record<string, Set<string>>} [config.boards]  screens an import may name;
 *   omitted on a page with no board loaded, which makes it a plain backup restore
 */
export function personalWiring({ onChanged, save, boards }) {
  return {
    save,
    gather: () => buildPackage({
      boards: readPersonal().data,
      speaker: readProfile(),
      edits: allEdits(),
    }),
    read: (/** @type {string} */ text) => readPackage(text, boards ? { boards } : {}),
    apply: (/** @type {import('../core/personal.js').PersonalPackage} */ data) => {
      // Written in the order they are read back: the board store last, because it is
      // the one with a queued write that can be refused, and a reader who has been
      // told "loaded" should not find the phrases missing.
      if (data.speaker) writeProfile(data.speaker);
      if (data.edits) restoreEdits(data.edits);
      // **`onChanged` waits for the board store.** Its writes are serialised behind
      // a queue, so calling back straight away reads the store as it was a moment
      // ago -- which showed up as an import that reported success while the old
      // buttons were still on the grid. `finally`, not `then`: a refused write still
      // has to repaint, or the screen keeps claiming something that did not happen.
      if (data.boards) replaceAll(data.boards).catch(() => {}).finally(onChanged);
      else onChanged();
      return Object.keys(data.boards?.phrases ?? {}).length;
    },
    forget: () => {
      forgetEdits();
      writeProfile({});
      forgetAll().catch(() => {}).finally(onChanged);
    },
  };
}
