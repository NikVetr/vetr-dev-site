// For the demos' browser tests: samples a tour guide's move frame by frame and says whether the character and its
// panel travel as one unit. After `act()` starts a move (a click on Next, say), it pauses the unit's animations and
// steps them through their timeline 16 ms at a time, reading both boxes, so the samples do not depend on how fast a
// headless browser paints.
//   const glide = await sampleGlide(page, '.tour-guide', '.tour-bubble', () => page.click('[data-tour="next"]'));

/**
 * @param {any} page a Playwright page
 * @param {string} character @param {string} panel selectors inside one .tour-unit
 * @param {() => Promise<unknown>} act
 */
export async function sampleGlide(page, character, panel, act) {
  await act();
  await page.waitForFunction((c) => document.querySelector(c).closest('.tour-unit').getAnimations({ subtree: true }).some((a) => a.effect?.target?.classList?.contains('tour-unit')), character);
  const frames = await page.evaluate(([c, p]) => {
    const unit = document.querySelector(c).closest('.tour-unit');
    const moves = unit.getAnimations({ subtree: true }).filter((a) => a.effect.target === unit || a.effect.target === document.querySelector(p));
    for (const a of moves) a.pause();
    const end = Math.max(...moves.map((a) => Number(a.effect.getComputedTiming().endTime)));
    const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y }; };
    const out = [];
    for (let t = 0; t < end + 16; t += 16) {
      for (const a of moves) a.currentTime = Math.min(t, end);
      out.push({ c: box(c), p: box(p) });
    }
    for (const a of moves) a.finish();
    return out;
  }, [character, panel]);
  const first = frames[0], last = frames.at(-1);
  const offset = (f) => ({ x: f.p.x - f.c.x, y: f.p.y - f.c.y });
  const spread = Math.max(...frames.map((f) => Math.hypot(offset(f).x - offset(first).x, offset(f).y - offset(first).y)));
  const distance = Math.hypot(last.c.x - first.c.x, last.c.y - first.c.y);
  const steps = frames.slice(1).map((f, i) => ({ x: f.c.x - frames[i].c.x, y: f.c.y - frames[i].c.y }));
  const monotonic = ['x', 'y'].every((k) => steps.every((s) => s[k] >= -0.5) || steps.every((s) => s[k] <= 0.5));
  const largest = Math.max(...steps.map((s) => Math.hypot(s.x, s.y)));
  return { frames: frames.length, distance, spread, monotonic, largest, end: last.c };
}
