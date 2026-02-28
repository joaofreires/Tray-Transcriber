const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayTranscriber', {
  onToggleRecording: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('toggle-recording', handler);
    return () => ipcRenderer.removeListener('toggle-recording', handler);
  },
  onTranscriptReady: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('transcript-ready', handler);
    return () => ipcRenderer.removeListener('transcript-ready', handler);
  },
  notifyRecordingComplete: (data) => ipcRenderer.send('recording-complete', data),
  setRecordingState: (payload) => ipcRenderer.send('ui-set-recording-state', payload),
  updateTrayIcon: () => ipcRenderer.send('ui-update-tray-icon'),
  updateConfig: (config) => ipcRenderer.invoke('config-save', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  onConfigChanged: (cb) => {
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('config-changed', handler);
    return () => ipcRenderer.removeListener('config-changed', handler);
  },
  listProviders: () => ipcRenderer.invoke('providers-list'),
  getProviderStatus: (providerId) => ipcRenderer.invoke('provider-status', providerId),
  selectProvider: (payload) => ipcRenderer.invoke('provider-select', payload),
  upsertProviderProfile: (payload) => ipcRenderer.invoke('provider-upsert-profile', payload),
  installStart: (payload) => ipcRenderer.invoke('install-start', payload),
  installCancel: (jobId) => ipcRenderer.invoke('install-cancel', jobId),
  installListJobs: () => ipcRenderer.invoke('install-list-jobs'),
  installCheckUpdates: () => ipcRenderer.invoke('install-check-updates'),
  setSecret: (payload) => ipcRenderer.invoke('secret-set', payload),
  deleteSecret: (ref) => ipcRenderer.invoke('secret-delete', ref),
  getRuntimeApiInfo: () => ipcRenderer.invoke('runtime-api-info'),
  verifyRuntimeApi: () => ipcRenderer.invoke('verify-runtime-api'),
  verifyProvider: (capability) => ipcRenderer.invoke('verify-provider', capability),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
  onCursorBusy: (cb) => {
    const handler = (_event, flag) => cb(flag);
    ipcRenderer.on('cursor-busy', handler);
    return () => ipcRenderer.removeListener('cursor-busy', handler);
  },
  getWindowType: () => ipcRenderer.invoke('get-window-type'),
  onHistoryUpdated: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('history-updated', handler);
    return () => ipcRenderer.removeListener('history-updated', handler);
  },
  getHistorySummaries: (opts) => ipcRenderer.invoke('history-get-summaries', opts),
  getHistoryEntry: (id) => ipcRenderer.invoke('history-get-entry', id),
  exportHistory: (targetPath) => ipcRenderer.invoke('history-export', targetPath),
  exportHistoryEntry: (id, targetPath) => ipcRenderer.invoke('history-export-entry', { id, targetPath }),
  log: (message, data) => ipcRenderer.send('debug-log', { message, data })
});
