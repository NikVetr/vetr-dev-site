export const norm = ({
    r0,
    c0,
    r1,
    c1
}) => ({
    r0: Math.min(r0, r1),
    c0: Math.min(c0, c1),
    r1: Math.max(r0, r1),
    c1: Math.max(c0, c1)
});

const alpha = n => {           // 0→A, 1→B … 25→Z, 26→AA …
  let s = '';
  do { s = String.fromCharCode(65 + (n % 26)) + s;
       n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
};

export function panelName(state, i) {
  return state.aliases[i] || (state.labelMode === 'alpha' ? alpha(i) : String(i + 1));
}

export const b36 = n => n.toString(36);

export function encodeLayout(state) {
    /* rows.cols|r0c0r1c1;r0c0r1c1;…|alias1,alias2…  (all base-36) */

    const gridPart =
        b36(state.rows) + '.' + b36(state.cols) +
        ( state.aspect ? '.' + b36(Math.round(state.aspect * 1000)) : '' );

    const rects = state.rects
        .map(r => {
            const n = norm(r);
            return b36(n.r0) + b36(n.c0) + b36(n.r1) + b36(n.c1); // 4 chars / rect
        })
        .join(';');

    const aliases = state.aliases
        .map(encodeURIComponent) // protect spaces, commas…
        .join(',');

    return (
        gridPart + '|' +
        rects + '|' +
        aliases // may be empty
    );
}
