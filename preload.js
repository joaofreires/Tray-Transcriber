const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trayTranscriber', {
  onToggleRecording: (cb) => ipcRenderer.on('toggle-recording', (_event, payload) => cb(payload)),
  notifyRecordingComplete: (data) => ipcRenderer.send('recording-complete', data),
  updateConfig: (config) => ipcRenderer.send('config-updated', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  log: (message, data) => ipcRenderer.send('debug-log', { message, data })
});
