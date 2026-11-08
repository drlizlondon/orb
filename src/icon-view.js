import {iconCandidates} from './icons.js';

// A round app icon: steps through iconCandidates on error, ending in a CSS monogram.
// Requests go only to the tool's own host, with no referrer.
export function createIcon(tool, color = '#9ab7ff') {
  const el = document.createElement('span');
  el.className = 'app-icon';
  el.style.setProperty('--icon-color', color);
  const list = iconCandidates(tool);
  let step = 0;
  const show = () => {
    const c = list[step];
    el.textContent = '';
    if (c.type === 'monogram') {
      el.classList.add('is-monogram');
      el.textContent = c.letter;
      return;
    }
    el.classList.remove('is-monogram');
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.draggable = false;
    img.onerror = () => { step++; show(); };
    img.src = c.src;
    el.append(img);
  };
  show();
  return el;
}
