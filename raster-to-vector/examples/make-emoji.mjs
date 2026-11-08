// Render a real Noto Color Emoji glyph, then deliberately JPEG-compress it.
// Requires the host's Noto Color Emoji font and the repository's existing Playwright.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openPage } from '../../scripts/landing-art/browser.mjs';
import { EMOJI_GLYPH, EMOJI_FONT_PIXELS, EMOJI_JPEG_QUALITY } from './emoji-settings.js';

const family = execFileSync('fc-match', ['--format=%{family}', 'Noto Color Emoji'], { encoding: 'utf8' });
if (family !== 'Noto Color Emoji') throw new Error('Install Noto Color Emoji before regenerating this example');
const session = await openPage('raster-to-vector/');
try {
  const data = await session.page.evaluate(async (/** @type {{glyph:string, fontPixels:number, quality:number}} */ { glyph, fontPixels, quality }) => {
    await document.fonts.load(`${fontPixels}px "Noto Color Emoji"`, glyph);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 128, 128);
    ctx.font = `${fontPixels}px "Noto Color Emoji"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 64, 65);
    return canvas.toDataURL('image/jpeg', quality).split(',')[1];
  }, { glyph: EMOJI_GLYPH, fontPixels: EMOJI_FONT_PIXELS, quality: EMOJI_JPEG_QUALITY });
  writeFileSync(new URL('emoji-compressed.jpg', import.meta.url), Buffer.from(data, 'base64'));
} finally { await session.close(); }
