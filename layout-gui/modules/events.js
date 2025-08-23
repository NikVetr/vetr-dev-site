/* events.js (no exports – listeners only) --------------------------- */

import {
    canvas,
    legendList,
    copyBtn,
    trimBtn,
    reduceBtn,
    expandBtn,
    clearBtn,
    undoBtn,
    redoBtn,
    exportBtn,
    importBtn,
    fillBtn,
    darkEl,
    rowsEl,
    colsEl,
    squareEl,
    showIdxEl,
    showGridEl,
    renderRadios,
    rcodeEl,
    aspectEl,
    labelSwitch,
    helpBtn,
    helpModal,
    helpClose,
    helpBackdrop,
    helpContent

} from './dom.js';

import {
    state,
    history,
    applySnap,
    PALETTE
} from './state.js';

import {
    nameOf,
    clamp,
    gcd,
    snap,
    norm,
    ok,
    rectBox,
    col,
    opp,
    syncURL,
    cell,
    cellAtPx,
    moveRect,
    deleteRectInPlace,
    expandRect,
    contractRect,
    growAllSidesOnce,
    shrinkTowardCellOnce,
    shrinkTargetCellForKeyboard,
    expandRectToLimit,
    planShiftResizeComposite,
    expandAllSidesWithPushStep,
    shrinkTowardCellWithPullStep,
    updateMods,
    planPwrMoveStep,
    pushChain, pullChain,
    buildOccupancy, hasEmptyCell, adjacentEmptyAtSide, shuffledSides,
    registerPwrButton, toggleLatch, clearPhysicalMods,
    nearestSidePx, growAxisSymOnce, shrinkAxisSymOnce,
    resolveTinyOverlaps
} from './helpers.js';

import {
    repaint,
    grid,
    drawRects,
    drawPreview,
    drawLiveTransform,
    indices
} from './canvas.js';

import {
    generateCode,
    renderer
} from './code-generator.js';

import {
    update,
    resizeCanvas,
    pos,
    hit,
    cursor,
    maxDelta,
    edgeKind
} from './controls.js';

function flashCopied() {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = 'Copy';
    }, 900);
}

export function commitDelete(idx, {
    strategy = 'preserve'
} = {}) {
    if (idx < 0 || idx >= state.rects.length) return;

    const prevSticky = state.stickyFocus; // keep for index adjustment
    history();
    deleteRectInPlace(idx);

    if (strategy === 'retarget') {
        if (state.rects.length) {
            // compute new index from the *previous* sticky target
            let newIdx = prevSticky;
            if (newIdx == null) {
                // fallback: target the same slot that was deleted
                newIdx = idx;
            } else if (idx < newIdx) {
                // array shifted left for items after the deleted one
                newIdx -= 1;
            }
            state.stickyFocus = Math.min(newIdx, state.rects.length - 1);
            state.focusSource = 'canvas';
        } else {
            state.stickyFocus = null;
            state.focusSource = null;
        }
    } else if (strategy === 'preserve') {
        if (prevSticky == null) {
            state.stickyFocus = null;
            state.focusSource = null;
        } else if (prevSticky === idx) {
            // you deleted the focused rect via × → clear focus
            state.stickyFocus = null;
            state.focusSource = null;
        } else {
            // preserve the *same rectangle* identity if it was after the removed slot
            state.stickyFocus = prevSticky + (idx < prevSticky ? -1 : 0);
            state.focusSource = 'canvas';
        }
    } else { // 'clear'
        state.stickyFocus = null;
        state.focusSource = null;
    }

    update(); // rebuild legend + repaint
    syncURL(); // debounced
}

legendList.addEventListener('dblclick', e => {
    const item = e.target.closest('.legend-item');
    if (!item) return;
    const idx = +item.dataset.idx;
    const current = state.aliases[idx] || '';
    const name = prompt('Rectangle name:', current);
    if (name === null) return; // cancelled
    history();
    state.aliases[idx] = name.trim();
    update();
    syncURL();
});

canvas.addEventListener('mousemove', e => {
    if (state.modalOpen) return;
    state.cursorPos = pos(e);
    const {
        x,
        y
    } = state.cursorPos;

    if (state.mode === 'drawing') {
        state.start.end = snap(x, y);
        repaint();
        return;
    }
    if (state.mode === 'moving' || state.mode === 'resizing') {
        repaint();
        return;
    }

    /* idle hover */
    state.hover = hit(x, y);
    state.prevFocus = state.focus;
    state.focus = state.hover ? state.hover.idx : null;
    cursor();

    /* update legend highlight */
    if (state.focus !== state.prevFocus) {
        const oldEl = legendList.querySelector('.legend-item.focus');
        if (oldEl) oldEl.classList.remove('focus');

        if (state.focus != null) {
            legendList
                .querySelector(`.legend-item[data-idx="${state.focus}"]`)
                ?.classList.add('focus');
        }
    }

    repaint();
});

canvas.addEventListener('mouseleave', () => {
    state.focus = null;
    const oldEl = legendList.querySelector('.legend-item.focus');
    if (oldEl) oldEl.classList.remove('focus');
    repaint(); // remove the tint, too
});

canvas.addEventListener('dblclick', e => {
    const {
        x,
        y
    } = pos(e);
    const hv = hit(x, y);

    // 1) dbl-click ON an existing rect → rename (unchanged)
    if (hv && hv.kind === 'inside') {
        const idx = hv.idx;
        const current = state.aliases[idx] || '';
        const name = prompt('Rectangle name:', current);
        if (name == null) return;
        history();
        state.aliases[idx] = name.trim();
        update();
        syncURL();
        return;
    }

    // 2) dbl-click NOT on a rect → create a 1×1 rect at the cell under the pointer
    const {
        r,
        c
    } = cellAtPx(x, y);
    const R = norm({
        r0: r,
        c0: c,
        r1: r + 1,
        c1: c + 1
    });

    if (!ok(R)) return;

    history();
    state.rects.push(R);
    state.aliases.push('');
    const colour = state.pool.shift() ?? `hsl(${Math.random()*360} 70% 75%)`;
    state.colours.push(colour);

    // focus the freshly created rectangle (so the wheel works immediately)
    const newIdx = state.rects.length - 1;
    state.focus = newIdx; // used by wheel listener + canvas tint
    if (state.pwrActive) {
        expandRectToLimit(newIdx, { recordHistory: false });
    }

    // make hover consistent with focus
    state.hover = {
        kind: 'inside',
        idx: newIdx
    };

    update();
    
    // legend row to show the .focus style immediately:
    requestAnimationFrame(() => {
        legendList.querySelector(`.legend-item[data-idx="${newIdx}"]`)
            ?.classList.add('focus');
    });
});

// Helper function to toggle sticky focus... can maybe move into helpers later
function toggleStickyFocus(hv) {
    if (hv && state.mode === 'idle') {
        if (state.stickyFocus === null) {
            state.stickyFocus = hv.idx; // Set sticky focus
        } else if (state.stickyFocus === hv.idx) {
            state.stickyFocus = null; // Remove sticky focus
        } else {
            state.stickyFocus = hv.idx; // Switch focus to the new rectangle
        }
    } else if (!hv && state.stickyFocus !== null) {
        state.stickyFocus = null; // Remove sticky focus if clicked outside
    }
}

