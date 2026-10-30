import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const quiet = { log() {}, warn() {}, error() {} };

function authHarness(values = {}, configuredHash) {
    const storage = new Map(Object.entries(values)), events = {};
    const context = vm.createContext({
        console: quiet,
        window: { __ENV__: { PASSWORD: configuredHash }, addEventListener: (key, fn) => { events[key] = fn; } },
        localStorage: {
            getItem: key => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key)
        }
    });
    vm.runInContext(read('js/proxy-auth.js'), context);
    return { context, storage, events };
}

test('current server credentials take precedence over persisted and in-memory hashes', async () => {
    const old = 'a'.repeat(64), current = 'b'.repeat(64), changed = 'c'.repeat(64);
    const { context } = authHarness({ proxyAuthHash: old }, current);
    assert.equal(await context.getPasswordHash(), current);
    context.window.__ENV__.PASSWORD = changed;
    assert.equal(await context.getPasswordHash(), changed);
});

test('legacy credentials remain usable without server config; password changes invalidate memory', async () => {
    const first = 'a'.repeat(64), second = 'b'.repeat(64);
    const { context, storage, events } = authHarness({ proxyAuthHash: first });
    assert.equal(await context.getPasswordHash(), first);
    storage.set('passwordVerified', 'true');
    storage.set('passwordHash', second);
    events.storage({ key: 'passwordHash' });
    assert.equal(await context.getPasswordHash(), second);
});

function apiHarness(special = false) {
    const timers = new Map();
    let timer = 0, reading = false, signal;
    const context = vm.createContext({
        URL, URLSearchParams, AbortController, DOMException, console: quiet, window: {},
        API_SITES: { fixture: { api: 'https://fixture.invalid/api', name: '测试源', ...(special ? { detail: 'https://fixture.invalid' } : {}) } },
        API_CONFIG: { search: { path: '?wd=', headers: {} }, detail: { path: '?ids=', headers: {} } },
        PROXY_URL: '/proxy/',
        setTimeout: fn => { timers.set(++timer, fn); return timer; },
        clearTimeout: key => timers.delete(key),
        fetch: async (_url, options) => {
            signal = options.signal;
            const body = () => {
                reading = true;
                return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Request timed out', 'AbortError')), { once: true }));
            };
            return { ok: true, json: body, text: body };
        }
    });
    vm.runInContext(read('js/api.js'), context);
    return { context, timers, reading: () => reading, signal: () => signal };
}

for (const [name, route, special] of [
    ['search JSON', '/api/search?source=fixture&wd=test', false],
    ['detail JSON', '/api/detail?source=fixture&id=1', false],
    ['custom detail HTML', '/api/detail?source=custom&id=1&customApi=https://fixture.invalid&customDetail=https://fixture.invalid', false],
    ['special detail HTML', '/api/detail?source=fixture&id=1', true]
]) {
    test(name + ': timeout remains active while reading a stalled body', async () => {
        const harness = apiHarness(special);
        const pending = harness.context.handleApiRequest(new URL('https://local.invalid' + route));
        for (let i = 0; i < 12; i++) await Promise.resolve();
        assert.equal(harness.reading(), true);
        assert.equal(harness.timers.size, 1);
        for (const fn of [...harness.timers.values()]) fn();
        assert.equal(JSON.parse(await pending).code, 400);
        assert.equal(harness.signal().aborted, true);
        assert.equal(harness.timers.size, 0);
    });
}

test('request completion and network failure release the deadline', async () => {
    for (const fail of [false, true]) {
        const harness = apiHarness();
        harness.context.fetch = async () => {
            if (fail) throw new Error('Offline');
            return { ok: true, json: async () => ({ list: [] }) };
        };
        const data = JSON.parse(await harness.context.handleApiRequest(new URL('https://local.invalid/api/search?source=fixture&wd=test')));
        assert.equal(data.code, fail ? 400 : 200);
        assert.equal(harness.timers.size, 0);
    }
});

function settingsHarness(values) {
    const storage = new Map(Object.entries(values));
    const context = vm.createContext({
        URL, console: quiet, window: {}, document: { addEventListener() {} },
        localStorage: { getItem: key => storage.get(key) ?? null }
    });
    vm.runInContext(read('js/config.js'), context);
    return { context, storage };
}

test('malformed or incorrectly shaped source settings do not abort home or player startup', () => {
    for (const invalid of ['{invalid', '{}', 'null', '[null]']) {
        for (const page of ['js/app.js', 'js/player.js']) {
            const { context } = settingsHarness({ selectedAPIs: invalid, customAPIs: invalid });
            const source = read(page);
            vm.runInContext(page === 'js/app.js' ? source : source.slice(0, source.indexOf('\n\n')), context);
            const selection = JSON.parse(vm.runInContext('JSON.stringify(selectedAPIs)', context));
            assert.deepEqual(selection, page === 'js/app.js' ? ['liangzi', 'baofeng', 'qiqi'] : []);
            assert.equal(vm.runInContext('customAPIs.length', context), 0);
        }
    }
});

test('valid source settings retain custom indices and are never overwritten by recovery', () => {
    const selected = ['custom_1', 'liangzi'];
    const custom = [{ name: '一', url: 'https://one.invalid' }, { name: '二', url: 'https://two.invalid' }];
    const values = { selectedAPIs: JSON.stringify(selected), customAPIs: JSON.stringify(custom) };
    const { context, storage } = settingsHarness(values);
    vm.runInContext(read('js/app.js'), context);
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(selectedAPIs)', context)), selected);
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(customAPIs)', context)), custom);
    assert.deepEqual(Object.fromEntries(storage), values);
});

test('the switch-resource title treats markup as literal text', async () => {
    const payload = '<img src=x onerror=alert(1)> & 标题';
    const title = {
        nodes: [],
        set innerHTML(_value) { throw new Error('A dynamic title must not use innerHTML'); },
        replaceChildren(...nodes) { this.nodes = nodes; }
    };
    const elements = { modalTitle: title, modal: { classList: { remove() {} } }, modalContent: {} };
    const context = vm.createContext({
        URLSearchParams, currentVideoTitle: payload, window: { location: { search: '' } },
        document: { getElementById: id => elements[id], createElement: () => ({}) }
    });
    const source = read('js/player.js');
    const start = source.indexOf('async function showSwitchResourceModal()');
    const end = source.indexOf('    // 搜索', start);
    vm.runInContext(source.slice(start, end) + '\n}', context);
    await context.showSwitchResourceModal();
    assert.equal(title.nodes.length, 1);
    assert.equal(title.nodes[0].textContent, payload);
    assert.equal(title.nodes[0].className, 'break-words');
});
