// A Chromium page that serves the project directory from a virtual https origin.
//
// Needed because Chrome refuses to load file:// subresources from an about:blank
// document, so `page.setContent` plus a file:// @font-face silently falls back to
// a default font -- which measures differently from what the solver committed to,
// and produces output that looks subtly wrong rather than obviously broken.
//
// Shared by the preview script, the pack pre-renderer and the visual specs so all
// three rasterise through the same path.
import { readFile } from 'node:fs/promises';
import { extname, normalize } from 'node:path';
import { chromium } from '@playwright/test';

export const ORIGIN = 'https://pocket-language-guide.local';

/** @type {Record<string,string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

/**
 * Launch Chromium and hand back a page whose requests to ORIGIN are served from
 * `root`. The system Chrome is used rather than a Playwright download, matching
 * ceo-salary-benchmark/tests/app.spec.js.
 * @param {{root?:string, deviceScaleFactor?:number}} [opts]
 */
export async function openLocalPage(opts = {}) {
  const root = opts.root ?? process.cwd();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  });
  const page = await browser.newPage({ deviceScaleFactor: opts.deviceScaleFactor ?? 1 });

  await page.route(`${ORIGIN}/**`, async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, '');
    // Refuse to serve outside the project root rather than following the escape.
    if (normalize(path).startsWith('..')) {
      await route.fulfill({ status: 403, body: 'outside project root' });
      return;
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: MIME[extname(path)] ?? 'application/octet-stream',
        body: await readFile(`${root}/${path}`),
      });
    } catch {
      await route.fulfill({ status: 404, body: `no such file: ${path}` });
    }
  });

  // Fail loudly: a missing font or data file must not degrade into a fallback.
  /** @type {string[]} */ const failures = [];
  page.on('requestfailed', (r) => failures.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });

  return {
    browser,
    page,
    /** @param {string} html */
    async show(html) {
      failures.length = 0;
      await page.route(`${ORIGIN}/__page`, (route) => route.fulfill({
        status: 200, contentType: 'text/html; charset=utf-8', body: html,
      }));
      await page.goto(`${ORIGIN}/__page`, { waitUntil: 'load' });
      // A declared face stays 'unloaded' until something on the page uses it, so
      // force every one to load: a missing woff2 must be an error here, not a
      // silent fallback discovered later by eye.
      const missing = await page.evaluate(async () => {
        await Promise.allSettled([...document.fonts].map((f) => f.load()));
        await document.fonts.ready;
        return [...document.fonts].filter((f) => f.status !== 'loaded')
          .map((f) => `${f.family} ${f.weight} ${f.style} (${f.status})`);
      });
      if (failures.length) throw new Error(`page requests failed:\n  ${failures.join('\n  ')}`);
      if (missing.length) throw new Error(`fonts did not load:\n  ${missing.join('\n  ')}`);
    },
    async close() {
      await browser.close();
    },
  };
}
