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
