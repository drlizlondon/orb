// Personal ("mine") mode lives at /app (or ?app for servers that cannot rewrite).
export function modeFor(pathname, search) {
  const path = String(pathname ?? '').replace(/\/+$/, '');
  if (path === '/app') return 'mine';
  return new URLSearchParams(search ?? '').has('app') ? 'mine' : 'public';
}
