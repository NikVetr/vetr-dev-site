// The Commands dialog: a filterable list of commands to try; choosing one puts it in its
// window's prompt (or pulls the cable).
import { commandGroups } from './commands.js';

export function createPalette(dialog, getWorld, { choose }) {
  const list = dialog.querySelector('#palette-list');
  const search = dialog.querySelector('#palette-search');
  let opener = null;

  function render() {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    for (const group of commandGroups(getWorld())) {
      const items = group.items.filter((i) => !q || `${i.label} ${i.command ?? ''}`.toLowerCase().includes(q));
      if (!items.length) continue;
      const h = document.createElement('h3');
      h.textContent = group.title;
      list.append(h);
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-item';
        const waiting = item.needs && !item.command;
        if (waiting) button.classList.add('waiting');
        const label = document.createElement('span');
        label.className = 'palette-label';
        label.textContent = waiting ? `${item.label} (submit ${item.needs} first)` : item.label;
        const code = document.createElement('code');
        code.textContent = item.action ? (item.action === 'unplug' ? 'simulation: pull the cable' : 'simulation: reconnect the cable') : item.command ?? '';
        const where = document.createElement('span');
        where.className = 'palette-host';
        where.textContent = item.action ? 'worker' : item.host;
        button.append(label, where, code);
        button.disabled = waiting;
        button.addEventListener('click', () => { opener = null; dialog.close(); choose(item); });
        list.append(button);
      }
    }
  }
  search.addEventListener('input', render);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  return {
    open(from) {
      opener = from ?? document.activeElement;
      search.value = '';
      render();
      dialog.showModal();
      search.focus();
    },
  };
}
