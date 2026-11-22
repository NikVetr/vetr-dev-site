import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

test('ASL café conversation, practice, and printable cards @smoke', async ({ page }, testInfo) => {
  await page.setViewportSize({ width:402, height:874 });
  await page.emulateMedia({ reducedMotion:'reduce' });
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await expect(page.locator('.card').first()).toBeVisible();
  const badge = page.locator('#want [data-lang="ase"]');
  await expect(badge).toHaveAccessibleName('American Sign Language');
  await badge.focus();
  await badge.press('Enter');
  await expect(badge).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#want-chosen')).toHaveText('American Sign Language');
  const card = page.locator('#gallery [data-lang="ase"]');
  await expect(card).toBeInViewport();
  await expect(card.locator('.card-badge')).toHaveText('ASL');
  await expect.poll(() => card.locator('img.card-thumb').evaluate(i => i.naturalWidth)).toBeGreaterThan(0);
  await expect(card.getByRole('link', { name:'Card', exact:true })).toHaveAttribute('href','signs.html#cards');
  await expect(card.getByRole('link', { name:'Quiz' })).toHaveAttribute('href','signs.html#quiz');
  await card.getByRole('link', { name:'Converse' }).click();
  await expect(page.locator('.sign-tile')).toHaveCount(12);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path:testInfo.outputPath('cafe-phone.png'), fullPage:true });

  await page.getByRole('button', { name:'Coffee', exact:true }).click();
  const dialog = page.getByRole('dialog', { name:'Coffee' });
  const video = dialog.locator('video');
  await expect.poll(() => video.evaluate(v => v.videoWidth)).toBeGreaterThan(0);
  expect(await video.evaluate(v => v.paused)).toBe(true);
  await dialog.getByLabel('Speed').selectOption('0.5');
  await dialog.getByRole('button', { name:'Replay' }).click();
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(0);
  expect(await video.evaluate(v => v.playbackRate)).toBe(0.5);
  await dialog.getByRole('button', { name:'Show stills' }).click();
  await expect(dialog.getByRole('img', { name:'Second frame of the sign' })).toBeVisible();
  expect(await video.evaluate(v => v.paused)).toBe(true);
  await dialog.getByRole('button', { name:'Show video' }).click();
  await expect(video).toBeVisible();
  await dialog.getByRole('button', { name:'Close' }).click();
  await page.getByRole('button', { name:'Exchange a written message' }).click();
  await page.getByRole('button', { name:'How much is it?' }).click();
  await expect(page.locator('.sign-message')).toHaveText('How much is it?');
  await page.getByRole('button', { name:'Write a reply' }).click();
  await page.getByLabel('Your message').fill('$4.50');
  await page.getByRole('button', { name:'Show message' }).click();
  await expect(page.locator('.sign-message')).toHaveText('$4.50');
  await page.getByRole('button', { name:'Close' }).click();

  await page.getByRole('link', { name:'Quiz' }).click();
  const pack = await (await page.request.get('/data/signs/ase-cafe/pack.json')).json();
  const entries = pack.flatMap(group => group.entries);
  const asked = new Set();
  for (let i = 0; i < entries.length; i++) {
    const poster = await page.locator('#quiz-video video').getAttribute('poster');
    const answer = entries.find(entry => poster.endsWith(entry.media + '.1.jpg'));
    expect(asked.has(answer.id)).toBe(false);
    asked.add(answer.id);
    const options = page.locator('#quiz-actions button');
    await expect(options).toHaveCount(4);
    await page.locator('#quiz-actions').getByRole('button', { name:answer.label, exact:true }).click();
    await expect(page.locator('#quiz-feedback')).toContainText('Correct');
    await page.getByRole('button', { name:i === entries.length - 1 ? 'Finish' : 'Next sign' }).click();
  }
  await expect(page.locator('#quiz-feedback')).toHaveText('12 of 12 correct.');
  await page.getByLabel('Practice').selectOption('recall');
  await expect(page.locator('#quiz-video video')).toHaveCount(0);
  await page.getByRole('button', { name:'Reveal animation' }).click();
  await expect(page.locator('#quiz-video video')).toBeVisible();
  await page.getByRole('button', { name:'Next sign' }).click();
  expect(await page.evaluate(async () =>
    (await import('/ui/drill-store.js')).pairRecord('ase__en').n)).toEqual([12,0,0]);

  await page.getByRole('link', { name:'Cheat sheets' }).click();
  await expect(page.locator('.sign-face canvas')).toHaveCount(3);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name:'Save PDF' }).click();
  const pdfPath = testInfo.outputPath('wanderwart-asl-cafe.pdf');
  await (await download).saveAs(pdfPath);
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  expect(pdf.getPages().map(p => p.getSize())).toEqual(Array(3).fill({ width:504, height:360 }));
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name:'Save Drinks as PNG' }).click();
  const pngPath = testInfo.outputPath('drinks.png');
  await (await pngDownload).saveAs(pngPath);
  const png = await readFile(pngPath);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([2100,1500]);
  if (testInfo.project.name === 'chromium') {
    const printed = await page.pdf({ preferCSSPageSize:true, printBackground:true });
    expect((await PDFDocument.load(printed)).getPageCount()).toBe(3);
  }
  expect(errors).toEqual([]);
});