canvas.addEventListener('mousedown', e => {
    if (state.modalOpen) return;
    const {
        x,
        y
    } = pos(e), hv = hit(x, y);

    if (hv && hv.kind === 'delete') {
        commitDelete(hv.idx, {
            strategy: 'preserve'
        });
        return;
    }

    if (hv) {
        state.active = hv.idx;
        state.base = norm(state.rects[hv.idx]);
        if (hv.kind === 'inside') {
            if (state.modActive) {
                // CLONE mode
                state.mode       = 'cloning';
                state.cloneFrom  = hv.idx;
                state.cloneBase  = norm(state.rects[hv.idx]);
                state.grabPx     = pos(e);
                state.grab       = snap(...Object.values(state.grabPx));
            } else {
                state.mode = 'moving';
                state.grabPx = pos(e);
                state.base   = norm(state.rects[hv.idx]);
                state.baseAll = state.pwrActive ? state.rects.map(norm) : null;
            }
        } else {
            state.mode = 'resizing';
            state.resize = hv.kind;
            state.baseAll = state.pwrActive ? state.rects.map(r => norm(r)) : null;
        }
    } else {
        state.mode = 'drawing';
        state.start = {
            begin: snap(x, y),
            end: null
        };
    }
});

window.addEventListener('mouseup', e => {
    if (state.modalOpen) return;
    const {
        x,
        y
    } = pos(e);
    const hv = hit(x, y); // Check if the mouse is inside a rectangle
    let moved = false; // Track if a move or resize has happened

    if (state.mode === 'drawing') {

        //first clear stickyfocus
        state.stickyFocus = null
        repaint();

        const a = state.start.begin,
            b = snap(...Object.values(pos(e)));
        const R = norm({
            r0: a.r,
            c0: a.c,
            r1: b.r,
            c1: b.c
        });
        state.mode = 'idle';
        state.start = null;
        if (ok(R)) {
            history();
            state.rects.push(R);
            state.aliases.push('');
            const colour = state.pool.shift() ?? `hsl(${Math.random()*360} 70% 75%)`; // emergency new colour
            state.colours.push(colour);
        }
        update();
        syncURL();
        return;
    }

    if (state.mode === 'moving') {
        const { x, y }   = pos(e);
        const { x: gx, y: gy } = state.grabPx;
        const { w, h }   = cell();

        const dR = Math.round((y - gy) / h);
        const dC = Math.round((x - gx) / w);

        if (state.pwrActive) {
            // power commit
            let remR = Math.abs(dR), remC = Math.abs(dC);
            const sR = Math.sign(dR), sC = Math.sign(dC);

            const diagonalGesture = (remR > 0 && remC > 0);
            const allowSinglePull = !diagonalGesture;

            let rects = (state.baseAll ?? state.rects).map(r => ({ ...r }));
            let moved = false;

            while ((remR > 0 || remC > 0)) {
            const stepDr = remR > 0 ? sR : 0;
            const stepDc = remC > 0 ? sC : 0;

            const before = rects[state.active];
            const res = planPwrMoveStep(rects, state.active, stepDr, stepDc, state.rows, state.cols, { allowSinglePull });
            if (!res.ok) break;

            const after = res.rects[state.active];
            rects = res.rects;

            const movedR = (after.r0 !== before.r0) || (after.r1 !== before.r1);
            const movedC = (after.c0 !== before.c0) || (after.c1 !== before.c1);

            if (movedR) remR--;
            if (movedC) remC--;

            if (movedR || movedC) {
                moved = true;
            } else {
                break;
            }
            }


            state.mode = 'idle';
            state.baseAll = null;
            state.base = null;

            if (moved) {
                history();
                state.rects = rects;
                if (state.active !== state.stickyFocus) {
                    state.stickyFocus = null;
                    repaint();
                }
                update();
                syncURL();
            } else {
                toggleStickyFocus(hv);
                repaint();
                update();
            }
            return;

        } else {
            //regular moving
            const {
                dr,
                dc
            } = maxDelta(state.active, dR, dC);
            const R = state.base;
            const movedRect = {
                r0: R.r0 + dr,
                c0: R.c0 + dc,
                r1: R.r1 + dr,
                c1: R.c1 + dc
            };
            if (dr || dc) {
                history();
                state.rects[state.active] = movedRect;
                if (state.active !== state.stickyFocus) {
                    state.stickyFocus = null;
                    repaint();
                }
                moved = true; // Track that the rectangle has moved
            }
            state.mode = 'idle';
            update();
            syncURL();

        }
    }

    if (state.mode === 'cloning') {
        // Safety 
        const srcIdx = state.cloneFrom;
        const src0   = state.cloneBase ?? state.rects[srcIdx];
        if (srcIdx == null || !src0) {
            state.mode = 'idle';
            state.cloneFrom = state.cloneBase = null;
            update();
            return;
        }
        const src = norm(src0);

        // Pixel-based deltas (same feel as move/power-move) 
        const { x, y }       = pos(e);
        const { x: gx, y: gy } = state.grabPx;      // set when clone starts
        const { w, h }       = cell();
        const dR = Math.round((y - gy) / h);
        const dC = Math.round((x - gx) / w);

        // Shared helpers 
        const overlaps = (A, B) =>
            !(A.r1 <= B.r0 || A.r0 >= B.r1 || A.c1 <= B.c0 || A.c0 >= B.c1);

        const inBounds = (R) =>
            R.r0 >= 0 && R.c0 >= 0 && R.r1 <= state.rows && R.c1 <= state.cols;

        const clampInside = (R) => {
            const hh = R.r1 - R.r0, ww = R.c1 - R.c0;
            R.r0 = clamp(R.r0, 0, state.rows - hh);
            R.c0 = clamp(R.c0, 0, state.cols - ww);
            R.r1 = R.r0 + hh;
            R.c1 = R.c0 + ww;
            return R;
        };

        let committed = false;

        if (state.pwrActive) {
            // POWER CLONE: simulate push/pull like power-move
            // Build sim world WITHOUT the source (so it never gets pushed)
            let sim = state.rects.map(norm);
            sim.splice(srcIdx, 1);

            // Insert the clone at the source’s pose as the last element
            let kClone = sim.length;
            sim.push({ ...src });

            let remR = Math.abs(dR), remC = Math.abs(dC);
            const sR = Math.sign(dR), sC = Math.sign(dC);
            const diagonalGesture = (remR > 0 && remC > 0);
            const allowSinglePull = !diagonalGesture;

            let movedAny = false;
            while (remR > 0 || remC > 0) {
            const stepDr = remR > 0 ? sR : 0;
            const stepDc = remC > 0 ? sC : 0;

            const before = sim[kClone];
            const res = planPwrMoveStep(sim, kClone, stepDr, stepDc, state.rows, state.cols, { allowSinglePull, pullTrailing: false });
            if (!res.ok) break;

            const after = res.rects[kClone];
            sim = res.rects;

            const movedR = (after.r0 !== before.r0) || (after.r1 !== before.r1);
            const movedC = (after.c0 !== before.c0) || (after.c1 !== before.c1);
            if (movedR) remR--;
            if (movedC) remC--;
            if (movedR || movedC) movedAny = true;
            else break;
            }

            if (movedAny) {
            const finalClone = sim[kClone];

            // Disallow landing overlapping the original
            if (!overlaps(finalClone, src)) {
                history();

                // Reinsert untouched source at its original index, append clone
                const finalRects = sim.slice();
                finalRects.splice(srcIdx, 0, src); // put source back
                state.rects = finalRects;

                // New color + empty alias
                state.aliases.push('');
                const colour = state.pool.shift() ?? `hsl(${Math.random()*360} 70% 75%)`;
                state.colours.push(colour);

                committed = true;
            }
            }
        } else {
            // BASE CLONE: pixel-rounded, clamped, no overlaps
            let clone = norm({
            r0: src.r0 + dR, c0: src.c0 + dC,
            r1: src.r1 + dR, c1: src.c1 + dC
            });
            clone = clampInside(clone);

            const fits = inBounds(clone) && state.rects.every(R =>
            clone.r1 <= R.r0 || clone.r0 >= R.r1 ||
            clone.c1 <= R.c0 || clone.c0 >= R.c1
            );

            if (fits) {
            history();
            state.rects.push(clone);
            state.aliases.push('');
            const colour = state.pool.shift() ?? `hsl(${Math.random()*360} 70% 75%)`;
            state.colours.push(colour);
            committed = true;
            }
        }

        // Exit clone mode (common)
        state.mode = 'idle';
        state.cloneFrom = null;
        state.cloneBase = null;

        if (committed) { update(); syncURL(); }
        else { repaint(); } // clear ghost overlay
        return;
        }


    if (state.mode === 'resizing') {
        const v = snap(...Object.values(pos(e)));

        if (state.pwrActive) {
            const baseRects = state.rects.map(r => norm(r));
            const {
                ok: valid,
                rects: planned
            } =
            planShiftResizeComposite(baseRects, state.active, state.resize, v, state.rows, state.cols);

            state.mode = 'idle';
            state.baseAll = null;
            state.base = null;

            if (valid) {
                history();
                state.rects = planned;
                if (state.active !== state.stickyFocus) {
                    state.stickyFocus = null;
                    repaint();
                }
                moved = true;
            }
            update();
            syncURL();
        } else {
            let R = {
                ...state.base
            };
            const k = state.resize;
            if (/N/.test(k)) R.r0 = clamp(v.r, 0, R.r1 - 1);
            if (/S/.test(k)) R.r1 = clamp(v.r, R.r0 + 1, state.rows);
            if (/W/.test(k)) R.c0 = clamp(v.c, 0, R.c1 - 1);
            if (/E/.test(k)) R.c1 = clamp(v.c, R.c0 + 1, state.cols);
            R = norm(R);
            if (ok(R, state.active)) {
                history();
                state.rects[state.active] = R;
                if (state.active !== state.stickyFocus) {
                    state.stickyFocus = null;
                    repaint();
                }
                moved = true; // Track that the rectangle has moved
            }
            state.mode = 'idle';
            update();
            syncURL();
        }


    }

    if (!moved) {
        toggleStickyFocus(hv); // Call the dedicated function to toggle sticky focus
        repaint(); // Redraw the canvas with updated focus
    }

});

