import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function searchHarness(pageResponse, initialStorage = []) {
    const requested = [];
    const storage = new Map(initialStorage);
    const context = vm.createContext({
        URL, AbortController, AbortSignal, setTimeout, clearTimeout,
        console: { warn() {} }, window: {},
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        API_SITES: { fixture: { name: '测试源', api: 'https://fixture.invalid/api' } },
        API_CONFIG: { search: { path: '?wd=', pagePath: '?wd={query}&pg={page}', maxPages: 50, headers: {} } },
        PROXY_URL: '/proxy/',
        fetch: async (url, { signal }) => {
            const page = Number(new URL(decodeURIComponent(url.slice('/proxy/'.length))).searchParams.get('pg') || 1);
            requested.push(page);
            const data = await pageResponse(page, signal);
            return { ok: true, json: async () => data };
        }
    });
    vm.runInContext(read('js/search.js'), context);
    return { context, requested, storage, search: context.searchByAPIAndKeyWord };
}

const pageData = (page, pagecount = 5) => ({
    pagecount,
    list: [{ vod_id: page, vod_name: `测试${page}` }, { vod_id: `noise${page}`, vod_name: '无关影片' }]
});

test('pagination resumes unread pages and restores complete results from cache', async () => {
    const harness = searchHarness(page => pageData(page));
    let pagination;
    const first = await harness.search('fixture', '测试', { onPagination: state => { pagination = state; } });
    assert.deepEqual(harness.requested.slice().sort(), [1, 2, 3]);
    assert.deepEqual([...pagination.remainingPages], [4, 5]);
    const next = await harness.search('fixture', '测试', {
        pagination, previousResults: first, onPagination: state => { pagination = state; }
    });
    assert.deepEqual(harness.requested.slice().sort(), [1, 2, 3, 4, 5]);
    assert.equal(first.length + next.length, 5);
    assert.equal(pagination.remainingPages.length, 0);
    const cached = await harness.search('fixture', '测试', { onPagination: state => { pagination = state; } });
    assert.equal(cached.length, 5);
    assert.equal(harness.requested.length, 5);
    const restored = searchHarness(page => { throw new Error(`Unexpected page ${page}`); }, harness.storage);
    assert.equal((await restored.search('fixture', '测试')).length, 5);
    assert.equal(restored.requested.length, 0);
});

test('fully read or empty sources have no remaining pages', async () => {
    for (const list of [[], [{ vod_id: 1, vod_name: '测试' }]]) {
        const harness = searchHarness(() => ({ pagecount: 1, list }));
        let pagination;
        await harness.search('fixture', '测试', { onPagination: state => { pagination = state; } });
        assert.equal(pagination.remainingPages.length, 0);
        await harness.search('fixture', '测试');
        assert.equal(harness.requested.length, 1);
    }
});

test('failed pages remain retryable without refetching completed pages', async () => {
    let fail = true;
    const harness = searchHarness(page => {
        if (fail && page === 2) throw new Error('Offline');
        return pageData(page, 3);
    });
    let pagination;
    const first = await harness.search('fixture', '测试', { onPagination: state => { pagination = state; } });
    assert.deepEqual([...pagination.remainingPages], [2]);
    fail = false;
    await harness.search('fixture', '测试', {
        pagination, previousResults: first, onPagination: state => { pagination = state; }
    });
    assert.deepEqual(harness.requested, [1, 2, 3, 2]);
    assert.equal(pagination.remainingPages.length, 0);
});

test('cancelled searches publish no stale results and retain unfinished pages', async () => {
    const controller = new AbortController();
    let delivered = 0;
    const harness = searchHarness(page => {
        if (page === 2) controller.abort();
        return pageData(page, 3);
    });
    let pagination;
    await harness.search('fixture', '测试', {
        signal: controller.signal,
        onResults: batch => { delivered += batch.length; },
        onPagination: state => { pagination = state; }
    });
    assert.equal(delivered, 1);
    assert.deepEqual([...pagination.remainingPages], [2, 3]);
});

function serverModule() {
    try {
        createRequire(path.join(root, 'package.json')).resolve('express');
        return path.join(root, 'server.mjs');
    } catch {
        const runtime = path.join(root, '.desktop/resources/app/server.mjs');
        assert.equal(fs.readFileSync(runtime, 'utf8'), read('server.mjs'), 'Run desktop:sync before testing the bundled runtime');
        return runtime;
    }
}

