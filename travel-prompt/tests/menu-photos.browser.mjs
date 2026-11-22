import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = /** @type {'chromium'|'webkit'|'firefox'} */ (process.env.BROWSER_ENGINE || 'chromium');

test('review, replace and share an ordered menu PDF on a phone', async () => {
  const { page, close, errors } = await openPage('travel-prompt/', { width: 375, height: 800, engine, touch: true });
  try {
    // Use pictures with different orientations so the page geometry verifies the reading order.
    async function photo(name, width, height, color) {
      const base64 = await page.evaluate(([w, h, background, title]) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(title, 18, 52);
        ctx.font = '18px sans-serif';
        ctx.fillText('House menu', 18, 82);
        return canvas.toDataURL().split(',')[1];
      }, [width, height, color, name]);
      return { name: name + '.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { value: () => true });
      Object.defineProperty(navigator, 'share', { value: async (data) => {
        document.body.dataset.sharedFile = data.files[0].name;
        document.body.dataset.sharedText = data.text;
      } });
    });
    await page.locator('[data-mode="menu"]').click();
    const first = await photo('Drinks', 240, 360, '#265648');
    const second = await photo('Draft', 360, 240, '#584931');
    await page.locator('#photos').setInputFiles([first, second]);
    await page.getByRole('button', { name: 'Review menu page 2' }).click();
    assert.equal(await page.locator('#next-page').isDisabled(), true);
    await page.locator('#previous-page').click();
    assert.equal(await page.locator('#previous-page').isDisabled(), true);
    await page.locator('#next-page').click();
    await page.locator('#zoom-page').click();
    assert.equal(await page.locator('#zoom-page').getAttribute('aria-pressed'), 'true');
    const replacement = await photo('Lunch', 480, 240, '#835439');
    await page.locator('#replace-page').setInputFiles(replacement);
    assert.match(await page.locator('#page-heading').innerText(), /2 of 2/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#close-page').click();
    assert.equal(await page.getByRole('button', { name: 'Review menu page 2' }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Move page 2 up' }).click();
    await page.locator('#prepare-pdf').click();
    await page.locator('#save-pdf').waitFor();
    const pdf = await page.locator('#save-pdf').evaluate(async el => {
      const data = await (await fetch(el.href)).arrayBuffer();
      // The fixtures are small enough to return as bytes.
      return Array.from(new Uint8Array(data));
    });
    const bytes = Buffer.from(pdf);
    const { PDFDocument } = await import('../../pocket-language-guide/vendor/pdf-lib.esm.js');
    const doc = await PDFDocument.load(bytes);
    assert.deepEqual(doc.getPages().map(p => p.getSize()), [{ width: 792, height: 396 }, { width: 528, height: 792 }]);
    if (process.env.MENU_PDF_PROOF) await writeFile(process.env.MENU_PDF_PROOF, bytes);
    assert.equal(await page.locator('body').getAttribute('data-shared-file'), null);
    await page.locator('#share-pdf').click();
    assert.equal(await page.locator('body').getAttribute('data-shared-file'), 'menu-pages.pdf');
    assert.equal(await page.locator('body').getAttribute('data-shared-text'), await page.locator('#prompt').inputValue());
    await page.getByRole('button', { name: 'Remove page 1' }).click();
    assert.equal(await page.locator('#save-pdf').isHidden(), true);
    await page.locator('#photos').setInputFiles({ name: 'corrupt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('unreadable') });
    await page.locator('#prepare-pdf').click();
    await page.getByText('Could not convert page 2.', { exact: false }).waitFor();
    assert.equal(await page.locator('#photo-list a[download]').count(), 2);
    assert.deepEqual(errors, []);
  } finally {
    await close();
  }
});
