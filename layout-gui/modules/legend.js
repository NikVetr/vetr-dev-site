import { legendList }          from './dom.js';
import { state, history }               from './state.js';
import { norm, col, nameOf }   from './helpers.js';
import { syncURL }             from './helpers.js';
import { update }              from './controls.js';
import { repaint }     from './canvas.js';

export function legend() {
    legendList.innerHTML = '';
    state.rects.forEach((R0, i) => {
        const R = norm(R0);
        const li = document.createElement('div');
        
        li.className = 'legend-item';
        li.dataset.idx = i; // ← for dbl-click
        li.draggable = true; // enable dragging

        li.innerHTML = `
        <div class="swatch" style="background:${col(i+1)}">${i+1}</div>
        <div class="legend-name">${nameOf(i)}</div>
        <small class="dim">rows&nbsp;${R.r0+1}:${R.r1}, cols&nbsp;${R.c0+1}:${R.c1}</small>
        <button class="del">×</button>`;

        li.querySelector('.del').onclick = () => {
            history();
            state.rects.splice(i, 1);
            state.aliases.splice(i, 1);
            update();
            syncURL();
        };

        // Drag events
        li.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', i);
            e.dataTransfer.effectAllowed = 'move';
            li.classList.add('dragging');
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
        });

        li.addEventListener('dragover', e => {
            e.preventDefault();
            li.classList.add('dragover');
        });

        li.addEventListener('dragleave', () => {
            li.classList.remove('dragover');
        });

        li.addEventListener('drop', e => {
            e.preventDefault();
            li.classList.remove('dragover');

            const fromIdx = +e.dataTransfer.getData('text/plain');
            const toIdx = +li.dataset.idx;

            if (fromIdx === toIdx) return;

            history();

            // move the rect and alias in state
            const [rect] = state.rects.splice(fromIdx, 1);
            const [alias] = state.aliases.splice(fromIdx, 1);
            state.rects.splice(toIdx, 0, rect);
            state.aliases.splice(toIdx, 0, alias);

            update();
            syncURL();
        });

        legendList.append(li);
    });
}

/* helper ─ toggle .focus on rows */
function highlight(idx){
  legendList.querySelectorAll('.legend-item')
            .forEach(el => el.classList.toggle('focus',
                                 +el.dataset.idx === idx));
}

/* pointer enters a legend row */
legendList.addEventListener('pointerover', e => {
  const row = e.target.closest('.legend-item');
  if (!row || row.contains(e.relatedTarget)) return;    // still inside row
  state.focus = +row.dataset.idx;
  highlight(state.focus);
  repaint();
});

/* pointer leaves that row (to anywhere else) */
legendList.addEventListener('pointerout', e => {
  const row = e.target.closest('.legend-item');
  if (!row || row.contains(e.relatedTarget)) return;    // moved within row
  state.focus = null;
  highlight(-1);                                        // clear all
  repaint();
});