async function serverWorker(environment = {}) {
    const moduleUrl = pathToFileURL(serverModule()).href;
    const code = `
        try {
            const { server } = await import(${JSON.stringify(moduleUrl)});
            process.send({ port: server.address().port, listening: server.listening });
            process.on('message', () => {
                server.close(() => process.disconnect());
                server.closeAllConnections();
            });
        } catch (error) {
            process.send({ error: error.code });
            process.disconnect();
            process.exitCode = 1;
        }
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
        cwd: root,
        env: {
            ...process.env, HOST: '127.0.0.1', PORT: '0', PASSWORD: 'optimization-test-only',
            NODE_ENV: 'development', DEBUG: 'false', REQUEST_TIMEOUT: '1000', MAX_RETRIES: '1',
            CACHE_MAX_AGE: '1d', NO_PROXY: '127.0.0.1',
            BLOCKED_HOSTS: 'blocked.invalid', BLOCKED_IP_PREFIXES: 'blocked.invalid', ...environment
        },
        stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => child.kill(), 8000);
    const message = await new Promise((resolve, reject) => {
        child.once('message', resolve);
        child.once('error', reject);
        child.once('exit', code => reject(new Error(`Server exited before reporting readiness (${code}): ${stderr}`)));
    }).finally(() => clearTimeout(timer));
    return {
        ...message, origin: `http://127.0.0.1:${message.port}`,
        async stop() {
            if (child.exitCode !== null || child.signalCode !== null) return;
            const exited = once(child, 'exit');
            if (child.connected && message.port) child.send('stop');
            else child.kill();
            const force = setTimeout(() => child.kill(), 1000);
            await exited.finally(() => clearTimeout(force));
        }
    };
}

test('backend import waits for listening and rejects an occupied port', { timeout: 10000 }, async () => {
    const first = await serverWorker();
    try {
        assert.equal(first.listening, true);
        assert.equal((await fetch(first.origin)).status, 200);
        const second = await serverWorker({ PORT: String(first.port) });
        try {
            assert.equal(second.error, 'EADDRINUSE');
            assert.equal(second.listening, undefined);
        } finally { await second.stop(); }
    } finally { await first.stop(); }
});

test('HTML refreshes, asset URLs reflect content, and only production versioned assets are cached', { timeout: 15000 }, async () => {
    for (const mode of ['development', 'production']) {
        const backend = await serverWorker({ NODE_ENV: mode });
        try {
            for (const page of ['/', '/s=test', '/player.html', '/watch.html', '/about.html']) {
                const response = await fetch(backend.origin + page);
                assert.equal(response.status, 200);
                assert.equal(response.headers.get('cache-control'), 'no-store');
                assert.match(await response.text(), /(?:js|css|libs)\/[^"']+\?v=[a-f0-9]{16}/);
            }
            const version = createHash('sha256').update(read('js/search.js')).digest('hex').slice(0, 16);
            const html = await (await fetch(backend.origin)).text();
            assert.ok(html.includes(`js/search.js?v=${version}`));
            const versioned = await fetch(`${backend.origin}/js/search.js?v=${version}`);
            assert.equal(versioned.status, 200);
            assert.equal(await versioned.text(), read('js/search.js'));
            assert.equal(versioned.headers.get('cache-control'), mode === 'production' ? 'public, max-age=86400, immutable' : 'no-store');
            for (const url of ['/js/search.js', '/js/search.js?v=old', '/service-worker.js']) {
                const response = await fetch(backend.origin + url);
                assert.equal(response.headers.get('cache-control'), mode === 'production' ? 'no-cache' : 'no-store');
                await response.arrayBuffer();
            }
        } finally { await backend.stop(); }
    }
});

test('proxy handles broken success/error streams and cancels upstream when the client leaves', { timeout: 15000 }, async () => {
    let cancelled;
    const upstreamCancelled = new Promise(resolve => { cancelled = resolve; });
    let retries = 0;
    const upstream = http.createServer((req, res) => {
        if (req.url === '/slow') {
            res.writeHead(200);
            const timer = setInterval(() => res.write('chunk'), 20);
            res.on('close', () => { clearInterval(timer); cancelled(); });
        } else if (req.url === '/not-found') {
            res.writeHead(404, { 'Set-Cookie': 'private=true' });
            res.end('not found');
        } else {
            if (req.url === '/error') retries++;
            res.writeHead(req.url === '/error' ? 503 : 200, { 'Content-Length': '1000' });
            res.write('partial');
            setTimeout(() => res.destroy(), 25);
        }
    });
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const backend = await serverWorker();
    const auth = createHash('sha256').update('optimization-test-only').digest('hex');
    const proxyUrl = suffix => `${backend.origin}/proxy/${encodeURIComponent(`http://127.0.0.1:${upstream.address().port}${suffix}`)}?auth=${auth}`;
    try {
        assert.equal((await fetch(proxyUrl('/slow').split('?auth=')[0])).status, 401);
        for (const suffix of ['/broken', '/error']) {
            const response = await fetch(proxyUrl(suffix), { signal: AbortSignal.timeout(2000) });
            assert.equal(response.status, suffix === '/error' ? 503 : 200);
            await assert.rejects(() => response.text(), error => error.name === 'TypeError');
            assert.equal((await fetch(backend.origin)).status, 200);
        }
        assert.equal(retries, 2);
        const missing = await fetch(proxyUrl('/not-found'));
        assert.equal(missing.status, 404);
        assert.equal(missing.headers.get('set-cookie'), null);
        assert.equal(await missing.text(), 'not found');
        const slow = await fetch(proxyUrl('/slow'));
        await slow.body.cancel();
        await Promise.race([upstreamCancelled, new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Upstream was not cancelled')), 2000);
            timer.unref();
        })]);
        assert.equal((await fetch(backend.origin)).status, 200);
    } finally {
        await backend.stop();
        upstream.closeAllConnections();
        await new Promise(resolve => upstream.close(resolve));
    }
});
