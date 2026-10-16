import { el } from './board-menu.js';
import { chipToggle } from './chips.js';
import { fieldLabels, fieldsFor } from './format-panel.js';
import { priorityOptions } from './glyphs.js';
import { languageName, t } from './i18n.js';
import { fitMessage } from './conversation-view.js';
import { keepAwake } from './platform/wake.js';
import * as store from './platform/store.js';
import { createRecitationPlayer } from './platform/recitation.js';
import { defaultRecitation, recitationPlan, validateRecitation } from './recitation-plan.js';

/** @typedef {import('./recitation-plan.js').RecitationConfig} Config */
/** @typedef {import('./recitation-plan.js').Step} Step */
/** @param {string} text @param {() => void} action */
function button(text, action) {
  const node = el('button', { type: 'button', text });
  node.addEventListener('click', action);
  return node;
}

/**
 * @param {object} input
 * @param {HTMLElement} input.root
 * @param {() => import('../core/types.js').Block[]} input.blocks
 * @param {() => Promise<{blocks:import('../core/types.js').Block[],spec:import('../core/types.js').SheetSpec}>} input.reverse
 * @param {Awaited<ReturnType<import('../core/pack.js').loadCorpus>>} input.corpus
 * @param {import('../core/types.js').SheetSpec} input.spec
 * @param {Node} [input.choose]
 * @param {() => void} input.back
 * @param {(running:boolean) => void} input.onRun
 */
