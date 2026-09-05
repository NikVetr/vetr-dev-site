export function modeForConstraintRow(channel, ch, role, tweakModes = {}, pointIndex = null) {
  if (role?.skipConstraints) return "none";
  if (role?.kind === "tweak") return role.constraintMode || tweakModes[ch] || "soft";
  return channel?.pointModes?.[pointIndex] || channel?.mode || "hard";
}

export function candidatePointIndicesForConstraintRole(role, count) {
  if (!count) return [];
  if (role?.kind === "tweak" && Number.isFinite(role.pointIndex)) {
    return [Math.max(0, Math.min(count - 1, Math.floor(role.pointIndex)))];
  }
  const excluded = new Set(role?.excludePointIndices || []);
  return Array.from({ length: count }, (_, i) => i).filter((i) => !excluded.has(i));
}

// Bind a union of point windows to this output's identity and explicit modes.
export function constraintSetForRole(sets, role, tweakModes) {
  if (!sets?.channels || role?.skipConstraints) return { ...sets, channels: {} };
  const count = Math.max(0, ...Object.values(sets.channels).map((c) => c.pointWindows?.length || 0));
  if (!count) return sets;
  const indices = candidatePointIndicesForConstraintRole(role, count);
  if (!indices.length) return { ...sets, channels: {} };
  return {
    ...sets,
    channels: Object.fromEntries(Object.entries(sets.channels).map(([ch, c]) => [ch, {
      ...c,
      pointWindows: indices.map((i) => c.pointWindows?.[i % c.pointWindows.length]),
      pointModes: indices.map((i) => modeForConstraintRow(c, ch, role, tweakModes, i)),
    }])),
  };
}
