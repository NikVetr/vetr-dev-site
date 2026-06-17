import { parsePalette } from "./configRead.js";
import { rgbToHex, srgbToOklab } from "../core/colorSpaces.js";
import { applyCvdHex } from "../core/cvd.js";
import { contrastColor } from "../core/metrics.js";

const DEFAULT_CLUSTER_COUNT = null;
const MAX_AUTO_CLUSTERS = 12;
const MAX_MANUAL_CLUSTERS = 24;
const MIN_DISTINCT_OKLAB = 0.075;
const MIN_DRAG_PX = 3;
const POINT_HIT_RADIUS = 11;
const MAG_SIZE = 15;
const MAG_SCALE = 8;
const CVD_SWATCH_TYPES = ["deutan", "protan", "tritan"];

export function attachImageInput(ui, state, { onCommit, recordHistory, setStatus } = {}) {
  if (!ui?.paletteInput) return;
  const modal = createModal();
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  const runtime = {
    modal,
    fileInput,
    dropIndicator: createDropIndicator(),
    canvas: modal.querySelector(".image-picker-canvas"),
    magnifier: modal.querySelector(".image-picker-magnifier"),
    magnifierBadge: modal.querySelector(".image-picker-magnifier-badge"),
    swatches: modal.querySelector(".image-picker-swatches"),
    clusterCountInput: modal.querySelector(".image-picker-cluster-count"),
    reclusterBtn: modal.querySelector(".image-picker-recluster"),
    infoToggle: modal.querySelector(".image-picker-info-toggle"),
    infoPanel: modal.querySelector(".image-picker-info-panel"),
    title: modal.querySelector(".image-picker-title"),
    meta: modal.querySelector(".image-picker-meta"),
    drag: null,
    hoverIndex: -1,
    pointer: null,
    fit: null,
    modalSnapshot: null,
    cvdModel: "legacy",
    suppressAddUntil: 0,
  };
  runtime.ctx = runtime.canvas.getContext("2d");
  runtime.magCtx = runtime.magnifier.getContext("2d");
  runtime.magnifier.width = MAG_SIZE * MAG_SCALE;
  runtime.magnifier.height = MAG_SIZE * MAG_SCALE;

  const openExistingOrFile = () => {
    const imageState = ensureImageState(state);
    if (imageState.imageEl) {
      openModal(ui, state, runtime);
      return;
    }
    fileInput.click();
  };

  ui.paletteImage?.addEventListener("click", openExistingOrFile);
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) await handleImageFile(ui, state, runtime, file, { onCommit, setStatus });
  });

  attachDropAndPaste(ui, state, runtime, { onCommit, setStatus });
  attachModalEvents(ui, state, runtime, { onCommit, recordHistory, setStatus });
  updateImageButton(ui, state);
}

export function refreshImageInputControls(ui, state) {
  updateImageButton(ui, state);
}

export function reconcileImageInputFromPalette(ui, state) {
  const imageState = state?.imageInput;
  if (!imageState?.entries?.length || state.imageInputApplying) return;
  const hexes = parsePalette(ui.paletteInput.value);
  const used = new Set();
  imageState.entries = imageState.entries.filter((entry) => {
    const key = (entry.paletteHex || entry.hex || "").toUpperCase();
    if (!key) return false;
    const idx = hexes.findIndex((hex, i) => !used.has(i) && hex.toUpperCase() === key);
    if (idx < 0) return false;
    used.add(idx);
    entry.paletteHex = hexes[idx].toUpperCase();
    entry.paletteIndex = idx;
    return true;
  });
  imageState.entries.sort((a, b) => (a.paletteIndex ?? Infinity) - (b.paletteIndex ?? Infinity));
  imageState.savedPaletteHexes = imageState.entries.map((entry) => entry.paletteHex).filter(Boolean);
  updateImageButton(ui, state);
}

export function cloneImageInputForHistory(imageInput) {
  if (!imageInput) return null;
  return {
    name: imageInput.name || "",
    width: imageInput.width || 0,
    height: imageInput.height || 0,
    dataUrl: imageInput.dataUrl || null,
    entries: (imageInput.entries || []).map((entry) => ({
      id: entry.id,
      x: entry.x,
      y: entry.y,
      hex: entry.hex,
      paletteHex: entry.paletteHex || null,
      paletteIndex: Number.isInteger(entry.paletteIndex) ? entry.paletteIndex : null,
    })),
    savedPaletteHexes: Array.isArray(imageInput.savedPaletteHexes) ? [...imageInput.savedPaletteHexes] : [],
    clusterInfo: cloneClusterInfo(imageInput.clusterInfo),
    nextId: imageInput.nextId || 1,
  };
}

