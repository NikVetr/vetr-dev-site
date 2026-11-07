// Render a real Noto Color Emoji glyph, then deliberately JPEG-compress it.
// Requires the host's Noto Color Emoji font and the repository's existing Playwright.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const family = execFileSync('fc-match', ['--format=%{family}', 'Noto Color Emoji'], { encoding: 'utf8' });
if (family !== 'Noto Color Emoji') throw new Error('Install Noto Color Emoji before regenerating this example');
const session = await openPage('raster-to-vector/');
try {
  const data = await session.page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 96, 96);
    ctx.font = '80px "Noto Color Emoji"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('😍', 48, 49);
    return canvas.toDataURL('image/jpeg', 0.025).split(',')[1];
  });
  writeFileSync(new URL('emoji-compressed.jpg', import.meta.url), Buffer.from(data, 'base64'));
} finally { await session.close(); }
