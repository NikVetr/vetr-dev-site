// Pip, the ROTA tour guide: one image per pose, all on the pose canvas of shared/tour-guide/POSES.md. To change the
// art, replace these files (same names) or point a pose at a new file here; a pose left out shows `idle`.
const file = (/** @type {string} */ name) => new URL(name, import.meta.url).href;

export default {
  name: 'Pip',
  label: 'Pip, the tour guide: show or fold the tour',
  // Pip's markings are one-sided (the black patch over its left eye), so the tour never mirrors it.
  mirror: false,
  poses: {
    idle: file('cat-idle.svg'),
    point: file('cat-point.svg'),
    happy: file('cat-happy.svg'),
    leap: file('cat-leap.svg'),
    wave: file('cat-wave.svg'),
  },
};
