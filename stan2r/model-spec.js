import { modelEquations } from './core/exports.js';

/** Render the same equations used by the LaTeX export, keeping each row linked to its graph node.
 * @param {HTMLElement} root
 * @param {import('./explorer.js').Snapshot} state
 * @param {boolean} stale
 * @param {(id:string)=>void} select */
export function renderModelSpec(root, state, stale, select) {
  root.classList.toggle('is-stale', stale);
  if (!state.model) { root.textContent = 'Build the model to see its equations.'; return; }
  const active = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.equationControl : undefined;
  const model = state.model;
  const equations = modelEquations(model, { overrides: state.overrides });
  const rows = [...model.nodes].sort((a,b) => a.line-b.line);
  root.replaceChildren();
  for (const node of rows) {
    const equation = equations.find(row => row.id === node.id);
    if (!equation) continue;
    const row = document.createElement('div');
    row.className = 'model-equation'; row.dataset.equation = node.id;
    row.classList.toggle('selected',state.selected === node.id);
    const line = document.createElement('button'); line.type = 'button'; line.className = 'equation-line'; line.textContent = `L${node.line}`;
    line.dataset.equationControl = node.id; line.disabled = stale;
    line.setAttribute('aria-label', `Explore ${node.id}, source line ${node.line}`);
    line.setAttribute('aria-pressed', String(state.selected === node.id));
    const math = document.createElement('span'); math.className = 'equation-math';
    math.innerHTML = window.katex.renderToString(`\\begin{aligned}${equation.latex}\\end{aligned}`, {output:'mathml',throwOnError:true,trust:false,displayMode:true});
    row.append(line, math); row.onclick = () => { if (!stale) select(node.id); }; root.append(row);
  }
  if (active) /** @type {HTMLElement|null} */ (root.querySelector(`[data-equation-control="${CSS.escape(active)}"]`))?.focus({preventScroll:true});
}
