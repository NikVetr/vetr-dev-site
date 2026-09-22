// The owner's menu, behind three bars.
//
// Two named buttons in the board's bar cost a whole row on a phone, and the row they
// cost was the one the topic needed. So they live behind an icon — which is worth
// doing only because there are exactly two of them and neither is used mid-
// conversation: a menu that hides something urgent would be a worse trade.
//
// A `<dialog>`, like every other modal here, so Escape closes it, the Android Back
// press closes it before the page sees it, and a waiting service-worker update holds
// off while it is open. All three of those come free from the element and would each
// have to be written by hand for a bare `<div>` pretending to be a popup.

/** @param {string} tag @param {Record<string,string>} attrs @param {(Node|string)[]} kids */
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

/**
 * Open the menu under the control that asked for it.
 *
 * @param {HTMLElement} anchor  the button pressed, so focus can go back to it
 * @param {{label:string, run:()=>void}[]} items
 */
export function openBoardMenu(anchor, items) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'board-menu-panel' }));
  panel.append(...items.map((item) => {
    const button = el('button', { type: 'button', class: 'board-menu-item', text: item.label });
    button.addEventListener('click', () => {
      // Closed before the action runs, so the action's own dialog is not opening
      // underneath this one -- two modals in the top layer at once is a stack the
      // reader did not ask for and cannot see out of.
      panel.close();
      item.run();
    });
    return button;
  }));
  document.body.append(panel);
  panel.addEventListener('close', () => {
    panel.remove();
    // Back to the button that opened it, for whoever is not using a finger.
    anchor.focus();
  });
  // Clicking the backdrop is the ordinary way out of a menu, and on a `<dialog>` the
  // backdrop is the element itself -- a press that lands on the dialog rather than
  // on one of its children came from outside the panel.
  panel.addEventListener('click', (event) => { if (event.target === panel) panel.close(); });
  panel.showModal();
  /** @type {HTMLElement|null} */ (panel.querySelector('button'))?.focus();
  return panel;
}
