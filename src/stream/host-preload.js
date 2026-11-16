'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('streamHost', {
  onOffer: (fn) => ipcRenderer.on('stream-host:offer', (_e, d) => fn(d)),
  onStop: (fn) => ipcRenderer.on('stream-host:stop', () => fn()),
  answer: (id, data) => ipcRenderer.send('stream-host:answer', id, data),
  input: (msg) => ipcRenderer.send('stream-host:input', msg),
  state: (s) => ipcRenderer.send('stream-host:state', s),
  stats: (s) => ipcRenderer.send('stream-host:stats', s),
  frame: (key, ts, buf) => ipcRenderer.send('stream-host:frame', key, ts, buf),
  onKeyReq: (fn) => ipcRenderer.on('stream-host:keyreq', () => fn()),
  onNet: (fn) => ipcRenderer.on('stream-host:net', (_e, d) => fn(d)),
});
