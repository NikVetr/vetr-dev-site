/* ---------- simple tooltip engine ---------------------------------- */
const tip = Object.assign(document.createElement('div'), {
    className: 'tooltip'
});
document.body.append(tip);

let timer = null;

function show(el) {
    tip.textContent = el.dataset.tip;
    tip.style.opacity = '1';

    const r = el.getBoundingClientRect(),
        pad = 8, // gap below the element
        x = Math.min(r.left, window.innerWidth - tip.offsetWidth - pad),
        y = Math.min(r.bottom + pad, window.innerHeight - tip.offsetHeight - pad);

    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
}

function hide() {
    tip.style.opacity = '0';
}

document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    timer = setTimeout(() => show(el), 1000); // 350 ms hover delay
});

document.addEventListener('mouseout', e => {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
    hide();
});

