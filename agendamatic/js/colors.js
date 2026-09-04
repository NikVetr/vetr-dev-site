/**
 * colors.js - Agenda item color normalization, readable theme tokens, and picker UI
 */

export const LEGACY_PALETTE = Object.freeze([
    '#2196f3',
    '#9c27b0',
    '#4caf50',
    '#ff9800',
    '#e91e63',
    '#009688',
    '#795548',
    '#607d8b'
]);

export const PICKER_LIGHTNESS = 48;

const CUSTOM_PROPERTIES = [
    '--item-color',
    '--item-accent-light',
    '--item-accent-dark',
    '--item-surface-light',
    '--item-surface-dark',
    '--item-input-light',
    '--item-input-dark',
    '--item-text-light',
    '--item-text-dark',
    '--item-active-light',
    '--item-active-dark',
    '--item-active-text-light',
    '--item-active-text-dark',
    '--item-rgb'
];

export function normalizeHexColor(value) {
    const match = String(value ?? '').trim().match(/^#?([0-9a-f]{6})$/i);
    return match ? `#${match[1].toLowerCase()}` : null;
}

export function getLegacyColor(themeColor, index = 0) {
    const value = Number(themeColor);
    const themeIndex = Number.isInteger(value) && value >= 1 && value <= LEGACY_PALETTE.length
        ? value - 1
        : Math.abs(Number(index) || 0) % LEGACY_PALETTE.length;
    return LEGACY_PALETTE[themeIndex];
}

export function getItemColor(item, index = 0) {
    return normalizeHexColor(item?.customColor) || getLegacyColor(item?.themeColor ?? item?.themeNumber, index);
}

export function closestLegacyTheme(value) {
    const color = normalizeHexColor(value);
    if (!color) throw new Error(`Invalid color “${value}”; use a six-digit hex code.`);
    const rgb = hexToRgb(color);
    let closestIndex = 0;
    let closestDistance = Infinity;

    LEGACY_PALETTE.forEach((candidate, index) => {
        const candidateRgb = hexToRgb(candidate);
        const distance = candidateRgb.reduce(
            (sum, channel, channelIndex) => sum + ((channel - rgb[channelIndex]) ** 2),
            0
        );
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
        }
    });

    return closestIndex + 1;
}

export function parseItemColor(value) {
    const trimmed = String(value ?? '').trim();
    if (/^[1-8]$/.test(trimmed)) {
        return { themeColor: Number(trimmed), customColor: null };
    }
    const customColor = normalizeHexColor(trimmed);
    if (!customColor) throw new Error(`Invalid color “${value}”; use a six-digit hex code.`);
    const presetIndex = LEGACY_PALETTE.indexOf(customColor);
    if (presetIndex >= 0) {
        return { themeColor: presetIndex + 1, customColor: null };
    }
    return { themeColor: closestLegacyTheme(customColor), customColor };
}

