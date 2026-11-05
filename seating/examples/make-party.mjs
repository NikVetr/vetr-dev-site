// Regenerates party.json from the R version's examples/synthetic-party.json: the same guests,
// order, categories, pairs, groups and options, with each group code replaced by a made-up
// name (families and couples share a surname). Same request, same chain as R's example.
//   node seating/examples/make-party.mjs ~/repos/table-seating/examples/synthetic-party.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fromRRequest } from '../core/index.js';

const NAMES = {
  Fam1a: 'Olive Crumb', Fam1b: 'Basil Crumb', Fam1c: 'Pip Crumb',
  Fam2a: 'Mabel Puddle', Fam2b: 'Otto Puddle', Fam2c: 'Ivy Puddle', Fam2d: 'Jasper Puddle', Fam2e: 'Tilly Puddle',
  Fam3a: 'Hazel Bramble', Fam3b: 'Rex Bramble', Fam3c: 'Fern Bramble', Fam3d: 'Milo Bramble',
  Cpl1a: 'Ruth Noodle', Cpl1b: 'Ned Noodle', Cpl2a: 'Lotte Pickle', Cpl2b: 'Gus Pickle',
  Cpl3a: 'Ada Wobble', Cpl3b: 'Kit Wobble', Cpl4a: 'June Tumble', Cpl4b: 'Felix Tumble',
  Cpl5a: 'Iris Muddle', Cpl5b: 'Theo Muddle', Cpl6a: 'Bea Sprocket', Cpl6b: 'Cyril Sprocket',
  Frd1a: 'Dot Kettle', Frd1b: 'Sid Marrow', Frd1c: 'Vera Plum',
  Frd2a: 'Lark Doily', Frd2b: 'Ozzie Fudge', Frd2c: 'Peg Wimble',
  Frd3a: 'Rosa Thimble', Frd3b: 'Ike Pebble', Frd3c: 'Una Biscuit', Frd3d: 'Wally Gherkin',
  Solo1: 'Edna Snoot', Solo2: 'Percy Grubb', Solo3: 'Flo Tinker', Solo4: 'Barty Nubbin', Solo5: 'Gwen Mopsy',
};
const source = fromRRequest(JSON.parse(readFileSync(process.argv[2], 'utf8')));
const name = (/** @type {string} */ id) => {
  const n = /** @type {Record<string, string>} */ (NAMES)[id];
  if (!n) throw new Error(`no name for ${id}`);
  return n;
};
const request = {
  guests: source.guests.map((/** @type {any} */ g) => ({ id: name(g.id), category: g.category })),
  tables: source.tables,
  pairs: source.pairs.map((/** @type {any} */ p) => ({ a: name(p.a), b: name(p.b), score: p.score })),
  together: source.together.map((/** @type {string[]} */ g) => g.map(name)),
  apart: source.apart.map((/** @type {string[]} */ g) => g.map(name)),
  geography: { cost: source.geography.cost.map((/** @type {any} */ c) => ({ a: name(c.a), b: name(c.b), cost: c.cost })) },
  options: source.options,
};
writeFileSync(new URL('party.json', import.meta.url), `${JSON.stringify(request, null, 2)}\n`);
