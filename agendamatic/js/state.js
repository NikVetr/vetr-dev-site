/**
 * state.js - State management with URL encoding and localStorage persistence
 */

import { generateId, deepClone, parseDuration, formatDuration, addMinutes, parseTime } from './utils.js';

// LZ-String compression library (inline minimal implementation)
const LZString = {
    compressToEncodedURIComponent: function(input) {
        if (input == null) return "";
        return LZString._compress(input, 6, function(a) {
            return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$".charAt(a);
        });
    },
    decompressFromEncodedURIComponent: function(input) {
        if (input == null) return "";
        if (input === "") return null;
        input = input.replace(/ /g, "+");
        return LZString._decompress(input.length, 32, function(index) {
            return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$".indexOf(input.charAt(index));
        });
    },
    _compress: function(uncompressed, bitsPerChar, getCharFromInt) {
        if (uncompressed == null) return "";
        let i, value, context_dictionary = {}, context_dictionaryToCreate = {},
            context_c = "", context_wc = "", context_w = "", context_enlargeIn = 2,
            context_dictSize = 3, context_numBits = 2, context_data = [], context_data_val = 0, context_data_position = 0;
        for (i = 0; i < uncompressed.length; i++) {
            context_c = uncompressed.charAt(i);
            if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
                context_dictionary[context_c] = context_dictSize++;
                context_dictionaryToCreate[context_c] = true;
            }
            context_wc = context_w + context_c;
            if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
                context_w = context_wc;
            } else {
                if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                    if (context_w.charCodeAt(0) < 256) {
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1);
                            if (context_data_position === bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else { context_data_position++; }
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 8; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position === bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else { context_data_position++; }
                            value = value >> 1;
                        }
                    } else {
                        value = 1;
                        for (i = 0; i < context_numBits; i++) {
                            context_data_val = (context_data_val << 1) | value;
                            if (context_data_position === bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else { context_data_position++; }
                            value = 0;
                        }
                        value = context_w.charCodeAt(0);
                        for (i = 0; i < 16; i++) {
                            context_data_val = (context_data_val << 1) | (value & 1);
                            if (context_data_position === bitsPerChar - 1) {
                                context_data_position = 0;
                                context_data.push(getCharFromInt(context_data_val));
                                context_data_val = 0;
                            } else { context_data_position++; }
                            value = value >> 1;
                        }
                    }
                    context_enlargeIn--;
                    if (context_enlargeIn === 0) {
                        context_enlargeIn = Math.pow(2, context_numBits);
                        context_numBits++;
                    }
                    delete context_dictionaryToCreate[context_w];
                } else {
                    value = context_dictionary[context_w];
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1);
                        if (context_data_position === bitsPerChar - 1) {
                            context_data_position = 0;
                            context_data.push(getCharFromInt(context_data_val));
                            context_data_val = 0;
                        } else { context_data_position++; }
                        value = value >> 1;
                    }
                }
                context_enlargeIn--;
                if (context_enlargeIn === 0) {
                    context_enlargeIn = Math.pow(2, context_numBits);
                    context_numBits++;
                }
                context_dictionary[context_wc] = context_dictSize++;
                context_w = String(context_c);
            }
        }
        if (context_w !== "") {
            if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
                if (context_w.charCodeAt(0) < 256) {
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1);
                        if (context_data_position === bitsPerChar - 1) {
                            context_data_position = 0;
                            context_data.push(getCharFromInt(context_data_val));
                            context_data_val = 0;
                        } else { context_data_position++; }
                    }
                    value = context_w.charCodeAt(0);
                    for (i = 0; i < 8; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1);
                        if (context_data_position === bitsPerChar - 1) {
                            context_data_position = 0;
                            context_data.push(getCharFromInt(context_data_val));
                            context_data_val = 0;
                        } else { context_data_position++; }
                        value = value >> 1;
                    }
                } else {
                    value = 1;
                    for (i = 0; i < context_numBits; i++) {
                        context_data_val = (context_data_val << 1) | value;
                        if (context_data_position === bitsPerChar - 1) {
                            context_data_position = 0;
                            context_data.push(getCharFromInt(context_data_val));
                            context_data_val = 0;
                        } else { context_data_position++; }
                        value = 0;
                    }
                    value = context_w.charCodeAt(0);
                    for (i = 0; i < 16; i++) {
                        context_data_val = (context_data_val << 1) | (value & 1);
                        if (context_data_position === bitsPerChar - 1) {
                            context_data_position = 0;
                            context_data.push(getCharFromInt(context_data_val));
                            context_data_val = 0;
                        } else { context_data_position++; }
                        value = value >> 1;
                    }
                }
                context_enlargeIn--;
                if (context_enlargeIn === 0) {
                    context_enlargeIn = Math.pow(2, context_numBits);
                    context_numBits++;
                }
                delete context_dictionaryToCreate[context_w];
            } else {
                value = context_dictionary[context_w];
                for (i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1) | (value & 1);
                    if (context_data_position === bitsPerChar - 1) {
                        context_data_position = 0;
                        context_data.push(getCharFromInt(context_data_val));
                        context_data_val = 0;
                    } else { context_data_position++; }
                    value = value >> 1;
                }
            }
            context_enlargeIn--;
            if (context_enlargeIn === 0) {
                context_numBits++;
            }
        }
        value = 2;
        for (i = 0; i < context_numBits; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
            } else { context_data_position++; }
            value = value >> 1;
        }
        while (true) {
            context_data_val = (context_data_val << 1);
            if (context_data_position === bitsPerChar - 1) {
                context_data.push(getCharFromInt(context_data_val));
                break;
            } else context_data_position++;
        }
        return context_data.join('');
    },
    _decompress: function(length, resetValue, getNextValue) {
        let dictionary = [], enlargeIn = 4, dictSize = 4, numBits = 3,
            entry = "", result = [], i, w, bits, resb, maxpower, power,
            c, data = { val: getNextValue(0), position: resetValue, index: 1 };
        for (i = 0; i < 3; i++) dictionary[i] = i;
        bits = 0; maxpower = Math.pow(2, 2); power = 1;
        while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
        }
        switch (bits) {
            case 0:
                bits = 0; maxpower = Math.pow(2, 8); power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                c = String.fromCharCode(bits);
                break;
            case 1:
                bits = 0; maxpower = Math.pow(2, 16); power = 1;
                while (power !== maxpower) {
                    resb = data.val & data.position;
                    data.position >>= 1;
                    if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                    bits |= (resb > 0 ? 1 : 0) * power;
                    power <<= 1;
                }
                c = String.fromCharCode(bits);
                break;
            case 2:
                return "";
        }
        dictionary[3] = c;
        w = c;
        result.push(c);
        while (true) {
            if (data.index > length) return "";
            bits = 0; maxpower = Math.pow(2, numBits); power = 1;
            while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
            }
            switch (c = bits) {
                case 0:
                    bits = 0; maxpower = Math.pow(2, 8); power = 1;
                    while (power !== maxpower) {
                        resb = data.val & data.position;
                        data.position >>= 1;
                        if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                        bits |= (resb > 0 ? 1 : 0) * power;
                        power <<= 1;
                    }
                    dictionary[dictSize++] = String.fromCharCode(bits);
                    c = dictSize - 1;
                    enlargeIn--;
                    break;
                case 1:
                    bits = 0; maxpower = Math.pow(2, 16); power = 1;
                    while (power !== maxpower) {
                        resb = data.val & data.position;
                        data.position >>= 1;
                        if (data.position === 0) { data.position = resetValue; data.val = getNextValue(data.index++); }
                        bits |= (resb > 0 ? 1 : 0) * power;
                        power <<= 1;
                    }
                    dictionary[dictSize++] = String.fromCharCode(bits);
                    c = dictSize - 1;
                    enlargeIn--;
                    break;
                case 2:
                    return result.join('');
            }
            if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
            if (dictionary[c]) {
                entry = dictionary[c];
            } else {
                if (c === dictSize) {
                    entry = w + w.charAt(0);
                } else {
                    return null;
                }
            }
            result.push(entry);
            dictionary[dictSize++] = w + entry.charAt(0);
            enlargeIn--;
            if (enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
            w = entry;
        }
    }
};

