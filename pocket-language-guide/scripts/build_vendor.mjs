// Regenerates the committed vendor/ bundles. The shipped app has no build step,
// so these are built once here and checked in, mirroring the repo's existing
// generator-writes-committed-artifact pattern (ceo-salary-benchmark/scripts/).
//
//   npm run vendor
//
// fontkit does the OpenType shaping (GSUB/GPOS) that gives us glyph advances for
// measurement and glyph ids for PDF output, so preview and export are measured by
// the same code rather than held in sync by a parity test.
//
// @pdf-lib/fontkit rather than fontkit v2: v2 replaced the subset stream API that
// pdf-lib's font embedder calls, so embedding a subset fails against it. The two
// agree exactly on advances and glyph counts for Latin, Arabic and CJK (see
// tests/measure.test.mjs), so this costs nothing and keeps one shaper.
//
// It does cost one polyfill. That build is Babel-transpiled, and Babel turned
// exactly one generator -- `StateMachine.prototype.match` -- into a state machine
// calling a `regeneratorRuntime` the package never bundles and declares no
// dependency on. Nothing else in fontkit reaches that function: it is the matcher
// the Indic and Universal shapers use, so Latin, Cyrillic, Greek, Arabic, Han, Kana
// and Hangul all shape without it, and Devanagari and Thai throw
// `regeneratorRuntime is not defined` at the first glyph. So the bundle declares the
// name and imports `regenerator-runtime` for the side effect of filling it in.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const targets = [
  {
    out: 'vendor/fontkit.esm.js',
    // CJS default export; re-exported as named bindings so callers can use a
    // plain namespace import.
    banner: 'var regeneratorRuntime;',
    contents: `import 'regenerator-runtime';
      import fk from '@pdf-lib/fontkit';
      const m = fk.default ?? fk;
      export const create = m.create;
      export const registerFormat = m.registerFormat;
      export default m;`,
  },
  { out: 'vendor/pdf-lib.esm.js', contents: "export * from 'pdf-lib';" },
];

for (const { contents, out, banner } of targets) {
  await build({
    stdin: { contents, resolveDir: '.', loader: 'js' },
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
    // A plain `var` rather than esbuild's `inject`, because `regenerator-runtime`
    // assigns to the name itself and esbuild refuses an assignment to an injected
    // import.
    ...(banner ? { banner: { js: banner } } : {}),
  });
  console.log(`${out}  ${(readFileSync(out).length / 1024).toFixed(0)} KB`);
}

const versions = ['@pdf-lib/fontkit', 'pdf-lib']
  .map((n) => {
    const pkg = JSON.parse(readFileSync(`node_modules/${n}/package.json`, 'utf8'));
    return `- ${n} ${pkg.version} (${pkg.license})`;
  })
  .join('\n');
writeFileSync(
  'vendor/VERSIONS.md',
  `# Vendored bundles\n\nBuilt by \`npm run vendor\` (scripts/build_vendor.mjs). Do not edit by hand.\n\n${versions}\n`,
);
console.log('vendor/VERSIONS.md');
