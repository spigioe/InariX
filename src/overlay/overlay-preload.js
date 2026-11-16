'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ov', {
  action: (a, arg) => ipcRenderer.invoke('overlay:action', a, arg),
  onState: (fn) => ipcRenderer.on('overlay:state', (_e, s) => fn(s)),
  onPerf: (fn) => ipcRenderer.on('perf:data', (_e, d) => fn(d)),
});