// Default state
const DEFAULT_STATE = {
    items: [],
    settings: {
        startTime: '16:00',
        darkMode: false,
        soundEffects: false,
        syncSystemTime: false,
        density: 'comfortable',
        showProgressBar: true,
        buffer: 0,
        timerMode: 'countdown',
        oneMinWarning: true,
        overtimeFlash: false
    },
    exportOptions: {
        includeHeader: true,
        includeNotes: true,
        includePrep: false,
        includeContext: false
    },
    tracker: {
        isRunning: false,
        startedAt: null,
        pausedAt: null
    }
};

// Default agenda items - each has its own theme color that persists
const DEFAULT_ITEMS = [
    { id: generateId(), name: 'Welcome', lead: 'Chair', duration: '5m', locked: false, notes: '', themeColor: 1 },
    { id: generateId(), name: 'ED Report', lead: 'Director', duration: '30m', locked: true, notes: '', themeColor: 2 },
    { id: generateId(), name: 'Treasurer Report', lead: 'CFO', duration: '15m', locked: true, notes: '', themeColor: 3 },
    { id: generateId(), name: 'Committee Update', lead: 'Staff', duration: '10m', locked: false, notes: '', themeColor: 4 },
    { id: generateId(), name: 'Closing', lead: 'Chair', duration: '5m', locked: false, notes: '', themeColor: 1 }
];

