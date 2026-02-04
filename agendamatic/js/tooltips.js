/**
 * tooltips.js - Simple tooltip engine for user guidance
 */

let tooltipElement = null;
let showTimeout = null;
let hideTimeout = null;

// Delay before showing tooltip (ms)
const SHOW_DELAY = 500;
// Delay before hiding tooltip (ms)
const HIDE_DELAY = 100;

/**
 * Initialize the tooltip system
 */
export function initTooltips() {
    // Create tooltip element if it doesn't exist
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.className = 'tooltip';
        tooltipElement.setAttribute('role', 'tooltip');
        tooltipElement.setAttribute('aria-hidden', 'true');
        document.body.appendChild(tooltipElement);
    }

    // Set up global event delegation for elements with data-tooltip
    document.addEventListener('mouseenter', handleMouseEnter, true);
    document.addEventListener('mouseleave', handleMouseLeave, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Hide tooltip on scroll
    document.addEventListener('scroll', hideTooltip, true);

    // Hide tooltip on click (for buttons)
    document.addEventListener('click', hideTooltip, true);
}

/**
 * Handle mouse enter on elements
 * @param {MouseEvent} e - Mouse event
 */
function handleMouseEnter(e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        showTooltip(target);
    }
}

/**
 * Handle mouse leave on elements
 * @param {MouseEvent} e - Mouse event
 */
function handleMouseLeave(e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        hideTooltip();
    }
}

/**
 * Handle focus on elements
 * @param {FocusEvent} e - Focus event
 */
function handleFocusIn(e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        showTooltip(target);
    }
}

/**
 * Handle focus out on elements
 * @param {FocusEvent} e - Focus event
 */
function handleFocusOut(e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        hideTooltip();
    }
}

/**
 * Show tooltip for an element
 * @param {HTMLElement} element - Element with data-tooltip attribute
 */
export function showTooltip(element) {
    if (!tooltipElement || !element) return;

    const text = element.getAttribute('data-tooltip');
    if (!text) return;

    // Clear any existing timeouts
    clearTimeout(hideTimeout);
    clearTimeout(showTimeout);

    // Show tooltip after delay
    showTimeout = setTimeout(() => {
        tooltipElement.textContent = text;
        positionTooltip(element);
        tooltipElement.classList.add('visible');
        tooltipElement.setAttribute('aria-hidden', 'false');
    }, SHOW_DELAY);
}

/**
 * Hide the tooltip
 */
export function hideTooltip() {
    if (!tooltipElement) return;

    // Clear show timeout if pending
    clearTimeout(showTimeout);

    // Hide after short delay (allows moving to tooltip if needed)
    hideTimeout = setTimeout(() => {
        tooltipElement.classList.remove('visible');
        tooltipElement.setAttribute('aria-hidden', 'true');
    }, HIDE_DELAY);
}

/**
 * Position the tooltip relative to an element
 * @param {HTMLElement} element - Target element
 */
function positionTooltip(element) {
    if (!tooltipElement || !element) return;

    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltipElement.getBoundingClientRect();

    // Default position: below the element
    let top = rect.bottom + 8;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

    // Check if tooltip would go off screen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position
    if (left < 8) {
        left = 8;
    } else if (left + tooltipRect.width > viewportWidth - 8) {
        left = viewportWidth - tooltipRect.width - 8;
    }

    // If not enough space below, show above
    if (top + tooltipRect.height > viewportHeight - 8) {
        top = rect.top - tooltipRect.height - 8;
        tooltipElement.classList.remove('bottom');
        tooltipElement.classList.add('top');
    } else {
        tooltipElement.classList.remove('top');
        tooltipElement.classList.add('bottom');
    }

    tooltipElement.style.top = `${top}px`;
    tooltipElement.style.left = `${left}px`;
}

/**
 * Update tooltip text for an element
 * @param {HTMLElement} element - Target element
 * @param {string} text - New tooltip text
 */
export function setTooltipText(element, text) {
    if (element) {
        element.setAttribute('data-tooltip', text);
    }
}

/**
 * Remove tooltip from an element
 * @param {HTMLElement} element - Target element
 */
export function removeTooltip(element) {
    if (element) {
        element.removeAttribute('data-tooltip');
    }
}

/**
 * Destroy the tooltip system
 */
export function destroyTooltips() {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }

    document.removeEventListener('mouseenter', handleMouseEnter, true);
    document.removeEventListener('mouseleave', handleMouseLeave, true);
    document.removeEventListener('focusin', handleFocusIn, true);
    document.removeEventListener('focusout', handleFocusOut, true);
    document.removeEventListener('scroll', hideTooltip, true);
    document.removeEventListener('click', hideTooltip, true);

    clearTimeout(showTimeout);
    clearTimeout(hideTimeout);
}
