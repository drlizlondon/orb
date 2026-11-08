import {addTool, removeTool, exportTools, importTools, domainOf} from './tools.js';
import {colorFor} from './planet-layout.js';
import {createIcon} from './icon-view.js';

// The List view: search, tap-to-open rows and, in personal mode, add / remove / export / import.
export function createDirectory({mine, getTools, openUrl, onChange}) {
  const root = document.getElementById('directory');
  const el = (tag, props = {}, ...kids) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...kids);
    return node;
  };
  let query = '';
  let pendingRemove = null, pendingTimer = 0;

  const search = el('input', {type: 'search', className: 'dir-search', placeholder: 'Search', autocomplete: 'off'});
  search.setAttribute('aria-label', 'Search tools');
  search.addEventListener('input', () => { query = search.value; renderRows(); });
  const status = el('p', {className: 'dir-status'});
  status.setAttribute('role', 'status');
  const list = el('ul', {className: 'dir-list'});
  const empty = el('p', {className: 'dir-empty', hidden: true, textContent: 'No tools match'});
  const bar = el('div', {className: 'dir-bar'}, search);

  let addDialog, confirmDialog, fileInput;
  if (mine) {
    const addBtn = el('button', {type: 'button', className: 'dir-action', textContent: 'Add tool'});
    const exportBtn = el('button', {type: 'button', className: 'dir-action', textContent: 'Export'});
    const importBtn = el('button', {type: 'button', className: 'dir-action', textContent: 'Import'});
    fileInput = el('input', {type: 'file', accept: 'application/json,.json', hidden: true});
    addBtn.onclick = () => openAdd();
    exportBtn.onclick = () => download();
    importBtn.onclick = () => { fileInput.value = ''; fileInput.click(); };
    fileInput.addEventListener('change', () => readImport());
    bar.append(addBtn, exportBtn, importBtn, fileInput);
    addDialog = buildAddDialog();
    confirmDialog = buildConfirmDialog();
    document.body.append(addDialog, confirmDialog);
  }
  root.append(bar, status, list, empty);

  function say(message) { status.textContent = message || ''; }

  function matches(tool) {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [tool.title, tool.desc, domainOf(tool.url) ?? ''].some(v => v.toLowerCase().includes(q));
  }

  function renderRows() {
    const tools = getTools();
    list.textContent = '';
    let shown = 0;
    tools.forEach((tool, i) => {
      if (!matches(tool)) return;
      shown++;
      const open = el('button', {type: 'button', className: 'dir-open'});
      const text = el('span', {className: 'dir-text'},
        el('span', {className: 'dir-title', textContent: tool.title}),
        el('span', {className: 'dir-desc', textContent: tool.desc}),
        el('span', {className: 'dir-host', textContent: domainOf(tool.url) ?? ''}));
      open.append(createIcon(tool, colorFor(tool, i)), text);
      open.addEventListener('click', () => openUrl(tool.url));
      const row = el('li', {className: 'dir-row'}, open);
      if (mine) row.append(removeControl(tool));
      list.append(row);
    });
    empty.hidden = shown > 0;
  }

  function removeControl(tool) {
    const btn = el('button', {type: 'button', className: 'dir-remove'});
    const idle = () => { btn.textContent = 'Remove'; btn.setAttribute('aria-label', `Remove ${tool.title}`); btn.classList.remove('is-confirm'); };
    idle();
    if (pendingRemove === tool.id) { btn.textContent = 'Confirm'; btn.classList.add('is-confirm'); }
    btn.addEventListener('click', () => {
      clearTimeout(pendingTimer);
      if (pendingRemove === tool.id) {
        pendingRemove = null;
        onChange(removeTool(getTools(), tool.id));
        say(`Removed ${tool.title}`);
        return;
      }
      pendingRemove = tool.id;
      renderRows();
      pendingTimer = setTimeout(() => { pendingRemove = null; renderRows(); }, 4000);
    });
    return btn;
  }

  function download() {
    const blob = new Blob([exportTools(getTools())], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = el('a', {href: url, download: 'orbit-tools.json'});
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readImport() {
    const file = fileInput.files?.[0];
    if (!file) return;
    let incoming;
    try {
      incoming = importTools(await file.text());
    } catch (error) {
      say(`Import failed: ${error.message}`);
      return;
    }
    const ok = await confirmAsk(`Replace your ${getTools().length} tools with ${incoming.length}?`, 'Replace');
    if (!ok) return;
    onChange(incoming);
    say(`Imported ${incoming.length} tools`);
  }

  function confirmAsk(message, okLabel) {
    return new Promise(resolve => {
      confirmDialog.querySelector('p').textContent = message;
      const ok = confirmDialog.querySelector('.ok'), cancel = confirmDialog.querySelector('.cancel');
      ok.textContent = okLabel;
      const done = value => { confirmDialog.close(); ok.onclick = cancel.onclick = null; resolve(value); };
      ok.onclick = () => done(true);
      cancel.onclick = () => done(false);
      confirmDialog.oncancel = () => resolve(false);
      confirmDialog.showModal();
    });
  }

  function buildConfirmDialog() {
    const d = el('dialog', {className: 'dir-dialog'}, el('p'),
      el('div', {className: 'dir-dialog-actions'}, el('button', {type: 'button', className: 'cancel', textContent: 'Cancel'}), el('button', {type: 'button', className: 'ok'})));
    return d;
  }

  function buildAddDialog() {
    const url = el('input', {type: 'text', name: 'url', required: true, autocomplete: 'off', inputMode: 'url', placeholder: 'example.com'});
    const name = el('input', {type: 'text', name: 'title', autocomplete: 'off'});
    const desc = el('input', {type: 'text', name: 'desc', autocomplete: 'off'});
    const preview = el('div', {className: 'dir-preview'});
    const error = el('p', {className: 'dir-error'});
    error.setAttribute('role', 'alert');
    const form = el('form', {method: 'dialog', className: 'dir-form'},
      el('h2', {textContent: 'Add tool'}),
      el('label', {}, 'URL', url), el('label', {}, 'Name', name), el('label', {}, 'Description', desc),
      preview, error,
      el('div', {className: 'dir-dialog-actions'}, el('button', {type: 'button', className: 'cancel', textContent: 'Cancel'}), el('button', {type: 'submit', className: 'ok', textContent: 'Add'})));
    const dialog = el('dialog', {className: 'dir-dialog'}, form);
    const updatePreview = () => {
      preview.textContent = '';
      const host = domainOf(url.value.trim());
      if (host) preview.append(createIcon({title: name.value || host, url: url.value.trim(), icon: ''}));
    };
    url.addEventListener('change', updatePreview);
    name.addEventListener('change', updatePreview);
    form.querySelector('.cancel').onclick = () => dialog.close();
    form.addEventListener('submit', event => {
      event.preventDefault();
      const before = getTools();
      try {
        const next = addTool(before, {url: url.value, title: name.value, desc: desc.value});
        if (next === before) { error.textContent = 'Already in your list'; return; }
        onChange(next);
        say(`Added ${next[next.length - 1].title}`);
        dialog.close();
      } catch (e) {
        error.textContent = e.message;
      }
    });
    dialog.addEventListener('close', () => { form.reset(); preview.textContent = ''; error.textContent = ''; });
    dialog.openForm = () => { form.reset(); preview.textContent = ''; error.textContent = ''; dialog.showModal(); url.focus(); };
    return dialog;
  }
  function openAdd() { addDialog.openForm(); }

  return {render() { renderRows(); }};
}
