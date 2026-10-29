const {app,BrowserWindow,Menu,shell,dialog,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const ROOT=__dirname;
const ORIGIN='http://127.0.0.1:8899';
let mainWindow;
let backendServer;
const single=app.requestSingleInstanceLock();
if(!single||process.argv.includes('--quit'))app.quit();
else {
 app.setName('LibreTV');
 app.on('second-instance',(_event,args)=>{if(args.includes('--quit')){app.quit();return;}if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});
 app.on('window-all-closed',()=>app.quit());
 app.on('before-quit',()=>{
  backendServer?.close();
  backendServer?.closeAllConnections();
 });
 app.whenReady().then(async()=>{
  process.chdir(ROOT);
  const log=path.join(app.getPath('userData'),'desktop.log');
  fs.mkdirSync(path.dirname(log),{recursive:true});
  const output=message=>{try{fs.appendFileSync(log,String(message));}catch{}return true;};
  process.stdout.write=output;process.stderr.write=output;
  process.env.PORT='8899';process.env.HOST='127.0.0.1';
  process.env.NODE_ENV ||= 'production';
  try {
   // Import resolves only after our own backend has bound its port successfully.
   ({server:backendServer}=await import(pathToFileURL(path.join(ROOT,'server.mjs')).href));
   Menu.setApplicationMenu(null);
   session.defaultSession.setPermissionRequestHandler((contents,permission,callback)=>{
    const local=contents.getURL().startsWith(ORIGIN+'/');
    callback(local&&['fullscreen','clipboard-sanitized-write'].includes(permission));
   });
   mainWindow=new BrowserWindow({width:1320,height:900,minWidth:940,minHeight:680,
    title:'LibreTV',backgroundColor:'#edf5fd',show:false,
    icon:path.join(ROOT,'image','logo.png'),titleBarStyle:'hidden',
    titleBarOverlay:{color:'#edf5fd',symbolColor:'#58789d',height:40},
    webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,
       backgroundThrottling:false,spellcheck:false}});
   const isLocal=url=>{try{return new URL(url).origin===ORIGIN;}catch{return false;}};
   const external=url=>{try{const u=new URL(url);if(['https:','http:'].includes(u.protocol))shell.openExternal(u.href);}catch{}};
   mainWindow.webContents.setWindowOpenHandler(({url})=>{
    if(isLocal(url))mainWindow.loadURL(url);else external(url);
    return {action:'deny'};
   });
   mainWindow.webContents.on('will-navigate',(event,url)=>{if(!isLocal(url)){event.preventDefault();external(url);}});
   mainWindow.webContents.on('page-title-updated',(event)=>{event.preventDefault();});
   mainWindow.webContents.on('did-fail-load',(_,code,description,url,isMainFrame)=>{
    if(isMainFrame)output(`Load failed ${code} ${description} ${url}\n`);
   });
   mainWindow.webContents.on('before-input-event',(event,input)=>{
    if(input.control&&input.key.toLowerCase()==='r'){event.preventDefault();mainWindow.webContents.reloadIgnoringCache();}
    if(input.alt&&input.key==='ArrowLeft'){event.preventDefault();const h=mainWindow.webContents.navigationHistory;if(h.canGoBack())h.goBack();}
   });
   await mainWindow.loadURL(ORIGIN+'/');
   mainWindow.show();
   if(process.env.LIBRETV_CAPTURE){
    setTimeout(async()=>{try{const img=await mainWindow.webContents.capturePage();fs.writeFileSync(process.env.LIBRETV_CAPTURE,img.toPNG());}catch(e){output(e.stack);}},8000);
   }
  } catch(error) {
   output(error.stack+'\n');
   const message=error.code==='EADDRINUSE'
    ? '本地端口 8899 已被占用，请关闭旧版 LibreTV 或占用该端口的程序后重试。'
    : '本地服务或窗口启动失败，请重试。\n'+error.message;
   dialog.showErrorBox('LibreTV 启动失败',message);
   app.quit();
  }
 }).catch(error=>{dialog.showErrorBox('LibreTV',error.message);app.quit();});
}
