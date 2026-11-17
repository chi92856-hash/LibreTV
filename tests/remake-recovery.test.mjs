import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';

test('installed remake player recovers transient failures and cleans recovery listeners', () => {
  const source = fs.readFileSync(new URL('../remake/web/app.js', import.meta.url), 'utf8');
  const events = {}, videoEvents = {}, calls = [];
  const video = { currentTime: 30, paused: false, canPlayType: () => '',
    addEventListener: (name, fn) => { videoEvents[name] = fn; },
    removeEventListener: (name, fn) => { assert.equal(videoEvents[name], fn); delete videoEvents[name]; } };
  class Hls {
    static Events = { ERROR: 'error', DESTROYING: 'destroying' };
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
    static isSupported() { return true; }
    on(name, fn) { events[name] = fn; }
    loadSource() { calls.push('manifest'); }
    attachMedia() {}
    startLoad(time) { calls.push(time); }
    recoverMediaError() { calls.push('media'); }
    stopLoad() { calls.push('stop'); }
  }
  const context = vm.createContext({ Hls, window: { Hls }, URL, video, hls: null,
    playback: { item: { lines: [{ episodes: [{ url: 'https://example.invalid/a.m3u8', title: '第一集' }] }] } },
    $: () => ({}), saveProgress() {}, releaseMedia() {}, renderEpisodes() {} });
  vm.runInContext(source.slice(source.indexOf('function playEpisode('), source.indexOf('function syncSave(')), context);
  context.playEpisode(0, 0);
  const error = (type, details, fatal = true) => events.error(null, { type, details, fatal });
  for (let i = 0; i < 10; i++) error('network', 'stall', false);
  error('network', 'fragLoadError');
  assert.equal(calls.at(-1), 30);
  error('media', 'bufferAppendError');
  assert.equal(calls.at(-1), 'media');
  video.currentTime += 0.25;
  videoEvents.timeupdate();
  error('network', 'manifestLoadError');
  assert.equal(calls.at(-1), 'manifest');
  error('network', 'fragLoadError');
  error('network', 'fragLoadError');
  assert.equal(calls.at(-1), 'stop');
  events.destroying();
  assert.equal(videoEvents.timeupdate, undefined);
});
