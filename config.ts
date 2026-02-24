/// <reference path="./types/tray-transcriber.d.ts" />

const $ = (id: string): HTMLElement | null => document.getElementById(id);

function setValue(id: string, value: unknown) {
  const el = $(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el) return;
  if (el.tagName === 'SELECT') {
    el.value = String(value);
  } else {
    el.value = value == null ? '' : String(value);
  }
}

function getBool(id: string) {
  return (($(id) as HTMLSelectElement | null)?.value || 'false') === 'true';
}

function getNumber(id: string) {
  const raw = (($(id) as HTMLInputElement | null)?.value || '').trim();
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeDictionary(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        const term = entry.trim();
        return term ? { term, description: '' } : null;
      }
      if (typeof entry === 'object') {
        const term = String((entry as { term?: string; word?: string }).term || (entry as { term?: string; word?: string }).word || '').trim();
        const description = String((entry as { description?: string }).description || '').trim();
        return term ? { term, description } : null;
      }
      return null;
    })
    .filter(Boolean);
}

function setDictionaryList(items: unknown) {
  const list = $('dictionaryList');
  if (!list) return;
  list.innerHTML = '';
  const normalized = normalizeDictionary(items);
  if (!normalized.length) {
    addDictionaryRow({ term: '', description: '' });
    return;
  }
  normalized.forEach((item) => addDictionaryRow(item as { term: string; description: string }));
}

function addDictionaryRow(item: { term?: string; description?: string }) {
  const list = $('dictionaryList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'dict-row';

  const termInput = document.createElement('input');
  termInput.type = 'text';
  termInput.placeholder = 'Word';
  termInput.value = item.term || '';

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.placeholder = 'Description (optional)';
  descInput.value = item.description || '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'dict-remove';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(termInput);
  row.appendChild(descInput);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function getDictionaryList() {
  const list = $('dictionaryList');
  if (!list) return [];
  const rows = list.querySelectorAll('.dict-row');
  const items: Array<{ term: string; description: string }> = [];
  rows.forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const term = (inputs[0] as HTMLInputElement | undefined)?.value.trim() || '';
    const description = (inputs[1] as HTMLInputElement | undefined)?.value.trim() || '';
    if (term) {
      items.push({ term, description });
    }
  });
  return items;
}

function setCorrectionsList(items: unknown) {
  const list = $('correctionsList');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(items) || !items.length) {
    addCorrectionRow({ from: '', to: '' });
    return;
  }
  items.forEach((item) => addCorrectionRow(item as { from: string; to: string }));
}

function addCorrectionRow(item: { from?: string; to?: string }) {
  const list = $('correctionsList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'dict-row';

  const fromInput = document.createElement('input');
  fromInput.type = 'text';
  fromInput.placeholder = 'Seen as';
  fromInput.value = item.from || '';

  const toInput = document.createElement('input');
  toInput.type = 'text';
  toInput.placeholder = 'Prefer';
  toInput.value = item.to || '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'dict-remove';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(fromInput);
  row.appendChild(toInput);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function getCorrectionsList() {
  const list = $('correctionsList');
  if (!list) return [];
  const rows = list.querySelectorAll('.dict-row');
  const items: Array<{ from: string; to: string }> = [];
  rows.forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const from = (inputs[0] as HTMLInputElement | undefined)?.value.trim() || '';
    const to = (inputs[1] as HTMLInputElement | undefined)?.value.trim() || '';
    if (from && to) items.push({ from, to });
  });
  return items;
}

function setShortcutsList(items: unknown) {
  const list = $('shortcutsList');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(items) || !items.length) {
    addShortcutRow({ shortcut: '', prompt: '' });
    return;
  }
  items.forEach((item) => addShortcutRow(item as { shortcut: string; prompt: string }));
}

function addShortcutRow(item: { shortcut?: string; prompt?: string }) {
  const list = $('shortcutsList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'dict-row';

  const shortcutInput = document.createElement('input');
  shortcutInput.type = 'text';
  shortcutInput.placeholder = 'Shortcut (e.g. CommandOrControl+Alt+P)';
  shortcutInput.value = item.shortcut || '';

  const promptInput = document.createElement('input');
  promptInput.type = 'text';
  promptInput.placeholder = 'Prompt (e.g. fix grammar)';
  promptInput.value = item.prompt || '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'dict-remove';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  row.appendChild(shortcutInput);
  row.appendChild(promptInput);
  row.appendChild(removeBtn);
  list.appendChild(row);
}

function getShortcutsList() {
  const list = $('shortcutsList');
  if (!list) return [];
  const rows = list.querySelectorAll('.dict-row');
  const items: Array<{ shortcut: string; prompt: string }> = [];
  rows.forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const shortcut = (inputs[0] as HTMLInputElement | undefined)?.value.trim() || '';
    const prompt = (inputs[1] as HTMLInputElement | undefined)?.value.trim() || '';
    if (shortcut && prompt) items.push({ shortcut, prompt });
  });
  return items;
}

