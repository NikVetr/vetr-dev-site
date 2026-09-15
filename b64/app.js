"use strict";

const source = document.getElementById("source");
const status = document.getElementById("status");
const links = document.getElementById("links");
const count = document.getElementById("count");
const results = document.querySelector(".results");
const encodePanel = document.querySelector(".encode-panel");
const layers = document.getElementById("encode-count");
const encoded = document.getElementById("encoded");
const encodeStatus = document.getElementById("encode-status");
const encodeTrace = document.getElementById("encode-trace");
const decodeTrace = document.getElementById("decode-trace");
const copy = document.getElementById("copy");
const openButton = document.getElementById("open-links");
const openLabel = document.getElementById("open-label");
const openStatus = document.getElementById("open-status");
let revision = 0;
let timer;
let copyTimer;
let worker;
let openNotice = "";
let pendingURLs = null;

function snapshot() {
  return { text: source.value, layers: layers.value, start: source.selectionStart, end: source.selectionEnd,
    field: document.activeElement === layers ? "layers" : "source" };
}
const edits = [snapshot()];
let editIndex = 0;
let lastEdit = null;

function rememberSelection() {
  Object.assign(edits[editIndex], { start: source.selectionStart, end: source.selectionEnd,
    field: document.activeElement === layers ? "layers" : "source" });
}

function rememberEdit(kind, field) {
  const next = snapshot();
  const current = edits[editIndex];
  if (next.text === current.text && next.layers === current.layers) return;
  const now = performance.now();
  const typing = ["insertText", "deleteContentBackward", "deleteContentForward"].includes(kind);
  const merge = typing && lastEdit?.kind === kind && lastEdit.field === field && now - lastEdit.time < 700 && editIndex === edits.length - 1;
  edits.splice(editIndex + 1);
  if (merge) edits[editIndex] = next;
  else { edits.push(next); editIndex++; }
  lastEdit = typing ? { kind, field, time: now } : null;
  // Keep history in memory only, bounded by both edit count and text size.
  let size = edits.reduce((sum, edit) => sum + edit.text.length, 0);
  while (edits.length > 2 && (edits.length > 100 || size > 4_000_000)) {
    size -= edits.shift().text.length;
    editIndex--;
  }
}

function restoreEdit(direction) {
  lastEdit = null;
  const next = editIndex + direction;
  if (next < 0 || next >= edits.length) return;
  rememberSelection();
  editIndex = next;
  const edit = edits[editIndex];
  source.value = edit.text;
  layers.value = edit.layers;
  source.setSelectionRange(edit.start, edit.end);
  (edit.field === "layers" ? layers : source).focus({ preventScroll: true });
  update();
}

const isApple = /Mac|iPhone|iPad/.test(navigator.platform);
if (isApple) document.getElementById("paste-key").textContent = "⌘ V";

function trace(steps, label) {
  const details = document.createElement("details");
  details.className = "trace";
  details.open = steps.length <= 3;
  const summary = document.createElement("summary");
  summary.textContent = label;
  const list = document.createElement("ol");
  list.className = "steps";
  for (const step of steps) {
    const item = document.createElement("li");
    item.className = "step";
    const number = document.createElement("span");
    number.className = "step-number";
    number.textContent = step.depth;
    number.setAttribute("aria-label", `Layer ${step.depth}`);
    const text = document.createElement("code");
    text.textContent = step.text;
    text.title = step.text;
    item.append(number, text);
    list.append(item);
  }
  details.append(summary, list);
  return details;
}

function updateOpenHint(total) {
  const remaining = pendingURLs?.length;
  openButton.hidden = !(remaining || total);
  openLabel.textContent = remaining
    ? `Open remaining ${remaining === 1 ? "link" : `${remaining} links`}`
    : total > 1 ? `Open all ${total} links` : "Open link";
  openStatus.textContent = openNotice;
  openStatus.hidden = !openNotice;
}

function render(result) {
  if (result.id !== revision) return;
  results.setAttribute("aria-busy", "false");
  encodePanel.setAttribute("aria-busy", "false");
  links.replaceChildren();
  decodeTrace.replaceChildren();
  count.textContent = `${result.links.length} ${result.links.length === 1 ? "link" : "links"}`;
  updateOpenHint(result.links.length);
  status.textContent = result.error || (result.links.length ? "" : "No links found.");
  if (result.limited && !result.error) status.textContent += " Scan limit reached.";

  for (const { url, depth, steps } of result.links) {
    const item = document.createElement("li");
    const anchor = document.createElement("a");
    anchor.className = "result-link";
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.title = "Open in a new tab";
    const address = document.createElement("span");
    address.className = "link-url";
    address.textContent = url;
    const arrow = document.createElement("span");
    arrow.className = "link-arrow";
    arrow.textContent = "↗";
    arrow.setAttribute("aria-hidden", "true");
    anchor.append(address, arrow);
    item.append(anchor);
    if (steps?.length) {
      const details = trace(steps, `Unwrapped ×${depth}`);
      if (result.links.length > 1) details.open = false;
      item.append(details);
    }
    links.append(item);
  }
  if (result.steps?.length) decodeTrace.append(trace(result.steps, `Decoded ×${result.steps.length}`));

  const encoding = result.encoding;
  encoded.value = encoding?.value || "";
  encodeStatus.textContent = encoding?.error || (encoding?.value ? `${encoding.value.length.toLocaleString()} characters` : "");
  encodeTrace.replaceChildren();
  if (encoding?.steps.length > 1) encodeTrace.append(trace(encoding.steps, `Wrapped ×${encoding.steps.length}`));
  copy.disabled = !encoded.value;
}

