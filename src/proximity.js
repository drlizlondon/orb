// Cursor drift: 1 at the planet, 0 at or beyond the radius.
export function proximityWeight(dx, dy, radius = 220) {
  return Math.max(0, Math.min(1, 1 - Math.hypot(dx, dy) / radius));
}