export function restoreImageInputFromHistory(state, snapshotImageInput) {
  const current = state.imageInput || null;
  if (!snapshotImageInput) {
    state.imageInput = current?.imageEl
      ? { ...current, entries: [], nextId: current.nextId || 1 }
      : null;
    return;
  }
  const dataUrl = snapshotImageInput.dataUrl || null;
  const imageEl =
    dataUrl && current?.dataUrl === dataUrl && current?.imageEl
      ? current.imageEl
      : dataUrl
        ? imageFromDataUrl(dataUrl)
        : null;
  state.imageInput = {
    name: snapshotImageInput.name || current?.name || "",
    width: snapshotImageInput.width || current?.width || 0,
    height: snapshotImageInput.height || current?.height || 0,
    dataUrl,
    imageEl,
    entries: (snapshotImageInput.entries || []).map((entry) => ({ ...entry })),
    savedPaletteHexes: Array.isArray(snapshotImageInput.savedPaletteHexes) ? [...snapshotImageInput.savedPaletteHexes] : [],
    clusterInfo: cloneClusterInfo(snapshotImageInput.clusterInfo),
    nextId: snapshotImageInput.nextId || 1,
  };
}

function cloneClusterInfo(info) {
  return info ? { ...info } : null;
}

function imageFromDataUrl(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  return image;
}

function createModal() {
  let modal = document.querySelector(".image-picker-overlay");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "image-picker-overlay";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="image-picker-panel" role="dialog" aria-modal="true" aria-label="Image color picker">
      <div class="image-picker-head">
        <div>
          <h2 class="image-picker-title">Image colors</h2>
          <p class="image-picker-meta">Drop, paste, or upload an image.</p>
        </div>
        <div class="image-picker-actions">
          <button type="button" class="ghost image-picker-upload">Upload Image</button>
          <button type="button" class="ghost image-picker-close">Cancel</button>
          <button type="button" class="primary image-picker-save" title="Append the selected image colors to the hex input.">Save</button>
        </div>
      </div>
      <div class="image-picker-body">
        <div class="image-picker-stage">
          <canvas class="image-picker-canvas" width="900" height="620"></canvas>
          <canvas class="image-picker-magnifier" width="120" height="120" hidden></canvas>
          <div class="image-picker-magnifier-badge" hidden></div>
        </div>
        <aside class="image-picker-side">
          <div class="image-picker-drop">Drop image here or paste from clipboard</div>
          <div class="image-picker-cluster-controls">
            <label for="image-picker-cluster-count">Clusters</label>
            <div class="image-picker-cluster-row">
              <input id="image-picker-cluster-count" class="image-picker-cluster-count" type="number" min="1" max="24" step="1" placeholder="Auto">
              <button type="button" class="ghost image-picker-recluster">Re-cluster</button>
            </div>
            <div class="image-picker-info-panel">
              <div class="image-picker-info-copy"></div>
            </div>
            <button type="button" class="image-picker-info-toggle">More ▾</button>
          </div>
          <div class="image-picker-input-head">
            <h3>Input colors</h3>
            <button type="button" class="image-picker-clear-all" title="Remove all sampled image colors from this image.">Clear all</button>
          </div>
          <div class="image-picker-cvd-labels" aria-hidden="true">
            <span>D</span>
            <span>P</span>
            <span>T</span>
          </div>
          <div class="image-picker-swatches"></div>
        </aside>
      </div>
      <div class="image-picker-help">
        Click the image to add a sampled color. Click an existing input node to remove it, or drag a node to resample from a different pixel.
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

function createDropIndicator() {
  let indicator = document.querySelector(".image-drop-focus");
  if (indicator) return indicator;
  indicator = document.createElement("div");
  indicator.className = "image-drop-focus";
  indicator.hidden = true;
  indicator.innerHTML = `
    <div class="image-drop-focus-card">
      <div class="image-drop-focus-icon" aria-hidden="true">
        <span></span>
      </div>
      <strong>Drop image to choose colors</strong>
      <span>Your image is processed in this browser window. It is not uploaded or sent to a server.</span>
    </div>
  `;
  document.body.appendChild(indicator);
  return indicator;
}

function ensureImageState(state) {
  if (!state.imageInput) {
    state.imageInput = { entries: [], nextId: 1 };
  }
  if (!Array.isArray(state.imageInput.entries)) state.imageInput.entries = [];
  if (!Number.isFinite(state.imageInput.nextId)) state.imageInput.nextId = 1;
  return state.imageInput;
}

function updateImageButton(ui, state) {
  if (!ui?.paletteImage) return;
  const imageState = state?.imageInput;
  const hasImage = Boolean(imageState?.imageEl);
  ui.paletteImage.textContent = hasImage ? "Modify Image" : "Upload Image";
  ui.paletteImage.classList.toggle("has-image", hasImage);
}

function attachDropAndPaste(ui, state, runtime, callbacks) {
  let hideTimer = null;
  const showDropIndicator = (evt = null) => {
    window.clearTimeout(hideTimer);
    runtime.dropIndicator.hidden = false;
    if (evt) {
      const card = runtime.dropIndicator.querySelector(".image-drop-focus-card");
      const rect = card?.getBoundingClientRect();
      const overCard =
        rect &&
        evt.clientX >= rect.left &&
        evt.clientX <= rect.right &&
        evt.clientY >= rect.top &&
        evt.clientY <= rect.bottom;
      runtime.dropIndicator.classList.toggle("is-over-target", Boolean(overCard));
    }
    runtime.modal.classList.add("is-dragging");
  };
  const scheduleHideDropIndicator = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      runtime.dropIndicator.hidden = true;
      runtime.dropIndicator.classList.remove("is-over-target");
      runtime.modal.classList.remove("is-dragging");
    }, 140);
  };
  ["dragenter", "dragover"].forEach((type) => {
    document.addEventListener(type, (evt) => {
      if (!hasImageDrag(evt.dataTransfer)) return;
      evt.preventDefault();
      evt.dataTransfer.dropEffect = "copy";
      showDropIndicator(evt);
    });
  });
  document.addEventListener("dragleave", () => scheduleHideDropIndicator());
  document.addEventListener("drop", async (evt) => {
    const file = imageFileFromList(evt.dataTransfer?.files);
    if (!file && !hasImageDrag(evt.dataTransfer)) return;
    evt.preventDefault();
    runtime.dropIndicator.hidden = true;
    runtime.dropIndicator.classList.remove("is-over-target");
    runtime.modal.classList.remove("is-dragging");
    if (file) await handleImageFile(ui, state, runtime, file, callbacks);
  });

  document.addEventListener("paste", async (evt) => {
    const items = Array.from(evt.clipboardData?.items || []);
    const item = items.find((it) => it.type?.startsWith("image/"));
    if (!item) return;
    const active = document.activeElement;
    const inTextInput = active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT");
    if (inTextInput && active !== ui.paletteInput) return;
    const file = item.getAsFile();
    if (!file) return;
    evt.preventDefault();
    await handleImageFile(ui, state, runtime, file, callbacks);
  });
}

