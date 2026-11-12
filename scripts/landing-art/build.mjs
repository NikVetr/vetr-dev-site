// Draws the landing page's card pictures from the tools themselves.
//   node scripts/landing-art/build.mjs            every card
//   node scripts/landing-art/build.mjs signature seating   just these
// Each module in cards/ exports `build()`, which returns the picture's SVG text; it is written
// to assets/cards/<name>.svg, which assets/landing.js inlines into the card with data-art=<name>.
import { readdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const root = new URL('../../', import.meta.url);
const all = readdirSync(new URL('cards/', import.meta.url)).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
const names = process.argv.slice(2).length ? process.argv.slice(2) : all;

for (const name of names) {
  if (!all.includes(name)) throw new Error(`no card module scripts/landing-art/cards/${name}.mjs`);
  const { build } = await import(`./cards/${name}.mjs`);
  const svg = await build();
  writeFileSync(new URL(`assets/cards/${name}.svg`, root), svg);
  console.log(`${name.padEnd(22)} ${(svg.length / 1024).toFixed(1).padStart(6)} KB, ${(gzipSync(svg).length / 1024).toFixed(1).padStart(5)} KB gzipped`);
}
