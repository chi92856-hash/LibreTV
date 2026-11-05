const { contextBridge, ipcRenderer } = require('electron');

if (process.isMainFrame) {
  let maximized = false;
  let listener;
  ipcRenderer.on('remake:window-state', (_event, state) => {
    maximized = state === true;
    listener?.(maximized);
  });
  contextBridge.exposeInMainWorld('libreWindow', {
    minimize: () => ipcRenderer.send('remake:window', 'minimize'),
    maximize: () => ipcRenderer.send('remake:window', 'maximize'),
    close: () => ipcRenderer.send('remake:window', 'close'),
    onState: callback => {
      listener = callback;
      callback(maximized);
    }
  });
}