async function handleImageFile(ui, state, runtime, file, callbacks = {}) {
  try {
    await loadImageFile(ui, state, runtime, file, callbacks);
  } catch (err) {
    console.warn("Image input failed:", err);
    callbacks.setStatus?.("Could not load image");
  }
}

function attachModalEvents(ui, state, runtime, { onCommit, recordHistory, setStatus } = {}) {
  const modal = runtime.modal;
  modal.querySelector(".image-picker-upload")?.addEventListener("click", () => runtime.fileInput.click());
  modal.querySelector(".image-picker-clear-all")?.addEventListener("click", () => {
    ensureImageState(state).entries = [];
    runtime.hoverIndex = -1;
    renderModal(ui, state, runtime);
  });
  runtime.reclusterBtn?.addEventListener("click", () => {
    reclusterImage(ui, state, runtime);
  });
  document.addEventListener("keydown", (evt) => {
    if (evt.key !== "Escape" || runtime.modal.hidden) return;
    evt.preventDefault();
    cancelAndClose(ui, state, runtime);
  });
  runtime.clusterCountInput?.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      reclusterImage(ui, state, runtime);
    }
  });
  runtime.infoToggle?.addEventListener("click", () => {
    runtime.infoPanel?.classList.toggle("show-info");
    const isOpen = runtime.infoPanel?.classList.contains("show-info");
    runtime.infoToggle.textContent = isOpen ? "Less ▴" : "More ▾";
  });
  modal.querySelector(".image-picker-save")?.addEventListener("click", () => {
    commitAndClose(ui, state, runtime, { onCommit, recordHistory, setStatus });
  });
  modal.querySelector(".image-picker-close")?.addEventListener("click", () => {
    cancelAndClose(ui, state, runtime);
  });
  modal.addEventListener("pointerdown", (evt) => {
    if (evt.target === modal) {
      cancelAndClose(ui, state, runtime);
    }
  });

  runtime.canvas.addEventListener("pointerdown", (evt) => {
    const pos = canvasPos(runtime.canvas, evt);
    const hit = hitPoint(runtime, state, pos.x, pos.y);
    runtime.drag = {
      index: hit,
      startX: pos.x,
      startY: pos.y,
      moved: false,
      pointerId: evt.pointerId,
    };
    runtime.canvas.setPointerCapture?.(evt.pointerId);
    if (hit >= 0) runtime.canvas.classList.add("is-dragging-point");
    evt.preventDefault();
  });

  runtime.canvas.addEventListener("pointermove", (evt) => {
    const pos = canvasPos(runtime.canvas, evt);
    runtime.pointer = pos;
    if (runtime.drag) {
      const dx = Math.abs(pos.x - runtime.drag.startX);
      const dy = Math.abs(pos.y - runtime.drag.startY);
      if (dx + dy > MIN_DRAG_PX) runtime.drag.moved = true;
      if (runtime.drag.index >= 0 && runtime.drag.moved) {
        moveEntryToCanvasPoint(state, runtime, runtime.drag.index, pos.x, pos.y);
        renderModal(ui, state, runtime);
      }
      evt.preventDefault();
      return;
    }
    runtime.hoverIndex = hitPoint(runtime, state, pos.x, pos.y);
    runtime.canvas.style.cursor = runtime.hoverIndex >= 0 ? "grab" : "crosshair";
    renderModal(ui, state, runtime);
  });

  runtime.canvas.addEventListener("pointerup", (evt) => {
    if (!runtime.drag) return;
    const pos = canvasPos(runtime.canvas, evt);
    const drag = runtime.drag;
    runtime.drag = null;
    runtime.canvas.releasePointerCapture?.(evt.pointerId);
    runtime.canvas.classList.remove("is-dragging-point");
    if (drag.index >= 0 && !drag.moved) {
      ensureImageState(state).entries.splice(drag.index, 1);
      runtime.hoverIndex = -1;
      runtime.suppressAddUntil = Date.now() + 320;
      renderModal(ui, state, runtime);
    } else if (drag.index < 0 && !drag.moved && Date.now() > runtime.suppressAddUntil) {
      addEntryFromCanvasPoint(state, runtime, pos.x, pos.y);
      renderModal(ui, state, runtime);
    }
    evt.preventDefault();
  });

  runtime.canvas.addEventListener("pointerleave", () => {
    runtime.pointer = null;
    runtime.hoverIndex = -1;
    runtime.magnifier.hidden = true;
    if (runtime.magnifierBadge) runtime.magnifierBadge.hidden = true;
  });

  window.addEventListener("resize", () => {
    if (!runtime.modal.hidden) renderModal(ui, state, runtime);
  });
}

