// The same tradeoff and keyboard scale in the recommendation board and Quick rate.
export function familiarityControl(id, weight, commit) {
  const group = document.createElement('span');
  group.className = 'familiarity-option';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = 'Familiarity weight';
  const value = document.createElement('output');
  value.htmlFor.add(id);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(Math.round(weight * 100));
  group.title = 'Balance information about your tastes against estimated familiarity.';
  function update() {
    value.value = slider.value + '%';
    slider.setAttribute('aria-valuetext', value.value + ' familiarity, ' + (100 - slider.valueAsNumber) + '% information');
  }
  slider.oninput = update;
  slider.onchange = () => commit(slider.valueAsNumber / 100);
  function endpoint(percent, description) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = percent + '%';
    button.title = description;
    button.setAttribute('aria-label', 'Set familiarity weight to ' + percent + '% · ' + description);
    button.onclick = () => {
      slider.value = String(percent);
      update();
      commit(percent / 100);
    };
    return button;
  }
  const scale = document.createElement('span');
  scale.className = 'familiarity-scale';
  scale.append(endpoint(0, 'Rank by information alone'), slider, endpoint(100, 'Rank by familiarity alone'));
  group.append(label, value, scale);
  update();
  return group;
}