function wheelDir(e) {
  let sign = Math.sign(e.deltaY || 0);
  if (sign === 0) {
    if ('wheelDelta' in e)       sign = -Math.sign(e.wheelDelta);
    else if ('detail' in e)      sign =  Math.sign(e.detail);
    else if (e.deltaY === 0 && 1/e.deltaY === -Infinity) sign = -1; // -0 edge-case
  }
  return sign;                           // -1 = "up/expand", +1 = "down/shrink"
}

canvas.addEventListener('wheel', (e) => {
    if (state.mode !== 'idle') return;
    e.preventDefault();

    // identify focused state
    const idx = state.focus;
    if (idx == null) return;

    const {x, y} = pos(e);
    const {r: tr, c: tc} = cellAtPx(x, y);
    const R = norm(state.rects[idx]);
    const dir = wheelDir(e); // -1 (up), +1 (down), 0 (none), with -0 handled
    //console.log('wheel:', { idx, sticky: state.stickyFocus, hover: state.focus, shiftKey: e.shiftKey, deltaY: e.deltaY, dir });

    let changed = false;
    const hoverKind = edgeKind(x, y, R, 10); // 'edgeN'|'edgeS'|'edgeW'|'edgeE'|'cornerNE'... or null
    const wantDirectional = state.modActive || !!hoverKind;

    //directional expansion
    if (wantDirectional) {
        e.preventDefault();

        // Helpers
        const sideFromKind = k => k ? k.slice(4) : null;             // 'edgeN' -> 'N'
        const cornerFromKind = k => k ? k.slice(6) : null;           // 'cornerNE' -> 'NE'
        const oppSide = s => ({N:'S',S:'N',W:'E',E:'W'})[s];
        const oppCorner = cr => ({NW:'SE', NE:'SW', SW:'NE', SE:'NW'})[cr];

        // Decide anchor (where the cursor is): edge/corner if present, otherwise nearest side by pixels
        const anchorCorner = hoverKind?.startsWith('corner') ? cornerFromKind(hoverKind) : null;
        const anchorSide   = hoverKind?.startsWith('edge')
                            ? sideFromKind(hoverKind)
                            : (!anchorCorner ? nearestSidePx(R, x, y) : null);

        let changedLocal = false;

        if (anchorCorner) {
            const oppCorner = cr => ({NW:'SE', NE:'SW', SW:'NE', SE:'NW'})[cr];
            const opC = oppCorner(anchorCorner);       // e.g. NW → SE
            const sidesFor = { SE:['S','E'], SW:['S','W'], NE:['N','E'], NW:['N','W'] }[opC];

            const sideKind = s => (s==='E'?'edgeE':s==='W'?'edgeW':s==='S'?'edgeS':'edgeN');

            // one-cell targets for a single side
            const outwardFor = (R, side) =>
                side === 'E' ? { r:R.r1,     c:R.c1+1 } :
                side === 'W' ? { r:R.r0,     c:R.c0-1 } :
                side === 'S' ? { r:R.r1+1,   c:R.c1   } :
                            { r:R.r0-1,   c:R.c0   }; // 'N'
            const inwardFor = (R, side) =>
                side === 'E' ? { r:R.r1,     c:R.c1-1 } :
                side === 'W' ? { r:R.r0,     c:R.c0+1 } :
                side === 'S' ? { r:R.r1-1,   c:R.c1   } :
                            { r:R.r0+1,   c:R.c0   }; // 'N'

            let changedLocal = false;

            if (state.pwrActive) {
                // Try both axes independently (so one can move even if the other can't)
                let plan = state.rects.map(norm);
                const before = plan[idx];

                for (const side of sidesFor) {
                const kind = sideKind(side);
                const aim  = (dir < 0) ? outwardFor(before, side)
                            : (dir > 0) ? inwardFor(before, side)
                            : null;
                if (!aim) continue;

                const res = planShiftResizeComposite(plan, idx, kind, aim, state.rows, state.cols);
                if (res.ok) {
                    // Did the active rect actually change?
                    const A = res.rects[idx];
                    if (A.r0!==plan[idx].r0 || A.c0!==plan[idx].c0 || A.r1!==plan[idx].r1 || A.c1!==plan[idx].c1) {
                    plan = res.rects;
                    changedLocal = true;
                    }
                }
                }

                if (changedLocal) { state.rects = plan; history(); update(); syncURL(); }
                return;
            } else {
                // Non-power: already independent single-axis ticks
                let changed = false;
                if (dir < 0) { // grow
                for (const s of sidesFor) changed = expandRect(idx, s) || changed;
                } else if (dir > 0) { // shrink
                for (const s of sidesFor) changed = contractRect(idx, s) || changed;
                }
                if (changed) { history(); update(); syncURL(); }
                return;
            }
        } else if (anchorSide) {
            // ----- Edge anchor → operate on the OPPOSITE side (single axis) -----
            const sideOpp = oppSide(anchorSide);

            if (state.pwrActive) {
                // one-cell composite edge-resize toward/away from sideOpp
                const kind =
                sideOpp === 'E' ? 'edgeE' :
                sideOpp === 'W' ? 'edgeW' :
                sideOpp === 'S' ? 'edgeS' : 'edgeN';

                const outwardTarget =
                sideOpp === 'E' ? { r: R.r1,     c: R.c1 + 1 } :
                sideOpp === 'W' ? { r: R.r0,     c: R.c0 - 1 } :
                sideOpp === 'S' ? { r: R.r1 + 1, c: R.c1     } :
                                    { r: R.r0 - 1, c: R.c0     }; // 'N'

                const inwardTarget =
                sideOpp === 'E' ? { r: R.r1,     c: R.c1 - 1 } :
                sideOpp === 'W' ? { r: R.r0,     c: R.c0 + 1 } :
                sideOpp === 'S' ? { r: R.r1 - 1, c: R.c1     } :
                                    { r: R.r0 + 1, c: R.c0     }; // 'N'

                const base = state.rects.map(norm);
                const aim  = (dir < 0) ? outwardTarget : (dir > 0) ? inwardTarget : null;
                if (aim) {
                const res = planShiftResizeComposite(base, idx, kind, aim, state.rows, state.cols);
                if (res.ok) { state.rects = res.rects; changedLocal = true; }
                }
            } else {
                // Non-power: single-axis tick on the opposite side
                if (dir < 0)      changedLocal = expandRect(idx, sideOpp);
                else if (dir > 0) changedLocal = contractRect(idx, sideOpp);
            }
        }

        if (changedLocal) { history(); update(); syncURL(); }
        return; // handled directionally
    }


    if (state.pwrActive) {
        // neighbor-aware chain logic
        if (dir < 0) {
            // expand outward one tick on all sides (push neighbors)
            const res = expandAllSidesWithPushStep(state.rects, idx, state.rows, state.cols);
            if (res.changed) {
                history();
                state.rects = res.rects;
                changed = true;
                // console.log('pushStep changed');
            }
        } else if (dir > 0) {
            // shrink one tick toward hovered cell (pull neighbors)
            const res = shrinkTowardCellWithPullStep(state.rects, idx, tr, tc, state.rows, state.cols);
            if (res.changed) {
                history();
                state.rects = res.rects;
                changed = true;
                // console.log('pullStep changed', { tr, tc });
            }
        }
    } else {
        // --- No alt mode: original solo-rect behavior
        const R = norm(state.rects[idx]);
        let next = null;

        if (dir > 0) {
            next = shrinkTowardCellOnce(R, tr, tc);
        } else if (dir < 0) {
            next = growAllSidesOnce(R, idx);
        }

        if (next) {
            history();
            state.rects[idx] = next;
            changed = true;
        }
    }

    if (changed) {
        update();
        syncURL();
    }
}, {
    passive: false
});