async function loadConfig() {
  const config = await window.trayTranscriber.getConfig();
  setValue('hotkey', config.hotkey || '');
  setValue('pressToTalk', String(!!config.pressToTalk));
  setValue('holdToTalk', String(!!config.holdToTalk));
  setValue('pasteMode', config.pasteMode || 'clipboard');
  setValue('asrEngine', config.asrEngine || 'whisperx');
  setValue('model', config.model || 'small');
  setValue('language', config.language || '');
  setValue('device', config.device || 'default');
  setValue('assistantName', config.assistantName || '');
  setValue('llmEndpoint', config.llmEndpoint || '');
  setValue('llmModel', config.llmModel || '');
  setValue('llmApiKey', config.llmApiKey || '');
  setValue('llmSystemPrompt', config.llmSystemPrompt || '');
  setValue('computeType', config.computeType || 'int8');
  setValue('batchSize', config.batchSize || 4);
  setValue('noAlign', String(!!config.noAlign));
  setDictionaryList(config.dictionary);
  setCorrectionsList(config.dictionaryCorrections);
  setShortcutsList(config.assistantShortcuts);
  setValue('includeDictionaryInPrompt', String(config.includeDictionaryInPrompt !== false));
  setValue('includeDictionaryDescriptions', String(!!config.includeDictionaryDescriptions));
  setValue('prompt', config.prompt || '');
  setValue('promptMode', config.promptMode || 'append');
  setValue('useWorker', String(!!config.useWorker));
  setValue('workerWarmup', String(!!config.workerWarmup));
  setValue('workerHost', config.workerHost || '127.0.0.1');
  setValue('workerPort', config.workerPort || 8765);
  setValue('workerTransport', config.workerTransport || 'stdio');
  setValue('workerRequestTimeoutMs', config.workerRequestTimeoutMs || 600000);
  setValue('minRecordingBytes', config.minRecordingBytes || 200);
  setValue('workerStatusPollMs', config.workerStatusPollMs || 30000);
  setValue('holdStopOnModifierRelease', String(!!config.holdStopOnModifierRelease));
  setValue('logLevel', config.logLevel || 'auto');
  setValue('pythonPath', config.pythonPath || '');
  setValue('disableCuda', String(!!config.disableCuda));
  setValue('forceNoWeightsOnlyLoad', String(!!config.forceNoWeightsOnlyLoad));
}

function gatherConfig() {
  const dictionary = getDictionaryList();
  const dictionaryCorrections = getCorrectionsList();
  const assistantShortcuts = getShortcutsList();

  return {
    hotkey: (($("hotkey") as HTMLInputElement | null)?.value || '').trim(),
    pressToTalk: getBool('pressToTalk'),
    holdToTalk: getBool('holdToTalk'),
    pasteMode: (($("pasteMode") as HTMLSelectElement | null)?.value || ''),
    asrEngine: (($("asrEngine") as HTMLSelectElement | null)?.value || ''),
    model: (($("model") as HTMLSelectElement | null)?.value || ''),
    language: (($("language") as HTMLInputElement | null)?.value || '').trim(),
    device: (($("device") as HTMLSelectElement | null)?.value || ''),
    computeType: (($("computeType") as HTMLSelectElement | null)?.value || ''),
    batchSize: getNumber('batchSize') || 4,
    noAlign: getBool('noAlign'),
    dictionary,
    dictionaryCorrections,
    includeDictionaryInPrompt: getBool('includeDictionaryInPrompt'),
    includeDictionaryDescriptions: getBool('includeDictionaryDescriptions'),
    prompt: (($("prompt") as HTMLTextAreaElement | null)?.value || ''),
    promptMode: (($("promptMode") as HTMLSelectElement | null)?.value || ''),
    useWorker: getBool('useWorker'),
    workerWarmup: getBool('workerWarmup'),
    workerHost: (($("workerHost") as HTMLInputElement | null)?.value || '').trim() || '127.0.0.1',
    workerPort: getNumber('workerPort') || 8765,
    workerTransport: (($("workerTransport") as HTMLSelectElement | null)?.value || ''),
    workerRequestTimeoutMs: getNumber('workerRequestTimeoutMs') || 600000,
    minRecordingBytes: getNumber('minRecordingBytes') || 200,
    workerStatusPollMs: getNumber('workerStatusPollMs') || 30000,
    holdStopOnModifierRelease: getBool('holdStopOnModifierRelease'),
    logLevel: (($("logLevel") as HTMLSelectElement | null)?.value || ''),
    pythonPath: (($("pythonPath") as HTMLInputElement | null)?.value || '').trim(),
    disableCuda: getBool('disableCuda'),
    forceNoWeightsOnlyLoad: getBool('forceNoWeightsOnlyLoad'),
    assistantName: (($("assistantName") as HTMLInputElement | null)?.value || '').trim(),
    llmEndpoint: (($("llmEndpoint") as HTMLInputElement | null)?.value || '').trim(),
    llmModel: (($("llmModel") as HTMLInputElement | null)?.value || '').trim(),
    llmApiKey: (($("llmApiKey") as HTMLInputElement | null)?.value || '').trim(),
    llmSystemPrompt: (($("llmSystemPrompt") as HTMLTextAreaElement | null)?.value || '').trim(),
    assistantShortcuts
  };
}

($('saveBtn') as HTMLButtonElement | null)?.addEventListener('click', () => {
  window.trayTranscriber.updateConfig(gatherConfig());
});

($('closeBtn') as HTMLButtonElement | null)?.addEventListener('click', () => {
  window.close();
});

loadConfig();

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-tab');
    tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
    tabPanels.forEach((panel) => {
      const isTarget = panel.getAttribute('data-panel') === target;
      (panel as HTMLElement).hidden = !isTarget;
    });
  });
});

const addBtn = $('dictionaryAddBtn');
if (addBtn) {
  addBtn.addEventListener('click', () => {
    addDictionaryRow({ term: '', description: '' });
  });
}

const correctionsAddBtn = $('correctionsAddBtn');
if (correctionsAddBtn) {
  correctionsAddBtn.addEventListener('click', () => {
    addCorrectionRow({ from: '', to: '' });
  });
}

const shortcutsAddBtn = $('shortcutsAddBtn');
if (shortcutsAddBtn) {
  shortcutsAddBtn.addEventListener('click', () => {
    addShortcutRow({ shortcut: '', prompt: '' });
  });
}
