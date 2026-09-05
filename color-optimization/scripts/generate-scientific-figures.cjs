// Run against the app's local server: node scripts/generate-scientific-figures.cjs [URL]
const { chromium } = require('@playwright/test');
const { writeFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

const output = resolve(__dirname, '../assets/scientific-summary');
const svg = (width, height, title, content) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
<title>${title}</title><rect width="100%" height="100%" fill="#fff"/>
<style>text{font-family:Arial,Helvetica,sans-serif;fill:#243746;font-size:15px}.small{font-size:12px;fill:#526471}.heading{font-weight:700;font-size:17px}</style>${content}</svg>\n`;
const text = (x, y, label, cls = '', extra = '') => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${label}</text>`;

async function main() {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 2400, height: 1400 }, deviceScaleFactor: 2 });
    page.on('pageerror', (error) => { throw error; });
    await page.route('**/main.js', async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() +
        '\nwindow.__scientificExample = { state, get ui() { return ui; }, config: () => readConfig(ui, state), normalizeWeights: () => normalizeAndUpdateWeights() };' });
    });
    await page.goto(process.argv[2] || 'http://localhost:18081');
    await page.waitForFunction(() => window.__scientificExample?.ui?.panelMap?.none?.wheelMeta);
    await page.fill('#palette-input', '#4477AA, #CC6677');
    await page.uncheck('#bg-enabled');
    for (const [id, value] of Object.entries({ 'seed-input': 2026, 'colors-to-add': 3, 'optim-runs': 12,
      'nm-iters': 160 })) {
      await page.fill(`#${id}`, String(value));
    }
    // Set together: changing one weight interactively redistributes the other three.
    await page.evaluate(() => {
      const weights = ['w-none', 'w-deutan', 'w-protan', 'w-tritan'].map((id) => document.getElementById(id));
      weights.forEach((input) => { input.value = '25'; });
      window.__scientificExample.normalizeWeights();
    });
    await page.click('#run-btn');
    await page.waitForFunction(() => document.querySelector('#status-state').textContent === 'Finished', null, { timeout: 60000 });
    const error = await page.locator('#error-text').textContent();
    if (error.trim()) throw new Error(error);
    const example = await page.evaluate(async () => {
      const { state, ui, config } = window.__scientificExample;
      const { applyCvdHex } = await import('./core/cvd.js');
      const { coordsFromHexForDistanceMetric, distanceBetweenCoords } = await import('./core/distance.js');
      const palette = [...state.currentColors, ...state.newColors];
      const states = ['none', 'deutan', 'protan', 'tritan'];
      const simulations = states.map((vision) => palette.map((hex) => applyCvdHex(hex, vision, 1, 'machado2009')));
      const matrices = states.map((vision) => {
        const coords = palette.map((hex) => coordsFromHexForDistanceMetric(hex, 'de2000', vision, 'machado2009'));
        return coords.map((a) => coords.map((b) => distanceBetweenCoords(a, b, 'de2000')));
      });
      return { config: { ...config(), backgroundEnabled: false }, inputs: state.currentColors, added: state.newColors, simulations, states, matrices,
        best: state.runRanking[0],
        domain: ui.panelMap.none.canvas.toDataURL('image/png'), paths: ui.statusMini.toDataURL('image/png') };
    });
    if (!Object.values(example.config.colorblindWeights).every((weight) => weight === 0.25)) {
      throw new Error('Worked-example vision weights must be equal.');
    }
    for (const name of ['domain', 'paths']) {
      writeFileSync(resolve(output, `${name}.png`), Buffer.from(example[name].split(',')[1], 'base64'));
      delete example[name];
    }
    writeFileSync(resolve(output, 'example.json'), JSON.stringify(example, null, 2) + '\n');

    const palette = [...example.inputs, ...example.added];
    let swatches = text(155, 25, 'FIXED INPUTS', 'small') + text(385, 25, 'OPTIMIZED ADDITIONS', 'small');
    const labels = ['Trichromacy', 'Deutan simulation', 'Protan simulation', 'Tritan simulation'];
    example.simulations.forEach((row, i) => {
      const y = 52 + i * 61;
      swatches += text(8, y + 26, labels[i], 'small');
      row.forEach((hex, j) => {
        const x = 155 + j * 100 + (j >= 2 ? 30 : 0);
        swatches += `<rect x="${x}" y="${y}" width="90" height="42" rx="3" fill="${hex}" stroke="#243746" stroke-opacity=".2"/>`;
        if (!i) swatches += text(x + 45, y - 10, String(j + 1), 'small', 'text-anchor="middle"');
      });
    });
    palette.forEach((hex, j) => {
      const x = 155 + j * 100 + (j >= 2 ? 30 : 0);
      swatches += text(x + 45, 304, hex, 'small', 'text-anchor="middle"');
    });
    writeFileSync(resolve(output, 'palette.svg'), svg(690, 322, 'Two fixed input colors and three additions under four vision models', swatches));

    const minimums = example.matrices.map((m) => Math.min(...m.flatMap((row, i) => row.slice(i + 1))));
    const worstIndex = minimums.indexOf(Math.min(...minimums));
    const largest = Math.max(...example.matrices.flat(2));
    let cells = '';
    [0, worstIndex].forEach((stateIndex, panel) => {
      const origin = 15 + panel * 340;
      cells += text(origin, 26, panel ? `${labels[stateIndex]} · weakest pair` : 'Trichromacy', 'heading');
      cells += text(origin, 49, `Minimum pair distance: ${minimums[stateIndex].toFixed(1)}`, 'small');
      example.matrices[stateIndex].forEach((row, i) => {
        cells += text(origin + 16, 106 + i * 45, String(i + 1));
        if (!i) palette.forEach((_, j) => { cells += text(origin + 55 + j * 45, 75, String(j + 1)); });
        row.forEach((d, j) => {
          const light = 98 - 56 * d / largest;
          const x = origin + 35 + j * 45, y = 86 + i * 45;
          cells += `<rect x="${x}" y="${y}" width="44" height="44" fill="${i === j ? '#edf0f2' : `hsl(196 32% ${light}%)`}"/>`;
          cells += `<text x="${x + 22}" y="${y + 27}" text-anchor="middle" style="font-size:12px;fill:${light < 60 ? '#fff' : '#243746'}">${i === j ? '—' : d.toFixed(1)}</text>`;
        });
      });
    });
    cells += text(15, 341, 'CIEDE2000 distance · shared scale · darker = larger separation', 'small');
    cells += text(15, 363, 'Numbers identify colors in Figure 1. Fixed–fixed pairs are included in this diagnostic.', 'small');
    writeFileSync(resolve(output, 'distances.svg'), svg(690, 382, 'Pairwise color distances under trichromacy and the vision model with the weakest pair', cells));
    console.log(JSON.stringify({ added: example.added, score: example.best.score, minimums, worstState: example.states[worstIndex] }));
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
