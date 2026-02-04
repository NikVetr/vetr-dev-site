/**
 * utils.js - Utility functions for time formatting and calculations
 */

/**
 * Parse a duration string (e.g., "5m", "1h", "1h30m", "90") into minutes
 * @param {string} durationStr - Duration string
 * @returns {number} - Duration in minutes
 */
export function parseDuration(durationStr) {
    if (!durationStr) return 0;

    const str = durationStr.toString().trim().toLowerCase();

    // Check for hours and minutes format (e.g., "1h30m")
    const hourMinMatch = str.match(/^(\d+)h\s*(\d+)m?$/);
    if (hourMinMatch) {
        return parseInt(hourMinMatch[1], 10) * 60 + parseInt(hourMinMatch[2], 10);
    }

    // Check for hours only (e.g., "1h")
    const hourMatch = str.match(/^(\d+)h$/);
    if (hourMatch) {
        return parseInt(hourMatch[1], 10) * 60;
    }

    // Check for minutes (e.g., "30m" or "30")
    const minMatch = str.match(/^(\d+)m?$/);
    if (minMatch) {
        return parseInt(minMatch[1], 10);
    }

    return 0;
}

/**
 * Format minutes into a duration string (e.g., 90 -> "1h30m")
 * @param {number} minutes - Duration in minutes
 * @returns {string} - Formatted duration string
 */
export function formatDuration(minutes) {
    if (!minutes || minutes <= 0) return '0m';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0 && mins > 0) {
        return `${hours}h${mins}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${mins}m`;
    }
}

/**
 * Parse a time string (e.g., "4:00", "16:00", "4:00 PM") into a Date object for today
 * @param {string} timeStr - Time string
 * @returns {Date} - Date object with the specified time
 */
export function parseTime(timeStr) {
    if (!timeStr) return new Date();

    const str = timeStr.toString().trim();
    const now = new Date();

    // Check for AM/PM format
    const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1], 10);
        const minutes = parseInt(ampmMatch[2], 10);
        const period = ampmMatch[3]?.toLowerCase();

        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
        return date;
    }

    // Fallback: try to parse as 24-hour format
    const parts = str.split(':');
    if (parts.length >= 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    }

    return now;
}

/**
 * Format a Date object into a time string (e.g., "4:05")
 * @param {Date} date - Date object
 * @param {boolean} use24Hour - Use 24-hour format
 * @returns {string} - Formatted time string
 */
export function formatTime(date, use24Hour = false) {
    if (!(date instanceof Date) || isNaN(date)) return '--:--';

    let hours = date.getHours();
    const minutes = date.getMinutes();

    if (!use24Hour) {
        hours = hours % 12 || 12;
    }

    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Format a time interval from two Date objects (e.g., "4:00-4:30")
 * @param {Date} start - Start time
 * @param {Date} end - End time
 * @param {boolean} use24Hour - Use 24-hour format
 * @returns {string} - Formatted interval string
 */
export function formatInterval(start, end, use24Hour = false) {
    return `${formatTime(start, use24Hour)}-${formatTime(end, use24Hour)}`;
}

/**
 * Add minutes to a Date object
 * @param {Date} date - Original date
 * @param {number} minutes - Minutes to add
 * @returns {Date} - New date with added minutes
 */
export function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}

/**
 * Get the difference between two dates in minutes
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @returns {number} - Difference in minutes
 */
export function getMinutesDiff(start, end) {
    return Math.round((end.getTime() - start.getTime()) / 60000);
}

/**
 * Clamp a number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} - Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Generate a unique ID
 * @returns {string} - Unique ID string
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} - Cloned object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Get the theme class number (1-4) based on index
 * @param {number} index - Item index
 * @returns {number} - Theme number (1-4)
 */
export function getThemeNumber(index) {
    return (index % 4) + 1;
}

/**
 * Render basic markdown to HTML for notes previews
 * @param {string} markdown - Markdown text
 * @returns {string} HTML string
 */
export function renderMarkdownToHtml(markdown) {
    if (!markdown) return '';

    const escapeHtml = (str) => str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const htmlParts = [];
    let inCodeBlock = false;
    let codeLines = [];
    let listType = null;

    const closeList = () => {
        if (listType) {
            htmlParts.push(`</${listType}>`);
            listType = null;
        }
    };

    const flushCodeBlock = () => {
        if (codeLines.length > 0) {
            const code = escapeHtml(codeLines.join('\n'));
            htmlParts.push(`<pre><code>${code}</code></pre>`);
            codeLines = [];
        }
    };

    const applyInline = (text) => {
        let result = text;
        result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
        result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        return result;
    };

    lines.forEach((rawLine) => {
        const line = rawLine || '';

        if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
                flushCodeBlock();
                inCodeBlock = false;
            } else {
                closeList();
                inCodeBlock = true;
            }
            return;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            return;
        }

        if (/^\s*#{3}\s+/.test(line)) {
            closeList();
            htmlParts.push(`<h3>${applyInline(escapeHtml(line.replace(/^\s*#{3}\s+/, '')))}</h3>`);
            return;
        }

        if (/^\s*#{2}\s+/.test(line)) {
            closeList();
            htmlParts.push(`<h2>${applyInline(escapeHtml(line.replace(/^\s*#{2}\s+/, '')))}</h2>`);
            return;
        }

        if (/^\s*#\s+/.test(line)) {
            closeList();
            htmlParts.push(`<h1>${applyInline(escapeHtml(line.replace(/^\s*#\s+/, '')))}</h1>`);
            return;
        }

        if (/^\s*[-*]\s+/.test(line)) {
            if (listType !== 'ul') {
                closeList();
                listType = 'ul';
                htmlParts.push('<ul>');
            }
            const itemText = line.replace(/^\s*[-*]\s+/, '');
            htmlParts.push(`<li>${applyInline(escapeHtml(itemText))}</li>`);
            return;
        }

        if (/^\s*\d+\.\s+/.test(line)) {
            if (listType !== 'ol') {
                closeList();
                listType = 'ol';
                htmlParts.push('<ol>');
            }
            const itemText = line.replace(/^\s*\d+\.\s+/, '');
            htmlParts.push(`<li>${applyInline(escapeHtml(itemText))}</li>`);
            return;
        }

        if (line.trim() === '') {
            closeList();
            htmlParts.push('');
            return;
        }

        closeList();
        htmlParts.push(`<p>${applyInline(escapeHtml(line))}</p>`);
    });

    if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
    }
    closeList();

    return htmlParts.join('\n');
}
