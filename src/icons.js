import {domainOf} from './tools.js';

// Icon chain (ORB-1 section 4). No third-party icon service: every request goes to
// the tool's own host, and the last step is a monogram drawn in CSS (no request).
export function iconCandidates(tool) {
  const out = [];
  if (tool.icon) out.push({type: 'url', src: tool.icon});
  const host = domainOf(tool.url);
  if (host) {
    out.push({type: 'url', src: `https://${host}/apple-touch-icon.png`});
    out.push({type: 'url', src: `https://${host}/favicon.ico`});
  }
  out.push({type: 'monogram', letter: (tool.title || '?').trim().charAt(0).toUpperCase() || '?'});
  return out;
}