const STORAGE_KEY = 'agendamatic_state';

// State subscribers
let subscribers = [];
let currentState = null;

/**
 * Get the current state
 * @returns {Object} Current state
 */
export function getState() {
    return currentState;
}

/**
 * Subscribe to state changes
 * @param {Function} callback - Function to call when state changes
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
    subscribers.push(callback);
    return () => {
        subscribers = subscribers.filter(sub => sub !== callback);
    };
}

/**
 * Notify all subscribers of state change
 */
function notifySubscribers() {
    subscribers.forEach(callback => callback(currentState));
}

/**
 * Update state and persist
 * @param {Object} updates - Partial state updates
 */
export function setState(updates) {
    currentState = { ...currentState, ...updates };
    persistState();
    notifySubscribers();
}

/**
 * Update a specific item by ID
 * @param {string} itemId - Item ID
 * @param {Object} updates - Item updates
 */
export function updateItem(itemId, updates) {
    const items = currentState.items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
    );
    setState({ items });
}

// Track next theme color to assign
let nextThemeColor = 1;

/**
 * Add a new agenda item
 * @param {Object} item - Item to add
 * @param {number} index - Optional index to insert at
 */
export function addItem(item = {}, index = -1) {
    // Assign a theme color if not provided
    const themeColor = item.themeColor || nextThemeColor;
    nextThemeColor = (nextThemeColor % 4) + 1;

    const newItem = {
        id: generateId(),
        name: item.name || 'New Item',
        lead: item.lead || '',
        duration: item.duration || '10m',
        locked: item.locked || false,
        notes: item.notes || '',
        themeColor: themeColor
    };

    let items;
    if (index >= 0 && index < currentState.items.length) {
        items = [...currentState.items];
        items.splice(index, 0, newItem);
    } else {
        items = [...currentState.items, newItem];
    }

    setState({ items });
    return newItem;
}

/**
 * Delete an item by ID
 * @param {string} itemId - Item ID to delete
 */
export function deleteItem(itemId) {
    const items = currentState.items.filter(item => item.id !== itemId);
    setState({ items });
}

/**
 * Reorder items (move item from one index to another)
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Destination index
 */
export function reorderItems(fromIndex, toIndex) {
    const items = [...currentState.items];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    setState({ items });
}

/**
 * Update settings
 * @param {Object} settings - Settings updates
 */
