// The generic app's actual initial histogram, with the tool's own block positions and colours.
import { openPage } from '../browser.mjs';
import { art } from '../svg.mjs';

export async function build() {
  const { page, errors, close } = await openPage('ceo-salary-benchmark/');
  try {
    await page.waitForSelector('#salary-chart .bar-block');
    const chart = await page.evaluate(() => {
      const source = /** @type {SVGSVGElement} */ (document.querySelector('#salary-chart'));
      const clone = /** @type {SVGSVGElement} */ (source.cloneNode(true));
      const original = [source, ...source.querySelectorAll('*')];
      const copied = [clone, ...clone.querySelectorAll('*')];
      original.forEach((element, i) => {
        const style = getComputedStyle(element);
        for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'paint-order', 'font-size', 'font-family', 'font-weight', 'text-anchor']) {
          copied[i].setAttribute(prop, style.getPropertyValue(prop));
        }
        for (const attr of ['id', 'tabindex', 'role', 'aria-label', 'aria-labelledby']) copied[i].removeAttribute(attr);
      });
      clone.setAttribute('x', '0'); clone.setAttribute('y', '0');
      clone.setAttribute('width', '320'); clone.setAttribute('height', '180');
      return clone.outerHTML;
    });
    if (errors.length) throw new Error(`benchmark card: ${errors.join('; ')}`);
    return art({ name: 'ceo-salary-benchmark', period: 4, body: chart,
      css: '& > svg { background: #fff; border-radius: 4px; }',
      loop: `& .bar-block { animation: benchmark-emphasis 4s ease-in-out infinite; }
@keyframes benchmark-emphasis { 0%, 100% { opacity: 1; } 50% { opacity: .65; } }`,
    });
  } finally { await close(); }
}