aspectEl.oninput = () => { // empty = auto
    const v = parseFloat(aspectEl.value);
    state.aspect = isFinite(v) ? Math.max(0.2, v) : null;
    if (state.square && state.aspect) { // force off – can’t mix
        squareEl.checked = state.square = false;
    }
    resizeCanvas();
    syncURL();
};

copyBtn.onclick = () => {
    /* works for <textarea>, <pre>, <code>, … */
    const code =
        'value' in rcodeEl && rcodeEl.value !== undefined ?
        rcodeEl.value :
        rcodeEl.textContent;

    /* 1 – modern Clipboard API (needs https or localhost) */
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
            .writeText(code)
            .then(flashCopied)
            .catch(fallbackCopy); // e.g. insecure context
        return;
    }

    /* 2 – fallback for file://, plain http, old browsers */
    fallbackCopy();

    function fallbackCopy() {
        const ta = document.createElement('textarea');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        try {
            if (document.execCommand('copy')) flashCopied();
            else alert('Copy failed – please copy manually.');
        } finally {
            document.body.removeChild(ta);
        }
    }
};

trimBtn.onclick = () => {
    if (!state.rects.length) return; // nothing to trim

    /* 1 ── find global bounding box of all rectangles */
    let minR = Infinity,
        minC = Infinity,
        maxR = -Infinity,
        maxC = -Infinity;

    state.rects.forEach(r0 => {
        const r = norm(r0);
        if (r.r0 < minR) minR = r.r0;
        if (r.c0 < minC) minC = r.c0;
        if (r.r1 > maxR) maxR = r.r1;
        if (r.c1 > maxC) maxC = r.c1;
    });

    /* nothing to trim if bounding box already touches (0,0) and full dims */
    if (minR === 0 && minC === 0 &&
        maxR === state.rows && maxC === state.cols) return;

    history(); // enable undo

    /* 2 ── shift every rectangle so (minR,minC) becomes (0,0) */
    state.rects = state.rects.map(r0 => {
        const r = norm(r0);
        return {
            r0: r.r0 - minR,
            c0: r.c0 - minC,
            r1: r.r1 - minR,
            c1: r.c1 - minC
        };
    });

    /* 3 ── shrink the grid to the bounding-box size */
    const newRows = maxR - minR;
    const newCols = maxC - minC;
    state.rows = newRows;
    state.cols = newCols;
    rowsEl.value = newRows;
    colsEl.value = newCols;

    update();
    syncURL(); // repaint, legend, R code
};

