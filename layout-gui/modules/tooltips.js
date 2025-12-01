/* ---------- simple tooltip engine ---------------------------------- */

// loads tooltips.json and applies attributes to matching elements by id
export const tooltipsReady = (async () => {
  try {
    const res = await fetch('./tooltips.json', { cache: 'no-store' });
    const tips = await res.json();

    Object.entries(tips).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn('[tooltips] no element with id="%s"', id);
        return;
      }

      // figure out the text & other fields just once
      let text = null;
      let title = null;
      let img = null;
      let html = null;

      if (typeof val === 'string') {
        text = val;
      } else if (val && typeof val === 'object') {
        if (val.text) text = val.text;
        if (val.title) title = val.title;
        if (val.img) img = val.img;
        if (val.html) html = val.html;
      }

      // collect all elements that should get the tooltip:
      //  - the element itself
      //  - any labels pointing at it (for="id")
      const targets = [el];

      if (el instanceof HTMLInputElement && el.labels && el.labels.length > 0) {
        // HTMLInputElement.labels is a NodeList of <label> elements
        targets.push(...el.labels);
      } else {
        // fallback: query labels by for="id" if .labels isn't supported
        const extra = document.querySelectorAll('label[for="' + id + '"]');
        extra.forEach(label => {
          if (!targets.includes(label)) targets.push(label);
        });
      }

      // apply data attributes to all targets
      targets.forEach(target => {
        if (text) target.dataset.tip = text;
        if (title) target.dataset.tipTitle = title;
        if (img) target.dataset.tipImg = img;
        if (html) target.dataset.tipHtml = html;
      });

      console.debug('[tooltips] attached to', id, 'targets:', targets.length);
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

