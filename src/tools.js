import {projects} from '../dist/projects.js';

export const TOOLS_KEY = 'orbit.tools.v1';

// Ported verbatim from galaxycloud src/lib/orbit.ts (faviconFor deliberately not ported:
// it sent every tool domain to Google).
export function domainOf(raw) {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.includes('.') ? u.hostname : null;
  } catch {
    return null;
  }
}

export function titleFromDomain(domain) {
  const base = domain.replace(/^www\./, '').split('.')[0] ?? domain;
  return base
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Icon URLs from galaxycloud seedTools(); titles, URLs and descriptions from orb projects.js.
const SEED_ICONS = {
  bpp: 'https://bigpictureplanner.app/favicon.svg',
  gp: 'https://girlplanner.lovable.app/favicon.png',
  sms: 'https://savemysummary.lovable.app/favicon.ico',
  ppd: 'https://publishingdesk.lovable.app/favicon.ico',
  da: 'https://webuildforgood.com/departure-alarm/icon.svg',
  cards: 'https://drlizlondon.github.io/orb/carousel/icon.svg',
  igc: 'https://drlizlondon.github.io/orb/carousel-insta/icon.svg',
};

export function seedTools(now = Date.now()) {
  return projects.map(p => ({id: p.id, title: p.title, url: p.url, desc: p.description, icon: SEED_ICONS[p.id] ?? '', addedAt: now}));
}

const hostKey = raw => (domainOf(raw) ?? '').replace(/^www\./, '').toLowerCase();

function validate(tool) {
  return tool && typeof tool === 'object'
    && typeof tool.id === 'string' && tool.id
    && typeof tool.title === 'string' && tool.title
    && typeof tool.url === 'string' && /^https?:\/\//i.test(tool.url) && domainOf(tool.url)
    && typeof tool.desc === 'string'
    && typeof tool.icon === 'string'
    && typeof tool.addedAt === 'number' && Number.isFinite(tool.addedAt);
}

function parseList(json) {
  let data;
  try { data = JSON.parse(json); } catch { throw new Error('Not valid JSON'); }
  if (!data || data.version !== 1) throw new Error('Unsupported file version');
  if (!Array.isArray(data.tools)) throw new Error('Missing tools list');
  const ids = new Set();
  for (const tool of data.tools) {
    if (!validate(tool)) throw new Error('A tool in the file is malformed');
    if (ids.has(tool.id)) throw new Error('Duplicate tool id in the file');
    ids.add(tool.id);
  }
  return data.tools.map(t => ({id: t.id, title: t.title, url: t.url, desc: t.desc, icon: t.icon, addedAt: t.addedAt}));
}

// Ids of defaults the user has already been offered. A default is added to the saved list once,
// the first time its id is not in this set; after that the user owns it (a removal stays removed).
export const SEEN_KEY = 'orbit.defaults.seen';
// Lists saved before SEEN_KEY existed were seeded from these six defaults (git 3a231b3: the
// projects.js in force when the stale lists were written). Later defaults count as new.
export const LEGACY_SEEN = ['bpp', 'gp', 'sms', 'ppd', 'da', 'cards'];

// Pure. Returns the saved list plus any default whose id was never seen, and the updated seen set.
// Never reorders, edits or drops anything already in `saved`; never re-adds a seen (removed) default.
export function mergeDefaults(saved, defaults, seen) {
  const seenSet = new Set(seen);
  const have = new Set(saved.map(t => t.id));
  const added = defaults.filter(d => !seenSet.has(d.id) && !have.has(d.id));
  for (const d of defaults) seenSet.add(d.id);
  return {tools: added.length ? [...saved, ...added] : saved, seen: [...seenSet], added: added.length};
}

function readSeen(storage) {
  try {
    const raw = storage?.getItem(SEEN_KEY);
    if (raw == null) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.filter(x => typeof x === 'string') : null;
  } catch { return null; }
}

function saveSeen(storage, seen) {
  try { storage?.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* storage unavailable */ }
}

// Tools that no longer exist as their own tile. Cover Series is now part of Instagram (dist/cover-series/ only redirects).
// A returning visitor's saved list may still hold them, so they are dropped on load.
export const RETIRED_IDS = ['cover'];
// Old default titles that were renamed, so a saved list shows the new name. Only an untouched default title is replaced.
const RENAMED = {igc: ['Instagram Carousel', 'Instagram'], cards: ['LinkedIn Carousel', 'LinkedIn posts']};

// Pure. Drops retired tiles and renames untouched old default titles. Returns the same array when nothing changed.
export function migrateSaved(saved) {
  let changed = false;
  const out = [];
  for (const t of saved) {
    if (RETIRED_IDS.includes(t.id)) { changed = true; continue; }
    const r = RENAMED[t.id];
    if (r && t.title === r[0]) { changed = true; out.push({...t, title: r[1]}); continue; }
    out.push(t);
  }
  return changed ? out : saved;
}

export function loadTools(storage, now = Date.now()) {
  let saved = null;
  try {
    const raw = storage?.getItem(TOOLS_KEY);
    if (raw != null) saved = parseList(raw);
  } catch { /* fall through to the seed */ }
  if (saved) {
    const migrated = migrateSaved(saved);
    if (migrated !== saved) { saved = migrated; saveTools(storage, saved); }
    const merged = mergeDefaults(saved, seedTools(now), readSeen(storage) ?? LEGACY_SEEN);
    if (merged.added) saveTools(storage, merged.tools);
    saveSeen(storage, merged.seen);
    return merged.tools;
  }
  const tools = seedTools(now);
  saveTools(storage, tools);
  saveSeen(storage, tools.map(t => t.id));
  return tools;
}

export function saveTools(storage, tools) {
  try { storage?.setItem(TOOLS_KEY, exportTools(tools)); return true; } catch { return false; }
}

// Throws on an invalid URL. A host already in the list returns the list unchanged.
export function addTool(tools, {url, title = '', desc = ''} = {}, now = Date.now()) {
  const raw = String(url ?? '').trim();
  const host = domainOf(raw);
  if (!host) throw new Error('Enter a valid web address');
  if (tools.some(t => hostKey(t.url) === hostKey(raw))) return tools;
  const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let id = `t${now.toString(36)}`;
  for (let n = 1; tools.some(t => t.id === id); n++) id = `t${now.toString(36)}-${n}`;
  return [...tools, {id, title: String(title).trim() || titleFromDomain(host), url: full, desc: String(desc).trim(), icon: '', addedAt: now}];
}

export function removeTool(tools, id) {
  return tools.filter(t => t.id !== id);
}

export function exportTools(tools) {
  return JSON.stringify({version: 1, tools}, null, 2);
}

// Validates everything and throws on anything malformed. Never merges: the caller replaces.
export function importTools(json) {
  return parseList(json);
}
