/** Panel visibility and sizing are navigation state, independent of model history. */
export function mountWorkspace() {
  /** @template {HTMLElement} T @param {string} id @returns {T} */
  const get = id => /** @type {T} */ (document.getElementById(id));
  const workspace = get('workspace'), dock = get('editors'), resizer = get('dock-resizer');
  const panels = { code: get('code-panel'), spec: get('spec-panel') };
  const buttons = { code: get('toggle-code'), spec: get('toggle-spec') };
  const focus = get('focus-graph');
  const defaultWidth = () => Math.round(Math.min(480, Math.max(360, innerWidth * .28)));
  let width = defaultWidth();
  /** @type {{code:boolean,spec:boolean}|null} */
  let beforeFocus = null;
  const desktop = matchMedia('(min-width: 1000px)');
  function render() {
    const collapsed = !!panels.code.hidden && !!panels.spec.hidden;
    dock.hidden = collapsed;
    resizer.hidden = collapsed;
    workspace.classList.toggle('dock-hidden', collapsed);
    for (const key of /** @type {const} */ (['code', 'spec'])) buttons[key].setAttribute('aria-pressed', String(!panels[key].hidden));
    focus.setAttribute('aria-pressed', String(collapsed));
    focus.textContent = collapsed ? 'Restore panels' : 'Focus graph';
  }
  /** @param {'code'|'spec'} name @param {boolean} visible */
  function show(name, visible = true) {
    panels[name].hidden = !visible;
    beforeFocus = null;
    render();
  }
  for (const name of /** @type {const} */ (['code', 'spec'])) {
    buttons[name].onclick = () => show(name, !!panels[name].hidden);
    const hide = /** @type {HTMLButtonElement} */ (document.querySelector(`[data-hide-panel="${name}"]`));
    hide.onclick = () => { show(name, false); buttons[name].focus({ preventScroll: true }); };
  }
  focus.onclick = () => {
    if (panels.code.hidden && panels.spec.hidden) {
      panels.code.hidden = beforeFocus ? !beforeFocus.code : false;
      panels.spec.hidden = beforeFocus ? !beforeFocus.spec : false;
      beforeFocus = null;
    } else {
      beforeFocus = {code: !panels.code.hidden, spec: !panels.spec.hidden};
      panels.code.hidden = panels.spec.hidden = true;
    }
    render();
  };
  /** @param {number} requested */
  function resize(requested) {
    const max = Math.max(280, Math.min(660, workspace.clientWidth - 560));
    width = Math.round(Math.max(280, Math.min(max, requested)));
    workspace.style.setProperty('--dock-width', `${width}px`);
    resizer.setAttribute('aria-valuemax', String(max));
    resizer.setAttribute('aria-valuenow', String(width));
    resizer.setAttribute('aria-valuetext', `${width} pixels`);
  }
  /** @type {{pointer:number,start:number,width:number}|null} */
  let drag = null;
  resizer.onpointerdown = event => {
    if (event.button !== 0 || !desktop.matches) return;
    event.preventDefault();
    drag = {pointer:event.pointerId, start:event.clientX, width};
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add('is-dragging');
  };
  resizer.onpointermove = event => { if (drag) resize(drag.width + event.clientX - drag.start); };
  resizer.onlostpointercapture = () => { drag = null; resizer.classList.remove('is-dragging'); };
  resizer.onpointerup = event => { if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId); };
  resizer.onkeydown = event => {
    const step = event.shiftKey ? 50 : 10;
    const next = {ArrowLeft:width-step, ArrowRight:width+step, Home:280, End:660}[event.key];
    if (next === undefined) return;
    event.preventDefault(); resize(next);
  };
  resizer.ondblclick = () => resize(defaultWidth());
  new ResizeObserver(() => { if (desktop.matches) resize(width); }).observe(workspace);
  const distributions = get('distribution-content'), toggle = get('toggle-distributions');
  toggle.onclick = () => {
    distributions.hidden = !distributions.hidden;
    toggle.setAttribute('aria-expanded', String(!distributions.hidden));
    toggle.textContent = distributions.hidden ? 'Show' : 'Hide';
  };
  render();
  return { show };
}
