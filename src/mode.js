// Personal ("mine") mode lives at <base>/app/ (or ?app for servers that cannot rewrite).
// Works at a domain root (/app) and under a project folder (/orb/app/).
export function modeFor(pathname, search) {
  const path = String(pathname ?? '').replace(/\/+$/, '');
  if (/(^|\/)app$/.test(path)) return 'mine';
  return new URLSearchParams(search ?? '').has('app') ? 'mine' : 'public';
}