async function loadImageFile(ui, state, runtime, file, { setStatus } = {}) {
  if (!file?.type?.startsWith("image/")) return;
  const restoreSnapshot = runtime.modalSnapshot || cloneImageInputForHistory(state.imageInput);
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const count = clusterCount(ui, runtime);
  const clusterResult = clusterImageColors(image, count);
  const imageState = ensureImageState(state);
  imageState.name = file.name || "clipboard image";
  imageState.width = image.naturalWidth || image.width;
  imageState.height = image.naturalHeight || image.height;
  imageState.dataUrl = dataUrl;
  imageState.imageEl = image;
  imageState.savedPaletteHexes = [];
  if (runtime.clusterCountInput) runtime.clusterCountInput.value = Number.isFinite(count) ? String(count) : "";
  setClusteredEntriesFromResult(state, clusterResult, count);
  updateImageButton(ui, state);
  setStatus?.(`Loaded image: ${imageState.name}`);
  openModal(ui, state, runtime, restoreSnapshot);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function imageFileFromList(files) {
  return Array.from(files || []).find((file) => file.type?.startsWith("image/")) || null;
}

function hasImageDrag(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  if (items.some((item) => item.kind === "file" && item.type?.startsWith("image/"))) return true;
  return Boolean(imageFileFromList(dataTransfer?.files));
}

function reclusterImage(ui, state, runtime) {
  const imageState = ensureImageState(state);
  if (!imageState.imageEl) return;
  const count = clusterCount(ui, runtime);
  if (runtime.clusterCountInput) runtime.clusterCountInput.value = Number.isFinite(count) ? String(count) : "";
  setClusteredEntries(state, imageState.imageEl, count);
  renderModal(ui, state, runtime);
}

function setClusteredEntries(state, image, count) {
  setClusteredEntriesFromResult(state, clusterImageColors(image, count), count);
}

function setClusteredEntriesFromResult(state, result, count) {
  const imageState = ensureImageState(state);
  imageState.entries = result.entries.map((entry, idx) => ({
    id: imageState.nextId++ || idx + 1,
    ...entry,
  }));
  imageState.clusterInfo = {
    requested: result.requested ?? count,
    produced: imageState.entries.length,
    samples: result.samples,
    sampleWidth: result.sampleWidth,
    sampleHeight: result.sampleHeight,
    auto: Boolean(result.auto),
    autoTrace: Array.isArray(result.autoTrace) ? result.autoTrace.map((row) => ({ ...row })) : [],
    threshold: result.threshold,
  };
}

function clusterCount(ui, runtime = null) {
  const raw = runtime?.clusterCountInput?.value?.trim() || "";
  const fromInput = parseInt(raw, 10);
  if (Number.isFinite(fromInput)) return Math.max(1, Math.min(MAX_MANUAL_CLUSTERS, fromInput));
  return DEFAULT_CLUSTER_COUNT;
}

function clusterImageColors(image, count) {
  const maxDim = 150;
  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const w = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const h = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  const buckets = new Map();
  let samples = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 160) continue;
      samples += 1;
      const key = `${data[i] >> 3}|${data[i + 1] >> 3}|${data[i + 2] >> 3}`;
      const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, x: 0, y: 0 };
      bucket.count += 1;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
      bucket.x += (x + 0.5) / w;
      bucket.y += (y + 0.5) / h;
      buckets.set(key, bucket);
    }
  }
  if (!samples) {
    return { entries: [], samples: 0, sampleWidth: w, sampleHeight: h, requested: count, auto: count == null };
  }

  const candidates = Array.from(buckets.values())
    .map((bucket) => candidateFromBucket(bucket))
    .filter(Boolean)
    .sort((a, b) => b.count - a.count)
    .slice(0, 1024);
  const auto = count == null;
  const autoResult = auto ? adaptiveClusterCount(candidates) : { count, trace: [] };
  const target = autoResult.count;
  const selected = refineCandidates(candidates, selectDistinctCandidates(candidates, target), 3);
  const entries = selected
    .sort((a, b) => b.count - a.count)
    .map((candidate) => ({
      x: candidate.x,
      y: candidate.y,
      hex: rgbToHex({ r: candidate.r / 255, g: candidate.g / 255, b: candidate.b / 255 }),
      paletteHex: null,
    }));
  return {
    entries,
    samples,
    sampleWidth: w,
    sampleHeight: h,
    requested: target,
    auto,
    autoTrace: autoResult.trace,
    threshold: MIN_DISTINCT_OKLAB,
  };
}

