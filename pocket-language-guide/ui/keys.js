// The keyboard contract shared by every roving-tabindex group in the app.
//
// The settings panels, the face strip and the rows on a face are three different
// widgets, but a reader should not have to learn three sets of keys, so they all
// answer arrows the same way and the arithmetic lives here rather than being
// reimplemented per widget.

/**
 * Where a directional keypress lands among `count` items, wrapping, or -1 for a
 * key that is not navigation.
 * @param {string} key @param {number} from @param {number} count
 */
export function nextIndex(key, from, count) {
  const last = count - 1;
  // Right means *back* for a reader of Arabic, because their list starts on the
  // right -- so the horizontal pair swaps with the page's direction while the
  // vertical pair does not. Doing it here rather than per widget is the reason
  // this arithmetic is shared: the face strip, the settings panels and a face's
  // rows would otherwise each need to remember, and one of them would not.
  const rtl = document.documentElement.dir === 'rtl';
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const back = rtl ? 'ArrowRight' : 'ArrowLeft';
  if (key === forward || key === 'ArrowDown') return from === last ? 0 : from + 1;
  if (key === back || key === 'ArrowUp') return from === 0 ? last : from - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  return -1;
}
