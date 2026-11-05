const fs = require('node:fs');
const path = require('node:path');

const legacyRuntime = path.resolve(__dirname, '..', '.desktop');
const npmRuntime = path.join(__dirname, 'node_modules', 'electron', 'dist');
const target = path.resolve(__dirname, '..', '.local-runtime', 'libretv-remake');
const app = path.join(target, 'resources', 'app');
const executable = path.join(target, 'LibreTV Remake.exe');
fs.mkdirSync(app, { recursive: true });

// Subsequent builds update the app in place and reuse its own Electron runtime.
if (!fs.existsSync(executable)) {
  const installed = fs.existsSync(path.join(npmRuntime, 'electron.exe')) ? npmRuntime : legacyRuntime;
  if (!fs.existsSync(installed)) throw new Error('缺少 Electron 运行文件。请先在 remake 目录安装依赖。');
  const runtimeExecutable = installed === npmRuntime ? 'electron.exe' : 'LibreTV.exe';
  for (const entry of fs.readdirSync(installed, { withFileTypes: true })) {
    if (entry.name === 'resources') continue;
    const source = path.join(installed, entry.name);
    const destination = entry.name === runtimeExecutable ? executable : path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'locales') fs.cpSync(source, destination, { recursive: true });
    } else if (!fs.existsSync(destination)) {
      try { fs.linkSync(source, destination); }
      catch { fs.copyFileSync(source, destination); }
    }
  }
}
for (const file of ['package.json', 'desktop.cjs', 'preload.cjs', 'server.cjs']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(app, file));
}
fs.cpSync(path.join(__dirname, 'web'), path.join(app, 'web'), { recursive: true });
console.log(executable);
