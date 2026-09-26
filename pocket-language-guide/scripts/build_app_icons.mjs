// The native apps' icons and launch image, rendered from the one drawing of the mark.
//
//   node scripts/build_app_icons.mjs      writes assets/native/
//
// `favicon.svg` is the mark; the web's launcher icons in `data/brand/` come from it
// and so do these, drawn by the Chrome the prerender already uses, at each exact pixel
// size a platform asks for rather than resized from one. They are committed, because
// the native projects are generated and the build scripts copy these over the
// template's placeholders -- a copy needs no image tool on whichever machine builds.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const OUT = 'assets/native';
const mark = await readFile('favicon.svg', 'utf8');
const [, , vw, vh] = /viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/.exec(mark)?.slice(1).map(Number) ?? [];
if (!vw || !vh) throw new Error('favicon.svg has no viewBox');

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
const page = await browser.newPage();

/**
 * The mark at `size` pixels square, `scale` of the width, on `plate`.
 * @param {number} size @param {number} scale
 * @param {'none'|'square'|'rounded'|'round'} plate  white behind it, and its shape
 */
async function render(size, scale, plate) {
  await page.setViewportSize({ width: size, height: size });
  const radius = { none: '0', square: '0', rounded: '18%', round: '50%' }[plate];
  const w = size * scale;
  const h = (w * vh) / vw;
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;background:transparent}
    div{width:${size}px;height:${size}px;display:grid;place-items:center;border-radius:${radius};
      background:${plate === 'none' ? 'transparent' : '#fff'}}
    svg{width:${w}px;height:${h}px}
  </style><div>${mark.replace(/^[\s\S]*?<svg/, '<svg')}</div>`);
  return page.screenshot({ omitBackground: plate !== 'square' });
}

/** @param {string} rel @param {Buffer} png */
async function put(rel, png) {
  await mkdir(`${OUT}/${rel.replace(/\/[^/]+$/, '')}`, { recursive: true });
  await writeFile(`${OUT}/${rel}`, png);
}

// iOS: one opaque 1024px icon (App Store Connect refuses transparency; the system
// rounds the corners), and a transparent launch image the launch screen centres on
// the system background, so a dark phone does not start on a white flash.
await put('ios/AppIcon-512@2x.png', await render(1024, 0.74, 'square'));
await put('ios/splash-2732x2732.png', await render(2732, 0.16, 'none'));

// Android: at each density, the legacy icon and its round form (Android 7), and the
// adaptive foreground -- 108dp of which the launcher shows the middle 72, and masks
// to the middle 66, so the mark keeps to three fifths of it.
for (const [dpi, px] of /** @type {[string, number][]} */ ([['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]])) {
  await put(`android/mipmap-${dpi}/ic_launcher.png`, await render(px, 0.72, 'rounded'));
  await put(`android/mipmap-${dpi}/ic_launcher_round.png`, await render(px, 0.62, 'round'));
  await put(`android/mipmap-${dpi}/ic_launcher_foreground.png`, await render((px * 108) / 48, 0.6, 'none'));
}
await browser.close();
console.log(`${OUT}: 1 iOS icon, 1 launch image, 15 Android icons`);