function fallback() {
  worker?.terminate();
  worker = null;
  if (source.value) render({ id: revision, ...B64.transform(source.value, layers.valueAsNumber) });
}

try {
  worker = new Worker("worker.js");
  worker.onmessage = ({ data }) => render(data);
  worker.onerror = fallback;
} catch { worker = null; }

function update() {
  const id = ++revision;
  clearTimeout(timer);
  clearTimeout(copyTimer);
  copy.textContent = "Copy ⧉";
  copy.disabled = true;
  openButton.hidden = true;
  openNotice = "";
  pendingURLs = null;
  openStatus.hidden = true;
  openStatus.textContent = "";
  links.replaceChildren();
  decodeTrace.replaceChildren();
  encodeTrace.replaceChildren();
  encoded.value = "";
  encodeStatus.textContent = "";
  count.textContent = "0 links";
  layers.setAttribute("aria-invalid", String(!layers.validity.valid || !layers.value));
  if (!source.value) {
    results.setAttribute("aria-busy", "false");
    encodePanel.setAttribute("aria-busy", "false");
    status.textContent = "Links land here.";
    return;
  }
  results.setAttribute("aria-busy", "true");
  encodePanel.setAttribute("aria-busy", "true");
  status.textContent = "Unwrapping…";
  timer = setTimeout(() => {
    const text = source.value;
    const depth = layers.valueAsNumber;
    if (worker) worker.postMessage({ id, text, layers: depth });
    else render({ id, ...B64.transform(text, depth) });
  }, 70);
}

for (const field of [source, layers]) {
  field.addEventListener("beforeinput", event => {
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      event.preventDefault();
      restoreEdit(event.inputType === "historyUndo" ? -1 : 1);
    } else {
      if (field === source && (source.selectionStart !== source.selectionEnd || source.selectionStart !== edits[editIndex].start)) lastEdit = null;
      rememberSelection();
    }
  });
  field.addEventListener("input", event => {
    if (!event.isComposing) rememberEdit(event.inputType, field.id);
    update();
  });
  field.addEventListener("compositionend", () => { rememberEdit("composition", field.id); update(); });
  field.addEventListener("pointerdown", () => { lastEdit = null; });
  field.addEventListener("blur", () => { lastEdit = null; });
}

function openLinks() {
  // Resolve an immediate paste → Enter within the keyboard gesture, even
  // when the background worker has not returned the latest results yet.
  const allURLs = results.getAttribute("aria-busy") === "true"
    ? B64.findLinks(source.value).links.map(link => link.url)
    : [...links.querySelectorAll("a")].map(link => link.href);
  const urls = pendingURLs || allURLs;
  if (!urls.length) return;
  const blocked = [];
  for (const url of urls) {
    let tab;
    try {
      tab = window.open("about:blank", "_blank");
      if (!tab) { blocked.push(url); continue; }
      // Detach the opener before navigating; retaining the blank tab handle
      // lets us detect blocked tabs (the noopener feature always returns null).
      tab.opener = null;
      const referrer = tab.document.createElement("meta");
      referrer.name = "referrer";
      referrer.content = "no-referrer";
      tab.document.head.append(referrer);
      tab.location.replace(url);
    } catch {
      tab?.close();
      blocked.push(url);
    }
  }
  pendingURLs = blocked.length ? blocked : null;
  openNotice = blocked.length
    ? `${urls.length - blocked.length} of ${urls.length} tabs opened. Allow pop-ups for this page to open the rest together, or press Enter again to try the remaining ${blocked.length === 1 ? "link" : "links"}.`
    : "";
  updateOpenHint(allURLs.length);
}

openButton.addEventListener("click", openLinks);
document.addEventListener("keydown", event => {
  if (event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    restoreEdit(event.shiftKey ? 1 : -1);
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Tab"].includes(event.key)) lastEdit = null;
  if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (![source, document.body, document.documentElement].includes(event.target)) return;
  event.preventDefault();
  if (event.repeat) return;

  openLinks();
});
layers.addEventListener("focus", () => layers.select());
copy.addEventListener("click", async () => {
  const value = encoded.value;
  const id = revision;
  try {
    await navigator.clipboard.writeText(value);
    if (id !== revision) return;
    copy.textContent = "Copied ✓";
    copyTimer = setTimeout(() => { copy.textContent = "Copy ⧉"; }, 1600);
  } catch {
    if (id !== revision) return;
    encoded.focus();
    encoded.select();
    encodeStatus.textContent = `Selected — ${isApple ? "⌘ C" : "Ctrl C"} to copy`;
  }
});
document.addEventListener("paste", event => {
  // The editable fields keep native insertion and selection behavior.
  if (event.target === source || event.target === layers) return;
  const text = event.clipboardData?.getData("text/plain");
  if (!text) return;
  event.preventDefault();
  rememberSelection();
  lastEdit = null;
  source.value = text;
  source.focus({ preventScroll: true });
  source.setSelectionRange(text.length, text.length);
  rememberEdit("paste", source.id);
  update();
});
