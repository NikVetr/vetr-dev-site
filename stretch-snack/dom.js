/** @template {keyof HTMLElementTagNameMap} K @param {string} id @param {K} tag @returns {HTMLElementTagNameMap[K]} */
export function get(id, tag) {
  const element = document.getElementById(id);
  if (element?.localName !== tag) throw new Error('Missing ' + tag + '#' + id);
  return /** @type {HTMLElementTagNameMap[K]} */ (element);
}

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag */
export function make(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}
export function button(name, action, className = '') {
  const node = make('button', name, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}
export function setPressed(node, value) {
  node.setAttribute('aria-pressed', String(value));
}
export function formatTime(seconds) {
  return Math.floor(seconds / 60) + ':' + String(Math.round(seconds % 60)).padStart(2, '0');
}

const prefix = 'vetr:stretch-snack:';
export function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(prefix + key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key, value) {
  try {
    localStorage.setItem(prefix + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
