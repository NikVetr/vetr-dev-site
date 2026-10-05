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
import { allEdits, restoreEdits, forgetEdits, forgetConfigs } from './io.js';
import { personalSection, readProfile, writeProfile } from './speaker-settings.js';
import { aboutSection, askCountry, dietOptions, readAbout, writeAbout } from './about.js';
import { readUsage, writeUsage, forgetUsage } from './usage.js';
import { forgetDrill } from './drill-store.js';
import { buildPackage, readPackage } from '../core/personal.js';
import { loadCountries } from '../core/pack.js';

/**
 * The reader's own sections of a sheet page's settings: their details and their saved
 * copy, the two the boards and the languages carry as well, so all three ask the same
 * things in the same place. A card prints none of the details, so nothing is redrawn
 * when they change; a loaded or deleted copy changes the card's edits underneath a
 * solved layout, so the page starts again rather than re-deriving it by hand.
 * @param {object} config
 * @param {{countries: Set<string>}} config.corpus
 * @param {string} config.reader  the language the details are asked in
 * @param {(rel:string) => Promise<string>} config.loadText
 * @param {(blob:Blob, name:string) => void} config.save
 * @returns {Promise<() => HTMLElement[]>}  the sections, built afresh each time
 */
export async function readerSections({ corpus, reader, loadText, save }) {
  const diet = await dietOptions(loadText, reader);
  const nothing = () => {};
  // The countries' names are read when the question is asked, as the board reads them.
  const askFrom = corpus.countries.has(reader)
    ? () => { loadCountries(loadText, reader).then((names) => askCountry(names, reader, nothing)); }
    : undefined;
  return () => [
    aboutSection(nothing, diet, undefined, askFrom),
    personalSection(personalWiring({ save, onChanged: () => location.reload() })),
  ];
}

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
      about: readAbout(),
      usage: readUsage(),
    }),
    read: (/** @type {string} */ text) => readPackage(text, boards ? { boards } : {}),
    apply: async (/** @type {import('../core/personal.js').PersonalPackage} */ data) => {
      // **Whole, or undone whole.** The five stores are written together and every
      // write is awaited; if any is refused, what was on the device before is put
      // back -- every part, so a package that carried no speaker answers cannot
      // leave the device with the file's phrases and its own old answers half-mixed
      // -- and the refusal is what the reader is told. `onChanged` runs either way,
      // because the screen has to show whichever state actually stands.
      const before = buildPackage({
        boards: readPersonal().data, speaker: readProfile(), edits: allEdits(), about: readAbout(), usage: readUsage(),
      });
      try {
        await put(data, false);
      } catch (err) {
        await put(before, true).catch(() => {});
        throw err;
      } finally {
        onChanged();
      }
      return Object.keys(data.boards?.phrases ?? {}).length;
    },
    forget: async () => {
      try {
        // The studio's saved card settings go too: "your settings and your saved card
        // edits" is what the confirmation promises, and a band can carry the reader's
        // own text -- a name, a number to call. So does the quiz's record of them.
        await Promise.all([forgetEdits(), forgetConfigs(), writeProfile({}), writeAbout({}),
          forgetAll(), forgetUsage(), forgetDrill()]);
      } finally {
        onChanged();
      }
    },
  };
}

/**
 * Write a package's parts to the five stores.
 *
 * Loading a copy writes only the parts it carries -- a file with phrases and no
 * speaker answers leaves the device's answers alone, which is what a plain backup
 * restore wants. Putting things *back* after a failure writes all five, with an
 * absent part meaning empty, because the copy taken beforehand is the whole state.
 * @param {import('../core/personal.js').PersonalPackage} pkg
 * @param {boolean} whole
 */
async function put(pkg, whole) {
  /** @type {Promise<unknown>[]} */ const jobs = [];
  if (pkg.speaker || whole) jobs.push(writeProfile(pkg.speaker ?? {}));
  if (pkg.about || whole) jobs.push(writeAbout(pkg.about ?? {}));
  if (pkg.edits || whole) {
    jobs.push(whole
      ? forgetEdits().then(() => restoreEdits(pkg.edits ?? {}))
      : restoreEdits(pkg.edits ?? {}));
  }
  if (pkg.boards || whole) jobs.push(pkg.boards ? replaceAll(pkg.boards) : forgetAll());
  if (pkg.usage || whole) jobs.push(pkg.usage ? writeUsage(/** @type {any} */ (pkg.usage)) : forgetUsage());
  await Promise.all(jobs);
}
