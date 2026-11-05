const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { startServer } = require('./server.cjs');

app.setName('LibreTV 新版');
app.setPath('userData', path.join(app.getPath('appData'), 'LibreTV Remake'));
let server;
let window;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    server?.close();
    server?.closeAllConnections();
  });
  app.whenReady().then(async () => {
    // Keep a stable origin so the desktop library and playback history persist across launches.
    server = await startServer(8901);
    const origin = `http://127.0.0.1:${server.address().port}`;
    Menu.setApplicationMenu(null);
    window = new BrowserWindow({
      width: 1360, height: 920, minWidth: 770, minHeight: 600,
      frame: false, backgroundColor: '#050505', show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== origin) event.preventDefault();
    });
    const actions = {
      minimize: () => window.minimize(),
      maximize: () => window.isMaximized() ? window.unmaximize() : window.maximize(),
      close: () => window.close()
    };
    ipcMain.on('remake:window', (event, action) => {
      const frame = event.senderFrame;
      if (window.isDestroyed() || event.sender !== window.webContents || !frame || frame.parent ||
          !frame.url.startsWith(origin + '/') || !Object.hasOwn(actions, action)) return;
      actions[action]();
    });
    const sendState = () => window.webContents.send('remake:window-state', window.isMaximized());
    window.on('maximize', sendState);
    window.on('unmaximize', sendState);
    window.webContents.on('dom-ready', sendState);
    await window.loadURL(origin);
    window.show();
  }).catch(error => {
    console.error(error);
    dialog.showErrorBox('LibreTV 新版启动失败', error.code === 'EADDRINUSE' ? '本机端口 8901 已被占用。' : error.message);
    app.exit(1);
  });
}
