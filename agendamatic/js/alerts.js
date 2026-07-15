/**
 * alerts.js - Meeting warning scheduling and presentation
 */

import { calculateAdjustedIntervals, getState } from './state.js';

let previousSample = null;
let bannerTimeout = null;
let pulseTimeout = null;
let audioContext = null;

function getItemKey(adjusted) {
    const item = adjusted.items[adjusted.currentItemIndex];
    return item ? `${item.id}:${adjusted.currentItemIndex}` : null;
}

function formatOffset(seconds) {
    if (seconds === 0) return 'Time is up';
    if (seconds % 60 === 0) {
        const minutes = seconds / 60;
        return `${minutes} minute${minutes === 1 ? '' : 's'} remaining`;
    }
    return `${seconds} second${seconds === 1 ? '' : 's'} remaining`;
}

export function parseAlertOffsets(value) {
    const tokens = String(value).split(/[\n,]+/).map(token => token.trim()).filter(Boolean);
    if (tokens.length === 0) {
        throw new Error('Enter at least one warning time, such as “60s, 0s”.');
    }

    const offsets = tokens.map(token => {
        const match = token.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)?$/i);
        if (!match) throw new Error(`Invalid warning time: “${token}”.`);
        const amount = Number(match[1]);
        const seconds = match[2]?.toLowerCase().startsWith('m') ? amount * 60 : amount;
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400) {
            throw new Error(`Warning time is out of range: “${token}”.`);
        }
        return Math.round(seconds);
    });

    return [...new Set(offsets)].sort((a, b) => b - a);
}

export function formatAlertOffsets(offsets) {
    return offsets.map(seconds => seconds % 60 === 0 && seconds !== 0
        ? `${seconds / 60}m`
        : `${seconds}s`).join(', ');
}

function showAlertBanner(message) {
    let banner = document.getElementById('meeting-alert-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'meeting-alert-banner';
        banner.className = 'meeting-alert-banner';
        banner.setAttribute('role', 'status');
        banner.setAttribute('aria-live', 'assertive');
        document.body.appendChild(banner);
    }
    banner.textContent = message;
    banner.classList.add('visible');
    clearTimeout(bannerTimeout);
    bannerTimeout = window.setTimeout(() => banner.classList.remove('visible'), 3500);
}

function pulseScreen() {
    document.body.classList.remove('meeting-alert-pulse');
    void document.body.offsetWidth;
    document.body.classList.add('meeting-alert-pulse');
    clearTimeout(pulseTimeout);
    pulseTimeout = window.setTimeout(() => document.body.classList.remove('meeting-alert-pulse'), 1300);
}

function playTone(frequency, start, duration, gain = 0.055) {
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(0, start);
    volume.gain.linearRampToValueAtTime(gain, start + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(volume);
    volume.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
}

function playAlertSound(style) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    audioContext ||= new AudioContext();
    const now = audioContext.currentTime;
    if (audioContext.state === 'suspended') audioContext.resume();

    if (style === 'beep') {
        playTone(660, now, 0.32);
    } else if (style === 'double') {
        playTone(540, now, 0.18);
        playTone(720, now + 0.22, 0.2);
    } else {
        playTone(523, now, 0.24);
        playTone(659, now + 0.14, 0.28);
        playTone(784, now + 0.29, 0.38);
    }
}

function sendDesktopNotification(message, itemName) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(message, { body: itemName, tag: 'agendamatic-meeting-alert' });
}

export function triggerAlert({ seconds = 60, itemName = 'Current item', preview = false } = {}) {
    const settings = getState().settings;
    const message = `${preview ? 'Preview: ' : ''}${formatOffset(seconds)}${seconds === 0 ? ` for ${itemName}` : ''}`;
    const visual = settings.alertVisual || 'both';

    if (settings.oneMinWarning !== false) {
        if (visual === 'banner' || visual === 'both') showAlertBanner(message);
        if (visual === 'pulse' || visual === 'both') pulseScreen();
    }
    if (seconds === 0 && settings.overtimeFlash) pulseScreen();
    if (settings.soundEffects) playAlertSound(settings.alertSound || 'chime');
    if (settings.desktopNotifications && !preview) sendDesktopNotification(message, itemName);
}

export function processAlertTick() {
    const state = getState();
    if (!state.tracker.isRunning) {
        previousSample = null;
        return;
    }

    const adjusted = calculateAdjustedIntervals(new Date());
    const itemKey = getItemKey(adjusted);
    const remainingSeconds = Math.round((adjusted.currentRemaining ?? 0) * 60);
    if (!itemKey) return;

    if (!previousSample || previousSample.itemKey !== itemKey || remainingSeconds > previousSample.remainingSeconds + 2) {
        previousSample = { itemKey, remainingSeconds };
        return;
    }

    const item = adjusted.items[adjusted.currentItemIndex];
    const offsets = [...(state.settings.alertOffsetsSeconds || [60, 0])];
    if (state.settings.overtimeFlash && !offsets.includes(0)) offsets.push(0);
    offsets.forEach(seconds => {
        if (previousSample.remainingSeconds > seconds && remainingSeconds <= seconds) {
            triggerAlert({ seconds, itemName: item.name });
        }
    });
    previousSample = { itemKey, remainingSeconds };
}

export function previewAlert() {
    const state = getState();
    const item = state.items[state.tracker.activeItemIndex] || state.items[0];
    const seconds = state.settings.alertOffsetsSeconds?.[0] ?? 60;
    triggerAlert({ seconds, itemName: item?.name || 'Current item', preview: true });
}

export async function requestDesktopNotificationPermission() {
    if (!('Notification' in window)) {
        throw new Error('Desktop notifications are not supported by this browser.');
    }
    return Notification.requestPermission();
}