function candidateFromBucket(bucket) {
  if (!bucket?.count) return null;
  const n = bucket.count;
  const r = bucket.r / n;
  const g = bucket.g / n;
  const b = bucket.b / n;
  return {
    count: n,
    r,
    g,
    b,
    x: bucket.x / n,
    y: bucket.y / n,
    lab: srgbToOklab({ r: r / 255, g: g / 255, b: b / 255 }),
  };
}

function adaptiveClusterCount(candidates) {
  if (!candidates.length) return { count: 0, trace: [] };
  const selected = [];
  const trace = [];
  const maxCount = Math.max(...candidates.map((c) => c.count));
  while (selected.length < Math.min(MAX_AUTO_CLUSTERS, candidates.length)) {
    const next = bestDistinctCandidate(candidates, selected, maxCount);
    if (!next) break;
    const nearest = selected.length ? nearestOklabDistance(next, selected) : Infinity;
    const k = selected.length + 1;
    if (selected.length && nearest < MIN_DISTINCT_OKLAB) {
      trace.push({
        k,
        accepted: false,
        nearest,
        threshold: MIN_DISTINCT_OKLAB,
        hex: rgbToHex({ r: next.r / 255, g: next.g / 255, b: next.b / 255 }),
      });
      break;
    }
    selected.push(next);
    trace.push({
      k,
      accepted: true,
      nearest,
      threshold: MIN_DISTINCT_OKLAB,
      hex: rgbToHex({ r: next.r / 255, g: next.g / 255, b: next.b / 255 }),
    });
  }
  return { count: Math.max(1, selected.length), trace };
}

function selectDistinctCandidates(candidates, target) {
  if (!candidates.length || target <= 0) return [];
  const selected = [];
  const maxCount = Math.max(...candidates.map((c) => c.count));
  while (selected.length < Math.min(target, candidates.length)) {
    const next = bestDistinctCandidate(candidates, selected, maxCount);
    if (!next) break;
    selected.push(next);
  }
  return selected;
}

function bestDistinctCandidate(candidates, selected, maxCount) {
  const used = new Set(selected);
  if (!selected.length) return candidates[0] || null;
  let best = null;
  let bestScore = -Infinity;
  candidates.forEach((candidate) => {
    if (used.has(candidate)) return;
    const nearest = nearestOklabDistance(candidate, selected);
    const countWeight = Math.sqrt(candidate.count / Math.max(maxCount, 1));
    const score = nearest * (0.25 + 0.75 * countWeight);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  });
  return best;
}

function refineCandidates(candidates, selected, iterations) {
  if (!selected.length) return [];
  let centers = selected.map((candidate) => ({ ...candidate, lab: { ...candidate.lab } }));
  for (let iter = 0; iter < iterations; iter += 1) {
    const groups = centers.map(() => ({ count: 0, r: 0, g: 0, b: 0, x: 0, y: 0 }));
    candidates.forEach((candidate) => {
      let bestIdx = 0;
      let bestD = Infinity;
      centers.forEach((center, idx) => {
        const d = oklabDistance(candidate, center);
        if (d < bestD) {
          bestD = d;
          bestIdx = idx;
        }
      });
      const group = groups[bestIdx];
      group.count += candidate.count;
      group.r += candidate.r * candidate.count;
      group.g += candidate.g * candidate.count;
      group.b += candidate.b * candidate.count;
      group.x += candidate.x * candidate.count;
      group.y += candidate.y * candidate.count;
    });
    centers = centers.map((center, idx) => {
      const group = groups[idx];
      if (!group.count) return center;
      return candidateFromBucket(group);
    }).filter(Boolean);
  }
  return centers;
}

function nearestOklabDistance(candidate, selected) {
  return Math.min(...selected.map((center) => oklabDistance(candidate, center)));
}

function oklabDistance(a, b) {
  const dl = a.lab.l - b.lab.l;
  const da = a.lab.a - b.lab.a;
  const db = a.lab.b - b.lab.b;
  return Math.hypot(dl, da, db);
}

function openModal(ui, state, runtime, restoreSnapshot = null) {
  runtime.modalSnapshot = restoreSnapshot || cloneImageInputForHistory(state.imageInput);
  runtime.modal.hidden = false;
  document.body.classList.add("image-picker-open");
  renderModal(ui, state, runtime);
}