reduceBtn.onclick = () => {
  const allowPower = !!state.pwrActive;

  // ---------- Normal reduce (unchanged) ----------
  const normalReduce = () => {
    if (!state.rects.length) {
      const f = gcd(state.rows, state.cols);
      if (f === 1) return;
      history();
      state.rows /= f;
      state.cols /= f;
      rowsEl.value = state.rows;
      colsEl.value = state.cols;
      update();
      syncURL();
      return;
    }

    const rSet = new Set([0, state.rows]);
    const cSet = new Set([0, state.cols]);
    state.rects.forEach(r0 => {
      const r = norm(r0);
      rSet.add(r.r0); rSet.add(r.r1);
      cSet.add(r.c0); cSet.add(r.c1);
    });

    const rFactor = [...rSet].reduce((g, v) => gcd(g, v));
    const cFactor = [...cSet].reduce((g, v) => gcd(g, v));

    if (rFactor === 1 && cFactor === 1) return;

    history();
    state.rects = state.rects.map(r0 => {
      const r = norm(r0);
      return { r0: r.r0 / rFactor, c0: r.c0 / cFactor, r1: r.r1 / rFactor, c1: r.c1 / cFactor };
    });
    state.rows = Math.round(state.rows / rFactor);
    state.cols = Math.round(state.cols / cFactor);
    rowsEl.value = state.rows;
    colsEl.value = state.cols;

    update();
    syncURL();
  };

  // ---------- Power reduce  ----------
  const powerReduce = (tol = 0.4) => {
    // Helper: divisors of n, >1, sorted desc
    const divisorsDesc = (n) => {
      const out = new Set();
      for (let d = 2; d * d <= n; d++) {
        if (n % d === 0) { out.add(d); out.add(Math.floor(n / d)); }
      }
      out.add(n); // include n itself
      return [...out].sort((a, b) => b - a);
    };

    // Pairwise non-overlap test
    const nonOverlapAll = (arr) => {
      for (let i = 0; i < arr.length; i++) {
        const A = arr[i];
        for (let j = i + 1; j < arr.length; j++) {
          const B = arr[j];
          const sep = (A.r1 <= B.r0) || (A.r0 >= B.r1) || (A.c1 <= B.c0) || (A.c0 >= B.c1);
          if (!sep) return false;
        }
      }
      return true;
    };

    // Snap a single value to nearest multiple of s
    const snapMult = (v, s) => Math.round(v / s) * s;

    // Try a candidate step s on both axes simultaneously
    const tryStep = (s) => {
        if ((state.rows % s) !== 0 || (state.cols % s) !== 0) return null;

        const snapped = [];
        for (const r0 of state.rects) {
            const r = norm(r0);
            const h = r.r1 - r.r0;
            const w = r.c1 - r.c0;

            const tolR = Math.floor(h * tol);
            const tolC = Math.floor(w * tol);

            let r0n = snapMult(r.r0, s);
            let r1n = snapMult(r.r1, s);
            let c0n = snapMult(r.c0, s);
            let c1n = snapMult(r.c1, s);

            // per-edge movement limits vs. ORIGINAL (pre-resolve) pose
            if (Math.abs(r0n - r.r0) > tolR) return null;
            if (Math.abs(r1n - r.r1) > tolR) return null;
            if (Math.abs(c0n - r.c0) > tolC) return null;
            if (Math.abs(c1n - r.c1) > tolC) return null;

            if ((r1n - r0n) < s || (c1n - c0n) < s) return null;

            // clamp to grid
            r0n = Math.max(0, Math.min(state.rows - s, r0n));
            c0n = Math.max(0, Math.min(state.cols - s, c0n));
            r1n = Math.min(state.rows, Math.max(s, r1n));
            c1n = Math.min(state.cols, Math.max(s, c1n));

            snapped.push({ r0: r0n, c0: c0n, r1: r1n, c1: c1n });
        }

        // If snapping created tiny overlaps, try to resolve them *within the same tol*
        let snappedOut = snapped;
        const originals = state.rects.map(norm);
        const nonOverlapAll = (arr) => {
            for (let i = 0; i < arr.length; i++) {
            const A = arr[i];
            for (let j = i+1; j < arr.length; j++) {
                const B = arr[j];
                const sep = (A.r1 <= B.r0) || (A.r0 >= B.r1) || (A.c1 <= B.c0) || (A.c0 >= B.c1);
                if (!sep) return false;
            }
            }
            return true;
        };

        if (!nonOverlapAll(snappedOut)) {
            const resolved = resolveTinyOverlaps(snappedOut, originals, state.rows, state.cols, tol);
            if (!resolved.ok) return null;
            snappedOut = resolved.rects;
            if (!nonOverlapAll(snappedOut)) return null; // belt-and-braces
        }

        // Success → divide by s
        const reduced = snappedOut.map(R => ({
            r0: R.r0 / s, c0: R.c0 / s, r1: R.r1 / s, c1: R.c1 / s
        }));
        return {
            rows: Math.round(state.rows / s),
            cols: Math.round(state.cols / s),
            rects: reduced,
        };
        };

    // Try from coarsest lattice down
    const g = gcd(state.rows, state.cols);
    const cand = divisorsDesc(g); // largest first
    for (const s of cand) {
      const res = tryStep(s);
      if (res) {
        history();
        state.rows = res.rows;
        state.cols = res.cols;
        rowsEl.value = state.rows;
        colsEl.value = state.cols;
        state.rects = res.rects;
        update();
        syncURL();
        return true;
      }
    }
    return false;
  };

  // Route
  if (allowPower) {
    if (!powerReduce(0.4)) {
      // If no candidate worked within tolerance, do nothing (or fall back):
      // normalReduce();
    }
  } else {
    normalReduce();
  }
};


/* ---------- EXPAND  ––  double everything -------------------------------- */
expandBtn.onclick = () => {
    /* 0 ── sanity: nothing to do if grid would grow beyond some huge limit   */
    const MAX = 10_000; // arbitrary safety cap
    if (state.rows * 2 > MAX || state.cols * 2 > MAX) return;

    history(); // enable Undo

    /* scale the grid itself  */
    state.rows *= 2;
    state.cols *= 2;
    rowsEl.value = state.rows;
    colsEl.value = state.cols;

    /* scale every rectangle  */
    state.rects = state.rects.map(r0 => {
        const r = norm(r0); // be safe
        return {
            r0: r.r0 * 2,
            c0: r.c0 * 2,
            r1: r.r1 * 2,
            c1: r.c1 * 2
        };
    });
    /*  refresh everything */
    update();
    syncURL();
};

