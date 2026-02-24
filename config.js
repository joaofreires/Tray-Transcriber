const $ = (id) => document.getElementById(id);

function setValue(id, value) {
  const el = $(id);
  if (!el) return;
  if (el.tagName === 'SELECT') {
    el.value = String(value);
  } else {
    el.value = value ?? '';
  }
}

function getBool(id) {
  return $(id).value === 'true';
}

function getNumber(id) {
  const raw = $(id).value;
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : undefined;
}

function normalizeDictionary(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        const term = entry.trim();
        return term ? { term, description: '' } : null;
      }
      if (typeof entry === 'object') {
        const term = String(entry.term || entry.word || '').trim();
        const description = String(entry.description || '').trim();
        return term ? { term, description } : null;
      }
      return null;
    })
    .filter(Boolean);
}

function setDictionaryList(items) {
  const list = $('dictionaryList');
  if (!list) return;
  list.innerHTML = '';
  const normalized = normalizeDictionary(items);
  if (!normalized.length) {
    addDictionaryRow({ term: '', description: '' });
    return;
  }
  normalized.forEach(addDictionaryRow);
}

function addDictionaryRow(item) {
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
  const items = [];
  rows.forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const term = inputs[0]?.value.trim() || '';
    const description = inputs[1]?.value.trim() || '';
    if (term) {
      items.push({ term, description });
    }
  });
  return items;
}

function setCorrectionsList(items) {
  const list = $('correctionsList');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(items) || !items.length) {
    addCorrectionRow({ from: '', to: '' });
    return;
  }
  items.forEach(addCorrectionRow);
}

function addCorrectionRow(item) {
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
  const items = [];
  rows.forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const from = inputs[0]?.value.trim() || '';
    const to = inputs[1]?.value.trim() || '';
    if (from && to) items.push({ from, to });
  });
  return items;
}

function setShortcutsList(items) {
  const list = $('shortcutsList');
  if (!list) return;
  list.innerHTML = '';
  if (!Array.isArray(items) || !items.length) {
    addShortcutRow({ shortcut: '', prompt: '' });
    return;
  }
  items.forEach(addShortcutRow);
}

function addShortcutRow(item) {
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
  const items = [];
  rows.forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const shortcut = inputs[0]?.value.trim() || '';
    const prompt = inputs[1]?.value.trim() || '';
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
    hotkey: $('hotkey').value.trim(),
    pressToTalk: getBool('pressToTalk'),
    holdToTalk: getBool('holdToTalk'),
    pasteMode: $('pasteMode').value,
    asrEngine: $('asrEngine').value,
    model: $('model').value,
    language: $('language').value.trim(),
    device: $('device').value,
    computeType: $('computeType').value,
    batchSize: getNumber('batchSize') || 4,
    noAlign: getBool('noAlign'),
    dictionary,
    dictionaryCorrections,
    includeDictionaryInPrompt: getBool('includeDictionaryInPrompt'),
    includeDictionaryDescriptions: getBool('includeDictionaryDescriptions'),
    prompt: $('prompt').value,
    promptMode: $('promptMode').value,
    useWorker: getBool('useWorker'),
    workerWarmup: getBool('workerWarmup'),
    workerHost: $('workerHost').value.trim() || '127.0.0.1',
    workerPort: getNumber('workerPort') || 8765,
    workerTransport: $('workerTransport').value,
    workerRequestTimeoutMs: getNumber('workerRequestTimeoutMs') || 600000,
    minRecordingBytes: getNumber('minRecordingBytes') || 200,
    workerStatusPollMs: getNumber('workerStatusPollMs') || 30000,
    holdStopOnModifierRelease: getBool('holdStopOnModifierRelease'),
    logLevel: $('logLevel').value,
    pythonPath: $('pythonPath').value.trim(),
    disableCuda: getBool('disableCuda'),
    forceNoWeightsOnlyLoad: getBool('forceNoWeightsOnlyLoad'),
    assistantName: $('assistantName').value.trim(),
    llmEndpoint: $('llmEndpoint').value.trim(),
    llmModel: $('llmModel').value.trim(),
    llmApiKey: $('llmApiKey').value.trim(),
    llmSystemPrompt: $('llmSystemPrompt').value.trim(),
    assistantShortcuts
  };
}

$('saveBtn').addEventListener('click', () => {
  window.trayTranscriber.updateConfig(gatherConfig());
});

$('closeBtn').addEventListener('click', () => {
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
      panel.hidden = !isTarget;
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