function commitAndClose(ui, state, runtime, { onCommit, recordHistory, setStatus } = {}) {
  mergeImageEntriesIntoPalette(ui, state);
  runtime.modalSnapshot = null;
  runtime.modal.hidden = true;
  runtime.magnifier.hidden = true;
  if (runtime.magnifierBadge) runtime.magnifierBadge.hidden = true;
  document.body.classList.remove("image-picker-open");
  updateImageButton(ui, state);
  onCommit?.("Image colors updated");
  recordHistory?.();
  setStatus?.("Image colors updated");
}

function cancelAndClose(ui, state, runtime) {
  restoreImageInputFromHistory(state, runtime.modalSnapshot);
  runtime.modalSnapshot = null;
  runtime.modal.hidden = true;
  runtime.magnifier.hidden = true;
  if (runtime.magnifierBadge) runtime.magnifierBadge.hidden = true;
  document.body.classList.remove("image-picker-open");
  updateImageButton(ui, state);
}

function mergeImageEntriesIntoPalette(ui, state) {
  const imageState = ensureImageState(state);
  const hexes = parsePalette(ui.paletteInput.value);
  const previous = Array.isArray(imageState.savedPaletteHexes)
    ? imageState.savedPaletteHexes
    : imageState.entries.map((entry) => entry.paletteHex).filter(Boolean);
  const removeIndices = new Set();
  let insertAt = hexes.length;
  previous.forEach((prevHex) => {
    const idx = hexes.findIndex((hex, i) => !removeIndices.has(i) && hex.toUpperCase() === prevHex.toUpperCase());
    if (idx >= 0) {
      removeIndices.add(idx);
      insertAt = Math.min(insertAt, idx);
    }
  });
  const removedBeforeInsert = Array.from(removeIndices).filter((idx) => idx < insertAt).length;
  const baseHexes = hexes.filter((_, idx) => !removeIndices.has(idx));
  const nextImageHexes = imageState.entries.map((entry) => entry.hex.toUpperCase());
  const adjustedInsert = Math.max(0, Math.min(baseHexes.length, insertAt - removedBeforeInsert));
  baseHexes.splice(adjustedInsert, 0, ...nextImageHexes);
  imageState.entries.forEach((entry, idx) => {
    entry.hex = nextImageHexes[idx];
    entry.paletteHex = nextImageHexes[idx];
  });
  imageState.savedPaletteHexes = [...nextImageHexes];

  state.imageInputApplying = true;
  ui.paletteInput.value = baseHexes.join(", ");
  ui.paletteInput.dispatchEvent(new Event("input", { bubbles: true }));
  state.imageInputApplying = false;
}

function renderModal(ui, state, runtime) {
  const imageState = ensureImageState(state);
  const image = imageState.imageEl;
  if (!image) return;
  if (!image.complete || !(image.naturalWidth || image.width)) {
    image.onload = () => renderModal(ui, state, runtime);
    return;
  }
  resizeCanvas(runtime);
  runtime.title.textContent = imageState.name || "Image colors";
  runtime.meta.textContent = `${imageState.width || image.naturalWidth} x ${imageState.height || image.naturalHeight} px`;
  runtime.cvdModel = ui?.cvdModel?.value || runtime.cvdModel || "legacy";
  if (runtime.clusterCountInput && Number.isFinite(imageState.clusterInfo?.requested)) {
    runtime.clusterCountInput.value = imageState.clusterInfo?.auto ? "" : String(imageState.clusterInfo.requested);
  }
  renderClusterInfo(runtime, imageState);
  runtime.ctx.clearRect(0, 0, runtime.canvas.width, runtime.canvas.height);
  runtime.fit = imageFit(image, runtime.canvas);
  runtime.ctx.fillStyle = "#f8fafc";
  runtime.ctx.fillRect(0, 0, runtime.canvas.width, runtime.canvas.height);
  runtime.ctx.drawImage(image, runtime.fit.x, runtime.fit.y, runtime.fit.w, runtime.fit.h);
  drawPoints(runtime, imageState.entries);
  renderSwatches(runtime, state);
  renderMagnifier(runtime, state);
}

function resizeCanvas(runtime) {
  const rect = runtime.canvas.getBoundingClientRect();
  const width = Math.max(420, Math.round(rect.width || 900));
  const height = Math.max(320, Math.round(rect.height || 620));
  if (runtime.canvas.width !== width || runtime.canvas.height !== height) {
    runtime.canvas.width = width;
    runtime.canvas.height = height;
  }
}

function imageFit(image, canvas) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const scale = Math.min(canvas.width / iw, canvas.height / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h, scale };
}

function canvasPos(canvas, evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / Math.max(rect.width, 1)),
    y: (evt.clientY - rect.top) * (canvas.height / Math.max(rect.height, 1)),
    clientX: evt.clientX,
    clientY: evt.clientY,
  };
}

function canvasToImageNorm(runtime, x, y, { clampToImage = false } = {}) {
  const fit = runtime.fit;
  if (!fit) return null;
  if (!clampToImage && (x < fit.x || x > fit.x + fit.w || y < fit.y || y > fit.y + fit.h)) {
    return null;
  }
  return {
    x: clamp01((x - fit.x) / fit.w),
    y: clamp01((y - fit.y) / fit.h),
  };
}

