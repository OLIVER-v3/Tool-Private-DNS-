const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jx', {
  isAdmin: () => ipcRenderer.invoke('is-admin'),
  adapters: () => ipcRenderer.invoke('adapters'),
  getDns: (index) => ipcRenderer.invoke('get-dns', index),
  setDns: (payload) => ipcRenderer.invoke('set-dns', payload),
  resetDns: (index) => ipcRenderer.invoke('reset-dns', index),
  flushDns: () => ipcRenderer.invoke('flush-dns'),
  lookup: (payload) => ipcRenderer.invoke('lookup', payload),
  ping: (ip) => ipcRenderer.invoke('ping', ip),
  settings: (s) => ipcRenderer.send('settings', s),
  win: (action) => ipcRenderer.send('win', action)
});
