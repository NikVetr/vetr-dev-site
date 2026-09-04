/**
 * state.js - State management with URL encoding and localStorage persistence
 */

import {
    generateId,
    deepClone,
    parseDuration,
    formatDuration,
    formatTimeValue,
    addMinutes,
    parseTime
} from './utils.js';
import {
    colorsMatch,
    getSeparatedColor,
    LEGACY_PALETTE,
    normalizeHexColor
} from './colors.js';

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
        for (let inputIndex = 0; inputIndex < uncompressed.length; inputIndex++) {
            context_c = uncompressed.charAt(inputIndex);
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
    schemaVersion: 2,
    items: [],
    stagedItems: [],
    settings: {
        startTime: '16:00',
        pinStartTime: true,
        pinEndTime: true,
        darkMode: false,
        soundEffects: false,
        syncSystemTime: false,
        density: 'comfortable',
        showProgressBar: true,
        buffer: 0,
        timerMode: 'countdown',
        oneMinWarning: true,
        overtimeFlash: false,
        alertOffsetsSeconds: [60, 0],
        alertSound: 'chime',
        alertVisual: 'both',
        desktopNotifications: false,
        separateAdjacentColors: false
    },
    exportOptions: {
        includeHeader: true,
        includeNotes: true,
        includePrep: false,
        includeContext: false,
        includeActionItems: false
    },
    metadata: {
        title: 'Board Meeting',
        date: '',
        location: '',
        url: '',
        attendeeGroups: [],
        actionItems: [],
        initialized: false
    },
    tracker: {
        isRunning: false,
        startedAt: null,
        scheduledStartAt: null,
        pausedAt: null,
        accumulatedPauseMs: 0,
        activeItemIndex: 0,
        activeItemId: null,
        activeStartedAt: null,
        completedAt: null,
        completedDiffById: {},
        overallDeltaMinutes: 0,
        expectedSnapshot: null,
        varianceMode: false,
        varianceActivatedAt: null
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
const STORAGE_URL_KEY = 'agendamatic_last_url_state';
const SESSION_ISOLATION_KEY = 'agendamatic_isolated_share_v1';
const HISTORY_LIMIT = 100;
const STATE_SCHEMA_VERSION = 2;

// State subscribers
let subscribers = [];
let currentState = null;
let undoStack = [];
let redoStack = [];
let historyTransaction = null;
let lastHistoryGroup = null;
let lastHistoryTime = 0;
let useSessionPersistence = false;

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function roundToTenth(value) {
    return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function timeOnReferenceDate(timeValue, referenceValue = new Date()) {
    const reference = validDate(referenceValue) || new Date();
    const parsed = parseTime(timeValue);
    return new Date(
        reference.getFullYear(),
        reference.getMonth(),
        reference.getDate(),
        parsed.getHours(),
        parsed.getMinutes(),
        0,
        0
    );
}

function normalizeString(value, fallback = '') {
    if (value === undefined || value === null) return fallback;
    return typeof value === 'string' ? value : String(value);
}

function normalizeBoolean(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
}

function normalizeEnum(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

function normalizeClockTime(value, fallback) {
    const match = normalizeString(value).trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (!match) return fallback;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const period = match[3]?.toLowerCase();
    if (minutes > 59 || (period ? hours < 1 || hours > 12 : hours > 23)) return fallback;
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeDuration(value, fallback = '10m') {
    const minutes = parseDuration(value);
    return Number.isFinite(minutes) && Math.round(minutes * 10) > 0 && minutes <= 525600
        ? formatDuration(minutes)
        : fallback;
}

function normalizeSettings(settings = {}) {
    const source = settings && typeof settings === 'object' ? settings : {};
    const bufferValue = Number(source.buffer);
    const rawAlertOffsets = Array.isArray(source.alertOffsetsSeconds)
        ? source.alertOffsetsSeconds
        : DEFAULT_STATE.settings.alertOffsetsSeconds;
    const alertOffsetsSeconds = [...new Set(rawAlertOffsets
        .map(value => Number(value))
        .filter(value => Number.isFinite(value) && value >= 0)
        .map(value => Math.round(value)))]
        .sort((a, b) => b - a);
    return {
        startTime: normalizeClockTime(source.startTime, DEFAULT_STATE.settings.startTime),
        pinStartTime: normalizeBoolean(source.pinStartTime, DEFAULT_STATE.settings.pinStartTime),
        pinEndTime: normalizeBoolean(source.pinEndTime, DEFAULT_STATE.settings.pinEndTime),
        darkMode: normalizeBoolean(source.darkMode, DEFAULT_STATE.settings.darkMode),
        soundEffects: normalizeBoolean(source.soundEffects, DEFAULT_STATE.settings.soundEffects),
        syncSystemTime: normalizeBoolean(source.syncSystemTime, DEFAULT_STATE.settings.syncSystemTime),
        density: normalizeEnum(
            source.density,
            ['comfortable', 'compact', 'presentation'],
            DEFAULT_STATE.settings.density
        ),
        showProgressBar: normalizeBoolean(source.showProgressBar, DEFAULT_STATE.settings.showProgressBar),
        buffer: Number.isFinite(bufferValue)
            ? Math.max(0, Math.min(30, Math.round(bufferValue)))
            : DEFAULT_STATE.settings.buffer,
        timerMode: normalizeEnum(
            source.timerMode,
            ['countdown', 'elapsed'],
            DEFAULT_STATE.settings.timerMode
        ),
        oneMinWarning: normalizeBoolean(source.oneMinWarning, DEFAULT_STATE.settings.oneMinWarning),
        overtimeFlash: normalizeBoolean(source.overtimeFlash, DEFAULT_STATE.settings.overtimeFlash),
        alertOffsetsSeconds: alertOffsetsSeconds.length > 0
            ? alertOffsetsSeconds
            : [...DEFAULT_STATE.settings.alertOffsetsSeconds],
        alertSound: normalizeEnum(
            source.alertSound,
            ['chime', 'beep', 'double'],
            DEFAULT_STATE.settings.alertSound
        ),
        alertVisual: normalizeEnum(
            source.alertVisual,
            ['both', 'banner', 'pulse'],
            DEFAULT_STATE.settings.alertVisual
        ),
        desktopNotifications: normalizeBoolean(
            source.desktopNotifications,
            DEFAULT_STATE.settings.desktopNotifications
        ),
        separateAdjacentColors: normalizeBoolean(
            source.separateAdjacentColors,
            DEFAULT_STATE.settings.separateAdjacentColors
        )
    };
}

function normalizeExportOptions(exportOptions = {}) {
    const source = exportOptions && typeof exportOptions === 'object' ? exportOptions : {};
    return Object.fromEntries(Object.entries(DEFAULT_STATE.exportOptions).map(([key, fallback]) => [
        key,
        normalizeBoolean(source[key], fallback)
    ]));
}

function normalizeItems(items, seenIds = new Set()) {
    if (!Array.isArray(items)) return [];
    return items.map((rawItem, index) => {
        const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
        const normalizedCustomColor = normalizeHexColor(item.customColor);
        const presetIndex = normalizedCustomColor
            ? LEGACY_PALETTE.indexOf(normalizedCustomColor)
            : -1;
        const fallbackThemeColor = Number.isInteger(Number(item.themeColor)) &&
            Number(item.themeColor) >= 1 && Number(item.themeColor) <= 8
            ? Number(item.themeColor)
            : ((index % 8) + 1);
        let id = item.id === undefined || item.id === null || item.id === ''
            ? generateId()
            : String(item.id);
        while (seenIds.has(id)) id = generateId();
        seenIds.add(id);
        return {
            ...item,
            id,
            name: normalizeString(item.name, `Item ${index + 1}`),
            lead: normalizeString(item.lead),
            duration: normalizeDuration(item.duration),
            locked: normalizeBoolean(item.locked, false),
            notes: normalizeString(item.notes),
            ...(Object.prototype.hasOwnProperty.call(item, 'context')
                ? { context: normalizeString(item.context) }
                : {}),
            ...(Object.prototype.hasOwnProperty.call(item, 'prep')
                ? { prep: normalizeString(item.prep) }
                : {}),
            customColor: presetIndex >= 0 ? null : normalizedCustomColor,
            themeColor: presetIndex >= 0 ? presetIndex + 1 : fallbackThemeColor
        };
    });
}

function normalizeCalendarDate(value) {
    const date = normalizeString(value).trim();
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leapYear = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
        ? date
        : '';
}

function normalizeMetadata(metadata = {}) {
    const source = metadata && typeof metadata === 'object' ? metadata : {};
    const legacyAttendees = Array.isArray(source.attendees) ? source.attendees : [];
    const hasLegacyAttendeeData = legacyAttendees.length > 0 || !!source.attendeeGroup;
    const rawGroups = Array.isArray(source.attendeeGroups) &&
        (source.attendeeGroups.length > 0 || !hasLegacyAttendeeData)
        ? source.attendeeGroups
        : (hasLegacyAttendeeData
            ? [{ name: source.attendeeGroup || 'Attendees', attendees: legacyAttendees }]
            : []);
    const groupIds = new Set();
    const attendeeIds = new Set();
    const attendeeGroups = rawGroups.map((rawGroup, groupIndex) => {
        const group = rawGroup && typeof rawGroup === 'object' ? rawGroup : {};
        const attendees = Array.isArray(group.attendees) ? group.attendees : [];
        let groupId = normalizeString(group.id, `attendee-group-${groupIndex + 1}`);
        while (groupIds.has(groupId)) groupId = generateId();
        groupIds.add(groupId);
        return {
            id: groupId,
            name: normalizeString(group.name, 'Attendees'),
            attendees: attendees.map((rawAttendee, attendeeIndex) => {
                const attendee = rawAttendee && typeof rawAttendee === 'object' ? rawAttendee : {};
                let attendeeId = normalizeString(attendee.id, `${groupId}-attendee-${attendeeIndex + 1}`);
                while (attendeeIds.has(attendeeId)) attendeeId = generateId();
                attendeeIds.add(attendeeId);
                return {
                    id: attendeeId,
                    name: normalizeString(attendee.name),
                    present: normalizeBoolean(attendee.present, false)
                };
            })
        };
    });
    const actionIds = new Set();
    const actionItems = (Array.isArray(source.actionItems) ? source.actionItems : [])
        .map((rawAction, index) => {
            const action = rawAction && typeof rawAction === 'object' ? rawAction : {};
            let id = normalizeString(action.id, `action-item-${index + 1}`);
            while (actionIds.has(id)) id = generateId();
            actionIds.add(id);
            return {
                id,
                text: normalizeString(action.text),
                owner: normalizeString(action.owner),
                done: normalizeBoolean(action.done, false)
            };
        });
    return {
        title: normalizeString(source.title, DEFAULT_STATE.metadata.title),
        date: normalizeCalendarDate(source.date),
        location: normalizeString(source.location),
        url: normalizeString(source.url),
        attendeeGroups,
        actionItems,
        initialized: normalizeBoolean(source.initialized, false)
    };
}

function plannedItemStart(items, itemIndex, scheduledStartAt, buffer) {
    const start = validDate(scheduledStartAt);
    if (!start) return null;
    const minutesBefore = items.slice(0, itemIndex).reduce((sum, item) => {
        return sum + parseDuration(item.duration) + Number(buffer || 0);
    }, 0);
    return addMinutes(start, minutesBefore);
}

function planStartFromActiveAnchor(items, tracker, buffer) {
    const fallback = validDate(tracker?.scheduledStartAt);
    if (!tracker?.startedAt || tracker.completedAt || items.length === 0) return fallback;

    const idIndex = tracker.activeItemId
        ? items.findIndex(item => item.id === String(tracker.activeItemId))
        : -1;
    const activeIndex = idIndex >= 0
        ? idIndex
        : Math.max(0, Math.min(items.length - 1, tracker.activeItemIndex || 0));
    const activeStartedAt = validDate(tracker.activeStartedAt);
    if (!activeStartedAt) return fallback;

    const minutesBefore = items.slice(0, activeIndex).reduce((sum, item) => {
        return sum + parseDuration(item.duration) + Number(buffer || 0);
    }, 0);
    return addMinutes(activeStartedAt, -minutesBefore);
}

function normalizeExpectedSnapshot(snapshot, scheduledStart, settings) {
    if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
        return null;
    }
    const snapshotItems = normalizeItems(snapshot.items);
    if (snapshotItems.length === 0) return null;
    const buffer = Number(snapshot.buffer);
    return {
        capturedAt: validDate(snapshot.capturedAt)?.toISOString() || null,
        startTime: normalizeClockTime(snapshot.startTime, settings.startTime),
        scheduledStartAt: validDate(snapshot.scheduledStartAt || scheduledStart)?.toISOString() || null,
        buffer: Number.isFinite(buffer)
            ? Math.max(0, Math.min(30, Math.round(buffer)))
            : settings.buffer,
        items: snapshotItems
    };
}

function normalizeTracker(tracker, items, settings) {
    const source = tracker && typeof tracker === 'object' ? tracker : {};
    const normalized = { ...DEFAULT_STATE.tracker, ...source };
    const startedAt = validDate(normalized.startedAt);
    const rawCompletedAt = validDate(normalized.completedAt);
    const completedAt = startedAt && rawCompletedAt && rawCompletedAt >= startedAt
        ? rawCompletedAt
        : null;
    const scheduledStart = startedAt
        ? (validDate(normalized.scheduledStartAt) || timeOnReferenceDate(settings.startTime, startedAt))
        : null;

    let activeItemIndex = Number.isFinite(normalized.activeItemIndex)
        ? Math.trunc(normalized.activeItemIndex)
        : 0;
    const requestedActiveId = normalized.activeItemId === undefined || normalized.activeItemId === null
        ? null
        : String(normalized.activeItemId);
    const idIndex = requestedActiveId === null
        ? -1
        : items.findIndex(item => item.id === requestedActiveId);
    const activeIdentityWasLost = requestedActiveId !== null && idIndex < 0;

    let activeItemId = null;
    if (completedAt) {
        activeItemIndex = items.length;
    } else if (startedAt && items.length > 0) {
        activeItemIndex = idIndex >= 0
            ? idIndex
            : Math.max(0, Math.min(items.length - 1, activeItemIndex));
        activeItemId = items[activeItemIndex].id;
    } else {
        activeItemIndex = 0;
    }

    let activeStartedAt = startedAt && (completedAt || (activeItemId && !activeIdentityWasLost))
        ? validDate(normalized.activeStartedAt)
        : null;
    if (!activeStartedAt && scheduledStart && activeItemId) {
        activeStartedAt = plannedItemStart(items, activeItemIndex, scheduledStart, settings.buffer);
    }

    const isRunning = normalizeBoolean(normalized.isRunning, false) &&
        !!startedAt && !completedAt && items.length > 0;
    const pausedAt = !isRunning && startedAt && !completedAt
        ? validDate(normalized.pausedAt)
        : null;
    const expectedSnapshot = normalizeExpectedSnapshot(normalized.expectedSnapshot, scheduledStart, settings);
    const varianceMode = !!expectedSnapshot && normalizeBoolean(normalized.varianceMode, false);

    return {
        ...normalized,
        isRunning,
        startedAt: startedAt?.toISOString() || null,
        scheduledStartAt: scheduledStart?.toISOString() || null,
        pausedAt: pausedAt?.toISOString() || null,
        accumulatedPauseMs: Number.isFinite(Number(normalized.accumulatedPauseMs))
            ? Math.max(0, Number(normalized.accumulatedPauseMs))
            : 0,
        activeItemIndex,
        activeItemId,
        activeStartedAt: activeStartedAt?.toISOString() || null,
        completedAt: completedAt?.toISOString() || null,
        completedDiffById: normalized.completedDiffById && typeof normalized.completedDiffById === 'object'
            ? normalized.completedDiffById
            : {},
        overallDeltaMinutes: Number.isFinite(Number(normalized.overallDeltaMinutes))
            ? Number(normalized.overallDeltaMinutes)
            : 0,
        expectedSnapshot,
        varianceMode,
        varianceActivatedAt: varianceMode
            ? validDate(normalized.varianceActivatedAt)?.toISOString() || null
            : null
    };
}

function normalizeState(state) {
    const source = state && typeof state === 'object' ? state : {};
    const seenIds = new Set();
    const items = normalizeItems(source.items, seenIds);
    const stagedItems = normalizeItems(source.stagedItems, seenIds);
    const settings = normalizeSettings(source.settings);
    const exportOptions = normalizeExportOptions(source.exportOptions);
    const metadata = normalizeMetadata(source.metadata);
    return {
        ...deepClone(DEFAULT_STATE),
        ...source,
        schemaVersion: STATE_SCHEMA_VERSION,
        items,
        stagedItems,
        settings,
        exportOptions,
        metadata,
        tracker: normalizeTracker(source.tracker, items, settings)
    };
}

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
export function setState(updates, options = {}) {
    const nextState = normalizeState(options.replace ? updates : { ...currentState, ...updates });
    if (JSON.stringify(nextState) === JSON.stringify(currentState)) return false;

    if (!historyTransaction) {
        const now = Date.now();
        const canCoalesce = options.historyGroup &&
            options.historyGroup === lastHistoryGroup &&
            now - lastHistoryTime < 750;
        if (!canCoalesce) {
            undoStack.push(deepClone(currentState));
            if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        }
        redoStack = [];
        lastHistoryGroup = options.historyGroup || null;
        lastHistoryTime = now;
    }

    currentState = nextState;
    persistState();
    notifySubscribers();
    return true;
}

/** Group a sequence of live updates into one undo step. */
export function beginHistoryTransaction() {
    if (historyTransaction || !currentState) return;
    historyTransaction = { before: deepClone(currentState) };
}

/** Finish a grouped state update and record its initial state. */
export function endHistoryTransaction() {
    if (!historyTransaction) return;
    const before = historyTransaction.before;
    historyTransaction = null;
    if (JSON.stringify(before) === JSON.stringify(currentState)) return;
    undoStack.push(before);
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
    lastHistoryGroup = null;
    lastHistoryTime = 0;
}

export function undo() {
    if (undoStack.length === 0 || !currentState) return false;
    redoStack.push(deepClone(currentState));
    currentState = undoStack.pop();
    lastHistoryGroup = null;
    lastHistoryTime = 0;
    persistState();
    notifySubscribers();
    return true;
}

export function redo() {
    if (redoStack.length === 0 || !currentState) return false;
    undoStack.push(deepClone(currentState));
    currentState = redoStack.pop();
    lastHistoryGroup = null;
    lastHistoryTime = 0;
    persistState();
    notifySubscribers();
    return true;
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
    const stagedItems = currentState.stagedItems.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
    );
    const fields = Object.keys(updates).sort().join(',');
    setState({ items, stagedItems }, { historyGroup: `item:${itemId}:${fields}` });
}

function getOpenRunActiveIndex(state = currentState) {
    const items = state?.items || [];
    const tracker = state?.tracker || {};
    if (!tracker.startedAt || tracker.completedAt || items.length === 0) return -1;

    const idIndex = tracker.activeItemId
        ? items.findIndex(item => item.id === String(tracker.activeItemId))
        : -1;
    return idIndex >= 0
        ? idIndex
        : Math.max(0, Math.min(items.length - 1, tracker.activeItemIndex || 0));
}

function assertLiveReplacementOrder(items) {
    const activeIndex = getOpenRunActiveIndex();
    if (activeIndex < 0) return;

    const activeId = currentState.items[activeIndex].id;
    const completedIds = new Set(currentState.items.slice(0, activeIndex).map(item => item.id));
    const ids = items.map(item => String(item.id));
    if (new Set(ids).size !== ids.length) {
        throw new Error('Agenda item IDs must remain unique during a live meeting.');
    }

    const nextActiveIndex = ids.indexOf(activeId);
    if (nextActiveIndex < 0) {
        throw new Error('The active item cannot be removed by bulk editing during a live meeting.');
    }

    ids.forEach((id, index) => {
        if (index < nextActiveIndex && !completedIds.has(id)) {
            throw new Error('Future and new items must remain after the active item during a live meeting.');
        }
        if (index > nextActiveIndex && completedIds.has(id)) {
            throw new Error('Completed items must remain before the active item during a live meeting.');
        }
    });
}

/** Replace all agenda items in one undoable state update. */
export function replaceItems(items) {
    if (!Array.isArray(items)) throw new TypeError('Agenda items must be an array.');
    const normalized = items.map(item => ({ ...item, id: item?.id || generateId() }));
    assertLiveReplacementOrder(normalized);
    setState({ items: normalized });
}

// Track the palette cursor for newly created items.
let nextThemeColor = 1;

function separateColorAt(items, index) {
    if (!currentState.settings.separateAdjacentColors || !items[index]) return;
    const item = items[index];
    const before = items[index - 1];
    const after = items[index + 1];
    if (!colorsMatch(item, before) && !colorsMatch(item, after)) return;

    const involvesCustomColor = [item, before, after]
        .some(entry => normalizeHexColor(entry?.customColor));
    if (involvesCustomColor) {
        items[index] = { ...item, ...getSeparatedColor(item, [before, after]) };
        return;
    }
    const replacement = Array.from({ length: 8 }, (_, paletteIndex) => paletteIndex + 1)
        .find(color => color !== before?.themeColor && color !== after?.themeColor);
    items[index] = { ...item, customColor: null, themeColor: replacement };
}

function separateColorsAroundMovedItem(items, movedIndex) {
    if (!currentState.settings.separateAdjacentColors || !items[movedIndex]) return;
    const movedItem = items[movedIndex];
    [movedIndex - 1, movedIndex + 1].forEach(neighborIndex => {
        const neighbor = items[neighborIndex];
        if (!neighbor || !colorsMatch(movedItem, neighbor)) return;

        const before = items[neighborIndex - 1];
        const after = items[neighborIndex + 1];
        const involvesCustomColor = [neighbor, before, after]
            .some(entry => normalizeHexColor(entry?.customColor));
        if (involvesCustomColor) {
            items[neighborIndex] = {
                ...neighbor,
                ...getSeparatedColor(neighbor, [before, after])
            };
            return;
        }

        const replacement = Array.from({ length: 8 }, (_, paletteIndex) => paletteIndex + 1)
            .find(color => color !== before?.themeColor && color !== after?.themeColor);
        items[neighborIndex] = { ...neighbor, customColor: null, themeColor: replacement };
    });
}

/**
 * Add a new agenda item
 * @param {Object} item - Item to add
 * @param {number} index - Optional index to insert at
 */
export function addItem(item = {}, index = -1) {
    // Assign a theme color if not provided
    const themeColor = item.themeColor || nextThemeColor;
    nextThemeColor = (nextThemeColor % 8) + 1;

    const newItem = {
        id: generateId(),
        name: item.name || 'New Item',
        lead: item.lead || '',
        duration: item.duration || '10m',
        locked: item.locked || false,
        notes: item.notes || '',
        customColor: normalizeHexColor(item.customColor),
        themeColor: themeColor
    };

    const activeIndex = getOpenRunActiveIndex();
    const insertionIndex = activeIndex >= 0 && index >= 0
        ? Math.max(activeIndex + 1, index)
        : index;
    let items;
    if (insertionIndex >= 0 && insertionIndex < currentState.items.length) {
        items = [...currentState.items];
        items.splice(insertionIndex, 0, newItem);
    } else {
        items = [...currentState.items, newItem];
    }

    const insertedIndex = items.indexOf(newItem);
    separateColorAt(items, insertedIndex);

    setState({ items });
    return currentState.items[insertedIndex];
}

function transitionTrackerAfterActiveRemoval(items, removedItemId, removedIndex) {
    const tracker = currentState.tracker || {};
    if (!tracker.startedAt || tracker.completedAt) return tracker;

    const activeIndex = tracker.activeItemId
        ? currentState.items.findIndex(item => item.id === String(tracker.activeItemId))
        : Math.max(0, Math.min(currentState.items.length - 1, tracker.activeItemIndex || 0));
    const removedActiveItem = tracker.activeItemId
        ? String(tracker.activeItemId) === String(removedItemId)
        : activeIndex === removedIndex;
    if (!removedActiveItem) return tracker;

    const pausedTime = !tracker.isRunning ? validDate(tracker.pausedAt) : null;
    const effectiveTime = pausedTime || new Date();
    const nextItem = items[removedIndex] || null;
    if (nextItem) {
        return {
            ...tracker,
            activeItemIndex: removedIndex,
            activeItemId: nextItem.id,
            activeStartedAt: effectiveTime.toISOString(),
            completedAt: null
        };
    }

    return {
        ...tracker,
        isRunning: false,
        pausedAt: null,
        activeItemIndex: items.length,
        activeItemId: null,
        activeStartedAt: effectiveTime.toISOString(),
        completedAt: effectiveTime.toISOString()
    };
}

/**
 * Delete an item by ID
 * @param {string} itemId - Item ID to delete
 */
export function deleteItem(itemId) {
    const fromIndex = currentState.items.findIndex(item => item.id === itemId);
    if (fromIndex < 0) return false;
    const items = [...currentState.items];
    items.splice(fromIndex, 1);
    const tracker = transitionTrackerAfterActiveRemoval(items, itemId, fromIndex);
    setState({ items, tracker });
    return true;
}

/**
 * Reorder items (move item from one index to another)
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Destination index
 */
export function reorderItems(fromIndex, toIndex) {
    const items = [...currentState.items];
    if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= items.length) return false;
    if (!Number.isInteger(toIndex)) return false;
    toIndex = Math.max(0, Math.min(items.length - 1, toIndex));

    const activeIndex = getOpenRunActiveIndex();
    if (activeIndex >= 0) {
        if (fromIndex === activeIndex) return false;
        toIndex = fromIndex < activeIndex
            ? Math.min(toIndex, activeIndex - 1)
            : Math.max(toIndex, activeIndex + 1);
    }

    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    separateColorsAroundMovedItem(items, toIndex);
    setState({ items });
    return true;
}

/**
 * Reorder staged items
 * @param {number} fromIndex - Source index
 * @param {number} toIndex - Destination index
 */
export function reorderStagedItems(fromIndex, toIndex) {
    const stagedItems = [...currentState.stagedItems];
    if (fromIndex < 0 || fromIndex >= stagedItems.length) return false;
    if (toIndex < 0) toIndex = 0;
    if (toIndex >= stagedItems.length) toIndex = stagedItems.length - 1;
    const [removed] = stagedItems.splice(fromIndex, 1);
    stagedItems.splice(toIndex, 0, removed);
    separateColorsAroundMovedItem(stagedItems, toIndex);
    setState({ stagedItems });
    return true;
}

/**
 * Move an agenda item into staging
 * @param {string} itemId - Item ID
 * @param {number} toIndex - Optional staged insertion index
 * @returns {boolean} Whether an update was applied
 */
export function stageItem(itemId, toIndex = -1) {
    const items = [...currentState.items];
    const stagedItems = [...currentState.stagedItems];
    const fromIndex = items.findIndex(item => item.id === itemId);
    if (fromIndex < 0) return false;

    const [moved] = items.splice(fromIndex, 1);
    let insertedIndex;
    if (toIndex < 0 || toIndex > stagedItems.length) {
        stagedItems.push(moved);
        insertedIndex = stagedItems.length - 1;
    } else {
        stagedItems.splice(toIndex, 0, moved);
        insertedIndex = toIndex;
    }

    separateColorsAroundMovedItem(stagedItems, insertedIndex);
    const tracker = transitionTrackerAfterActiveRemoval(items, itemId, fromIndex);
    setState({ items, stagedItems, tracker });
    return true;
}

/**
 * Move a staged item back into the active agenda
 * @param {string} itemId - Item ID
 * @param {number} toIndex - Optional agenda insertion index
 * @returns {boolean} Whether an update was applied
 */
export function unstageItem(itemId, toIndex = -1) {
    const items = [...currentState.items];
    const stagedItems = [...currentState.stagedItems];
    const fromIndex = stagedItems.findIndex(item => item.id === itemId);
    if (fromIndex < 0) return false;

    const [moved] = stagedItems.splice(fromIndex, 1);
    const activeIndex = getOpenRunActiveIndex();
    const insertionIndex = activeIndex >= 0 && toIndex >= 0
        ? Math.max(activeIndex + 1, toIndex)
        : toIndex;
    let insertedIndex;
    if (insertionIndex < 0 || insertionIndex > items.length) {
        items.push(moved);
        insertedIndex = items.length - 1;
    } else {
        items.splice(insertionIndex, 0, moved);
        insertedIndex = insertionIndex;
    }

    separateColorsAroundMovedItem(items, insertedIndex);

    setState({ items, stagedItems });
    return true;
}

/**
 * Update settings
 * @param {Object} settings - Settings updates
 */
export function updateSettings(settings) {
    const nextSettings = normalizeSettings({ ...currentState.settings, ...settings });
    const updates = { settings: nextSettings };
    if (
        Object.prototype.hasOwnProperty.call(settings, 'startTime') &&
        currentState.tracker?.startedAt &&
        currentState.tracker?.scheduledStartAt
    ) {
        const previousStart = validDate(currentState.tracker.scheduledStartAt);
        const nextStart = timeOnReferenceDate(nextSettings.startTime, previousStart);
        const deltaMs = previousStart ? nextStart.getTime() - previousStart.getTime() : 0;
        const previousActiveStart = validDate(currentState.tracker.activeStartedAt);
        updates.tracker = {
            ...currentState.tracker,
            scheduledStartAt: nextStart.toISOString(),
            activeStartedAt: previousActiveStart
                ? new Date(previousActiveStart.getTime() + deltaMs).toISOString()
                : currentState.tracker.activeStartedAt
        };
    }
    setState(updates);
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

/** Update persisted meeting metadata. */
export function updateMetadata(metadata) {
    setState({
        metadata: { ...currentState.metadata, ...metadata }
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

function createExpectedSnapshotFromState(scheduledStartAt = null) {
    const { items, settings, tracker } = currentState;
    return {
        capturedAt: new Date().toISOString(),
        startTime: settings.startTime,
        scheduledStartAt: validDate(scheduledStartAt || tracker?.scheduledStartAt)?.toISOString() || null,
        buffer: settings.buffer || 0,
        items: (items || []).map(item => ({
            id: item.id,
            name: item.name || '',
            lead: item.lead || '',
            duration: item.duration || '1m',
            locked: !!item.locked,
            notes: item.notes || '',
            customColor: normalizeHexColor(item.customColor),
            themeColor: item.themeColor || 1
        }))
    };
}

function ensureExpectedSnapshotInTracker(tracker, scheduledStartAt = null) {
    if (tracker?.expectedSnapshot) {
        return { tracker, changed: false };
    }
    return {
        tracker: {
            ...(tracker || {}),
            expectedSnapshot: createExpectedSnapshotFromState(scheduledStartAt)
        },
        changed: true
    };
}

/**
 * Ensure an expected-plan snapshot exists for this run.
 * @returns {boolean} Whether a snapshot was created
 */
export function ensureExpectedSnapshot(scheduledStartAt = null) {
    const currentTracker = currentState.tracker || {};
    const { tracker, changed } = ensureExpectedSnapshotInTracker(currentTracker, scheduledStartAt);
    if (changed) {
        setState({ tracker });
    }
    return changed;
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

    const tracker = currentState.tracker || {};
    if (!tracker.startedAt || tracker.completedAt) return false;
    if (!tracker.isRunning && tracker.pausedAt) {
        const pausedTime = new Date(tracker.pausedAt);
        if (!Number.isNaN(pausedTime.getTime())) currentTime = pausedTime;
    }
    const scheduledIntervals = calculateIntervals();
    if (scheduledIntervals.length === 0) return false;

    const idIndex = tracker.activeItemId
        ? items.findIndex(item => item.id === String(tracker.activeItemId))
        : -1;
    const currentIndex = idIndex >= 0
        ? idIndex
        : Math.max(0, Math.min(items.length - 1, tracker.activeItemIndex || 0));
    const scheduledCurrent = scheduledIntervals[currentIndex];
    if (!scheduledCurrent) return false;

    const originalDuration = parseDuration(items[currentIndex].duration);
    const activeStartedAt = validDate(tracker.activeStartedAt) || scheduledCurrent.startTime;
    const elapsedExact = Math.max(0, (currentTime - activeStartedAt) / 60000);
    if (items[currentIndex].locked && elapsedExact < originalDuration) return false;
    const newCurrentDuration = Math.max(1, roundToTenth(elapsedExact));

    const scheduledEnd = scheduledIntervals[scheduledIntervals.length - 1].endTime;
    const remainingTotal = Math.max(0, roundToTenth((scheduledEnd - currentTime) / 60000));
    const buffer = settings.buffer || 0;

    const futureItems = items.slice(currentIndex + 1);
    const futureCount = futureItems.length;
    const totalFutureBuffer = Math.max(0, futureCount * buffer);
    const remainingForFuture = Math.max(0, remainingTotal - totalFutureBuffer);
    const newFutureDurations = scaleDurationsToTarget(futureItems, remainingForFuture);

    const updatedItems = items.map((item, index) => {
        if (index < currentIndex) return item;
        if (index === currentIndex) {
            return { ...item, duration: formatDuration(newCurrentDuration) };
        }
        const futureIndex = index - currentIndex - 1;
        const nextDuration = newFutureDurations[futureIndex] ?? parseDuration(item.duration);
        return { ...item, duration: formatDuration(nextDuration) };
    });

    const snapshotResult = ensureExpectedSnapshotInTracker(tracker, tracker.scheduledStartAt);
    const expectedCurrent = snapshotResult.tracker.expectedSnapshot?.items
        ?.find(item => item.id === items[currentIndex].id);
    const expectedDuration = expectedCurrent
        ? parseDuration(expectedCurrent.duration || '1m')
        : originalDuration;
    const completedDifference = roundToTenth(newCurrentDuration - expectedDuration);
    const completedDiffById = {
        ...(snapshotResult.tracker.completedDiffById || {}),
        [items[currentIndex].id]: completedDifference
    };
    const overallDeltaMinutes = roundToTenth(Object.values(completedDiffById)
        .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0));
    const varianceMode = snapshotResult.tracker.varianceMode || Math.abs(overallDeltaMinutes) > 1;
    const isFinalItem = currentIndex === items.length - 1;
    const nextItem = items[currentIndex + 1] || null;
    const nextActiveStart = nextItem ? addMinutes(currentTime, buffer) : null;
    const nextTracker = {
        ...snapshotResult.tracker,
        isRunning: isFinalItem ? false : tracker.isRunning,
        pausedAt: isFinalItem ? null : tracker.pausedAt,
        activeItemIndex: isFinalItem ? items.length : currentIndex + 1,
        activeItemId: nextItem?.id || null,
        activeStartedAt: nextActiveStart?.toISOString() || activeStartedAt.toISOString(),
        completedAt: isFinalItem ? currentTime.toISOString() : null,
        completedDiffById,
        overallDeltaMinutes,
        varianceMode,
        varianceActivatedAt: !snapshotResult.tracker.varianceMode && varianceMode
            ? currentTime.toISOString()
            : snapshotResult.tracker.varianceActivatedAt
    };

    setState({ items: updatedItems, tracker: nextTracker });
    return true;
}

/**
 * Move run focus back to the previous item.
 * @returns {boolean} Whether an update was applied
 */
export function retreatToPreviousItem() {
    const { items, tracker } = currentState;
    if (!items || items.length === 0) return false;
    if (!tracker || (!tracker.isRunning && !tracker.startedAt)) return false;

    const idIndex = tracker.activeItemId
        ? items.findIndex(item => item.id === String(tracker.activeItemId))
        : -1;
    const activeItemIndex = tracker.completedAt
        ? items.length
        : (idIndex >= 0
            ? idIndex
            : Math.max(0, Math.min(items.length - 1, tracker.activeItemIndex || 0)));
    if (activeItemIndex <= 0) return false;

    const prevIndex = activeItemIndex - 1;
    const prevItem = items[prevIndex];
    const intervals = calculateIntervals();
    const completedAt = validDate(tracker.completedAt);

    setState({
        tracker: {
            ...tracker,
            isRunning: completedAt ? false : tracker.isRunning,
            pausedAt: completedAt?.toISOString() || tracker.pausedAt,
            activeItemIndex: prevIndex,
            activeItemId: prevItem.id,
            activeStartedAt: intervals[prevIndex]?.startTime?.toISOString() || tracker.activeStartedAt,
            completedAt: null
        }
    });
    return true;
}

function calculateIntervalsFromPlan(planItems, startTimeValue, bufferValue, scheduledStartAt = null) {
    if (!planItems || planItems.length === 0) return [];
    const startTime = validDate(scheduledStartAt) || parseTime(startTimeValue);
    const buffer = bufferValue || 0;

    let currentTime = new Date(startTime);
    return planItems.map((item, index) => {
        const duration = parseDuration(item.duration);
        const itemStart = new Date(currentTime);
        const itemEnd = addMinutes(currentTime, duration);
        currentTime = addMinutes(itemEnd, index < planItems.length - 1 ? buffer : 0);

        return {
            ...item,
            startTime: itemStart,
            endTime: itemEnd,
            themeNumber: item.themeColor || ((index % 8) + 1)
        };
    });
}

/**
 * Update an interval boundary time and rebalance durations as needed.
 * @param {number} index - Item index
 * @param {'start'|'end'} position - Which boundary to update
 * @param {Date} targetTime - New boundary time
 * @returns {boolean} Whether an update was applied
 */
export function updateIntervalTime(index, position, targetTime) {
    const { items, settings } = currentState;
    if (!items || items.length === 0) return false;

    const intervals = calculateIntervals();
    if (!intervals[index]) return false;

    if (!(targetTime instanceof Date) || Number.isNaN(targetTime.getTime())) {
        return false;
    }

    const buffer = settings.buffer || 0;
    const pinStart = settings.pinStartTime !== false;
    const pinEnd = settings.pinEndTime !== false;

    if (position === 'start') {
        if (index === 0) {
            const newStartValue = formatTimeValue(targetTime);
            updateSettings({ startTime: newStartValue });
            return true;
        }

        const oldBoundary = intervals[index].startTime;

        if (!pinStart) {
            const currentStart = intervals[0].startTime;
            const deltaMinutes = Math.round((targetTime - oldBoundary) / 60000);
            const newStart = addMinutes(currentStart, deltaMinutes);
            const newStartValue = formatTimeValue(newStart);
            updateSettings({ startTime: newStartValue });
            return true;
        }

        const currentStart = intervals[0].startTime;
        const buffersBefore = index;
        let targetTotal = Math.round((targetTime - currentStart) / 60000) - buffersBefore * buffer;
        targetTotal = Math.max(0, targetTotal);

        const prevItems = items.slice(0, index);
        const newDurations = scaleDurationsToTarget(prevItems, targetTotal);

        const updatedItems = items.map((item, idx) => {
            if (idx < index) {
                return { ...item, duration: formatDuration(newDurations[idx]) };
            }
            return item;
        });

        setState({ items: updatedItems });
        return true;
    }

    if (position === 'end') {
        const itemStart = intervals[index].startTime;
        let newDuration = Math.round((targetTime - itemStart) / 60000);
        newDuration = Math.max(1, newDuration);

        const updatedItems = items.map((item, idx) => {
            if (idx === index) {
                return { ...item, duration: formatDuration(newDuration) };
            }
            return item;
        });

        if (pinEnd && index < items.length - 1) {
            const oldMeetingEnd = intervals[intervals.length - 1].endTime;
            const laterItems = items.slice(index + 1);
            const buffersAfter = laterItems.length;
            let targetTotal = Math.round((oldMeetingEnd - targetTime) / 60000) - buffersAfter * buffer;
            targetTotal = Math.max(0, targetTotal);

            const newLaterDurations = scaleDurationsToTarget(laterItems, targetTotal);
            for (let i = 0; i < newLaterDurations.length; i += 1) {
                const itemIndex = index + 1 + i;
                updatedItems[itemIndex] = {
                    ...updatedItems[itemIndex],
                    duration: formatDuration(newLaterDurations[i])
                };
            }
        }

        setState({ items: updatedItems });
        return true;
    }

    return false;
}

/**
 * Calculate intervals for all items based on start time and durations
 * Takes into account locked items and adjusts unlocked items proportionally
 * @returns {Array} Items with calculated start and end times
 */
export function calculateIntervals() {
    const { items, settings, tracker } = currentState;
    return calculateIntervalsFromPlan(
        items,
        settings.startTime,
        settings.buffer || 0,
        tracker?.startedAt
            ? planStartFromActiveAnchor(items, tracker, settings.buffer)
            : null
    );
}

/**
 * Get Expected-vs-Actual rows for the Input panel and exports.
 * Returns null when variance mode is not active.
 * @returns {Object|null}
 */
export function getExpectedVsActualData() {
    const tracker = currentState.tracker || {};
    const snapshot = tracker.expectedSnapshot;
    if (!tracker.varianceMode || !snapshot || !Array.isArray(snapshot.items) || snapshot.items.length === 0) {
        return null;
    }

    const expectedIntervals = calculateIntervalsFromPlan(
        snapshot.items,
        snapshot.startTime || currentState.settings.startTime,
        snapshot.buffer ?? currentState.settings.buffer ?? 0,
        snapshot.scheduledStartAt || null
    );
    const actualIntervals = calculateIntervals();
    const expectedById = new Map(expectedIntervals.map(item => [item.id, item]));

    const rows = actualIntervals.map(actual => {
        const expected = expectedById.get(actual.id) || null;
        const actualDurationMinutes = parseDuration(actual.duration || '1m');
        const expectedDurationMinutes = expected ? parseDuration(expected.duration || '1m') : null;
        const durationDifferenceMinutes = expectedDurationMinutes === null
            ? null
            : roundToTenth(actualDurationMinutes - expectedDurationMinutes);

        return {
            id: actual.id,
            expected,
            actual,
            expectedDurationMinutes,
            actualDurationMinutes,
            durationDifferenceMinutes
        };
    });

    const byId = rows.reduce((acc, row) => {
        acc[row.id] = row;
        return acc;
    }, {});

    return {
        snapshot,
        rows,
        byId
    };
}

function scaleDurationsToTarget(items, targetTotal) {
    if (!items.length) return [];

    const durations = items.map(item => parseDuration(item.duration));
    const locked = items.map(item => item.locked);
    const minDurations = durations.map((duration, idx) => (locked[idx] ? duration : 1));

    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    const lockedTotal = durations.reduce((sum, duration, idx) => {
        return locked[idx] ? sum + duration : sum;
    }, 0);
    const unlockedTotal = totalDuration - lockedTotal;

    let newDurations;
    if (targetTotal >= totalDuration) {
        const availableForUnlocked = Math.max(0, targetTotal - lockedTotal);
        const scale = unlockedTotal > 0 ? availableForUnlocked / unlockedTotal : 1;
        newDurations = durations.map((duration, idx) => {
            if (locked[idx]) return duration;
            return Math.max(1, roundToTenth(duration * scale));
        });
    } else {
        const availableForUnlocked = Math.max(0, targetTotal - lockedTotal);
        const scale = unlockedTotal > 0 ? availableForUnlocked / unlockedTotal : 0;
        newDurations = durations.map((duration, idx) => {
            if (locked[idx]) return duration;
            return Math.max(1, roundToTenth(duration * scale));
        });
    }

    let diffTenths = Math.round(targetTotal * 10) - newDurations
        .reduce((sum, duration) => sum + Math.round(duration * 10), 0);
    const adjustable = items.map((item, idx) => ({
        idx,
        minTenths: Math.round(minDurations[idx] * 10),
        locked: item.locked
    })).filter(entry => !entry.locked);
    const durationTenths = newDurations.map(duration => Math.round(duration * 10));

    let safety = 0;
    while (diffTenths !== 0 && safety < 10000) {
        let moved = false;
        for (const entry of adjustable) {
            if (diffTenths === 0) break;
            if (diffTenths > 0) {
                const step = Math.min(10, diffTenths);
                durationTenths[entry.idx] += step;
                diffTenths -= step;
                moved = true;
            } else if (durationTenths[entry.idx] > entry.minTenths) {
                const step = Math.min(10, -diffTenths, durationTenths[entry.idx] - entry.minTenths);
                durationTenths[entry.idx] -= step;
                diffTenths += step;
                moved = true;
            }
        }
        if (!moved) break;
        safety += 1;
    }

    return durationTenths.map(duration => duration / 10);
}

function scaleLiveFutureDurations(items, targetTotal) {
    if (!items.length) return [];

    const durations = items.map(item => parseDuration(item.duration || '1m'));
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    if (targetTotal >= totalDuration) return durations;

    const lockedTotal = items.reduce((sum, item, index) => {
        return item.locked ? sum + durations[index] : sum;
    }, 0);
    const unlockedIndexes = items
        .map((item, index) => ({ item, index }))
        .filter(entry => !entry.item.locked)
        .map(entry => entry.index);
    const minimumTotal = lockedTotal + unlockedIndexes.length;
    if (targetTotal <= minimumTotal) {
        return durations.map((duration, index) => items[index].locked ? duration : 1);
    }

    const availableExtra = targetTotal - minimumTotal;
    const totalExtraWeight = unlockedIndexes.reduce((sum, index) => {
        return sum + Math.max(0, durations[index] - 1);
    }, 0);
    if (totalExtraWeight <= 0) return durations;

    return durations.map((duration, index) => {
        if (items[index].locked) return duration;
        const weight = Math.max(0, duration - 1);
        return 1 + availableExtra * (weight / totalExtraWeight);
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
    if (!tracker.isRunning && tracker.pausedAt) {
        const pausedTime = new Date(tracker.pausedAt);
        if (!Number.isNaN(pausedTime.getTime())) currentTime = pausedTime;
    }
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
            signedDifference: 0,
            currentItemIndex: -1
        };
    }

    const scheduledItems = calculateIntervals();
    const scheduledStart = scheduledItems[0]?.startTime || (tracker.startedAt
        ? (validDate(tracker.scheduledStartAt) || parseTime(settings.startTime))
        : parseTime(settings.startTime));
    if (tracker.completedAt) {
        const signedDifference = Number(tracker.overallDeltaMinutes) || 0;
        return {
            items: scheduledItems,
            status: signedDifference > 0.05 ? 'behind' : (signedDifference < -0.05 ? 'ahead' : 'on-time'),
            difference: Math.abs(signedDifference),
            signedDifference,
            currentItemIndex: items.length,
            currentOverrun: 0,
            currentRemaining: 0
        };
    }
    const idIndex = tracker.activeItemId
        ? items.findIndex(item => item.id === String(tracker.activeItemId))
        : -1;
    const currentItemIndex = idIndex >= 0
        ? idIndex
        : Math.max(0, Math.min(
            items.length - 1,
            Number.isFinite(tracker.activeItemIndex) ? tracker.activeItemIndex : 0
        ));
    const plannedDurations = items.map(item => parseDuration(item.duration || '1m'));

    const currentScheduledStart = validDate(tracker.activeStartedAt) ||
        scheduledItems[currentItemIndex]?.startTime ||
        new Date(currentTime);
    const currentPlannedDuration = plannedDurations[currentItemIndex] || 1;
    const elapsedOnCurrent = Math.max(0, (currentTime - currentScheduledStart) / 60000);
    const currentActualDuration = Math.max(currentPlannedDuration, elapsedOnCurrent);
    const currentOverrun = Math.max(0, elapsedOnCurrent - currentPlannedDuration);
    const futureItems = items.slice(currentItemIndex + 1);
    const futurePlannedTotal = plannedDurations
        .slice(currentItemIndex + 1)
        .reduce((sum, duration) => sum + duration, 0);
    const liveFutureDurations = scaleLiveFutureDurations(
        futureItems,
        Math.max(0, futurePlannedTotal - currentOverrun)
    );

    let runningTime = new Date(scheduledStart);
    const adjustedItems = items.map((item, index) => {
        let duration = plannedDurations[index];
        if (index === currentItemIndex) {
            duration = currentActualDuration;
        } else if (index > currentItemIndex) {
            duration = liveFutureDurations[index - currentItemIndex - 1];
        }

        const itemStart = new Date(runningTime);
        const itemEnd = addMinutes(runningTime, duration);
        runningTime = addMinutes(itemEnd, index < items.length - 1 ? buffer : 0);

        return {
            ...item,
            startTime: itemStart,
            endTime: itemEnd,
            adjustedDuration: duration,
            themeNumber: item.themeColor || ((index % 8) + 1)
        };
    });

    const signedDifference = (tracker.overallDeltaMinutes || 0) + currentOverrun;

    let status = 'on-time';
    if (signedDifference > 0.05) status = 'behind';
    else if (signedDifference < -0.05) status = 'ahead';

    return {
        items: adjustedItems,
        status,
        difference: Math.abs(signedDifference),
        signedDifference,
        currentItemIndex,
        currentOverrun,
        currentRemaining: currentPlannedDuration - elapsedOnCurrent
    };
}

/**
 * Encode state to URL-safe compressed string
 * @returns {string} Compressed state string
 */
export function encodeStateToURL() {
    const stateToEncode = {
        v: STATE_SCHEMA_VERSION,
        items: currentState.items.map(item => ({
            id: item.id,
            name: item.name,
            lead: item.lead,
            duration: item.duration,
            locked: !!item.locked,
            notes: item.notes,
            themeColor: item.themeColor || 1,
            ...(normalizeHexColor(item.customColor) ? { customColor: normalizeHexColor(item.customColor) } : {}),
            ...(item.context ? { context: item.context } : {}),
            ...(item.prep ? { prep: item.prep } : {})
        })),
        stagedItems: currentState.stagedItems.map(item => ({
            id: item.id,
            name: item.name,
            lead: item.lead,
            duration: item.duration,
            locked: !!item.locked,
            notes: item.notes,
            themeColor: item.themeColor || 1,
            ...(normalizeHexColor(item.customColor) ? { customColor: normalizeHexColor(item.customColor) } : {}),
            ...(item.context ? { context: item.context } : {}),
            ...(item.prep ? { prep: item.prep } : {})
        })),
        settings: { ...currentState.settings },
        exportOptions: { ...currentState.exportOptions },
        metadata: deepClone(currentState.metadata)
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
        if (decoded?.v === STATE_SCHEMA_VERSION) {
            if (!Array.isArray(decoded.items)) return null;
            return normalizeState({
                schemaVersion: STATE_SCHEMA_VERSION,
                items: decoded.items,
                stagedItems: Array.isArray(decoded.stagedItems) ? decoded.stagedItems : [],
                settings: decoded.settings,
                exportOptions: decoded.exportOptions,
                metadata: decoded.metadata,
                tracker: deepClone(DEFAULT_STATE.tracker)
            });
        }

        const legacyState = {
            items: decoded.i.map((item, index) => ({
                id: generateId(),
                name: item.n || '',
                lead: item.l || '',
                duration: item.d || '10m',
                locked: item.k === 1,
                notes: item.o || '',
                themeColor: item.c || ((index % 8) + 1)
            })),
            stagedItems: (decoded.g || []).map((item, index) => ({
                id: generateId(),
                name: item.n || '',
                lead: item.l || '',
                duration: item.d || '10m',
                locked: item.k === 1,
                notes: item.o || '',
                themeColor: item.c || ((index % 8) + 1)
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
                overtimeFlash: decoded.s?.of === 1,
                alertOffsetsSeconds: Array.isArray(decoded.s?.ao)
                    ? decoded.s.ao
                    : DEFAULT_STATE.settings.alertOffsetsSeconds,
                alertSound: decoded.s?.as || DEFAULT_STATE.settings.alertSound,
                alertVisual: decoded.s?.av || DEFAULT_STATE.settings.alertVisual,
                desktopNotifications: decoded.s?.nt === 1,
                separateAdjacentColors: decoded.s?.sc === 1,
                pinStartTime: decoded.s?.ps === undefined
                    ? DEFAULT_STATE.settings.pinStartTime
                    : decoded.s.ps === 1,
                pinEndTime: decoded.s?.pe === undefined
                    ? DEFAULT_STATE.settings.pinEndTime
                    : decoded.s.pe === 1
            }
        };
        return normalizeState(legacyState);
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
    try {
        const storage = useSessionPersistence ? sessionStorage : localStorage;
        storage.setItem(STORAGE_URL_KEY, encoded);
    } catch (e) {
        console.error('Failed to remember URL state:', e);
    }
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
 * Save state to the active tab/origin persistence scope.
 */
function persistState() {
    try {
        const storage = useSessionPersistence ? sessionStorage : localStorage;
        storage.setItem(STORAGE_KEY, JSON.stringify(currentState));
    } catch (e) {
        console.error('Failed to persist state to localStorage:', e);
    }
    try {
        updateURL();
    } catch (e) {
        console.error('Failed to persist state to URL:', e);
    }
}

/**
 * Load state from a browser persistence scope.
 * @param {Storage} storage - Storage scope to read, defaulting to the active scope
 * @returns {Object|null} Persisted state or null
 */
function loadFromPersistenceStorage(storage = useSessionPersistence ? sessionStorage : localStorage) {
    try {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.error('Failed to load persisted state:', e);
    }
    return null;
}

/**
 * Initialize state from URL, localStorage, or defaults
 */
export function initializeState() {
    // Explicit share links get a tab-scoped working copy. Ordinary sessions
    // prefer their fuller persisted state, including runtime details omitted
    // from compact URLs.
    const url = new URL(window.location.href);
    const encodedURLState = url.searchParams.get('s');
    const isExplicitShare = url.searchParams.get('share') === '1';
    let lastLocalURLState = null;
    try {
        lastLocalURLState = localStorage.getItem(STORAGE_URL_KEY);
    } catch (e) {
        console.error('Failed to read remembered local URL state:', e);
    }
    const isUnmarkedExternalShare = !!encodedURLState &&
        !isExplicitShare &&
        encodedURLState !== lastLocalURLState;
    let rememberedShareSession = false;
    let startedIsolatedSession = false;
    try {
        rememberedShareSession = sessionStorage.getItem(SESSION_ISOLATION_KEY) === '1';
        startedIsolatedSession = (isExplicitShare || isUnmarkedExternalShare) &&
            !rememberedShareSession;
        if (isExplicitShare || isUnmarkedExternalShare) {
            sessionStorage.setItem(SESSION_ISOLATION_KEY, '1');
            rememberedShareSession = sessionStorage.getItem(SESSION_ISOLATION_KEY) === '1';
        }
        if (!isExplicitShare && !encodedURLState && rememberedShareSession) {
            sessionStorage.removeItem(SESSION_ISOLATION_KEY);
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(STORAGE_URL_KEY);
            rememberedShareSession = false;
        }
    } catch (e) {
        console.error('Failed to isolate shared agenda state:', e);
    }
    useSessionPersistence = isExplicitShare || isUnmarkedExternalShare || rememberedShareSession;
    if (isExplicitShare && rememberedShareSession) {
        url.searchParams.delete('share');
        window.history.replaceState(window.history.state, '', url.toString());
    }
    let lastPersistedURLState = null;
    try {
        const storage = useSessionPersistence ? sessionStorage : localStorage;
        lastPersistedURLState = storage.getItem(STORAGE_URL_KEY);
    } catch (e) {
        console.error('Failed to read remembered URL state:', e);
    }

    const hasExternalURLState = !!encodedURLState &&
        (isExplicitShare || startedIsolatedSession || encodedURLState !== lastPersistedURLState);
    let state = hasExternalURLState ? loadFromURL() : loadFromPersistenceStorage();
    if (!state && encodedURLState && !hasExternalURLState) state = loadFromURL();
    if (!state && hasExternalURLState) state = loadFromPersistenceStorage();
    if (!state && isUnmarkedExternalShare) state = loadFromPersistenceStorage(localStorage);

    if (!state) {
        state = {
            ...deepClone(DEFAULT_STATE),
            items: deepClone(DEFAULT_ITEMS)
        };
    }

    currentState = normalizeState(state);
    undoStack = [];
    redoStack = [];
    historyTransaction = null;
    lastHistoryGroup = null;
    lastHistoryTime = 0;
    persistState();
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

        setState(imported, { replace: true });
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
    setState({
        ...deepClone(DEFAULT_STATE),
        items: deepClone(DEFAULT_ITEMS)
    }, { replace: true });
}
