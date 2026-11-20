export function rankingWeightControl(id, weight, commit, kind = 'familiarity') {
  const discovery = kind === 'discovery';
  const name = discovery ? 'Match my picks' : 'Familiarity weight';
  const group = document.createElement('span');
  group.className = 'ranking-weight';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = name;
  const value = document.createElement('output');
  value.htmlFor.add(id);
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(Math.round(weight * 100));
  group.title = discovery ? 'Balance predicted ratings and the kinds of titles you chose to rate.'
    : 'Balance information about your tastes against estimated familiarity.';
  function update() {
    value.value = slider.value + '%';
    slider.setAttribute('aria-valuetext', discovery
      ? value.value + ' review context, ' + (100 - slider.valueAsNumber) + '% predicted rating'
      : value.value + ' familiarity, ' + (100 - slider.valueAsNumber) + '% information');
  }
  slider.oninput = update;
  slider.onchange = () => commit(slider.valueAsNumber / 100);
  function endpoint(percent, description) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = percent + '%';
    button.title = description;
    button.setAttribute('aria-label', 'Set ' + name.toLowerCase() + ' to ' + percent + '% · ' + description);
    button.onclick = () => {
      slider.value = String(percent);
      update();
      commit(percent / 100);
    };
    return button;
  }
  const scale = document.createElement('span');
  scale.className = 'weight-scale';
  scale.append(endpoint(0, discovery ? 'Rank by predicted rating alone' : 'Rank by information alone'),
    slider, endpoint(100, discovery ? 'Rank by review context alone' : 'Rank by familiarity alone'));
  group.append(label, value, scale);
  update();
  return group;
}
