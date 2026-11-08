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
  ppd: 'https://portfoliocommander.lovable.app/favicon.ico',
  da: 'https://webuildforgood.com/departure-alarm/icon.svg',
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

export function loadTools(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem(TOOLS_KEY);
    if (raw != null) return parseList(raw);
  } catch { /* fall through to the seed */ }
  const tools = seedTools(now);
  saveTools(storage, tools);
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
