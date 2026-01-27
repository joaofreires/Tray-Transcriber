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
  setValue('computeType', config.computeType || 'int8');
  setValue('batchSize', config.batchSize || 4);
  setValue('noAlign', String(!!config.noAlign));
  setDictionaryList(config.dictionary);
  setValue('includeDictionaryInPrompt', String(config.includeDictionaryInPrompt !== false));
  setValue('includeDictionaryDescriptions', String(!!config.includeDictionaryDescriptions));
  setValue('prompt', config.prompt || '');
  setValue('promptMode', config.promptMode || 'append');
  setValue('useWorker', String(!!config.useWorker));
  setValue('workerWarmup', String(!!config.workerWarmup));
  setValue('workerHost', config.workerHost || '127.0.0.1');
  setValue('workerPort', config.workerPort || 8765);
  setValue('workerRequestTimeoutMs', config.workerRequestTimeoutMs || 600000);
  setValue('minRecordingBytes', config.minRecordingBytes || 200);
  setValue('workerStatusPollMs', config.workerStatusPollMs || 30000);
  setValue('holdStopOnModifierRelease', String(!!config.holdStopOnModifierRelease));
  setValue('disableCuda', String(!!config.disableCuda));
  setValue('forceNoWeightsOnlyLoad', String(!!config.forceNoWeightsOnlyLoad));
}

function gatherConfig() {
  const dictionary = getDictionaryList();

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
    includeDictionaryInPrompt: getBool('includeDictionaryInPrompt'),
    includeDictionaryDescriptions: getBool('includeDictionaryDescriptions'),
    prompt: $('prompt').value,
    promptMode: $('promptMode').value,
    useWorker: getBool('useWorker'),
    workerWarmup: getBool('workerWarmup'),
    workerHost: $('workerHost').value.trim() || '127.0.0.1',
    workerPort: getNumber('workerPort') || 8765,
    workerRequestTimeoutMs: getNumber('workerRequestTimeoutMs') || 600000,
    minRecordingBytes: getNumber('minRecordingBytes') || 200,
    workerStatusPollMs: getNumber('workerStatusPollMs') || 30000,
    holdStopOnModifierRelease: getBool('holdStopOnModifierRelease'),
    disableCuda: getBool('disableCuda'),
    forceNoWeightsOnlyLoad: getBool('forceNoWeightsOnlyLoad')
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