function imageNormToCanvas(runtime, entry) {
  const fit = runtime.fit;
  return {
    x: fit.x + entry.x * fit.w,
    y: fit.y + entry.y * fit.h,
  };
}

function addEntryFromCanvasPoint(state, runtime, x, y) {
  const norm = canvasToImageNorm(runtime, x, y);
  if (!norm) return;
  const imageState = ensureImageState(state);
  imageState.entries.push({
    id: imageState.nextId++,
    x: norm.x,
    y: norm.y,
    hex: pixelHexAt(imageState.imageEl, norm.x, norm.y),
    paletteHex: null,
  });
}

function moveEntryToCanvasPoint(state, runtime, idx, x, y) {
  const imageState = ensureImageState(state);
  const entry = imageState.entries[idx];
  const norm = canvasToImageNorm(runtime, x, y, { clampToImage: true });
  if (!entry || !norm) return;
  entry.x = norm.x;
  entry.y = norm.y;
  entry.hex = pixelHexAt(imageState.imageEl, norm.x, norm.y);
}

function pixelHexAt(image, xNorm, yNorm) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const sx = Math.max(0, Math.min(iw - 1, Math.floor(xNorm * iw)));
  const sy = Math.max(0, Math.min(ih - 1, Math.floor(yNorm * ih)));
  const canvas = pixelHexAt.canvas || (pixelHexAt.canvas = document.createElement("canvas"));
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, 1, 1);
  ctx.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return rgbToHex({ r: data[0] / 255, g: data[1] / 255, b: data[2] / 255 });
}

function hitPoint(runtime, state, x, y) {
  const imageState = ensureImageState(state);
  if (!runtime.fit) return -1;
  for (let i = imageState.entries.length - 1; i >= 0; i -= 1) {
    const pt = imageNormToCanvas(runtime, imageState.entries[i]);
    const d = Math.hypot(pt.x - x, pt.y - y);
    if (d <= POINT_HIT_RADIUS) return i;
  }
  return -1;
}

function drawPoints(runtime, entries) {
  entries.forEach((entry, idx) => {
    const pt = imageNormToCanvas(runtime, entry);
    const hover = idx === runtime.hoverIndex || idx === runtime.drag?.index;
    runtime.ctx.beginPath();
    runtime.ctx.arc(pt.x, pt.y, hover ? 9 : 7, 0, Math.PI * 2);
    runtime.ctx.fillStyle = entry.hex;
    runtime.ctx.strokeStyle = contrastColor(entry.hex);
    runtime.ctx.lineWidth = hover ? 3 : 2;
    runtime.ctx.fill();
    runtime.ctx.stroke();
  });
}

function renderMagnifier(runtime, state) {
  const draggingPoint = runtime.drag?.index >= 0;
  if (!runtime.pointer || (runtime.hoverIndex >= 0 && !draggingPoint)) {
    runtime.magnifier.hidden = true;
    if (runtime.magnifierBadge) runtime.magnifierBadge.hidden = true;
    return;
  }
  const norm = canvasToImageNorm(runtime, runtime.pointer.x, runtime.pointer.y, { clampToImage: draggingPoint });
  if (!norm) {
    runtime.magnifier.hidden = true;
    if (runtime.magnifierBadge) runtime.magnifierBadge.hidden = true;
    return;
  }
  const imageState = ensureImageState(state);
  const image = imageState.imageEl;
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  const sx = Math.max(0, Math.min(iw - MAG_SIZE, Math.floor(norm.x * iw) - Math.floor(MAG_SIZE / 2)));
  const sy = Math.max(0, Math.min(ih - MAG_SIZE, Math.floor(norm.y * ih) - Math.floor(MAG_SIZE / 2)));
  runtime.magCtx.imageSmoothingEnabled = false;
  runtime.magCtx.clearRect(0, 0, runtime.magnifier.width, runtime.magnifier.height);
  runtime.magCtx.drawImage(image, sx, sy, MAG_SIZE, MAG_SIZE, 0, 0, runtime.magnifier.width, runtime.magnifier.height);
  drawMagnifierReticule(runtime);
  const rect = runtime.canvas.getBoundingClientRect();
  const magLeft = Math.min(rect.width - 132, Math.max(8, runtime.pointer.x * (rect.width / runtime.canvas.width) + 18));
  const magTop = Math.min(rect.height - 132, Math.max(8, runtime.pointer.y * (rect.height / runtime.canvas.height) + 18));
  runtime.magnifier.style.left = `${magLeft}px`;
  runtime.magnifier.style.top = `${magTop}px`;
  runtime.magnifier.hidden = false;
  renderMagnifierBadge(runtime, imageState, norm, magLeft, magTop, rect);
}

function drawMagnifierReticule(runtime) {
  const mid = runtime.magnifier.width / 2;
  runtime.magCtx.save();
  drawMagnifierReticuleStroke(runtime, mid, "#ffffff", 5);
  drawMagnifierReticuleStroke(runtime, mid, "#000000", 2);
  runtime.magCtx.restore();
}

