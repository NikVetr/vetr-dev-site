import { state } from './state.js';
import { incSetupEl, incURLEl, incExampleEl, incLabelsEl } from './dom.js';
import { update } from './controls.js';
import * as generator from './generate.js';

export const renderer = { value: 'layout' };
export let incSetup = incSetupEl.checked;
export let incURL = incURLEl.checked;
export let incExample = incExampleEl.checked;
export let incLabels  = incLabelsEl.checked;

[incSetupEl, incURLEl, incExampleEl, incLabelsEl].forEach(el => {
  el.onchange = () => {
    incSetup   = incSetupEl.checked;
    incURL     = incURLEl.checked;
    incExample = incExampleEl.checked;
    incLabels  = incLabelsEl.checked;
    update(); // regenerate code immediately
  };
});


function generatorState() {
  const { rows, cols, rects, aliases, colours, aspect, labelMode } = state;
  return { rows, cols, rects, aliases, colours, aspect, labelMode,
    renderer: renderer.value, incSetup, incURL, incExample, incLabels };
}

export function getProject() {
  return structuredClone(generatorState());
}

function syncExtraOptionVisibility() {
  const key = renderer.value;
  const cfg = generator.FEATURE_SUPPORT[key] || { example: false, labels: false };

  if (incExampleEl) {
    const wrapper = incExampleEl.closest('label') || incExampleEl;
    wrapper.style.display = cfg.example ? '' : 'none';
  }

  if (incLabelsEl) {
    const wrapper = incLabelsEl.closest('label') || incLabelsEl;
    wrapper.style.display = cfg.labels ? '' : 'none';
  }
}

export function generateCode() {
  syncExtraOptionVisibility();
  return generator.generateCode(generatorState());
}

export { f, fmt, plot_code } from './generate.js';
export const buildMat = () => generator.buildMat(generatorState());
export const matrixLiteral = () => generator.matrixLiteral(generatorState());
export const designMatrix = () => generator.designMatrix(generatorState());
export const widthsHeights = () => generator.widthsHeights(generatorState());
export const urlHeader = () => generator.urlHeader(generatorState());
export const filenameHint = (ext = 'R') => generator.filenameHint(generatorState(), ext);
