import { lightSwitch } from '../shared/light-switch.js';

const button = document.querySelector('#editor-switch');
if (button instanceof HTMLButtonElement) {
  const mattlab = button.dataset.editor === 'mattlab';
  lightSwitch({
    button,
    label: 'Mattlab editor (off: MotRPAC, on: Mattlab)',
    dark: () => mattlab,
    marks: ['<span class="switch-word">MotRPAC</span>', '<span class="switch-word">Mattlab</span>'],
    flip: () => {
      // Both editors save locally; their ordinary blur/pagehide handlers finish edits.
      window.location.assign(new URL(mattlab ? './' : './mattlab/', import.meta.url));
    },
  });
  button.classList.add('editor-switch');
  button.title = mattlab ? 'Switch to the MotRPAC alphabet editor' : 'Switch to the Mattlab logo painter';
}
