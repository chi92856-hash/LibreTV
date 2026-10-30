import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const password = 'cover-test-only';
const auth = crypto.createHash('sha256').update(password).digest('hex');
const poster = 'https://img9.doubanio.com/view/photo/s_ratio_poster/public/p2935652656.jpg';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

function proxyHarness(platform) {
    const files = {
        cloudflare: 'functions/proxy/[[path]].js',
        vercel: 'api/proxy/[...path].mjs',
        netlify: 'netlify/functions/proxy.mjs'
    };
    let body = png, type = 'image/png';
    const requests = [], cacheKeys = [], cacheWrites = [];
    const context = {
        Buffer, URL, URLSearchParams, Request, Response, Headers, TextEncoder, crypto,
        console: { log() {}, info() {}, warn() {}, error() {} },
        process: { env: { PASSWORD: password } },
        fetch: async (url, options) => {
            requests.push({ url, headers: new Headers(options.headers) });
            return new Response(body, { headers: {
                'Content-Type': type, 'Content-Encoding': 'gzip', 'Content-Length': '999999'
            } });
        }
    };
    const source = read(files[platform])
        .replace(/^import .*;[^\n]*$/gm, '')
        .replace(/export default /g, '').replace(/^export /gm, '');
    const handler = vm.runInNewContext(source + '\n;' + (platform === 'cloudflare' ? 'onRequest' : 'handler'), context);
    return {
        requests, cacheKeys, cacheWrites,
        setResponse(value, mime) { body = value; type = mime; },
        async call(target = poster, token = auth) {
            const encoded = encodeURIComponent(target);
            if (platform === 'cloudflare') {
                const response = await handler({
                    request: new Request('https://fixture.invalid/proxy/' + encoded + '?auth=' + token, {
                        headers: { Referer: 'https://fixture.invalid/' }
                    }),
                    env: { PASSWORD: password, LIBRETV_PROXY_KV: {
                        async get(key) {
                            cacheKeys.push(key);
                            return key === 'proxy_raw:' + target
                                ? JSON.stringify({ body: 'old corrupted image', headers: '{"content-type":"image/png"}' }) : null;
                        },
                        async put(key) { cacheWrites.push(key); }
                    } },
                    waitUntil() {}
                });
                return { status: response.status, headers: response.headers, body: Buffer.from(await response.arrayBuffer()) };
            }
            if (platform === 'netlify') {
                const result = await handler({
                    httpMethod: 'GET', path: '/proxy/' + encoded,
                    queryStringParameters: { auth: token }, headers: { referer: 'https://fixture.invalid/' }
                }, {});
                return {
                    status: result.statusCode, headers: new Headers(result.headers),
                    body: Buffer.from(result.body, result.isBase64Encoded ? 'base64' : 'utf8')
                };
            }
            const res = {
                headers: new Headers(), statusCode: 200,
                status(value) { this.statusCode = value; return this; },
                setHeader(key, value) { this.headers.set(key, value); return this; },
                removeHeader(key) { this.headers.delete(key); return this; },
                send(value) { this.body = Buffer.isBuffer(value) ? value : Buffer.from(value); return this; },
                json(value) { this.body = Buffer.from(JSON.stringify(value)); return this; }
            };
            await handler({
                method: 'GET', url: '/proxy/' + encoded, query: { '...path': encoded, auth: token },
                headers: { referer: 'https://fixture.invalid/' }
            }, res);
            return { status: res.statusCode, headers: res.headers, body: res.body };
        }
    };
}

for (const platform of ['cloudflare', 'vercel', 'netlify']) {
    test(platform + ': posters keep exact bytes, use Douban referrer, and still require authentication', async () => {
        const harness = proxyHarness(platform);
        const image = await harness.call();
        assert.equal(image.status, 200);
        assert.deepEqual(image.body, png);
        assert.equal(image.headers.get('content-type'), 'image/png');
        assert.equal(image.headers.get('content-encoding'), null);
        assert.equal(image.headers.get('content-length'), null);
        assert.equal(harness.requests[0].headers.get('referer'), 'https://movie.douban.com/');
        assert.equal(harness.cacheWrites.length, 0);
        const before = harness.requests.length;
        assert.equal((await harness.call(poster, 'wrong')).status, 401);
        assert.equal(harness.requests.length, before);
        harness.setResponse('{"subjects":[]}', 'application/json');
        assert.equal((await harness.call('https://movie.douban.com/j/search_subjects')).body.toString(), '{"subjects":[]}');
        harness.setResponse(png, 'image/png');
        await harness.call('https://doubanio.com.evil.invalid/poster.png');
        assert.equal(harness.requests.at(-1).headers.get('referer'), 'https://fixture.invalid/');
    });
}

function imageHarness(authenticate = async url => url + '&auth=test') {
    const context = vm.createContext({
        URL, PROXY_URL: '/proxy/', window: { ProxyAuth: { addAuthToProxyUrl: authenticate } },
        document: { addEventListener() {} }
    });
    vm.runInContext(read('js/douban.js'), context);
    const events = new Map(), classes = new Set();
    const image = {
        style: {}, isConnected: true,
        parentElement: { classList: { add: name => classes.add(name) } },
        addEventListener: (name, callback) => events.set(name, callback)
    };
    return { image, classes, load: value => context.loadDoubanCover(image, value), error: () => events.get('error')() };
}

test('a failed direct cover retries the authenticated proxy once and bypasses old cache', async () => {
    let calls = 0;
    const harness = imageHarness(async url => { calls++; return url + '&auth=test'; });
    harness.load(poster);
    assert.equal(harness.image.src, poster);
    await harness.error();
    assert.equal(harness.image.src, '/proxy/' + encodeURIComponent(poster) + '?cover=2&auth=test');
    assert.equal(harness.classes.size, 0);
    await harness.error();
    assert.equal(calls, 1);
    assert.ok(harness.classes.has('dt-cover-empty'));
    assert.equal(harness.image.style.display, 'none');
});

test('authentication failures and invalid cover URLs end in a placeholder without unhandled errors', async () => {
    const harness = imageHarness(async () => { throw new Error('Unavailable'); });
    harness.load(poster);
    await harness.error();
    assert.ok(harness.classes.has('dt-cover-empty'));
    for (const value of ['javascript:alert(1)', 'file:///secret', 'not a URL']) {
        const invalid = imageHarness();
        invalid.load(value);
        assert.equal(invalid.image.src, undefined);
        assert.ok(invalid.classes.has('dt-cover-empty'));
    }
});

test('changing the recommendation list cancels a pending cover fallback', async () => {
    let resolve;
    const harness = imageHarness(() => new Promise(done => { resolve = done; }));
    harness.load(poster);
    const fallback = harness.error();
    harness.image.isConnected = false;
    resolve('/proxy/poster');
    await fallback;
    assert.equal(harness.image.src, poster);
});
