const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  openScanFolder: () => ipcRenderer.invoke('open-scan-folder'),
  startSetupServer: () => ipcRenderer.invoke('start-setup-server'),
  openSetupUrl: (url) => ipcRenderer.invoke('open-setup-url', url),
  checkSetupComplete: () => ipcRenderer.invoke('check-setup-complete'),
  closeSetupWindow: () => ipcRenderer.invoke('close-setup-window'),
  changeScanFolder: () => ipcRenderer.invoke('change-scan-folder'),
  testConnection: () => ipcRenderer.invoke('test-connection'),

  // Event listeners
  onConfigUpdate: (callback) => ipcRenderer.on('config-update', callback),
  onStatusUpdate: (callback) => ipcRenderer.on('status-update', callback),
  onLogMessage: (callback) => ipcRenderer.on('log-message', (event, message, type) => callback(message, type)),

  // Remove listeners
  removeAllListeners: (event) => ipcRenderer.removeAllListeners(event)
});