/* ---------- FILL  ––  expand rectangles into empty space ----------------- */
fillBtn.onclick = (e) => {
  if (!state.rects.length) return;

  const allowPower = !!state.pwrActive;
  history();                     // one undo frame for the whole fill
  let changed = false;

  // -------- Pass 1: normal (non-power) expansion until stable -------------
  // We try to grow each rect from randomized sides; repeat until no growth.
  const MAX_PASSES = state.rows + state.cols + state.rects.length * 4; // safety
  let pass = 0, grew = true;

  while (grew && pass < MAX_PASSES) {
    grew = false;
    pass++;

    for (let i = 0; i < state.rects.length; i++) {
      // try sides in random order for fairness
      const sides = shuffledSides();
      for (const side of sides) {
        // expandRect(i, side) should mutate state.rects and return boolean
        if (expandRect(i, side)) {
          grew = true;
          changed = true;
        }
      }
    }
  }

  // -------- Pass 2 (optional): Power Fill to reach trapped pockets ---------
  if (allowPower) {
    let occ = buildOccupancy(state.rects, state.rows, state.cols);
    let guard = 0;

    while (hasEmptyCell(occ) && guard < MAX_PASSES * 2) {
      guard++;
      let any = false;

      for (let i = 0; i < state.rects.length; i++) {
        const R = norm(state.rects[i]);

        for (const side of ['N','S','W','E']) {
          if (!adjacentEmptyAtSide(occ, R, side, state.rows, state.cols)) continue;

          // Prepare a single-step power push on that side using the composite planner
          const kind =
            side === 'E' ? 'edgeE' :
            side === 'W' ? 'edgeW' :
            side === 'S' ? 'edgeS' : 'edgeN';

          // target 1 cell outward from the grabbed edge
          const target =
            side === 'E' ? { r: R.r1,   c: R.c1 + 1 } :
            side === 'W' ? { r: R.r0,   c: R.c0 - 1 } :
            side === 'S' ? { r: R.r1 + 1, c: R.c1   } :
                           { r: R.r0 - 1, c: R.c0   }; // 'N'

          const base = state.rects.map(norm);
          const res  = planShiftResizeComposite(base, i, kind, target, state.rows, state.cols);

          if (res.ok) {
            // Did anything actually change?
            let diff = false;
            for (let k = 0; k < base.length; k++) {
              const a = base[k], b = res.rects[k];
              if (!a || !b) continue;
              if (a.r0 !== b.r0 || a.c0 !== b.c0 || a.r1 !== b.r1 || a.c1 !== b.c1) { diff = true; break; }
            }
            if (diff) {
              state.rects = res.rects;
              occ = buildOccupancy(state.rects, state.rows, state.cols);
              any = true;
              changed = true;
            }
          }
        }
      }

      if (!any) break; // no progress this sweep
    }
  }

  if (changed) {
    update();
    syncURL();
  }
};

clearBtn.onclick = () => {
    if (!state.rects.length) return;

    history();
    state.rects.length = 0;
    state.aliases.length = 0;
    state.pool = [...PALETTE];
    state.colours = [];
    state.focus = null;
    state.prevFocus = null;
    update();
    syncURL();
};

undoBtn.onclick = () => {
    if (!state.past.length) return;
    state.future.push(JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases: state.aliases,
        colours: state.colours,
        pool: state.pool
    }));
    applySnap(state.past.pop());
    resizeCanvas();
};

redoBtn.onclick = () => {
    if (!state.future.length) return;
    state.past.push(JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases: state.aliases,
        colours: state.colours,
        pool: state.pool
    }));
    applySnap(state.future.pop());
    resizeCanvas();
};

exportBtn.onclick = () => {
    const blob = new Blob([JSON.stringify({
        rows: state.rows,
        cols: state.cols,
        rects: state.rects,
        aliases: state.aliases,
        colours: state.colours,
        pool: state.pool
    }, null, 2)], {
        type: 'application/json'
    });
    const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob),
        download: 'layout-mat.json'
    });
    a.click();
    URL.revokeObjectURL(a.href);
};

darkEl.onchange = () => {
    document.body.classList.toggle('dark', darkEl.checked);
    repaint(); // grid colour changes
};


importBtn.onclick = () => {
    const inp = Object.assign(document.createElement('input'), {
        type: 'file',
        accept: 'application/json'
    });
    inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        const fr = new FileReader();
        fr.onload = () => {
            try {
                const o = JSON.parse(fr.result);
                if (o.rows && o.cols && Array.isArray(o.rects)) {
                    history();
                    Object.assign(state, {
                        rows: o.rows,
                        cols: o.cols,
                        rects: o.rects.map(norm),
                        colours: o.colours,
                        pool: o.pool,
                        aliases: o.aliases || []
                    });
                    rowsEl.value = o.rows;
                    colsEl.value = o.cols;
                    update();
                    syncURL();
                }
            } catch (_) {}
        };
        fr.readAsText(f);
    };
    inp.click();
};

renderRadios.addEventListener('change', e => {
    if (e.target.name === 'render') {
        renderer.value = e.target.value; // ← .value!
        rcodeEl.value = generateCode(); // live refresh
    }
});

/* mutually-exclusive buttons for code generation */
labelSwitch.addEventListener('click', e => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;

    /* visual state */
    labelSwitch.querySelectorAll('button').forEach(b =>
        b.classList.toggle('active', b === btn));

    /* functional state */
    state.labelMode = btn.dataset.mode; // 'num' | 'alpha'
    update(); // repaint legend + canvas + code
});

/* keyboard shortcuts */

//events for undo / redo
document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey; // Ctrl on Win/Linux, Cmd on macOS
    if (!mod) return;

    if (e.key.toLowerCase() === 'z') {
        e.preventDefault(); // stop the browser’s own undo
        if (e.shiftKey) redoBtn.click();
        else undoBtn.click();
    }
});

document.addEventListener('keydown', (e) => {
  if (state.stickyFocus == null) return;
  if (!state.pwrActive) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
  }
}, true);