export function updateSettings(settings) {
    setState({
        settings: { ...currentState.settings, ...settings }
    });
}

/**
 * Update export options
 * @param {Object} options - Export options updates
 */
export function updateExportOptions(options) {
    setState({
        exportOptions: { ...currentState.exportOptions, ...options }
    });
}

/**
 * Update tracker state
 * @param {Object} tracker - Tracker updates
 */
export function updateTracker(tracker) {
    setState({
        tracker: { ...currentState.tracker, ...tracker }
    });
}

/**
 * Advance to the next item by ending the current item now and redistributing future time
 * Locked items are never compressed below their current duration
 * @param {Date} currentTime - Current wall-clock time
 * @returns {boolean} Whether an update was applied
 */
export function advanceToNextItem(currentTime = new Date()) {
    const { items, settings } = currentState;
    if (!items || items.length === 0) return false;

    const scheduledIntervals = calculateIntervals();
    if (scheduledIntervals.length === 0) return false;

    let currentIndex = -1;
    for (let i = 0; i < scheduledIntervals.length; i++) {
        const interval = scheduledIntervals[i];
        if (currentTime >= interval.startTime && currentTime < interval.endTime) {
            currentIndex = i;
            break;
        }
        if (currentTime >= interval.startTime) {
            currentIndex = i;
        }
    }

    if (currentIndex < 0) currentIndex = 0;
    if (currentIndex >= items.length - 1) return false;

    const scheduledCurrent = scheduledIntervals[currentIndex];
    if (!scheduledCurrent) return false;

    if (currentTime < scheduledCurrent.startTime) {
        return false;
    }

    const originalDuration = parseDuration(items[currentIndex].duration);
    const elapsedMinutes = Math.floor((currentTime - scheduledCurrent.startTime) / 60000);
    let newCurrentDuration = Math.max(1, elapsedMinutes);
    if (items[currentIndex].locked) {
        if (elapsedMinutes < originalDuration) {
            return false;
        }
        newCurrentDuration = Math.max(originalDuration, newCurrentDuration);
    }

    const scheduledEnd = scheduledIntervals[scheduledIntervals.length - 1].endTime;
    const remainingTotal = Math.max(0, Math.round((scheduledEnd - currentTime) / 60000));
    const buffer = settings.buffer || 0;

    const futureItems = items.slice(currentIndex + 1);
    const futureCount = futureItems.length;
    const totalFutureBuffer = Math.max(0, (futureCount - 1) * buffer);
    let remainingForFuture = Math.max(0, remainingTotal - totalFutureBuffer);

    const futureDurations = futureItems.map(item => parseDuration(item.duration));
    const totalFutureDuration = futureDurations.reduce((sum, duration) => sum + duration, 0);
    const lockedTotal = futureItems.reduce((sum, item, idx) => {
        return item.locked ? sum + futureDurations[idx] : sum;
    }, 0);
    const unlockedTotal = totalFutureDuration - lockedTotal;

    let newFutureDurations;
    if (remainingForFuture >= totalFutureDuration) {
        const scale = totalFutureDuration > 0 ? remainingForFuture / totalFutureDuration : 1;
        newFutureDurations = futureDurations.map(duration => Math.max(1, Math.round(duration * scale)));
    } else {
        const availableForUnlocked = Math.max(0, remainingForFuture - lockedTotal);
        const scale = unlockedTotal > 0 ? availableForUnlocked / unlockedTotal : 0;
        newFutureDurations = futureDurations.map((duration, idx) => {
            if (futureItems[idx].locked) return duration;
            return Math.max(1, Math.round(duration * scale));
        });
    }

    // Adjust for rounding differences where possible
    let durationSum = newFutureDurations.reduce((sum, duration) => sum + duration, 0);
    let diff = remainingForFuture - durationSum;
    const adjustable = futureItems
        .map((item, idx) => ({ idx, locked: item.locked }))
        .filter(entry => !entry.locked);

    if (diff !== 0 && adjustable.length > 0) {
        let safety = 0;
        while (diff !== 0 && safety < 5000) {
            for (const entry of adjustable) {
                if (diff === 0) break;
                if (diff > 0) {
                    newFutureDurations[entry.idx] += 1;
                    diff -= 1;
                } else if (newFutureDurations[entry.idx] > 1) {
                    newFutureDurations[entry.idx] -= 1;
                    diff += 1;
                }
            }
            if (diff < 0 && adjustable.every(entry => newFutureDurations[entry.idx] <= 1)) {
                break;
            }
            safety += 1;
        }
    }

    const updatedItems = items.map((item, index) => {
        if (index < currentIndex) return item;
        if (index === currentIndex) {
            return { ...item, duration: formatDuration(newCurrentDuration) };
        }
        const futureIndex = index - currentIndex - 1;
        const nextDuration = newFutureDurations[futureIndex] ?? parseDuration(item.duration);
        return { ...item, duration: formatDuration(nextDuration) };
    });

    setState({ items: updatedItems });
    return true;
}

