// The format panel's labels, which have to read as one ladder of settings.
import { test, expect } from '@playwright/test';

test('every setting label sits on the same type scale', async ({ page }) => {
  // "Header" and "Footer" were the panel's base size and semibold where every other
  // label is `--fs--1` at normal weight, so they read as headings for the controls
  // under them rather than as the two checkboxes they are -- which is how it was
  // reported. Their sibling legends were a hardcoded 0.7rem against the token's
  // 0.78rem, for no reason anyone had recorded.
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.panel-field-title').first()).toBeVisible();

  const styles = await page.evaluate(() => {
    const read = (el) => {
      const s = getComputedStyle(el);
      return { text: (el.textContent ?? '').trim().slice(0, 24), size: s.fontSize, weight: s.fontWeight };
    };
    return {
      titles: [...document.querySelectorAll('.panel-field-title')].map(read),
      toggles: [...document.querySelectorAll('.head-on')].map(read),
      legends: [...document.querySelectorAll('.head-side legend')].map(read),
    };
  });

  // Not vacuous: the panel really is rendered and really has all three kinds.
  expect(styles.titles.length).toBeGreaterThan(6);
  expect(styles.toggles.length).toBe(2);
  expect(styles.legends.length).toBeGreaterThan(2);

  const scale = styles.titles[0].size;
  for (const kind of ['titles', 'toggles', 'legends']) {
    for (const label of styles[kind]) {
      expect(label.size, `${kind}: ${label.text}`).toBe(scale);
      expect(label.weight, `${kind}: ${label.text}`).toBe('400');
    }
  }
});

test('the header can be a solid tab, flush with the corner, in white', async ({ page }) => {
  // A stack of printed cards is hard to tell apart face-on, and the band is the one
  // thing on a sheet visible from its edge. `section` colours the tab by whichever
  // section owns most of that face -- weighted by height, so a section with twenty
  // rows counts for more than one with two -- which makes each face a different
  // colour and makes the colour mean something.
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.panel-field-title').first()).toBeVisible();
  await page.locator('.head-on input').first().check();
  // The fill is a glyph ladder now, not a `<select>`: `#head-fill` is the revealed
  // list of theme colour keys, and "by section" is a segment. Same idiom the header
  // test further down already uses.
  await page.getByRole('radio', { name: 'By section' }).first().click();
  await page.waitForTimeout(2500);

  /** The band's own rectangle: in the strip above the columns, a line or so tall. */
  const band = () => page.evaluate(() => {
    const svg = document.querySelector('.face.focused svg') ?? document.querySelector('svg');
    const rect = [...(svg?.querySelectorAll('rect') ?? [])]
      .map((r) => ({
        x: +(r.getAttribute('x') ?? 0), y: +(r.getAttribute('y') ?? 0),
        w: +(r.getAttribute('width') ?? 0), h: +(r.getAttribute('height') ?? 0),
        fill: (r.getAttribute('fill') ?? '').toUpperCase(),
      }))
      .filter((r) => r.y < 20 && r.h > 4 && r.h < 30)[0] ?? null;
    const white = [...(svg?.querySelectorAll('text') ?? [])]
      .filter((t) => (t.getAttribute('fill') ?? '').toLowerCase() === '#ffffff').length;
    const page_w = +(svg?.getAttribute('viewBox') ?? '0 0 504 360').split(' ')[2];
    return { rect, white, page_w };
  });

  const full = await band();
  expect(full.rect, 'the tab should be painted').not.toBe(null);
  // A theme role, not paper: `section` resolved to something.
  expect(full.rect.fill).toMatch(/^#[0-9A-F]{6}$/);
  expect(full.rect.fill).not.toBe('#FFFFFF');
  // White type on it, which is the other half of being legible on a solid colour.
  expect(full.white).toBeGreaterThan(0);
  // `full` spans the page, which is a bar rather than a tab and is the default.
  expect(full.rect.w).toBeCloseTo(full.page_w, 0);

  // A corner tab is flush with the paper's edge, not inset by the margin -- a tab
  // you cannot see past the card in front is not a tab.
  // `Sits` is a segmented control of glyph buttons, not a select.
  await page.getByRole('radio', { name: 'Left tab' }).first().click();
  await page.waitForTimeout(2500);
  const left = await band();
  expect(left.rect.x).toBeCloseTo(0, 1);
  expect(left.rect.w).toBeLessThan(left.page_w * 0.8);
});

test('two changes to the band in one breath both survive', async ({ page }) => {
  // `push` used to read the band back out of the spec the app last handed down, and
  // that only catches up after a solve, which is debounced. So a second gesture
  // inside the same window was built on the spec as it was *before* the first, and
  // the first was silently discarded. The panel gained two more ladders when the tab
  // got a shape and a fill ladder, which made a pair of quick taps much easier to hit.
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto('/customize.html?target=es&source=en');
  await expect(page.locator('.panel-field-title').first()).toBeVisible();

  // Switch the header on, then -- without waiting for the solve -- tick a slot and
  // choose a corner. Both are changes to the same band.
  await page.locator('.head-on input').first().check();
  await page.waitForTimeout(1500);
  // **Both gestures in one tick.** Driven from the page rather than through two
  // Playwright actions: each of those waits for actionability, which is long enough
  // for the 260ms solve debounce to fire between them, and the bug only exists
  // inside one window. This is the gesture pair a thumb actually makes.
  await page.evaluate(() => {
    const tick = /** @type {HTMLInputElement} */ (document.getElementById('head-left-pair'));
    tick.click();
    const span = [...document.querySelectorAll('[role=radio]')]
      .find((r) => /Left tab/.test(r.textContent || ''));
    /** @type {HTMLElement} */ (span)?.click();
  });
  // **Asserted on the sheet, not on the checkbox.** The tick stays visually checked
  // either way -- the control only repaints when the app hands a spec back down --
  // so the DOM checkbox cannot see this bug. What the reader loses is the slot on
  // the card, so that is what is checked.
  await page.waitForTimeout(3500);
  const band = await page.evaluate(() => {
    const svg = document.querySelector('.face.focused svg');
    // The band sits above the columns; the content box starts around y=14 on this
    // card, so anything higher is furniture.
    return [...(svg?.querySelectorAll('text') ?? [])]
      .filter((t) => +(t.getAttribute('y') ?? 99) < 13)
      .map((t) => t.textContent).join(' ');
  });
  expect(band, 'the pair asked for in the first gesture must still be on the card')
    .toMatch(/Spanish|English/);
  await expect(page.locator('#head-left-pair')).toBeChecked();
});
