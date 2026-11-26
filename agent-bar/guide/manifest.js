// Biscuit, the Agent Bar tour guide: one image per pose, all on the pose canvas of shared/tour-guide/POSES.md. To
// change the art, replace these files (same names) or point a pose at a new file here; a pose left out shows `idle`.
const file = (/** @type {string} */ name) => new URL(name, import.meta.url).href;

export default {
  name: 'Biscuit',
  label: 'Biscuit, the tour guide',
  // The tour flips Biscuit to face a target on its left, so the art must still read when mirrored.
  mirror: true,
  poses: {
    idle: file('dog-idle.svg'),
    point: file('dog-point.svg'),
    happy: file('dog-happy.svg'),
    leap: file('dog-leap.svg'),
    wave: file('dog-wave.svg'),
  },
};
