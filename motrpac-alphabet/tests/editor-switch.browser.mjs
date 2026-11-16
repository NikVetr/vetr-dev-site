import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const output = new URL('../../tmp/output/editor-switch/', import.meta.url);
const switchName = 'Mattlab editor (off: MotRPAC, on: Mattlab)';
const viewports = [[2560, 1440], [1440, 900], [1024, 768], [390, 844], [320, 844], [844, 390]];
await mkdir(output, { recursive: true });

// This function is serialized into the browser by page.evaluate.
function mattlabFills() {
  const studio = /** @type {{CardinalStudio: {getFills: () => Record<string, string>}}} */ (/** @type {unknown} */ (window)).CardinalStudio;
  return studio.getFills();
}

const run = await openPage('motrpac-alphabet/', { width: 1440, height: 900 });
try {
  const { page, errors } = run;
  await page.waitForSelector('#shape-layer path');
  await page.getByRole('button', { name: 'Open B', exact: true }).click();
  assert.equal(await page.locator('#active-letter-label').textContent(), 'B');

  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    const alphabetSwitch = page.getByRole('switch', { name: switchName });
    assert.equal(await alphabetSwitch.getAttribute('aria-checked'), 'false');
    const beforeBox = await alphabetSwitch.boundingBox();
    assert.ok(beforeBox);

    // Space activates the native button; the shared switch does not intercept keys.
    await alphabetSwitch.focus();
    await page.keyboard.press('Space');
    await page.waitForURL('**/motrpac-alphabet/mattlab/');
    await page.waitForFunction(() => 'CardinalStudio' in window);

    const mattlabSwitch = page.getByRole('switch', { name: switchName });
    assert.equal(await mattlabSwitch.getAttribute('aria-checked'), 'true');
    const afterBox = await mattlabSwitch.boundingBox();
    assert.ok(afterBox);
    for (const key of /** @type {const} */ (['x','y','width','height'])) assert.ok(Math.abs(afterBox[key]-beforeBox[key])<.1, `Switch ${key} stays identical at ${width}×${height}`);
    if (width > 800 && height > 640) {
      const frame = await page.locator('.workspace').boundingBox(), canvas = await page.locator('.canvas-viewport').boundingBox(), gallery = await page.locator('.glyph-shelf').boundingBox();
      assert.ok(frame && frame.x < 20 && frame.width > width-40, 'Mattlab uses the viewport width');
      assert.ok(canvas && canvas.width > 400 && canvas.height > 180, 'painting canvas remains usable');
      assert.ok(gallery && gallery.y+gallery.height <= height, 'gallery and sheet export remain within the desktop viewport');
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true, 'desktop workspace fits vertically');
    }
    const mattlabLayout = await page.evaluate(() => {
      const toggleNode = document.querySelector('#editor-switch');
      const actionsNode = document.querySelector('.header-actions');
      if (!toggleNode || !actionsNode) throw new Error('Mattlab header controls are missing');
      const toggle = toggleNode.getBoundingClientRect();
      const actions = actionsNode.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        left: toggle.x,
        overlap: toggle.right > actions.left,
      };
    });
    assert.equal(mattlabLayout.overflow, false, `Mattlab page fits at ${width}px`);
    assert.equal(mattlabLayout.overlap, false, `Mattlab header controls do not overlap at ${width}px`);
    assert.ok(mattlabLayout.left < 35, 'Switch stays at the start of the Mattlab header');
    await page.screenshot({ path: fileURLToPath(new URL(`mattlab-${width}.png`, output)) });

    await page.locator('#customHex').fill('#345678');
    await page.locator('#customHex').press('Enter');
    const face = page.locator('#artworkHost .paintable').first();
    const faceId = await face.getAttribute('id');
    assert.ok(faceId);
    await face.focus();
    await page.keyboard.press('Enter');
    assert.equal((await page.evaluate(mattlabFills))[faceId], '#345678');

    // Mouse activation in the reverse direction preserves the alphabet selection.
    await mattlabSwitch.click();
    await page.waitForURL(/\/motrpac-alphabet\/$/);
    await page.waitForSelector('#shape-layer path');
    assert.equal(await page.locator('#active-letter-label').textContent(), 'B');
    const alphabetLayout = await page.evaluate(() => {
      const toggle = document.querySelector('#editor-switch');
      if (!toggle) throw new Error('Alphabet editor switch is missing');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        left: toggle.getBoundingClientRect().x,
      };
    });
    assert.equal(alphabetLayout.overflow, false, `Alphabet page fits at ${width}px`);
    assert.ok(alphabetLayout.left < 20, 'Switch stays at the start of the alphabet header');
    await page.screenshot({ path: fileURLToPath(new URL(`motrpac-${width}.png`, output)) });

    // Verify the painted study survives navigation, and Space also works in reverse.
    await page.locator('#editor-switch').click();
    await page.waitForURL('**/motrpac-alphabet/mattlab/');
    await page.waitForFunction(() => 'CardinalStudio' in window);
    assert.equal((await page.evaluate(mattlabFills))[faceId], '#345678');
    await page.locator('#editor-switch').focus();
    await page.keyboard.press('Space');
    await page.waitForURL(/\/motrpac-alphabet\/$/);
    await page.waitForSelector('#shape-layer path');
    console.log(`Editor switch passed at ${width}×${height}`);
  }

  assert.deepEqual(errors, []);
  console.log('Click/Space navigation, switch state, responsive headers and both editors’ saved state passed.');
} finally {
  await run.close();
}
