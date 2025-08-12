import { legendList }          from './dom.js';
import { state, history }               from './state.js';
import { commitDelete } from './events.js';
import { norm, col, nameOf }   from './helpers.js';
import { syncURL, colorOf }             from './helpers.js';
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
        <div class="swatch" style="background:${colorOf(i)}">${i+1}</div>
        <div class="legend-name">${nameOf(i)}</div>
        <small class="dim">rows&nbsp;${R.r0+1}:${R.r1}, cols&nbsp;${R.c0+1}:${R.c1}</small>
        <button class="del">×</button>`;

        li.querySelector('.del').onclick = () => {
            commitDelete(i, { strategy: 'preserve' });
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
            e.preventDefault();                // must keep default cancelled

            // clear any previous hint classes
            li.classList.remove('dragover-above', 'dragover-below');

            // cursor is past the mid-line ⇒ show the bar *below* the row
            const mid = li.getBoundingClientRect().height / 2;
            const cls = (e.offsetY > mid) ? 'dragover-below' : 'dragover-above';
            li.classList.add(cls);
        });

        const clearHint = el =>
            el.classList.remove('dragover-above','dragover-below');

        li.addEventListener('dragleave', () => {
            clearHint(li);
        });

        li.addEventListener('drop', e => {
            e.preventDefault();          // we handle the drop ourselves

            const fromIdx = +e.dataTransfer.getData('text/plain');   // dragged row
            const rowIdx  = +li.dataset.idx;                         // row under pointer

            /* Decide whether the pointer is in the upper or lower half
            of the hovered row → insert *above* or *below* that row. */
            const pointerBelowMid =
                e.offsetY > li.getBoundingClientRect().height / 2;   // boolean

            /* Calculate final insertion slot (after removing the dragged row)
            If we insert *after* a row that originally sat before us,
            the target index needs to be decremented because the list shrank. */
            let insertAt = rowIdx + (pointerBelowMid ? 1 : 0);
            if (fromIdx < insertAt) insertAt--;

            /* Nothing to do? */
            if (fromIdx === insertAt) {
                clearHint(li);
                return;
            }

            history();

            /* Move rectangle, alias and colour in lock-step ---------------*/
            const [rect]   = state.rects  .splice(fromIdx, 1);
            const [alias]  = state.aliases.splice(fromIdx, 1);
            const [colour] = state.colours.splice(fromIdx, 1);

            state.rects  .splice(insertAt, 0, rect);
            state.aliases.splice(insertAt, 0, alias);
            state.colours.splice(insertAt, 0, colour);

            clearHint(li);      // remove the visual bar
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
