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
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const targets = [
  {
    out: 'vendor/fontkit.esm.js',
    // CJS default export; re-exported as named bindings so callers can use a
    // plain namespace import.
    contents: `import fk from '@pdf-lib/fontkit';
      const m = fk.default ?? fk;
      export const create = m.create;
      export const registerFormat = m.registerFormat;
      export default m;`,
  },
  { out: 'vendor/pdf-lib.esm.js', contents: "export * from 'pdf-lib';" },
];

for (const { contents, out } of targets) {
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
