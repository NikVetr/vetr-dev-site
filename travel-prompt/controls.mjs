export function icon(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + id + '-icon');
  svg.append(use);
  return svg;
}

// A fieldset supplies the group label. Native radios handle selection, focus and arrow keys.
export function radioChoices(container, name, options, value, onChange) {
  const buttons = [];
  for (const { value: key, label, symbol } of options) {
    const wrap = document.createElement('label');
    wrap.className = 'choice';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = key;
    input.checked = key === value;
    input.addEventListener('change', () => onChange(key));
    const face = document.createElement('span');
    if (symbol) face.append(icon(symbol));
    face.append(label);
    wrap.append(input, face);
    container.append(wrap);
    buttons.push(input);
  }
  return (selected) => {
    for (const radio of buttons) radio.checked = radio.value === selected;
  };
}