/**
 * Calculate intervals for all items based on start time and durations
 * Takes into account locked items and adjusts unlocked items proportionally
 * @returns {Array} Items with calculated start and end times
 */
export function calculateIntervals() {
    const { items, settings } = currentState;
    const startTime = parseTime(settings.startTime);
    const buffer = settings.buffer || 0;

    if (!items || items.length === 0) return [];

    // Calculate total duration and end time
    let totalDuration = 0;
    items.forEach(item => {
        totalDuration += parseDuration(item.duration) + buffer;
    });
    // Remove buffer after last item
    totalDuration -= buffer;

    const endTime = addMinutes(startTime, totalDuration);

    // Calculate intervals
    let currentTime = new Date(startTime);
    return items.map((item, index) => {
        const duration = parseDuration(item.duration);
        const itemStart = new Date(currentTime);
        const itemEnd = addMinutes(currentTime, duration);

        currentTime = addMinutes(itemEnd, index < items.length - 1 ? buffer : 0);

        return {
            ...item,
            startTime: itemStart,
            endTime: itemEnd,
            // Use item's stored themeColor, fall back to position-based if not set
            themeNumber: item.themeColor || ((index % 4) + 1)
        };
    });
}

/**
 * Calculate adjusted intervals when running behind/ahead of schedule
 * Locked items keep their duration, unlocked items are proportionally adjusted
 * @param {Date} currentTime - Current wall-clock time
 * @returns {Object} Adjusted items and status info
 */