function drawMagnifierReticuleStroke(runtime, mid, color, width) {
  runtime.magCtx.strokeStyle = color;
  runtime.magCtx.lineWidth = width;
  runtime.magCtx.beginPath();
  runtime.magCtx.moveTo(mid, 0);
  runtime.magCtx.lineTo(mid, runtime.magnifier.height);
  runtime.magCtx.moveTo(0, mid);
  runtime.magCtx.lineTo(runtime.magnifier.width, mid);
  runtime.magCtx.stroke();
}

function renderMagnifierBadge(runtime, imageState, norm, magLeft, magTop, rect) {
  if (!runtime.magnifierBadge) return;
  const hex = pixelHexAt(imageState.imageEl, norm.x, norm.y);
  const badgeTop = Math.min(rect.height - 28, Math.max(8, magTop + runtime.magnifier.height + 6));
  const badgeLeft = Math.min(rect.width - 132, Math.max(8, magLeft));
  runtime.magnifierBadge.textContent = hex;
  runtime.magnifierBadge.style.background = hex;
  runtime.magnifierBadge.style.color = contrastColor(hex);
  runtime.magnifierBadge.style.left = `${badgeLeft}px`;
  runtime.magnifierBadge.style.top = `${badgeTop}px`;
  runtime.magnifierBadge.hidden = false;
}

function renderSwatches(runtime, state) {
  const imageState = ensureImageState(state);
  runtime.swatches.innerHTML = "";
  if (!imageState.entries.length) {
    const empty = document.createElement("div");
    empty.className = "image-picker-empty";
    empty.textContent = "Click the image to add colors.";
    runtime.swatches.appendChild(empty);
    return;
  }
  imageState.entries.forEach((entry, idx) => {
    const item = document.createElement("div");
    item.className = "image-picker-swatch";
    const textColor = contrastColor(entry.hex);
    item.style.color = textColor;
    item.style.setProperty("--image-swatch-outline", "#111827");
    ["left", "right"].forEach((pieceName) => {
      const piece = document.createElement("span");
      piece.className = `image-picker-swatch-piece image-picker-swatch-piece-${pieceName}`;
      piece.style.background = entry.hex;
      item.appendChild(piece);
    });
    CVD_SWATCH_TYPES.forEach((type, typeIdx) => {
      const band = document.createElement("span");
      band.className = `image-picker-cvd-band image-picker-cvd-band-${typeIdx}`;
      band.style.background = applyCvdHex(entry.hex, type, 1, runtime.cvdModel);
      item.appendChild(band);
    });
    const label = document.createElement("span");
    label.className = "image-picker-swatch-label";
    label.textContent = entry.hex;
    item.appendChild(label);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Remove ${entry.hex}`);
    remove.textContent = "×";
    item.appendChild(remove);
    item.querySelector("button").addEventListener("click", () => {
      imageState.entries.splice(idx, 1);
      renderModal(null, state, runtime);
    });
    runtime.swatches.appendChild(item);
  });
}

function renderClusterInfo(runtime, imageState) {
  const target = runtime.infoPanel?.querySelector(".image-picker-info-copy");
  if (!target) return;
  const info = imageState.clusterInfo || {};
  const requested = Number.isFinite(info.requested) ? info.requested : parseInt(runtime.clusterCountInput?.value || "", 10);
  const produced = Number.isFinite(info.produced) ? info.produced : imageState.entries.length;
  const samples = Number.isFinite(info.samples) ? info.samples : 0;
  const sampleSize =
    Number.isFinite(info.sampleWidth) && Number.isFinite(info.sampleHeight)
      ? `${info.sampleWidth} x ${info.sampleHeight}`
      : "auto";
  const trace = Array.isArray(info.autoTrace) ? info.autoTrace : [];
  const criterion = info.auto
    ? trace.length
      ? trace
          .map((row) => {
            const nearest = Number.isFinite(row.nearest) ? row.nearest.toFixed(3) : "seed";
            const threshold = Number.isFinite(row.threshold) ? row.threshold.toFixed(3) : "-";
            const decision = row.accepted ? "accepted" : "stopped";
            return `<div>k=${row.k}: ${nearest} vs ${threshold} (${decision}${row.hex ? `, ${row.hex}` : ""})</div>`;
          })
          .join("")
      : "<div>No auto trace available.</div>"
    : "<div>Manual cluster count; auto search was not run.</div>";
  target.innerHTML = `
    <div><strong>Method:</strong> quantized peaks with OKLab spacing</div>
    <div><strong>Requested:</strong> ${info.auto ? "auto" : Number.isFinite(requested) ? requested : "-"} clusters</div>
    <div><strong>Produced:</strong> ${produced} colors</div>
    <div><strong>Sampled:</strong> ${samples} opaque pixels (${sampleSize})</div>
    <div><strong>Auto criterion:</strong> add the next distinct color while nearest OKLab distance is at least ${Number.isFinite(info.threshold) ? info.threshold.toFixed(3) : MIN_DISTINCT_OKLAB.toFixed(3)}.</div>
    <div class="image-picker-trace">${criterion}</div>
  `;
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