document.addEventListener('keydown', e => {

    // nothing to do if no sticky focus AND the key isn't Tab (which can set it)
    const hasFocus = state.stickyFocus !== null;
    // --- Tab / Shift+Tab: cycle sticky focus with rollover
    if (e.key === 'Tab') {
        const n = state.rects.length;
        if (!n) return;
        e.preventDefault();

        if (!hasFocus) {
            state.stickyFocus = e.shiftKey ? (n - 1) : 0;
        } else {
            const delta = e.shiftKey ? -1 : 1;
            state.stickyFocus = (state.stickyFocus + delta + n) % n;
        }
        state.focusSource = 'canvas';
        repaint();
        return;
    }

    if (!hasFocus) return; // from here on we need a sticky focused rect

    const idx = state.stickyFocus;
    const mod = state.modActive;
    const inv = state.invActive;
    const pwr = state.pwrActive;
    let changed = false;

    // --- Cmd/Ctrl + Enter: expand to maximum
    if ((e.key === 'Enter' || e.key === 'NumpadEnter') && mod) {
        e.preventDefault();
        // expand to limit using your existing helper
        changed = expandRectToLimit(idx);
        if (changed) {
            update();
            syncURL();
        }
        return;
    }

    // --- Cmd/Ctrl + '+' / '-' one-tick grow/shrink (wheel semantics)
    if (mod) {
        const isPlus = (e.key === '+' || e.key === '=' || e.key === 'Add' || e.key === '≠');
        const isMinus = (e.key === '-' || e.key === 'Subtract' || e.key === '–');

        if (isPlus || isMinus) {
            e.preventDefault(); // stop browser zoom

            if (pwr) {

                // POWER VARIANTS: push/pull neighbors
                let res;
                if (isPlus) {
                    res = expandAllSidesWithPushStep(state.rects, idx, state.rows, state.cols);
                } else {
                    const {
                        r: tr,
                        c: tc
                    } = shrinkTargetCellForKeyboard(idx);
                    res = shrinkTowardCellWithPullStep(state.rects, idx, tr, tc, state.rows, state.cols);
                }
                if (res.changed) {
                    history();
                    state.rects = res.rects;
                    update();
                    syncURL();
                }

            } else {

                // standard mode: stop at boundaries
                const R = norm(state.rects[idx]);
                let next = null;

                if (isPlus) {
                    next = growAllSidesOnce(R, idx);
                } else { // isMinus
                    const {
                        r: tr,
                        c: tc
                    } = shrinkTargetCellForKeyboard(idx);
                    next = shrinkTowardCellOnce(R, tr, tc);
                }

                if (next) {
                    history();
                    state.rects[idx] = next;
                    update();
                    syncURL();
                }
            }

            return;
        }
    }

    switch (e.key) {

        case 'Delete': case 'Backspace': {
            if (state.stickyFocus == null) return;
            commitDelete(state.stickyFocus, {
                strategy: 'retarget'
            });
            return;
        }

        case 'Escape':
            state.stickyFocus = null;
            repaint();
            return;

        case 'ArrowLeft':
            if (pwr) {
                e.preventDefault();
                if (mod && inv) {
                    const res = pullChain(state.rects, idx, 'E', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else if (mod) {
                    const res = pushChain(state.rects, idx, 'W', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else {
                    const res = planPwrMoveStep(state.rects, idx, 0, -1, state.rows, state.cols);
                    if (res.ok) { state.rects = res.rects; changed = true; }
                }
            } else {
                if (mod && inv) {
                    changed = contractRect(idx, 'E');
                } else if (mod) {
                    changed = expandRect(idx, 'W');
                } else {
                    changed = moveRect(idx, 0, -1);
                }
            }
            break;

        case 'ArrowRight':
            if (pwr) {
                e.preventDefault();
                if (mod && inv) {
                    const res = pullChain(state.rects, idx, 'W', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else if (mod) {
                    const res = pushChain(state.rects, idx, 'E', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else {
                    const res = planPwrMoveStep(state.rects, idx, 0, 1, state.rows, state.cols);
                    if (res.ok) { state.rects = res.rects; changed = true; }
                }
            } else {
                if (mod && inv) {
                    changed = contractRect(idx, 'W');
                } else if (mod) {
                    changed = expandRect(idx, 'E');
                } else {
                    changed = moveRect(idx, 0, 1);
                }
            }
            break;


        case 'ArrowUp':
            if (pwr) {
                e.preventDefault();
                if (mod && inv) {
                    const res = pullChain(state.rects, idx, 'S', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else if (mod) {
                    const res = pushChain(state.rects, idx, 'N', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else {
                    const res = planPwrMoveStep(state.rects, idx, -1, 0, state.rows, state.cols);
                    if (res.ok) { state.rects = res.rects; changed = true; }
                }
            } else {
                if (mod && inv) {
                    changed = contractRect(idx, 'S');
                } else if (mod) {
                    changed = expandRect(idx, 'N');
                } else {
                    changed = moveRect(idx, -1, 0);
                }
            }
            break;

        case 'ArrowDown':
            if (pwr) {
                e.preventDefault();
                if (mod && inv) {
                    const res = pullChain(state.rects, idx, 'N', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else if (mod) {
                    const res = pushChain(state.rects, idx, 'S', 1, state.rows, state.cols);
                    if (res.applied > 0) { state.rects = res.rects; changed = true; }
                } else {
                    const res = planPwrMoveStep(state.rects, idx, 1, 0, state.rows, state.cols);
                    if (res.ok) { state.rects = res.rects; changed = true; }
                }
            } else {
                if (mod && inv) {
                    changed = contractRect(idx, 'N');
                } else if (mod) {
                    changed = expandRect(idx, 'S');
                } else {
                    changed = moveRect(idx, 1, 0);
                }
            }
            break;

        default:
            return; // not a key we handle
    }

    if (changed) {
        e.preventDefault(); // stop page scroll / key repeat side-effects
        history();
        update();
        syncURL();
    }
});

//help information
// Detect platform modifier label
const MOD_LABEL = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

// Build the modal content (HTML) — uses your current behaviors
function renderHelpHTML() {
    return `
  <div class="controls-grid">

    <div class="section section--full help-mods">
    <div class="section-title">
        <h3><strong>Modifier keys</strong></h3>
        <div class="modbar" aria-hidden="true">
        <div class="modchip">mod</div>
        <div class="modchip">pwr</div>
        <div class="modchip">inv</div>
        </div>
    </div>

    <p class="blurb">Three modifiers change how actions behave:</p>

    <div class="line">
        <span class="label"><span class="modchip modchip--roundL">mod</span></span>
        <span class="explain"><b>Cmd/Ctrl</b>. Switches focused <i>movement</i> ↔ <i>resize</i>.</span>
    </div>

    <div class="line">
        <span class="label"><span class="modchip modchip--square">pwr</span></span>
        <span class="explain"><b>Alt/Option</b>. <i>Squish / stretch</i> other rectangles when moving or resizing.</span>
    </div>

    <div class="line">
        <span class="label"><span class="modchip modchip--roundR">inv</span></span>
        <span class="explain"><b>Shift</b>. Inverts direction of resizing (expand → contract; push → pull).</span>
    </div>

    <span class="aside" style="margin-top:1.8rem;">(note: modifiers can also change the function of some buttons)</span>

    <p class="blurb" style="margin-top:0.8rem;">
        To activate, you can <b>hold</b> the keys:
        <span class="demo">
        <span class="modchip modchip--roundL">mod</span>
        <span class="arrow">→</span>
        <span class="modchip modchip--roundL on">mod</span>
        </span>
    </p>

    <p class="blurb" style="margin-top:0.8rem;">
        …or <b>toggle</b> the chips (click them or press <b>M</b>/<b>P</b>/<b>I</b>):
        <span class="demo" style="margin-top:0.5rem;">
        <span class="modchip modchip--roundL">mod</span>
        <span class="arrow">→</span>
        <span class="modchip modchip--roundL latched">mod</span>
        </span>
        <span class="aside">(holding latched modifiers cancels them)</span>
    </p>

    </div>



    
    <div class="section">
    <h3><strong>Canvas</strong> (Left Panel) — Mouse (Default)</h3>
        <div class="row"><span class="chip">Click (rect)</span> <span class="desc">Toggle sticky focus on a rectangle; click empty grid to clear</span></div>
        <div class="row"><span class="chip">Click + drag</span> <span class="desc">Draw new rectangle (empty space) or move (inside rect) or resize (edge/corner)</span></div>
        <div class="row"><span class="chip">Double-click (rect)</span> <span class="desc">Rename rectangle</span></div>
        <div class="row"><span class="chip">Double-click (empty)</span> <span class="desc">Create 1×1 rectangle at cell</span></div>
        <div class="row"><span class="chip">Scroll</span> <span class="desc">On highlighted rect: grow (scroll up) on all sides; shrink (scroll down) toward hovered cell</span></div>
        <div class="row"><span class="chip">× (red)</span> <span class="desc">Delete rectangle</span></div>
    </div>

    <div class="section">
    <h3>
        <strong>Canvas</strong> (Left Panel) — Mouse (
        <span class="kbd" style="text-transform:none;">pwr</span> mode)
    </h3>
        <div class="row"><span class="chip">Drag edge / corner</span> <span class="desc">Alt resize: push/pull other rectangles out of/into the way (up to 1-cell minimum)</span></div>
        <div class="row"><span class="chip">Drag inside rect</span> <span class="desc">Alt move: pushes blockers and pulls attached neighbors when possible</span></div>
        <div class="row"><span class="chip">Scroll</span> <span class="desc">Alt grow/shrink: expand (up) on all sides by pushing neighbors; shrink (down) toward hovered cell by pulling neighbors</span></div>
    </div>


    <div class="section">
      <h3><strong>Canvas</strong> (Left Panel) — Keyboard (Focused)</h3>
      <div class="row"><span class="kbd">Tab</span>/<span class="kbd">Shift</span> + <span class="kbd">Tab</span> <span class="desc">Cycle focused rectangle (rollover)</span></div>
      <div class="row"><span class="kbd">←</span><span class="kbd">→</span><span class="kbd">↑</span><span class="kbd">↓</span> <span class="desc">Move rectangle by 1 cell (blocked by borders/overlap)</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">←/→/↑/↓</span> <span class="desc">Expand 1 cell from that side</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Shift</span> + <span class="kbd">←/→/↑/↓</span> <span class="desc">Contract 1 cell from that side</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Enter</span> <span class="desc">Expand to maximum space</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">+</span> / <span class="kbd">−</span> <span class="desc">Grow/shrink 1 tick (same as scroll)</span></div>
      <div class="row"><span class="kbd">Delete</span> <span class="desc">Delete focused rectangle</span></div>
      <div class="row"><span class="kbd">Esc</span><span class="desc">Clear focus</span></div>
    </div>

    <div class="section">
        <h3><strong>Canvas</strong> (Left Panel) — Keyboard (
            <span class="kbd" style="text-transform:none;">pwr</span> mode + Focused)</h3>
        
        <div class="row"><span class="kbd">←/→/↑/↓</span>
            <span class="desc">Power move: squeezes and stretches neighbors</span></div>

        <div class="row">
            <span class="kbd">${MOD_LABEL}</span> + <span class="kbd">+</span>/<span class="kbd">−</span>
            <span class="desc">Power grow / shrink: squeezes and stretches neighbors </span></div>



        <div class="row">
            <span class="kbd">Ctrl</span> + 
            <span class="kbd">←/→/↑/↓</span>
            <span class="desc">Power expand (push): expand from that side, pushing neighbors (min 1×1)</span>
        </div>

        <div class="row">
            <span class="kbd">Ctrl</span> + 
            <span class="kbd">Shift</span> + 
            <span class="kbd">←/→/↑/↓</span>
            <span class="desc">Power contract (pull): contract from that side, pulling neighbors along</span>
        </div>

        <div class="row">
            <span class="kbd">${MOD_LABEL}</span> + 
            <span class="kbd">+</span>/<span class="kbd">−</span>
            <span class="desc">Power grow/shrink (1 tick): push on grow; pull toward hovered cell on shrink</span>
        </div>

            
    </div>

    <div class="section">
      <h3><strong>Legend</strong> (Middle Panel) </h3>
      <div class="row"><span class="chip">Drag rows</span> <span class="desc">Reorder rectangles (color/name travel with it)</span></div>
      <div class="row"><span class="chip">Hover row</span> <span class="desc">Highlight rectangle in canvas</span></div>
    </div>

    <div class="section">
      <h3>History & Export</h3>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Z</span> <span class="desc">Undo</span></div>
      <div class="row"><span class="kbd">${MOD_LABEL}</span> + <span class="kbd">Shift</span> + <span class="kbd">Z</span> <span class="desc">Redo</span></div>
      <div class="row"><b>Export / Import</b> <span class="desc">JSON snapshot; shareable URL is updated automatically</span></div>
    </div>
  </div>`;
}

// Open/close helpers (with focus trap)
let _helpPrevFocus = null;

function openHelp() {
    helpContent.innerHTML = renderHelpHTML();
    helpModal.classList.remove('hidden');
    helpModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    state.modalOpen = true;
    _helpPrevFocus = document.activeElement;
    helpClose.focus();
}

function closeHelp() {
    helpModal.classList.add('hidden');
    helpModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    state.modalOpen = false;
    if (_helpPrevFocus && _helpPrevFocus instanceof HTMLElement) _helpPrevFocus.focus();
}

// click + keyboard bindings
helpBtn?.addEventListener('click', openHelp);
helpClose?.addEventListener('click', closeHelp);
helpBackdrop?.addEventListener('click', closeHelp);

// ESC closes
document.addEventListener('keydown', (e) => {
    if (helpModal.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        closeHelp();
    }
});

// focus trap inside modal
helpModal.addEventListener('keydown', (e) => {
    if (helpModal.classList.contains('hidden')) return;
    if (e.key !== 'Tab') return;

    const focusables = helpModal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
    }
});

// Optional: keyboard 'H' toggles help
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'h') return;
    // avoid typing in inputs
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (helpModal.classList.contains('hidden')) openHelp();
    else closeHelp();
});

// Fill: show red power hint + different tooltip
registerPwrButton(fillBtn, {
  tipPower:   'Fill negative space — pwr mode will push / pull rectangles.',
  tipDefault: 'Fill negative space — default mode will expand rects until they run into barriers.'
});
registerPwrButton(reduceBtn, {
  tipPower:   'Simplify rectangles onto a coarser grid (≤10% tolerance)',
  tipDefault: 'Downscale grid and rects by an evenly divisble common factor.'
});


// chip clicks → latch/unlatch
document.getElementById('modIndMod')  ?.addEventListener('click', () => toggleLatch('mod'));
document.getElementById('modIndPwr')  ?.addEventListener('click', () => toggleLatch('pwr'));
document.getElementById('modIndShift')?.addEventListener('click', () => toggleLatch('inv'));

// m / p / i toggle (ignore when typing)
const isEditable = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
document.addEventListener('keydown', (e) => {
  if (isEditable(e.target)) return;
  const k = e.key.toLowerCase();
  if (k === 'm') { e.preventDefault(); toggleLatch('mod'); }
  if (k === 'p') { e.preventDefault(); toggleLatch('pwr'); }
  if (k === 'i') { e.preventDefault(); toggleLatch('inv'); }
});

// keep physical flags in sync
document.addEventListener('keydown', updateMods);
document.addEventListener('keyup',   updateMods);

// on blur, clear physical (leave latches)
window.addEventListener('blur', clearPhysicalMods);

// Block context menu only when we intend to clone (or are in cloning)
canvas.addEventListener('contextmenu', (e) => {
  if (state.mode === 'cloning') {
    e.preventDefault();
  }
});