export function calculateAdjustedIntervals(currentTime = new Date()) {
    const { items, settings, tracker } = currentState;
    const scheduledStart = parseTime(settings.startTime);
    const buffer = settings.buffer || 0;

    if (!items || items.length === 0) {
        return { items: [], status: 'on-time', difference: 0 };
    }

    // If tracker hasn't started, return scheduled intervals
    if (!tracker.isRunning && !tracker.startedAt) {
        return {
            items: calculateIntervals(),
            status: 'on-time',
            difference: 0,
            currentItemIndex: -1
        };
    }

    // Calculate scheduled total
    let scheduledTotal = 0;
    items.forEach((item, i) => {
        scheduledTotal += parseDuration(item.duration) + (i < items.length - 1 ? buffer : 0);
    });
    const scheduledEnd = addMinutes(scheduledStart, scheduledTotal);

    // Find current item based on scheduled times
    let elapsed = Math.max(0, (currentTime - scheduledStart) / 60000);
    let currentItemIndex = -1;
    let elapsedCheck = 0;

    for (let i = 0; i < items.length; i++) {
        const duration = parseDuration(items[i].duration) + (i < items.length - 1 ? buffer : 0);
        if (elapsed >= elapsedCheck && elapsed < elapsedCheck + duration) {
            currentItemIndex = i;
            break;
        }
        elapsedCheck += duration;
    }

    if (currentItemIndex === -1 && elapsed >= elapsedCheck) {
        currentItemIndex = items.length - 1;
    }

    // Calculate remaining time and adjust unlocked items
    const remainingTime = Math.max(0, (scheduledEnd - currentTime) / 60000);

    // Calculate locked duration remaining (items after current)
    let lockedDuration = 0;
    let unlockedCount = 0;
    let unlockedDuration = 0;

    for (let i = currentItemIndex + 1; i < items.length; i++) {
        const duration = parseDuration(items[i].duration);
        if (items[i].locked) {
            lockedDuration += duration;
        } else {
            unlockedCount++;
            unlockedDuration += duration;
        }
    }

    // Calculate how much time is available for unlocked items
    const availableForUnlocked = Math.max(0, remainingTime - lockedDuration - (items.length - currentItemIndex - 2) * buffer);
    const scaleFactor = unlockedDuration > 0 ? availableForUnlocked / unlockedDuration : 1;

    // Build adjusted items
    let runningTime = new Date(scheduledStart);
    const adjustedItems = items.map((item, index) => {
        let duration = parseDuration(item.duration);

        // If item is in the future and unlocked, scale it
        if (index > currentItemIndex && !item.locked && scaleFactor !== 1) {
            duration = Math.max(1, Math.round(duration * scaleFactor));
        }

        const itemStart = new Date(runningTime);
        const itemEnd = addMinutes(runningTime, duration);

        runningTime = addMinutes(itemEnd, index < items.length - 1 ? buffer : 0);

        return {
            ...item,
            startTime: itemStart,
            endTime: itemEnd,
            adjustedDuration: duration,
            // Use item's stored themeColor, fall back to position-based if not set
            themeNumber: item.themeColor || ((index % 4) + 1)
        };
    });

    // Calculate status
    const scheduledCurrentEnd = calculateIntervals()[currentItemIndex]?.endTime || scheduledEnd;
    const actualCurrentEnd = adjustedItems[currentItemIndex]?.endTime || new Date();
    const difference = Math.round((currentTime - scheduledCurrentEnd) / 60000);

    let status = 'on-time';
    if (difference > 1) status = 'behind';
    else if (difference < -1) status = 'ahead';

    return {
        items: adjustedItems,
        status,
        difference: Math.abs(difference),
        currentItemIndex
    };
}

/**
 * Encode state to URL-safe compressed string
 * @returns {string} Compressed state string
 */
export function encodeStateToURL() {
    const stateToEncode = {
        i: currentState.items.map(item => ({
            n: item.name,
            l: item.lead,
            d: item.duration,
            k: item.locked ? 1 : 0,
            o: item.notes,
            c: item.themeColor || 1
        })),
        s: {
            t: currentState.settings.startTime,
            dm: currentState.settings.darkMode ? 1 : 0,
            se: currentState.settings.soundEffects ? 1 : 0,
            st: currentState.settings.syncSystemTime ? 1 : 0,
            dn: currentState.settings.density,
            sp: currentState.settings.showProgressBar ? 1 : 0,
            b: currentState.settings.buffer,
            tm: currentState.settings.timerMode,
            ow: currentState.settings.oneMinWarning ? 1 : 0,
            of: currentState.settings.overtimeFlash ? 1 : 0
        }
    };

    const json = JSON.stringify(stateToEncode);
    return LZString.compressToEncodedURIComponent(json);
}

/**
 * Decode state from URL-safe compressed string
 * @param {string} encoded - Compressed state string
 * @returns {Object|null} Decoded state or null if invalid
 */
