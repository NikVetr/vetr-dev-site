export function emptyCustomConstraints(space) {
  return { space, values: [], widths: {} };
}

export function resetCustomConstraintsForSpace(state, space) {
  if (!state || !space) return;
  if (!state.customConstraints) return;
  if (state.customConstraints.space === space) return;
  state.customConstraints = emptyCustomConstraints(space);
}

export function ensureCustomConstraintsForSpace(state, space) {
  if (!state || !space) return null;
  if (!state.customConstraints || state.customConstraints.space !== space) {
    state.customConstraints = emptyCustomConstraints(space);
  }
  if (!state.customConstraints.widths) state.customConstraints.widths = {};
  if (!Array.isArray(state.customConstraints.values)) state.customConstraints.values = [];
  return state.customConstraints;
}
