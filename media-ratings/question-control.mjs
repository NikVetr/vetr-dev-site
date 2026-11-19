// The same tradeoff and keyboard scale in the recommendation board and Quick rate.
export function familiarityControl(id, weight, commit) {
  const label = document.createElement('label');
  label.className = 'familiarity-option';
  const caption = document.createElement('span');
  const value = document.createElement('output');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(Math.round(weight * 100));
  slider.setAttribute('aria-label', 'Familiarity weight');
  label.title = 'Balance information about your tastes against estimated familiarity.';
  function update() {
    value.value = slider.value + '%';
    slider.setAttribute('aria-valuetext', value.value + ' familiarity, ' + (100 - slider.valueAsNumber) + '% information');
  }
  slider.oninput = update;
  slider.onchange = () => commit(slider.valueAsNumber / 100);
  caption.append('Familiarity ', value);
  label.append(caption, slider);
  update();
  return label;
}