function hexToRgb(value) {
    const hex = normalizeHexColor(value);
    if (!hex) throw new Error(`Invalid six-digit hex color: ${value}`);
    return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

export function colorRgb(value) {
    return hexToRgb(value).join(' ');
}

export function hexToHsl(value) {
    const [red, green, blue] = hexToRgb(value).map(channel => channel / 255);
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    const lightness = (maximum + minimum) / 2;
    let hue = 0;

    if (delta !== 0) {
        if (maximum === red) hue = ((green - blue) / delta) % 6;
        else if (maximum === green) hue = ((blue - red) / delta) + 2;
        else hue = ((red - green) / delta) + 4;
        hue *= 60;
        if (hue < 0) hue += 360;
    }

    const saturation = delta === 0
        ? 0
        : delta / (1 - Math.abs((2 * lightness) - 1));

    return {
        h: Math.round(hue),
        s: Math.round(saturation * 100),
        l: Math.round(lightness * 100)
    };
}

export function hslToHex(hue, saturation, lightness) {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = clamp(Number(saturation), 0, 100) / 100;
    const l = clamp(Number(lightness), 0, 100) / 100;
    const chroma = (1 - Math.abs((2 * l) - 1)) * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - (chroma / 2);
    let channels;

    if (h < 60) channels = [chroma, x, 0];
    else if (h < 120) channels = [x, chroma, 0];
    else if (h < 180) channels = [0, chroma, x];
    else if (h < 240) channels = [0, x, chroma];
    else if (h < 300) channels = [x, 0, chroma];
    else channels = [chroma, 0, x];

    return `#${channels.map(channel => Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0')).join('')}`;
}

function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function relativeLuminance(value) {
    const channels = hexToRgb(value).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function contrastRatio(first, second) {
    const firstLum = relativeLuminance(first);
    const secondLum = relativeLuminance(second);
    return (Math.max(firstLum, secondLum) + 0.05) / (Math.min(firstLum, secondLum) + 0.05);
}

function findReadableTone(hue, saturation, background, start, direction, minimumContrast) {
    const backgrounds = Array.isArray(background) ? background : [background];
    let lightness = clamp(start, 0, 100);
    while (lightness >= 0 && lightness <= 100) {
        const candidate = hslToHex(hue, saturation, lightness);
        if (backgrounds.every(value => contrastRatio(candidate, value) >= minimumContrast)) {
            return candidate;
        }
        lightness += direction;
    }
    const darkContrast = Math.min(...backgrounds.map(value => contrastRatio('#000000', value)));
    const lightContrast = Math.min(...backgrounds.map(value => contrastRatio('#ffffff', value)));
    return darkContrast >= lightContrast
        ? '#000000'
        : '#ffffff';
}

function readableText(background) {
    return contrastRatio('#000000', background) >= contrastRatio('#ffffff', background)
        ? '#000000'
        : '#ffffff';
}

export function getColorTokens(value) {
    const exact = normalizeHexColor(value);
    if (!exact) throw new Error(`Invalid six-digit hex color: ${value}`);
    const { h, s, l } = hexToHsl(exact);
    const surfaceSaturation = Math.min(58, s * 0.58);
    const lightSurface = hslToHex(h, surfaceSaturation, 95);
    const darkSurface = hslToHex(h, surfaceSaturation, 21);
    const lightText = findReadableTone(h, s, [lightSurface, '#ffffff'], 31, -1, 4.5);
    const darkText = findReadableTone(h, s, [darkSurface, '#0f3460', '#1a1a2e'], 76, 1, 4.5);
    const lightAccent = findReadableTone(h, s, '#fcfcfc', Math.min(l, 48), -1, 3);
    const darkAccent = findReadableTone(h, s, '#1a1a2e', Math.max(l, 58), 1, 3);
    const lightActive = findReadableTone(h, s, '#fcfcfc', 31, -1, 4.5);
    const darkActive = findReadableTone(h, s, '#1a1a2e', 72, 1, 4.5);

    return {
        exact,
        rgb: colorRgb(exact),
        light: {
            accent: lightAccent,
            surface: lightSurface,
            input: hslToHex(h, surfaceSaturation, 87),
            text: lightText,
            active: lightActive,
            activeText: readableText(lightActive)
        },
        dark: {
            accent: darkAccent,
            surface: darkSurface,
            input: hslToHex(h, surfaceSaturation, 29),
            text: darkText,
            active: darkActive,
            activeText: readableText(darkActive)
        }
    };
}

export function clearItemColorStyles(element) {
    if (!element) return;
    element.classList.remove('custom-item-color');
    CUSTOM_PROPERTIES.forEach(property => element.style.removeProperty(property));
}

export function applyItemColorStyles(element, item) {
    clearItemColorStyles(element);
    const customColor = normalizeHexColor(item?.customColor);
    if (!customColor) return false;

    const tokens = getColorTokens(customColor);
    element.classList.add('custom-item-color');
    element.style.setProperty('--item-color', tokens.exact);
    element.style.setProperty('--item-rgb', tokens.rgb);
    for (const mode of ['light', 'dark']) {
        element.style.setProperty(`--item-accent-${mode}`, tokens[mode].accent);
        element.style.setProperty(`--item-surface-${mode}`, tokens[mode].surface);
        element.style.setProperty(`--item-input-${mode}`, tokens[mode].input);
        element.style.setProperty(`--item-text-${mode}`, tokens[mode].text);
        element.style.setProperty(`--item-active-${mode}`, tokens[mode].active);
        element.style.setProperty(`--item-active-text-${mode}`, tokens[mode].activeText);
    }
    return true;
}

export function getItemAccentColor(item, index = 0, darkMode = false) {
    const customColor = normalizeHexColor(item?.customColor);
    if (!customColor) return getLegacyColor(item?.themeColor ?? item?.themeNumber, index);
    const tokens = getColorTokens(customColor);
    return tokens[darkMode ? 'dark' : 'light'].accent;
}

export function colorsMatch(first, second, firstIndex = 0, secondIndex = 0) {
    if (!first || !second) return false;
    return getItemColor(first, firstIndex) === getItemColor(second, secondIndex);
}

export function getSeparatedColor(item, neighbors = []) {
    const current = getItemColor(item);
    const { h, s } = hexToHsl(current);
    const occupied = new Set(neighbors.filter(Boolean).map(neighbor => getItemColor(neighbor)));

    for (let step = 1; step <= 8; step += 1) {
        const customColor = hslToHex(h + (137.508 * step), Math.max(s, 45), PICKER_LIGHTNESS);
        if (!occupied.has(customColor)) {
            return { customColor, themeColor: closestLegacyTheme(customColor) };
        }
    }

    throw new Error('Unable to generate a distinct adjacent item color.');
}

let picker = null;

function focusAfterModalTransition(modalElement, resolveTarget) {
    const focusTarget = () => {
        if (!modalElement.classList.contains('visible')) return;
        resolveTarget()?.focus({ preventScroll: true });
    };
    if (getComputedStyle(modalElement).visibility === 'visible') {
        setTimeout(focusTarget, 0);
        return;
    }
    const onTransitionEnd = event => {
        if (event.target !== modalElement) return;
        modalElement.removeEventListener('transitionend', onTransitionEnd);
        focusTarget();
    };
    modalElement.addEventListener('transitionend', onTransitionEnd);
}

function pickerElements() {
    if (picker) return picker;
    const overlay = document.getElementById('item-color-modal');
    if (!overlay) throw new Error('Item color picker markup is missing.');
    picker = {
        overlay,
        dialog: overlay.querySelector('[role="dialog"]'),
        close: document.getElementById('item-color-close'),
        cancel: document.getElementById('item-color-cancel'),
        apply: document.getElementById('item-color-apply'),
        hue: document.getElementById('item-color-hue'),
        hueValue: document.getElementById('item-color-hue-value'),
        saturation: document.getElementById('item-color-saturation'),
        saturationValue: document.getElementById('item-color-saturation-value'),
        swatch: document.getElementById('item-color-swatch'),
        previewCard: document.getElementById('item-color-preview-card'),
        value: document.getElementById('item-color-value'),
        title: document.getElementById('item-color-title'),
        trigger: null,
        onApply: null,
        originalColor: null,
        dirty: false,
        initialized: false
    };
    return picker;
}

function selectedPickerColor(elements) {
    if (!elements.dirty && elements.originalColor) return elements.originalColor;
    return hslToHex(elements.hue.value, elements.saturation.value, PICKER_LIGHTNESS);
}

function updatePickerPreview(elements) {
    const color = selectedPickerColor(elements);
    const tokens = getColorTokens(color);
    elements.swatch.style.backgroundColor = color;
    elements.value.value = color;
    elements.value.textContent = color;
    elements.hueValue.value = `${elements.hue.value}°`;
    elements.hueValue.textContent = `${elements.hue.value}°`;
    elements.saturationValue.value = `${elements.saturation.value}%`;
    elements.saturationValue.textContent = `${elements.saturation.value}%`;
    elements.dialog.style.setProperty('--picker-color', color);
    for (const mode of ['light', 'dark']) {
        elements.previewCard.style.setProperty(`--picker-accent-${mode}`, tokens[mode].accent);
        elements.previewCard.style.setProperty(`--picker-surface-${mode}`, tokens[mode].surface);
        elements.previewCard.style.setProperty(`--picker-text-${mode}`, tokens[mode].text);
    }
    elements.saturation.style.background = `linear-gradient(to right, ${hslToHex(elements.hue.value, 0, PICKER_LIGHTNESS)}, ${hslToHex(elements.hue.value, 100, PICKER_LIGHTNESS)})`;
}

function closeColorPicker(restoreFocus = true) {
    const elements = pickerElements();
    if (!elements.overlay.classList.contains('visible')) return;
    elements.overlay.classList.remove('visible');
    elements.overlay.setAttribute('aria-hidden', 'true');
    const trigger = elements.trigger;
    elements.trigger = null;
    elements.onApply = null;
    elements.originalColor = null;
    elements.dirty = false;
    if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function setupPickerListeners(elements) {
    if (elements.initialized) return;
    elements.initialized = true;
    elements.hue.addEventListener('input', () => {
        elements.dirty = true;
        updatePickerPreview(elements);
    });
    elements.saturation.addEventListener('input', () => {
        elements.dirty = true;
        updatePickerPreview(elements);
    });
    elements.close.addEventListener('click', () => closeColorPicker());
    elements.cancel.addEventListener('click', () => closeColorPicker());
    elements.overlay.addEventListener('click', event => {
        if (event.target === elements.overlay) closeColorPicker();
    });
    elements.apply.addEventListener('click', () => {
        const onApply = elements.onApply;
        const color = selectedPickerColor(elements);
        closeColorPicker();
        onApply?.(color);
    });
    elements.overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeColorPicker();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...elements.dialog.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
}

export function openColorPicker({ color, itemName = '', trigger = null, onApply }) {
    const elements = pickerElements();
    setupPickerListeners(elements);
    const originalColor = normalizeHexColor(color) || LEGACY_PALETTE[0];
    const initial = hexToHsl(originalColor);
    elements.hue.value = String(initial.h);
    elements.saturation.value = String(initial.s);
    elements.title.textContent = itemName ? `Item Color: ${itemName}` : 'Item Color';
    elements.trigger = trigger;
    elements.onApply = onApply;
    elements.originalColor = originalColor;
    elements.dirty = false;
    updatePickerPreview(elements);
    elements.overlay.classList.add('visible');
    elements.overlay.setAttribute('aria-hidden', 'false');
    focusAfterModalTransition(elements.overlay, () => elements.hue);
}
