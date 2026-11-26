// node --test rota/tests/demo.browser.mjs   (BROWSER_ENGINE=webkit for WebKit; PLAYWRIGHT=<path>)
import test from 'node:test';
import assert from 'node:assert/strict';
import { openPage } from '../../scripts/landing-art/browser.mjs';

const engine = process.env.BROWSER_ENGINE ?? 'chromium';
const SUBMIT_A = 'rota submit --model_dir /srv/cluster/projects/my-analysis --queue a.txt --project my-analysis --run_name A --cpu_units_per_job 1 --memory_mib_per_job 1024';

test('keyboard only: type, complete, recall and use the Commands list', async () => {
  const app = await openPage('rota/?tour=0', { engine });
  const { page } = app;
  try {
    await page.locator('[data-shell="storage"] input').focus();
    await page.keyboard.type('rota pool-stat');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('[data-shell="storage"] input').inputValue(), 'rota pool-status ');
    await page.keyboard.press('Enter');
    await page.locator('[data-shell="storage"] .out', { hasText: 'live_cpu_units=12' }).waitFor();
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('[data-shell="storage"] input').inputValue(), 'rota pool-status ');
    await page.keyboard.press('Control+k');
    await page.locator('#palette').waitFor({ state: 'visible' });
    await page.keyboard.type('Queue A');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[data-shell]')?.getAttribute('data-shell')), 'storage');
    assert.equal(await page.locator('[data-shell="storage"] input').inputValue(), SUBMIT_A);
    await page.keyboard.press('Enter');
    await page.evaluate(() => /** @type {any} */ (window).RotaDemo.advance(90));
    const state = await page.evaluate(() => /** @type {any} */ (window).RotaDemo.state());
    assert.deepEqual(state.queues[0].running, { storage: 4, worker: 8 });
    assert.match(await page.locator('#dashboard').innerText(), /A\s+\|my-analysis\|4-8/);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('the tour moves to each target, reacts, and steps by keyboard; reduced motion places it without flying', async () => {
  const app = await openPage('rota/?tour=1', { engine });
  const { page } = app;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.bubble').waitFor();
    await page.locator('[data-next]').click();
    assert.equal(await page.locator('.bubble-title').textContent(), 'An idle pool');
    await page.locator('.bubble .suggest').click();
    await page.keyboard.press('Enter');
    await page.locator('.bubble-reaction', { hasText: 'state=ACTIVE' }).waitFor();
    assert.equal(await page.evaluate(() => document.getAnimations().length), 0, 'no flight under reduced motion');
    await page.locator('.bubble').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.bubble-title').textContent(), 'The dashboard');
    const near = await page.evaluate(() => {
      const cat = document.querySelector('.pip')?.getBoundingClientRect();
      const target = document.getElementById('win-monitor')?.getBoundingClientRect();
      return !!cat && !!target && cat.bottom > target.top - 10 && cat.top < target.top + 60 && cat.right <= target.right + 4;
    });
    assert.ok(near, 'Pip perches on the dashboard window');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#guide').isHidden(), true);
    await page.locator('#tour-button').click();
    assert.equal(await page.locator('.bubble-title').textContent(), 'Hello');
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('the cable: lease expiry, jobs still running on the worker, recovery records', async () => {
  const app = await openPage('rota/?tour=0', { engine });
  const { page } = app;
  try {
    const demo = (/** @type {string} */ f, /** @type {any} */ a) => page.evaluate(([f, a]) => /** @type {any} */ (window).RotaDemo[f](...a), [f, a]);
    await demo('setClock', [false]);
    await demo('run', [SUBMIT_A]);
    await demo('advance', [90]);
    await page.locator('#cable-button').click();
    await demo('advance', [25]);
    assert.match(await page.locator('#pool-view').innerText(), /lease expired/);
    assert.match(await page.locator('#dashboard').innerText(), /worker unavailable: ssh: connect to host worker/);
    const ps = await demo('run', ['ps', 'worker']);
    assert.ok(ps.lines.filter((/** @type {string} */ l) => l.includes('simulate.py')).length === 8, 'eight jobs still running on the worker');
    await page.locator('#cable-button').click();
    await demo('advance', [400]);
    const batch = (await demo('state', [])).queues[0].batchDir;
    const status = await demo('run', [`rota queue-status --batch_dir ${batch}`]);
    assert.ok(status.lines.some((/** @type {string} */ l) => /^share_interrupted_jobs=[1-9]/.test(l)));
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test('phone: windows are tabs, the dashboard keeps 120 columns, nothing overflows the page', async () => {
  const app = await openPage('rota/?tour=0', { engine, width: 390, height: 844, touch: true, scheme: 'dark' });
  const { page } = app;
  try {
    assert.equal(await page.locator('#win-monitor').isVisible(), false);
    await page.locator('#tab-monitor').click();
    assert.equal(await page.locator('#win-monitor').isVisible(), true);
    assert.equal(await page.locator('#win-storage').isVisible(), false);
    const row = await page.locator('#dashboard .tty-row').nth(12).textContent();
    assert.ok((row ?? '').length >= 120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.locator('#tab-storage').click();
    await page.locator('[data-shell="storage"] input').fill('rota help');
    await page.locator('#win-storage .run-button').click();
    await page.locator('[data-shell="storage"] .out', { hasText: 'Usage: rota <command>' }).waitFor();
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
