const { readFileSync } = require('node:fs');
const { resolve, sep } = require('node:path');
const assert = require('node:assert/strict');

function replaceOnce(source, needle, replacement) {
  assert.equal(source.split(needle).length, 2, `Expected one instrumentation target: ${needle}`);
  return source.replace(needle, replacement);
}

async function profileModules(page, baselineRoot, transform) {
  await page.route('**/*.js', async (route) => {
    const response = await route.fetch();
    const path = new URL(route.request().url()).pathname;
    let source;
    if (baselineRoot) {
      const root = resolve(baselineRoot);
      const file = resolve(root, `.${path}`);
      assert.ok(file.startsWith(root + sep));
      source = readFileSync(file, 'utf8');
    } else source = await response.text();
    await route.fulfill({ response, body: transform(path, source) });
  });
}
module.exports = { profileModules, replaceOnce };
