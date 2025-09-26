/* ---------- simple tooltip engine ---------------------------------- */

// loads tooltips.json and applies attributes to matching elements by id
export const tooltipsReady = (async () => {
  try {
    const res = await fetch('./tooltips.json', { cache: 'no-store' });
    const tips = await res.json();

    Object.entries(tips).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`[tooltips] no element with id="${id}"`);
        return;
      }
      if (typeof val === 'string') {
        // simple case: just a text tooltip
        el.dataset.tip = val;
      } else if (val && typeof val === 'object') {
        // future-friendly: structured tooltips
        // (you can use these later to render richer HTML)
        if (val.text) el.dataset.tip = val.text;
        if (val.title) el.dataset.tipTitle = val.title;
        if (val.img) el.dataset.tipImg = val.img;
        if (val.html) el.dataset.tipHtml = val.html; // optional raw HTML
      }
    });

    console.debug('[tooltips] applied', Object.keys(tips).length, 'entries');
    return tips;
  } catch (e) {
    console.error('[tooltips] failed to load tooltips.json', e);
    return {};
  }
})();


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

