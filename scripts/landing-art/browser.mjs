// For the card pictures that need a tool's page rather than its core: serves the repository
// over HTTP on a free port and opens the page in headless Chromium through Playwright.
// Playwright is not a dependency of the site; set PLAYWRIGHT to an installed playwright
// package, or install one in any tool folder (npm ci there), where this finds it.
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** @type {Record<string, string>} */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.csv': 'text/csv', '.txt': 'text/plain', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm' };

function playwright() {
  const require = createRequire(import.meta.url);
  if (process.env.PLAYWRIGHT) return require(process.env.PLAYWRIGHT);
  const paths = readdirSync(ROOT).map((d) => join(ROOT, d)).filter((d) => existsSync(join(d, 'node_modules', 'playwright')));
  if (!paths.length) throw new Error('No Playwright found: set PLAYWRIGHT to an installed playwright package, or run npm ci in a tool folder');
  return require(require.resolve('playwright', { paths }));
}

/**
 * Opens `path` (relative to the site root, e.g. "agendamatic/") and returns the page and a
 * close() that stops the browser and the server.
 * @param {string} path
 * @param {{ width?: number, height?: number, scheme?: 'light' | 'dark', engine?: 'chromium' | 'webkit' | 'firefox' }} [options]
 */
export async function openPage(path, { width = 1440, height = 900, scheme = 'light', engine = 'chromium' } = {}) {
  if (!['chromium', 'webkit', 'firefox'].includes(engine)) throw new Error(`Unsupported browser engine: ${engine}`);
  const server = createServer((req, res) => {
    let file = normalize(join(ROOT, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  let browser;
  try {
    browser = await playwright()[engine].launch();
  } catch (error) {
    server.close();
    throw error;
  }
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: scheme });
  // The site's analytics is not needed to draw anything.
  await context.route(/googletagmanager|google-analytics/, (/** @type {any} */ route) => route.abort());
  const page = await context.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (/** @type {Error} */ e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/${path}`, { waitUntil: 'networkidle' });
  return {
    page,
    errors,
    close: async () => { await browser.close(); server.close(); },
  };
}