export function decodeStateFromURL(encoded) {
    try {
        const json = LZString.decompressFromEncodedURIComponent(encoded);
        if (!json) return null;

        const decoded = JSON.parse(json);

        return {
            items: decoded.i.map((item, index) => ({
                id: generateId(),
                name: item.n || '',
                lead: item.l || '',
                duration: item.d || '10m',
                locked: item.k === 1,
                notes: item.o || '',
                themeColor: item.c || ((index % 4) + 1)
            })),
            settings: {
                ...DEFAULT_STATE.settings,
                startTime: decoded.s?.t || DEFAULT_STATE.settings.startTime,
                darkMode: decoded.s?.dm === 1,
                soundEffects: decoded.s?.se === 1,
                syncSystemTime: decoded.s?.st === 1,
                density: decoded.s?.dn || DEFAULT_STATE.settings.density,
                showProgressBar: decoded.s?.sp === undefined
                    ? DEFAULT_STATE.settings.showProgressBar
                    : decoded.s?.sp === 1,
                buffer: decoded.s?.b ?? 0,
                timerMode: decoded.s?.tm || DEFAULT_STATE.settings.timerMode,
                oneMinWarning: decoded.s?.ow === undefined
                    ? DEFAULT_STATE.settings.oneMinWarning
                    : decoded.s?.ow === 1,
                overtimeFlash: decoded.s?.of === 1
            }
        };
    } catch (e) {
        console.error('Failed to decode state from URL:', e);
        return null;
    }
}

/**
 * Update URL with current state
 */
export function updateURL() {
    const encoded = encodeStateToURL();
    const url = new URL(window.location.href);
    url.searchParams.set('s', encoded);
    window.history.replaceState({}, '', url.toString());
}

/**
 * Load state from URL if present
 * @returns {Object|null} State from URL or null
 */
export function loadFromURL() {
    const url = new URL(window.location.href);
    const encoded = url.searchParams.get('s');
    if (encoded) {
        return decodeStateFromURL(encoded);
    }
    return null;
}

/**
 * Save state to localStorage
 */
function persistState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
        // Also update URL
        updateURL();
    } catch (e) {
        console.error('Failed to persist state:', e);
    }
}

/**
 * Load state from localStorage
 * @returns {Object|null} State from localStorage or null
 */
function loadFromLocalStorage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load from localStorage:', e);
    }
    return null;
}

/**
 * Initialize state from URL, localStorage, or defaults
 */
export function initializeState() {
    // Priority: URL > localStorage > defaults
    let state = loadFromURL();

    if (!state) {
        state = loadFromLocalStorage();
    }

    if (!state) {
        state = {
            ...deepClone(DEFAULT_STATE),
            items: deepClone(DEFAULT_ITEMS)
        };
    } else {
        // Merge with defaults to ensure all properties exist
        state = {
            ...deepClone(DEFAULT_STATE),
            ...state,
            settings: { ...DEFAULT_STATE.settings, ...state.settings },
            exportOptions: { ...DEFAULT_STATE.exportOptions, ...state.exportOptions },
            tracker: { ...DEFAULT_STATE.tracker, ...state.tracker }
        };
    }

    currentState = state;
    notifySubscribers();
    return currentState;
}

/**
 * Export state as JSON
 * @returns {string} JSON string
 */
export function exportToJSON() {
    return JSON.stringify(currentState, null, 2);
}

/**
 * Import state from JSON
 * @param {string} json - JSON string
 * @returns {boolean} Success
 */
export function importFromJSON(json) {
    try {
        const imported = JSON.parse(json);

        // Validate basic structure
        if (!imported.items || !Array.isArray(imported.items)) {
            throw new Error('Invalid state: missing items array');
        }

        // Ensure all items have IDs
        imported.items = imported.items.map(item => ({
            ...item,
            id: item.id || generateId()
        }));

        // Merge with defaults
        currentState = {
            ...deepClone(DEFAULT_STATE),
            ...imported,
            settings: { ...DEFAULT_STATE.settings, ...imported.settings },
            exportOptions: { ...DEFAULT_STATE.exportOptions, ...imported.exportOptions },
            tracker: { ...DEFAULT_STATE.tracker }
        };

        persistState();
        notifySubscribers();
        return true;
    } catch (e) {
        console.error('Failed to import JSON:', e);
        return false;
    }
}

/**
 * Reset state to defaults
 */
export function resetState() {
    currentState = {
        ...deepClone(DEFAULT_STATE),
        items: deepClone(DEFAULT_ITEMS)
    };
    persistState();
    notifySubscribers();
}
