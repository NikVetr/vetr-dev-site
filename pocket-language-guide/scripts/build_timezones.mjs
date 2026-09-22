// Which country a timezone is in, from IANA's own table.
//
// A browser will tell you its timezone and will not tell you its country. For a
// travel app that is the wrong way round: the language someone needs is the language
// of the place they are standing in, and `navigator.language` is the language of the
// laptop they packed. `Intl.DateTimeFormat().resolvedOptions().timeZone` is the one
// signal that moves when the reader does.
//
// Turning `Asia/Tokyo` into `JP` needs a table, and the table exists: `zone1970.tab`
// ships with tzdata, is public domain, and is the reference every other copy of this
// mapping is derived from. Its first column is a comma-separated list of the
// countries a zone covers, **most populous first** — which is exactly the guess to
// make when a zone spans a border.
//
// Generated rather than written, and regenerable: `npm run timezones`. The tzdata
// version is recorded in the file so a stale table can be spotted.
//
// Going the other way — `JP` to `ja` — needs nothing new. `data/registry/languages.csv`
// already names the regions each language is spoken in, which is reviewed data of this
// project's own and handles the places CLDR would have to guess at: India names twelve
// of these languages and Switzerland three, and a collage can offer each in turn
// rather than pretending there is one answer.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(ROOT, 'data/registry/timezones.csv');
/** Where tzdata puts it on every Linux and macOS this has been run on. */
const SOURCES = ['/usr/share/zoneinfo/zone1970.tab', '/usr/share/zoneinfo/zone.tab'];

/** @returns {Promise<{path:string, text:string}>} */
async function source() {
  for (const path of SOURCES) {
    try {
      return { path, text: await readFile(path, 'utf8') };
    } catch { /* try the next one */ }
  }
  throw new Error(`no IANA zone table found; looked in ${SOURCES.join(', ')}`);
}

const { path, text } = await source();
/** @type {[string, string][]} */ const rows = [];
for (const line of text.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [codes, , zone] = line.split('\t');
  if (!zone) continue;
  // The first code, because IANA sorts a shared zone's countries by population and
  // the most populous one is the better guess when there is nothing else to go on.
  rows.push([zone.trim(), codes.split(',')[0].trim()]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));

const version = /# *tzdb.*/.exec(text)?.[0] ?? '# tzdb (version not stated in source)';
// **No comment header, though the provenance wants one.** Every other file in
// `data/registry` is a plain CSV, and the tooling reads the directory with a bare
// `csv.DictReader` — a `#` line becomes the header, the first line with a comma in it
// overflows into `None`, and `scripts/subset_fonts.py` dies calling `ord()` on a list.
// Which it did. The provenance lives in this file's own header instead.
const out = [
  'timezone,iso3166',
  ...rows.map(([zone, code]) => `${zone},${code}`),
  '',
].join('\n');

const changed = await readFile(OUT, 'utf8').catch(() => '') !== out;
if (process.argv.includes('--check')) {
  if (changed) throw new Error('data/registry/timezones.csv is stale -- run `npm run timezones`');
  console.log(`timezone table current  ${rows.length} zones`);
} else {
  await writeFile(OUT, out);
  console.log(`data/registry/timezones.csv  ${rows.length} zones from ${version.replace(/^#\s*/, '')}`);
}
