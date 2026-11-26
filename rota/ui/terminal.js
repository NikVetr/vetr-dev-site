// A terminal window on one host: scrollback, a prompt with a real text input, history, Tab
// completion and Ctrl+L / Ctrl+C, running lines through the demo shell (core/shell.js).
import { createShell, execute, prompt, complete } from '../core/shell.js';

const MAX_LINES = 1500;

/**
 * @param {HTMLElement} body
 * @param {object} world
 * @param {string} host
 * @param {{banner?: {text: string}[], onRun?: (e: {host: string, text: string, result: any}) => void}} [options]
 */
export function createTerminal(body, world, host, { banner = [], onRun = () => {} } = {}) {
  const shell = createShell(world, host);
  const log = document.createElement('div');
  log.className = 'term-log';
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', `${host} output`);
  const line = document.createElement('div');
  line.className = 'term-input';
  const promptEl = document.createElement('span');
  promptEl.className = 'prompt';
  const input = document.createElement('input');
  Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false });
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  input.setAttribute('enterkeyhint', 'go');
  input.setAttribute('aria-label', `Command on ${host}`);
  const run = document.createElement('button');
  run.type = 'button';
  run.className = 'run-button';
  run.textContent = 'Run ↵';
  run.setAttribute('aria-label', `Run the command on ${host}`);
  line.append(promptEl, input, run);
  body.append(log, line);

  let back = -1; // position in history while browsing with the arrows
  let draft = '';

  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const showPrompt = () => { promptEl.textContent = prompt(shell); };
  function print(lines, cls) {
    const frag = document.createDocumentFragment();
    for (const l of lines) {
      const div = document.createElement('div');
      div.className = cls ?? (l.err ? 'out err' : 'out');
      div.textContent = l.text === '' ? '​' : l.text;
      frag.append(div);
    }
    log.append(frag);
    while (log.childElementCount > MAX_LINES) log.firstElementChild.remove();
    scroll();
  }
  function clear() { log.replaceChildren(); }

  /** Run a line as if typed; returns the shell's result. */
  function submit(text) {
    print([{ text: prompt(shell) + text }], 'out echo');
    const result = execute(shell, text);
    if (result.clear) clear();
    print(result.lines);
    showPrompt();
    back = -1;
    onRun({ host, text, result });
    return result;
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const text = input.value;
      input.value = '';
      submit(text);
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      const before = input.value.slice(0, input.selectionStart);
      const after = input.value.slice(input.selectionEnd);
      const c = complete(shell, before);
      const next = before.slice(0, c.start) + c.replacement;
      if (c.candidates.length && next === before) {
        print([{ text: prompt(shell) + input.value }], 'out echo');
        print([{ text: c.candidates.map((x) => x.split('/').filter(Boolean).pop() + (x.endsWith('/') ? '/' : '')).join('  ') }]);
      }
      input.value = next + after;
      input.setSelectionRange(next.length, next.length);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const h = shell.history;
      if (!h.length) return;
      event.preventDefault();
      if (back === -1) draft = input.value;
      back = event.key === 'ArrowUp' ? (back === -1 ? h.length - 1 : Math.max(0, back - 1)) : back === -1 ? -1 : back + 1;
      if (back >= h.length) back = -1;
      input.value = back === -1 ? draft : h[back];
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault();
      clear();
    } else if (event.key === 'c' && event.ctrlKey && input.selectionStart === input.selectionEnd) {
      event.preventDefault();
      print([{ text: `${prompt(shell)}${input.value}^C` }], 'out echo');
      input.value = '';
    }
  });
  run.addEventListener('click', () => {
    const text = input.value;
    input.value = '';
    submit(text);
    input.focus({ preventScroll: true });
  });
  // A click on the window (not a selection of its text) types into the prompt.
  body.addEventListener('click', () => {
    if (!String(getSelection())) input.focus({ preventScroll: true });
  });

  print(banner);
  showPrompt();

  return {
    host, shell, input, body,
    submit,
    /** Put a command in the prompt for the visitor to run. */
    insert(text) {
      input.value = text;
      input.focus({ preventScroll: true });
      input.setSelectionRange(text.length, text.length);
    },
    refreshPrompt: showPrompt,
    print,
    clear,
  };
}
