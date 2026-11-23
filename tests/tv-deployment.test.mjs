import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { handleApi } from '../remake/pages-worker.mjs';

test('hosted API preserves password protection and validates upstream selection', async () => {
  const env = { PASSWORD: 'fixture-only-password' };
  let response = await handleApi(new Request('https://fixture.invalid/api/search?q=test'), env);
  assert.equal(response.status, 401);
  assert.equal((await response.text()).includes(env.PASSWORD), false);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.PASSWORD));
  const hash = Buffer.from(digest).toString('hex');
  const headers = { 'X-LibreTV-Auth': hash };
  response = await handleApi(new Request('https://fixture.invalid/api/auth', { headers }), env);
  assert.equal(response.status, 200);
  response = await handleApi(new Request('https://fixture.invalid/api/search?q=test&source=custom-evil', { headers }), env);
  assert.equal(response.status, 400);
  response = await handleApi(new Request('https://fixture.invalid/api/recommend-cover?url=http://127.0.0.1/', { headers }), env);
  assert.equal(response.status, 400);
});

test('hosted search shares catalog normalization with the desktop server', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.equal(new URL(url).searchParams.get('wd'), 'fixture');
    return Response.json({ list: [{ vod_id: 42, vod_name: 'Fixture movie', vod_pic: 'https://example.invalid/cover.jpg', vod_year: 2026 }] });
  };
  try {
    const response = await handleApi(new Request('https://fixture.invalid/api/search?q=fixture&source=lizi'), {});
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.items[0].id, '42');
    assert.equal(data.items[0].title, 'Fixture movie');
    assert.equal(data.items[0].source, 'lizi');
  } finally { globalThis.fetch = original; }
});

test('TV update detection waits for idle and leaves the page usable offline', async () => {
  const source = fs.readFileSync(new URL('../remake/web/app.js', import.meta.url), 'utf8');
  let reloads = 0, requests = 0, open = false;
  const context = vm.createContext({ buildVersion: '0000000000000000', checkingVersion: false,
    view: 'watch', document: { hidden: false, querySelector: () => open },
    location: { reload: () => reloads++ },
    fetch: async () => { requests++; return Response.json({ version: '1111111111111111' }); } });
  vm.runInContext(source.slice(source.indexOf('async function checkSiteUpdate()'), source.indexOf('if (buildVersion) {')), context);
  await context.checkSiteUpdate();
  assert.equal(requests, 0);
  context.view = 'discover'; open = true;
  await context.checkSiteUpdate();
  assert.equal(requests, 0);
  open = false;
  await context.checkSiteUpdate();
  assert.equal(reloads, 1);
  context.fetch = async () => { throw new Error('offline'); };
  await context.checkSiteUpdate();
  assert.equal(reloads, 1);
  assert.equal(context.checkingVersion, false);
});
