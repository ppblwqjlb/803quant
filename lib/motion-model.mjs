export function easeOutCubic(progress) {
  const value = Math.min(1, Math.max(0, progress));
  return 1 - (1 - value) ** 3;
}

export function getCountFrame(target, progress) {
  const safeTarget = Math.max(0, Math.round(target));
  return Math.min(safeTarget, Math.round(safeTarget * easeOutCubic(progress)));
}
