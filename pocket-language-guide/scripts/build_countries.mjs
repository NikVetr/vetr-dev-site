// Every country's name in every language, for the "I am from ..." detail.
//
//   node scripts/build_countries.mjs           write data/countries/<code>.csv
//   node scripts/build_countries.mjs --check   fail if a name is stale
//
// **The names are CLDR's, not ours.** `Intl.DisplayNames` in the Node that runs this
// carries the Unicode CLDR's territory names in all of these languages, and CLDR is
// the dictionary of record for exactly this: what each language calls each country.
// They are written into the repository rather than asked of the browser at run time
// because the IPA beside each name has to be built from the same spelling the
// listener is shown, and a phone's CLDR is whatever its OS shipped.
//
// **Every inhabited country and territory, and the continents**, not a shortlist of
// popular ones: leaving a country off would leave someone unable to say where they
// are from. One language's file is about 250 short rows, fetched only for the two
// languages of the pair in use.
//
// Columns: `name` is CLDR's, written here and nowhere else. `insert` is the form the
// language's "I am from {}" frame takes where that is not the bare name (English
// *the* United States), `romanization` the attested romanisation for the packs whose
// IPA is read off one, and `ipa` the builder's -- all three kept across a rewrite.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseTable, serialize } from '../core/csv.js';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const CHECK = process.argv.includes('--check');

/** The continents, by UN M49 code: someone may rather say "Africa" than one country. */
const CONTINENTS = ['002', '003', '005', '142', '150', '009'];
/**
 * ISO 3166-1, less the six territories nobody is from (Antarctica, Bouvet, Heard and
 * McDonald, South Georgia, the French Southern Territories, the US Outlying Islands),
 * with Kosovo's `XK`, which CLDR names although ISO has not assigned it.
 */
const COUNTRIES = `AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN
  BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ
  EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN
  HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK
  LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF
  NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD
  SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA
  UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`.split(/\s+/);
/**
 * CLDR's short form where its full one is a menu's rather than a sentence's: "Hong
 * Kong SAR China", "Palestinian Territories", "Myanmar (Burma)". Not for every region,
 * because elsewhere the short form is an abbreviation -- É.-U., EE. UU.
 */
const SHORT = new Set(['HK', 'MO', 'PS', 'MM']);
const HEADER = ['region', 'name', 'insert', 'romanization', 'ipa'];

/** The languages CLDR can name countries in: every ready one it displays in. */
const languages = parseTable(readFileSync(`${ROOT}/data/registry/languages.csv`, 'utf8'), 'languages.csv')
  .filter((row) => row.status === 'ready')
  .map((row) => row.bcp47)
  .filter((code) => Intl.DisplayNames.supportedLocalesOf([code]).length);

let stale = 0;
mkdirSync(`${ROOT}/data/countries`, { recursive: true });
for (const code of languages) {
  const path = `${ROOT}/data/countries/${code}.csv`;
  const kept = new Map(existsSync(path)
    ? parseTable(readFileSync(path, 'utf8'), path).map((row) => [row.region, row]) : []);
  const long = new Intl.DisplayNames([code], { type: 'region', fallback: 'none' });
  const short = new Intl.DisplayNames([code], { type: 'region', style: 'short', fallback: 'none' });
  const rows = [...CONTINENTS, ...COUNTRIES].map((region) => {
    const name = (SHORT.has(region) ? short : long).of(region);
    if (!name) throw new Error(`CLDR has no ${code} name for ${region}`);
    return { ...kept.get(region), region, name };
  });
  const text = serialize(HEADER, rows);
  if (CHECK) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      console.error(`data/countries/${code}.csv is stale -- run \`node scripts/build_countries.mjs\``);
      stale += 1;
    }
  } else {
    writeFileSync(path, text);
  }
}
// Which languages have a file, so a page asks for only those: Klingon, Quenya and
// Morse are not locales CLDR can speak in.
const index = `${JSON.stringify(languages)}\n`;
const indexPath = `${ROOT}/data/countries/index.json`;
if (!CHECK) writeFileSync(indexPath, index);
else if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== index) {
  console.error('data/countries/index.json is stale -- run `node scripts/build_countries.mjs`');
  stale += 1;
}
if (stale) process.exit(1);
console.log(`${CHECK ? 'countries current' : 'wrote'}  ${languages.length} languages, `
  + `${CONTINENTS.length + COUNTRIES.length} regions each`);
