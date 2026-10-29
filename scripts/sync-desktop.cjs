const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.desktop/resources/app');
if (!fs.existsSync(path.join(target, 'desktop-main.cjs'))) throw new Error('Desktop runtime is missing; this command updates an existing runtime only.');
const files = ['desktop-main.cjs', 'server.mjs', 'index.html', 'player.html', 'watch.html', 'service-worker.js', 'manifest.json'];
function collect(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const relative = path.join(dir, entry.name);
        if (entry.isDirectory()) collect(relative);
        else if (entry.isFile() && !/\.before[-.]|\.log$/.test(entry.name)) files.push(relative);
    }
}
for (const dir of ['js', 'css', 'image', 'libs']) collect(dir);
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let changed = 0;
for (const relative of files) {
    const source = path.join(root, relative), destination = path.join(target, relative);
    if (fs.existsSync(destination) && hash(source) === hash(destination)) continue;
    changed++;
    if (!process.argv.includes('--check')) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        const temporary = destination + '.sync-tmp';
        fs.copyFileSync(source, temporary);
        fs.renameSync(temporary, destination);
    }
}
if (process.argv.includes('--check') && changed) {
    console.error(`${changed} runtime files differ. Run desktop:sync.`);
    process.exitCode = 1;
} else console.log(`Desktop ${process.argv.includes('--check') ? 'verified' : 'synced'}: ${files.length} files, ${changed} changed.`);