export function mountRecitation({ root, blocks, reverse, corpus, spec, choose, back, onRun }) {
  const key = `plg.recitation.${spec.target}__${spec.source}`;
  let config = defaultRecitation();
  let invalidSaved = false;
  const notice = el('p', { role: 'status', class: 'recitation-note' });
  try {
    const saved = store.get(key);
    if (saved) config = validateRecitation(JSON.parse(saved));
  } catch (error) {
    invalidSaved = true;
    notice.textContent = t('recitation.invalidSaved');
  }
  const reset = button(t('recitation.reset'), () => {
    config = defaultRecitation(); invalidSaved = false; reset.remove(); renderPhases(); refresh();
  });
  const form = el('form', { class: 'drill-setup recitation-setup' });
  const phaseList = el('div', { class: 'recitation-phases' });
  const start = /** @type {HTMLButtonElement} */ (el('button', { type: 'submit', class: 'primary', text: t('recitation.start') }));
  const depth = /** @type {HTMLSelectElement} */ (el('select', { 'aria-label': t('format.priority') }));
  for (const option of priorityOptions(corpus.concepts)) depth.append(new Option(option.caption, String(option.value)));
  depth.value = String(config.floor);
  const rate = /** @type {HTMLInputElement} */ (el('input', {
    type: 'number', min: '0.5', max: '2', step: '0.1', value: String(config.rate), 'aria-label': t('recitation.rate'),
  }));
  const repeat = chipToggle({ label: t('recitation.repeat'), checked: config.repeat,
    onChange: (on) => { config.repeat = on; refresh(); } });
  depth.addEventListener('change', () => { config.floor = Number(depth.value); refresh(); });
  rate.addEventListener('input', () => { config.rate = rate.valueAsNumber; refresh(); });
  /** @type {Awaited<ReturnType<typeof reverse>>|null} */ let reversed = null;
  let busy = false;
  /** @type {ReturnType<typeof recitationPlan>|null} */ let plan = null;
  const native = Boolean(/** @type {any} */ (globalThis).Capacitor?.isNativePlatform?.());

  function refresh() {
    start.disabled = true;
    if (invalidSaved || !reversed || busy) return;
    try {
      plan = recitationPlan(blocks(), reversed.blocks, spec, config);
      notice.textContent = t('recitation.count', { count: plan.phrases, skipped: plan.skipped });
      start.disabled = !plan.steps.length;
    } catch (error) {
      plan = null;
      notice.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  function renderPhases() {
    if (!reversed) return;
    const reverseSpec = reversed.spec;
    phaseList.replaceChildren(...config.phases.map((phase, index) => {
      const box = el('fieldset', { class: 'recitation-phase' }, [el('legend', { text: t('recitation.phase', { number: index + 1 }) })]);
      for (const side of /** @type {const} */ (['source', 'target'])) {
        const ownSpec = side === 'target' ? spec : reverseSpec;
        const labels = fieldLabels(ownSpec, corpus);
        const fields = fieldsFor(ownSpec, corpus).filter((field) => field !== 'gloss');
        const name = languageName(ownSpec.target, corpus.languages[ownSpec.target].exonym_en);
        box.append(el('h3', { text: name }));
        for (const channel of /** @type {const} */ (['screen', 'audio'])) {
          const choices = el('div', { class: 'chip-grid' });
          for (const field of fields) {
            const value = `${side}:${field}`;
            const chip = chipToggle({ label: labels[field].caption, title: labels[field].title,
              checked: phase[channel].includes(value), onChange: (on) => {
                phase[channel] = on ? [...phase[channel], value] : phase[channel].filter((v) => v !== value);
                refresh();
              } });
            chip.box.value = value;
            chip.box.dataset.channel = channel;
            choices.append(chip.label);
          }
          box.append(el('fieldset', { class: 'recitation-fields' }, [el('legend', { text: t(`recitation.${channel}`) }), choices]));
        }
      }
      const delay = /** @type {HTMLInputElement} */ (el('input', {
        type: 'number', min: '0', max: '600', step: '0.1', value: String(phase.delayMs / 1000),
        'aria-label': t('recitation.delay'),
      }));
      delay.addEventListener('input', () => { phase.delayMs = delay.valueAsNumber * 1000; refresh(); });
      const actions = el('div', { class: 'row' }, [el('label', {}, [t('recitation.delay'), delay])]);
      if (index > 0) actions.append(button(t('recitation.earlier'), () => {
        [config.phases[index - 1], config.phases[index]] = [phase, config.phases[index - 1]];
        renderPhases(); refresh();
      }));
      if (config.phases.length > 1) actions.append(button(t('recitation.remove'), () => {
        config.phases.splice(index, 1); renderPhases(); refresh();
      }));
      box.append(actions);
      return box;
    }));
  }

  form.append(button(t('recitation.back'), back), el('h2', { text: t('recitation.title') }),
    el('p', { text: t('recitation.intro') }), ...(choose ? [choose] : []),
    el('div', { class: 'row' }, [el('label', {}, [t('format.priority'), depth]), el('label', {}, [t('recitation.rate'), rate]), repeat.label]),
    el('p', { class: 'small muted', text: t('recitation.phonetics') }), phaseList,
    button(t('recitation.add'), () => {
      if (config.phases.length >= 8) { notice.textContent = t('recitation.maxPhases'); return; }
      config.phases.push({ screen: ['target:script'], audio: ['target:script'], delayMs: 3000 });
      renderPhases(); refresh();
    }), el('p', { class: 'small muted', text: t(native ? 'recitation.native' : 'recitation.browser') }),
    notice, ...(invalidSaved ? [reset] : []), start);
  root.replaceChildren(form);
  notice.textContent ||= t('recitation.loading');
  start.disabled = true;
  reverse().then((value) => { reversed = value; renderPhases(); refresh(); }).catch((error) => {
    notice.textContent = String(error);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    refresh();
    if (start.disabled || !plan) return;
    busy = true; start.disabled = true;
    try {
      await store.set(key, JSON.stringify(config));
      await playRecitation(plan.steps, config.repeat, corpus, onRun);
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false; start.disabled = !plan?.steps.length;
    }
  });
  return { refresh };
}

/** @param {Step[]} steps @param {boolean} repeat @param {Awaited<ReturnType<import('../core/pack.js').loadCorpus>>} corpus @param {(running:boolean) => void} onRun */
async function playRecitation(steps, repeat, corpus, onRun) {
  const stage = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'board-stage recitation-stage', 'aria-label': t('recitation.title') }));
  const content = el('div', { class: 'recitation-screen' });
  const status = el('p', { role: 'status', class: 'recitation-status' });
  const pause = /** @type {HTMLButtonElement} */ (button(t('recitation.pause'), () => {
    const action = state === 'paused' ? player.resume() : player.pause();
    Promise.resolve(action).catch(fail);
  }));
  const stop = button(t('recitation.stop'), () => stage.close());
  stage.append(content, status, el('div', { class: 'row recitation-controls' }, [pause, stop]));
  let state = 'preparing';
  let shown = -1;
  /** @type {{text:HTMLElement,box:HTMLElement}[]} */ let lines = [];
  const refit = () => lines.forEach(({ text, box }) => fitMessage(text, box));
  const observer = new ResizeObserver(refit);
  const fail = (/** @type {unknown} */ error) => {
    state = 'error'; pause.disabled = true; keepAwake(false);
    status.textContent = error instanceof Error ? error.message : String(error);
  };
  const player = await createRecitationPlayer((next) => {
    if (!stage.open) return;
    state = next.status;
    keepAwake(state === 'preparing' || state === 'playing');
    pause.disabled = !['playing', 'paused'].includes(state);
    pause.textContent = t(state === 'paused' ? 'recitation.resume' : 'recitation.pause');
    const step = steps[next.index];
    if (step && shown !== next.index) {
      shown = next.index;
      stage.className = `board-stage recitation-stage board-role-${step.colorRole}`;
      lines = step.screen.map((cell) => {
        const text = el('p', { class: 'recitation-text', text: cell.text.replaceAll('{}', '____'), lang: cell.lang,
          dir: cell.key.endsWith(':roman') || cell.key.endsWith(':ipa') ? 'ltr'
            : corpus.scripts[corpus.languages[cell.lang]?.script]?.direction === 'rtl' ? 'rtl' : 'ltr' });
        const box = el('div', { class: 'recitation-line' }, [text]);
        return { text, box };
      });
      content.replaceChildren(...lines.map((line) => line.box));
      refit();
    }
    status.textContent = next.error || t(`recitation.state.${state}`, {
      current: Math.max(0, next.index) + 1, total: steps.length,
      prepared: next.prepared ?? 0, preparingTotal: next.total ?? steps.length,
    });
  }, { background: steps.some((step) => step.audio.length > 0) });
  document.body.append(stage); stage.showModal(); onRun(true);
  observer.observe(content);
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    observer.disconnect(); keepAwake(false);
    window.removeEventListener('pagehide', leaving);
    try { await player.dispose(); } catch (error) { fail(error); }
    stage.remove(); onRun(false);
  };
  const leaving = () => { void close(); };
  window.addEventListener('pagehide', leaving);
  stage.addEventListener('close', () => { void close(); }, { once: true });
  pause.disabled = true;
  status.textContent = t('recitation.state.preparing', { prepared: 0, preparingTotal: steps.length });
  if (!player.background && steps.every((step) => !step.audio.length)) {
    stage.append(el('p', { class: 'small', text: t('recitation.screenOnly') }));
  }
  try { await player.start({ steps, repeat }); } catch (error) { if (!closed) fail(error); }
}
